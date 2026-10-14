"""
Baixa de estoque por NF-e: bipa o codigo de barras do DANFE (chave de acesso),
le o XML da nota nas pastas do emissor, liga os itens aos produtos e lanca as
movimentacoes de uma vez, sem deixar a mesma nota ser baixada duas vezes.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.services.movement_service import MovementRecord, MovementService
from core.catalog.normalization import _NAME_SPLIT, canonical_code, is_searchable_code
from core.constants import DATE_FORMAT_DB
from core.database.connection import DatabaseConnection
from core.database.repositories.catalog_repository import CatalogRepository
from core.exceptions import (
    InsufficientStockException,
    InvalidTransferException,
    ProductNotFoundException,
    ValidationException,
)
from core.nfe_xml import NfeDocumento, chave_from_code, find_nfe_by_chave
from core.utils.file_utils import FileUtils

# Pastas onde o Questor salva os XMLs (vendas e simples remessa).
DEFAULT_XML_FOLDERS = [
    r"C:\nQuestorEmp\NFe\Geradas",
    r"C:\nQuestorEmp\NFe\Distribuicao",
]
CONFIG_FILENAME = "nfe_config.json"
MAX_FOLDERS = 10
MAX_CANDIDATES = 5

_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS nfe_baixas (
        chave TEXT PRIMARY KEY,
        numero INTEGER NOT NULL,
        serie INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        data_hora DATETIME NOT NULL,
        movimentacao_ids TEXT NOT NULL
    )
    """,
    # O que aprendemos ao confirmar: codigo do item na nota do emissor -> nosso produto.
    """
    CREATE TABLE IF NOT EXISTS nfe_item_vinculos (
        emitente_cnpj TEXT NOT NULL,
        codigo TEXT NOT NULL,
        produto_id INTEGER NOT NULL,
        atualizado_em DATETIME NOT NULL,
        PRIMARY KEY (emitente_cnpj, codigo)
    )
    """,
)


def _ensure_schema(conn) -> None:
    for statement in _SCHEMA:
        conn.execute(statement)


def _config_path() -> str:
    return os.path.join(FileUtils.get_app_root_directory(), CONFIG_FILENAME)


def load_config() -> Dict[str, Any]:
    path = _config_path()
    folders = list(DEFAULT_XML_FOLDERS)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            saved = data.get("pastas_xml")
            if isinstance(saved, list):
                folders = [str(p).strip() for p in saved if str(p).strip()][:MAX_FOLDERS]
        except (OSError, ValueError):
            pass
    return {"pastas_xml": folders}


def save_config(pastas_xml: List[str]) -> Dict[str, Any]:
    folders: List[str] = []
    for raw in pastas_xml:
        folder = str(raw or "").strip()
        if not folder:
            continue
        if len(folder) > 260:
            raise ValidationException("Caminho de pasta muito longo.")
        if folder not in folders:
            folders.append(folder)
    if len(folders) > MAX_FOLDERS:
        raise ValidationException(f"Informe no maximo {MAX_FOLDERS} pastas.")
    with open(_config_path(), "w", encoding="utf-8") as fh:
        json.dump({"pastas_xml": folders}, fh, ensure_ascii=False, indent=2)
    return {"pastas_xml": folders}


def _quantity(value: Decimal) -> Optional[int]:
    """Quantidade inteira da nota (o estoque e em unidades); None se for fracionada."""
    if value <= 0 or value != value.to_integral_value():
        return None
    return int(value)


def _description_codes(descricao: str, ean: str) -> List[str]:
    """Codigos de peca citados na descricao do item (como escritos) e o EAN."""
    codes: List[str] = []
    seen: set[str] = set()
    for token in _NAME_SPLIT.split((descricao or "").upper()):
        token = token.strip(" .-")
        canonical = canonical_code(token)
        if token and is_searchable_code(canonical) and canonical not in seen:
            seen.add(canonical)
            codes.append(token)
    if ean and ean not in seen:
        codes.append(ean)
    return codes


class NfeService:
    def __init__(self, movement_service: Optional[MovementService] = None) -> None:
        self.db = DatabaseConnection()
        self.movements = movement_service or MovementService()

    # ------------------------------------------------------------------
    # Leitura
    # ------------------------------------------------------------------

    def _load(self, code: str) -> NfeDocumento:
        chave = chave_from_code(code)
        if not chave:
            raise ValidationException("Codigo lido nao e uma chave de NF-e valida (44 digitos).")
        folders = load_config()["pastas_xml"]
        documento = find_nfe_by_chave(chave, folders)
        if documento is None:
            existing = [f for f in folders if os.path.isdir(f)]
            if not existing:
                raise ProductNotFoundException(
                    "Nenhuma das pastas de XML existe nesta maquina. Confira as pastas em 'Pastas dos XMLs'."
                )
            raise ProductNotFoundException(
                "XML da nota nao encontrado nas pastas configuradas. A nota foi emitida nesta maquina?"
            )
        return documento

    def preview(self, code: str) -> Dict[str, Any]:
        documento = self._load(code)
        conn = self.db.get_connection()
        try:
            _ensure_schema(conn)
            baixa = conn.execute(
                "SELECT tipo, data_hora FROM nfe_baixas WHERE chave = ?", (documento.chave,)
            ).fetchone()
            itens = [self._suggest(conn, documento, item) for item in documento.itens]
        finally:
            conn.close()

        return {
            "chave": documento.chave,
            "numero": documento.numero,
            "serie": documento.serie,
            "tipo_sugerido": "SAIDA" if documento.tipo_nf == 1 else "ENTRADA",
            "natureza_operacao": documento.natureza_operacao,
            "emissao": documento.emissao,
            "emitente": documento.emitente_nome,
            "destinatario": documento.destinatario_nome,
            "autorizada": documento.autorizada,
            "cancelada": documento.cancelada,
            "ja_baixada": (
                {"tipo": baixa["tipo"], "data": baixa["data_hora"]} if baixa else None
            ),
            "arquivo": documento.arquivo,
            "itens": itens,
        }

    def _products(self, conn, ids: List[int]) -> Dict[int, Dict[str, Any]]:
        if not ids:
            return {}
        marks = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"SELECT id, nome FROM produtos WHERE ativo = 1 AND id IN ({marks})", tuple(ids)
        ).fetchall()
        result = {int(r["id"]): {"id": int(r["id"]), "nome": r["nome"], "estoque": {}} for r in rows}
        if result:
            stock_rows = conn.execute(
                f"""
                SELECT e.produto_id, e.local_id, e.quantidade
                FROM produto_estoque e JOIN locais l ON l.id = e.local_id
                WHERE l.ativo = 1 AND e.produto_id IN ({",".join("?" for _ in result)})
                """,
                tuple(result),
            ).fetchall()
            for row in stock_rows:
                result[int(row["produto_id"])]["estoque"][str(row["local_id"])] = int(row["quantidade"] or 0)
        return result

    def _suggest(self, conn, documento: NfeDocumento, item) -> Dict[str, Any]:
        learned_id: Optional[int] = None
        if item.codigo:
            row = conn.execute(
                "SELECT produto_id FROM nfe_item_vinculos WHERE emitente_cnpj = ? AND codigo = ?",
                (documento.emitente_cnpj, item.codigo),
            ).fetchone()
            if row:
                learned_id = int(row["produto_id"])

        # Codigos de peca citados na descricao (ex.: 876272-5017S) e o EAN.
        scores: Dict[int, int] = {}
        for code in _description_codes(item.descricao, item.ean):
            clause = CatalogRepository.build_code_search_clause(code, product_alias="p")
            if not clause:
                continue
            sql, params = clause
            rows = conn.execute(
                f"SELECT p.id FROM produtos p WHERE p.ativo = 1 AND (p.nome LIKE ? OR {sql})",
                [f"%{code}%", *params],
            )
            for row in rows:
                scores[int(row["id"])] = scores.get(int(row["id"]), 0) + 1

        ids = list(scores)
        if learned_id is not None and learned_id not in scores:
            ids.append(learned_id)
        products = self._products(conn, ids)

        def total(pid: int) -> int:
            return sum(products[pid]["estoque"].values())

        ranked = sorted(
            (pid for pid in scores if pid in products),
            key=lambda pid: (-scores[pid], -(total(pid) > 0), products[pid]["nome"]),
        )
        candidatos = [products[pid] for pid in ranked[:MAX_CANDIDATES]]

        if learned_id is not None and learned_id in products:
            sugerido, confianca = products[learned_id], "aprendido"
            candidatos = [sugerido] + [c for c in candidatos if c["id"] != learned_id]
        elif ranked:
            top = ranked[0]
            tie = len(ranked) > 1 and scores[ranked[1]] == scores[top]
            sugerido, confianca = products[top], ("duvida" if tie else "codigo")
        else:
            sugerido, confianca = None, "nenhum"

        return {
            "item": item.item,
            "codigo": item.codigo,
            "ean": item.ean,
            "descricao": item.descricao,
            "unidade": item.unidade,
            "quantidade": _quantity(item.quantidade),
            "quantidade_nota": str(item.quantidade.normalize()),
            "produto_sugerido": sugerido,
            "confianca": confianca,
            "candidatos": candidatos,
        }

    # ------------------------------------------------------------------
    # Baixa
    # ------------------------------------------------------------------

    def baixar(
        self,
        code: str,
        *,
        tipo: str,
        location_id: int,
        itens: List[Dict[str, int]],
    ) -> Dict[str, Any]:
        tipo = (tipo or "").upper()
        if tipo not in {"SAIDA", "ENTRADA"}:
            raise ValidationException("Tipo deve ser SAIDA ou ENTRADA.")
        documento = self._load(code)
        if documento.cancelada:
            raise ValidationException("Esta NF-e foi cancelada; nada foi baixado.")
        if not documento.autorizada:
            raise ValidationException("O XML encontrado nao tem a autorizacao da SEFAZ; nada foi baixado.")

        by_item = {i.item: i for i in documento.itens}
        chosen: Dict[int, Dict[str, int]] = {}
        for entry in itens:
            n = int(entry["item"])
            if n not in by_item:
                raise ValidationException(f"Item {n} nao existe nesta nota.")
            if n in chosen:
                raise ValidationException(f"Item {n} repetido.")
            chosen[n] = entry
        missing = [n for n in by_item if n not in chosen]
        if missing:
            raise ValidationException(
                "Escolha o produto de todos os itens da nota (faltam: "
                + ", ".join(str(n) for n in missing) + ")."
            )

        documento_mov = f"NF {documento.numero}"
        observacao = f"NF-e {documento.numero} serie {documento.serie}"
        outra_parte = documento.destinatario_nome if documento.tipo_nf == 1 else documento.emitente_nome
        if outra_parte:
            observacao = f"{observacao} - {outra_parte}"
        observacao = observacao[:200]
        now = datetime.now().strftime(DATE_FORMAT_DB)

        conn = self.db.get_connection()
        try:
            _ensure_schema(conn)
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM nfe_baixas WHERE chave = ?", (documento.chave,)).fetchone():
                raise ValidationException(f"A NF {documento.numero} ja foi baixada no estoque.")

            records: List[MovementRecord] = []
            for n in sorted(chosen):
                entry = chosen[n]
                record = self.movements._create_movement_internal(
                    conn,
                    tipo,
                    int(entry["produto_id"]),
                    int(entry["quantidade"]),
                    location_id if tipo == "SAIDA" else None,
                    location_id if tipo == "ENTRADA" else None,
                    observacao,
                    "OPERACAO_NORMAL",
                    None,
                    None,
                    documento_mov,
                    None,
                    None,
                )
                records.append(record)
                codigo = by_item[n].codigo
                if codigo and documento.emitente_cnpj:
                    conn.execute(
                        """
                        INSERT INTO nfe_item_vinculos (emitente_cnpj, codigo, produto_id, atualizado_em)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(emitente_cnpj, codigo)
                        DO UPDATE SET produto_id = excluded.produto_id, atualizado_em = excluded.atualizado_em
                        """,
                        (documento.emitente_cnpj, codigo, int(entry["produto_id"]), now),
                    )

            conn.execute(
                "INSERT INTO nfe_baixas (chave, numero, serie, tipo, data_hora, movimentacao_ids) VALUES (?, ?, ?, ?, ?, ?)",
                (documento.chave, documento.numero, documento.serie, tipo, now,
                 json.dumps([r.id for r in records])),
            )
            conn.commit()
        except (ValidationException, InvalidTransferException, InsufficientStockException, ProductNotFoundException):
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return {
            "chave": documento.chave,
            "numero": documento.numero,
            "documento": documento_mov,
            "tipo": tipo,
            "movimentacoes": [r.id for r in records],
        }
