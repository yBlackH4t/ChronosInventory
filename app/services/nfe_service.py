"""
Baixa de estoque por NF-e: bipa o codigo de barras do DANFE (chave de acesso),
le o XML da nota nas pastas do emissor, liga os itens aos produtos e lanca as
movimentacoes de uma vez, sem deixar a mesma nota ser baixada duas vezes.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
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
from core.nfe_xml import MAX_XML_BYTES, NfeDocumento, chave_from_code, find_nfe_by_chave
from core.utils.file_utils import FileUtils

# Pastas onde o Questor salva os XMLs (vendas e simples remessa).
DEFAULT_XML_FOLDERS = [
    r"C:\nQuestorEmp\NFe\Geradas",
    r"C:\nQuestorEmp\NFe\Distribuicao",
]
# Raiz do Questor: se a nota nao estiver nas pastas configuradas, procura aqui pelo nome do arquivo.
QUESTOR_ROOT = r"C:\nQuestorEmp\NFe"
CONFIG_FILENAME = "nfe_config.json"
CERTIFICATE_FILENAME = "nfe_certificado.pfx"
DEFAULT_UF = "43"  # RS: UF de quem consulta na SEFAZ
MAX_FOLDERS = 10
MAX_CANDIDATES = 5
# Naturezas que a baixa por NF aceita (devolucao exige a movimentacao de origem; estorno e outra tela).
NATUREZAS_NF = {"OPERACAO_NORMAL", "TRANSFERENCIA_EXTERNA", "AJUSTE"}

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
    # Itens que nao sao estoque (ex.: CASCO, embalagem de transporte): a nota passa sem eles.
    """
    CREATE TABLE IF NOT EXISTS nfe_itens_ignorados (
        emitente_cnpj TEXT NOT NULL,
        codigo TEXT NOT NULL,
        atualizado_em DATETIME NOT NULL,
        PRIMARY KEY (emitente_cnpj, codigo)
    )
    """,
)


def _ensure_schema(conn) -> None:
    for statement in _SCHEMA:
        conn.execute(statement)


def _active_baixa(conn, chave: str):
    """Baixa registrada da nota, ou None se todas as movimentacoes dela ja foram estornadas
    (assim a nota pode ser lancada de novo, ex.: com outra natureza)."""
    row = conn.execute(
        "SELECT tipo, data_hora, movimentacao_ids FROM nfe_baixas WHERE chave = ?", (chave,)
    ).fetchone()
    if row is None:
        return None
    try:
        ids = [int(i) for i in json.loads(row["movimentacao_ids"] or "[]")]
    except (TypeError, ValueError):
        return row
    if not ids:
        return row
    marks = ",".join("?" for _ in ids)
    estornados = conn.execute(
        f"SELECT COUNT(DISTINCT movimento_ref_id) FROM movimentacoes "
        f"WHERE natureza = 'ESTORNO' AND movimento_ref_id IN ({marks})",
        ids,
    ).fetchone()[0]
    if estornados < len(set(ids)):
        return row
    conn.execute("DELETE FROM nfe_baixas WHERE chave = ?", (chave,))
    return None


def _config_path() -> str:
    return os.path.join(FileUtils.get_app_root_directory(), CONFIG_FILENAME)


def _certificate_path() -> str:
    return os.path.join(FileUtils.get_app_root_directory(), CERTIFICATE_FILENAME)


def xml_download_dir() -> str:
    """XMLs baixados da SEFAZ ficam aqui (e o Chronos sempre procura aqui tambem)."""
    path = os.path.join(FileUtils.get_app_root_directory(), "nfe_xml")
    os.makedirs(path, exist_ok=True)
    return path


def _only_digits(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _read_raw() -> Dict[str, Any]:
    path = _config_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_raw(data: Dict[str, Any]) -> None:
    with open(_config_path(), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def load_config() -> Dict[str, Any]:
    """Configuracao desta maquina, sem segredos (a senha do certificado nunca sai daqui)."""
    data = _read_raw()
    folders = list(DEFAULT_XML_FOLDERS)
    saved = data.get("pastas_xml")
    if isinstance(saved, list):
        folders = [str(p).strip() for p in saved if str(p).strip()][:MAX_FOLDERS]
    cert = data.get("certificado") if isinstance(data.get("certificado"), dict) else None
    has_cert = bool(cert and cert.get("senha") and os.path.isfile(_certificate_path()))
    return {
        "pastas_xml": folders,
        "cnpj_loja": _only_digits(data.get("cnpj_loja")) or None,
        "uf": str(data.get("uf") or DEFAULT_UF),
        "certificado": (
            {"titular": cert.get("titular"), "cnpj": cert.get("cnpj"), "validade": cert.get("validade")}
            if has_cert else None
        ),
    }


def save_config(pastas_xml: List[str], cnpj_loja: Optional[str] = None) -> Dict[str, Any]:
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
    data = _read_raw()
    data["pastas_xml"] = folders
    if cnpj_loja is not None:
        cnpj = _only_digits(cnpj_loja)
        if cnpj and len(cnpj) != 14:
            raise ValidationException("CNPJ da loja deve ter 14 numeros.")
        data["cnpj_loja"] = cnpj or None
    _write_raw(data)
    return load_config()


def save_certificate(arquivo: str, senha: str) -> Dict[str, Any]:
    """Confere o certificado A1 (.pfx) e guarda uma copia nesta maquina, com a senha protegida."""
    from core import secret_box
    from core.nfe_sefaz import SefazError, certificate_info

    arquivo = (arquivo or "").strip().strip('"')
    if not arquivo.lower().endswith((".pfx", ".p12")) or not os.path.isfile(arquivo):
        raise ValidationException("Arquivo do certificado nao encontrado (precisa ser .pfx ou .p12).")
    if os.path.getsize(arquivo) > 100 * 1024:
        raise ValidationException("Esse arquivo e grande demais para ser um certificado .pfx.")
    with open(arquivo, "rb") as fh:
        pfx = fh.read()
    try:
        info = certificate_info(pfx, senha)
    except SefazError as exc:
        raise ValidationException(str(exc)) from exc
    if info.validade < datetime.now(timezone.utc):
        raise ValidationException(f"Este certificado venceu em {info.validade:%d/%m/%Y}.")

    with open(_certificate_path(), "wb") as fh:
        fh.write(pfx)
    data = _read_raw()
    data["certificado"] = {
        "titular": info.titular,
        "cnpj": info.cnpj,
        "validade": info.validade.strftime("%Y-%m-%d"),
        "senha": secret_box.protect(senha),
    }
    if not data.get("cnpj_loja") and info.cnpj:
        data["cnpj_loja"] = info.cnpj
    _write_raw(data)
    return load_config()


def remove_certificate() -> Dict[str, Any]:
    try:
        os.remove(_certificate_path())
    except OSError:
        pass
    data = _read_raw()
    data.pop("certificado", None)
    _write_raw(data)
    return load_config()


def _certificate_secret() -> Optional[tuple[bytes, str]]:
    from core import secret_box

    cert = _read_raw().get("certificado")
    if not isinstance(cert, dict) or not cert.get("senha") or not os.path.isfile(_certificate_path()):
        return None
    with open(_certificate_path(), "rb") as fh:
        pfx = fh.read()
    return pfx, secret_box.unprotect(cert["senha"])


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


def _other_party(documento: NfeDocumento, tipo: str) -> tuple[str, str]:
    """(nome, documento) de quem esta do outro lado da nota, para quem lanca o tipo dado."""
    if tipo == "SAIDA":
        return documento.destinatario_nome or "", documento.destinatario_documento or ""
    return documento.emitente_nome or "", documento.emitente_cnpj or ""


def _format_cnpj(cnpj: str) -> str:
    d = _only_digits(cnpj)
    if len(d) != 14:
        return cnpj
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"


def _same_company(cnpj_a: str, cnpj_b: Optional[str]) -> bool:
    """Matriz e filiais tem a mesma raiz (8 primeiros digitos) do CNPJ."""
    a, b = _only_digits(cnpj_a), _only_digits(cnpj_b)
    return len(a) == 14 and len(b) == 14 and a[:8] == b[:8]


def _suggested_movement(documento: NfeDocumento, tipo: str, cnpj_loja: Optional[str]) -> Dict[str, str]:
    """Natureza, local externo e observacao que a tela ja traz preenchidos (editaveis)."""
    nome, doc = _other_party(documento, tipo)
    observacao = f"NF-e {documento.numero} serie {documento.serie}"
    if nome:
        observacao = f"{observacao} - {nome}"
    transferencia = _same_company(doc, cnpj_loja)
    return {
        "natureza": "TRANSFERENCIA_EXTERNA" if transferencia else "OPERACAO_NORMAL",
        "local_externo": (nome or "Outra filial")[:120] if transferencia else "",
        "observacao": observacao[:200],
    }


def _suggested_type(documento: NfeDocumento, cnpj_loja: Optional[str]) -> str:
    """Do ponto de vista desta loja: nota recebida e entrada; nota emitida segue o tpNF."""
    if cnpj_loja and documento.destinatario_documento == cnpj_loja and documento.emitente_cnpj != cnpj_loja:
        return "ENTRADA" if documento.tipo_nf == 1 else "SAIDA"
    return "SAIDA" if documento.tipo_nf == 1 else "ENTRADA"


class NfeService:
    def __init__(self, movement_service: Optional[MovementService] = None, downloader=None) -> None:
        self.db = DatabaseConnection()
        self.movements = movement_service or MovementService()
        if downloader is None:
            from core.nfe_sefaz import download_nfe as downloader
        self.downloader = downloader

    # ------------------------------------------------------------------
    # Leitura
    # ------------------------------------------------------------------

    def _load(self, code: str) -> NfeDocumento:
        chave = chave_from_code(code)
        if not chave:
            raise ValidationException("Codigo lido nao e uma chave de NF-e valida (44 digitos).")
        config = load_config()
        folders = [*config["pastas_xml"], xml_download_dir()]
        documento = find_nfe_by_chave(chave, folders)
        sem_autorizacao = None
        if documento is None and os.path.isdir(QUESTOR_ROOT):
            encontrado = find_nfe_by_chave(chave, [QUESTOR_ROOT], by_content=False)
            if encontrado is not None and encontrado.autorizada:
                documento = encontrado
            else:
                # XML assinado mas sem o protocolo: guarda so como ultimo recurso,
                # para nao atrapalhar o download da nota autorizada na SEFAZ.
                sem_autorizacao = encontrado
        if documento is not None:
            return documento
        loja = config["cnpj_loja"] or _only_digits((config["certificado"] or {}).get("cnpj"))
        if loja and chave[6:20] == loja:
            if sem_autorizacao is not None:
                return sem_autorizacao
            # Nota emitida por esta loja: a SEFAZ so devolve o resumo para quem emitiu,
            # entao o XML tem que vir das pastas do emissor (Questor).
            raise ProductNotFoundException(
                f"Esta nota foi emitida por esta loja (CNPJ {_format_cnpj(loja)}), mas o XML "
                "dela nao esta nas pastas: " + "; ".join(config["pastas_xml"] or ["nenhuma pasta"])
                + ". Confira no emissor se ela foi autorizada e em qual pasta o XML foi salvo, "
                "e adicione essa pasta em 'Configurar'."
            )
        if config["certificado"]:
            return self._download(chave, config)
        if sem_autorizacao is not None:
            return sem_autorizacao
        if not any(os.path.isdir(f) for f in config["pastas_xml"]):
            raise ProductNotFoundException(
                "Nenhuma das pastas de XML existe nesta maquina. Confira em 'Configurar'."
            )
        raise ProductNotFoundException(
            "XML da nota nao encontrado nas pastas. Para notas de fornecedor, cadastre o certificado "
            "digital em 'Configurar' e o Chronos baixa o XML da SEFAZ."
        )

    def _download(self, chave: str, config: Dict[str, Any]) -> NfeDocumento:
        """Nota que nao esta nas pastas (ex.: de fornecedor): baixa o XML da SEFAZ e guarda."""
        from core.nfe_sefaz import MOTIVOS, SefazError

        secret = _certificate_secret()
        if secret is None:
            raise ValidationException("Certificado digital nao configurado nesta maquina.")
        pfx, senha = secret
        cnpj = config["cnpj_loja"] or (config["certificado"] or {}).get("cnpj")
        if not cnpj:
            raise ValidationException("Informe o CNPJ desta loja em 'Configurar'.")
        try:
            result = self.downloader(chave, pfx=pfx, senha=senha, cnpj=cnpj, uf=config["uf"])
        except SefazError as exc:
            raise ValidationException(str(exc)) from exc
        if result.xml:
            destino = os.path.join(xml_download_dir(), f"{chave}-nfe.xml")
            with open(destino, "wb") as fh:
                fh.write(result.xml)
            documento = find_nfe_by_chave(chave, [xml_download_dir()])
            if documento is not None:
                return documento
            raise ValidationException("A SEFAZ mandou um XML que nao e desta nota.")
        if result.so_resumo:
            raise ValidationException(
                "A SEFAZ so liberou o resumo desta nota: a empresa ainda precisa registrar a "
                "'ciencia da operacao' dela (no Questor ou no portal da NF-e). Depois, bipe de novo."
            )
        motivo = MOTIVOS.get(result.c_stat) or f"A SEFAZ respondeu: {result.c_stat} - {result.motivo}"
        raise ProductNotFoundException(motivo)

    def preview(self, code: str) -> Dict[str, Any]:
        documento = self._load(code)
        conn = self.db.get_connection()
        try:
            _ensure_schema(conn)
            baixa = _active_baixa(conn, documento.chave)
            conn.commit()
            itens = [self._suggest(conn, documento, item) for item in documento.itens]
        finally:
            conn.close()

        cnpj_loja = load_config()["cnpj_loja"]
        tipo_sugerido = _suggested_type(documento, cnpj_loja)
        return {
            "chave": documento.chave,
            "numero": documento.numero,
            "serie": documento.serie,
            "tipo_sugerido": tipo_sugerido,
            "movimento_sugerido": {
                tipo: _suggested_movement(documento, tipo, cnpj_loja) for tipo in ("SAIDA", "ENTRADA")
            },
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

    def xml(self, code: str) -> Dict[str, Any]:
        """XML da nota como texto, para a etiqueta de expedicao (destinatario, transportadora, volumes)."""
        documento = self._load(code)
        try:
            with open(documento.arquivo, "rb") as fh:
                content = fh.read(MAX_XML_BYTES)
        except OSError as exc:
            raise ProductNotFoundException("Nao foi possivel abrir o XML desta nota.") from exc
        try:
            texto = content.decode("utf-8")
        except UnicodeDecodeError:
            texto = content.decode("latin-1")
        return {
            "chave": documento.chave,
            "numero": documento.numero,
            "arquivo": os.path.basename(documento.arquivo),
            "xml": texto,
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
        ignorar = bool(item.codigo) and conn.execute(
            "SELECT 1 FROM nfe_itens_ignorados WHERE emitente_cnpj = ? AND codigo = ?",
            (documento.emitente_cnpj, item.codigo),
        ).fetchone() is not None
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
            "ignorar": ignorar,
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
        natureza: Optional[str] = None,
        local_externo: Optional[str] = None,
        motivo_ajuste: Optional[str] = None,
        observacao: Optional[str] = None,
    ) -> Dict[str, Any]:
        tipo = (tipo or "").upper()
        if tipo not in {"SAIDA", "ENTRADA"}:
            raise ValidationException("Tipo deve ser SAIDA ou ENTRADA.")
        natureza = (natureza or "OPERACAO_NORMAL").upper()
        if natureza not in NATUREZAS_NF:
            raise ValidationException("Natureza deve ser operacao normal, transferencia externa ou ajuste.")
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
        missing = [n for n in by_item if n not in chosen or (not chosen[n].get("ignorar") and not chosen[n].get("produto_id"))]
        if missing:
            raise ValidationException(
                "Escolha o produto de todos os itens da nota ou marque 'Ignorar' (faltam: "
                + ", ".join(str(n) for n in missing) + ")."
            )
        if all(entry.get("ignorar") for entry in chosen.values()):
            raise ValidationException("Todos os itens estao marcados para ignorar: nada para lancar.")

        documento_mov = f"NF {documento.numero}"
        observacao = (observacao or "").strip()[:200] or _suggested_movement(documento, tipo, None)["observacao"]
        now = datetime.now().strftime(DATE_FORMAT_DB)

        conn = self.db.get_connection()
        try:
            _ensure_schema(conn)
            conn.execute("BEGIN IMMEDIATE")
            if _active_baixa(conn, documento.chave) is not None:
                raise ValidationException(f"A NF {documento.numero} ja foi baixada no estoque.")

            records: List[MovementRecord] = []
            for n in sorted(chosen):
                entry = chosen[n]
                codigo = by_item[n].codigo
                if entry.get("ignorar"):
                    if codigo and documento.emitente_cnpj:
                        conn.execute(
                            """
                            INSERT INTO nfe_itens_ignorados (emitente_cnpj, codigo, atualizado_em)
                            VALUES (?, ?, ?)
                            ON CONFLICT(emitente_cnpj, codigo) DO UPDATE SET atualizado_em = excluded.atualizado_em
                            """,
                            (documento.emitente_cnpj, codigo, now),
                        )
                    continue
                record = self.movements._create_movement_internal(
                    conn,
                    tipo,
                    int(entry["produto_id"]),
                    int(entry["quantidade"]),
                    location_id if tipo == "SAIDA" else None,
                    location_id if tipo == "ENTRADA" else None,
                    observacao,
                    natureza,
                    motivo_ajuste,
                    local_externo,
                    documento_mov,
                    None,
                    None,
                )
                records.append(record)
                if codigo and documento.emitente_cnpj:
                    conn.execute(
                        "DELETE FROM nfe_itens_ignorados WHERE emitente_cnpj = ? AND codigo = ?",
                        (documento.emitente_cnpj, codigo),
                    )
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
