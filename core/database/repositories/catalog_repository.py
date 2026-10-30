"""
Repository do catalogo de referencias externas.

Responsabilidades:
- Manter `produto_codigos` sincronizado com o nome dos produtos.
- Montar o filtro de busca por codigo (nome + codigos + referencias do catalogo).
- Ler fichas do catalogo e gerenciar vinculos produto <-> catalogo.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from core.catalog.normalization import canonical_code, extract_codes_from_name
from core.database.repositories.base_repository import BaseRepository
from core.exceptions import NotFoundException, ProductNotFoundException, ValidationException

LINK_STATUS_AUTO = "AUTO"
LINK_STATUS_CONFIRMED = "CONFIRMADO"
LINK_STATUS_REJECTED = "REJEITADO"
VALID_LINK_STATUSES = {LINK_STATUS_AUTO, LINK_STATUS_CONFIRMED, LINK_STATUS_REJECTED}

# Termos com menos que isso nao expandem a busca para codigos (evita ruido).
MIN_CODE_SEARCH_LENGTH = 4
# A partir desse tamanho, a busca por codigo aceita prefixo (4031195 -> 4031195X).
MIN_PREFIX_SEARCH_LENGTH = 6


class CatalogRepository(BaseRepository):
    """Acesso a dados do catalogo e dos vinculos com produtos."""

    # ------------------------------------------------------------------
    # Codigos dos nossos produtos
    # ------------------------------------------------------------------

    @staticmethod
    def sync_product_codes(cursor: sqlite3.Cursor, product_id: int, nome: Optional[str]) -> None:
        """Atualiza os codigos extraidos do nome (usar dentro da transacao do produto)."""
        cursor.execute(
            "DELETE FROM produto_codigos WHERE produto_id = ? AND origem = 'NOME'",
            (product_id,),
        )
        codes = extract_codes_from_name(nome)
        if codes:
            cursor.executemany(
                "INSERT OR IGNORE INTO produto_codigos (produto_id, numero_norm, origem) VALUES (?, ?, 'NOME')",
                [(product_id, code) for code in codes],
            )

    # ------------------------------------------------------------------
    # Busca
    # ------------------------------------------------------------------

    @staticmethod
    def build_code_search_clause(term: str, product_alias: str = "p") -> Optional[Tuple[str, List[Any]]]:
        """
        Retorna (sql, params) que casa produtos por codigo normalizado:
        - codigos extraidos do nome (`produto_codigos`);
        - codigo do produto no catalogo vinculado (ex.: Master 805390);
        - qualquer referencia cruzada do produto de catalogo vinculado.
        Retorna None se o termo nao parece um codigo.
        """
        from core.catalog.normalization import expand_family_codes
        code = canonical_code(term)
        if len(code) < MIN_CODE_SEARCH_LENGTH or not any(ch.isdigit() for ch in code):
            return None

        expanded_codes = expand_family_codes([code])
        use_prefix = len(code) >= MIN_PREFIX_SEARCH_LENGTH
        # Prefixo com GLOB, nao LIKE: o LIKE ignora maiusculas e por isso nao usa o indice.
        # Os codigos normalizados so tem A-Z/0-9 maiusculos, entao o resultado e o mesmo.

        where_parts_codes = []
        codes_params = []
        where_parts_cat = []
        cat_params = []
        where_parts_ref = []
        ref_params = []

        for c in expanded_codes:
            if use_prefix:
                where_parts_codes.append("(pc.numero_norm = ? OR pc.numero_norm GLOB ?)")
                codes_params.extend([c, f"{c}*"])
                where_parts_cat.append("(cp.codigo_norm = ? OR cp.codigo_norm GLOB ?)")
                cat_params.extend([c, f"{c}*"])
                where_parts_ref.append("(cr.numero_norm = ? OR cr.numero_norm GLOB ?)")
                ref_params.extend([c, f"{c}*"])
            else:
                where_parts_codes.append("pc.numero_norm = ?")
                codes_params.append(c)
                where_parts_cat.append("cp.codigo_norm = ?")
                cat_params.append(c)
                where_parts_ref.append("cr.numero_norm = ?")
                ref_params.append(c)

        codes_sql = " OR ".join(where_parts_codes)
        cat_sql = " OR ".join(where_parts_cat)
        ref_sql = " OR ".join(where_parts_ref)

        sql = f"""
            {product_alias}.id IN (
                SELECT pc.produto_id FROM produto_codigos pc WHERE {codes_sql}
                UNION
                SELECT v.produto_id
                FROM produto_catalogo_vinculo v
                JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
                WHERE v.status <> 'REJEITADO' AND {cat_sql}
                UNION
                SELECT v.produto_id
                FROM produto_catalogo_vinculo v
                JOIN catalogo_referencias cr ON cr.catalogo_produto_id = v.catalogo_produto_id
                WHERE v.status <> 'REJEITADO' AND {ref_sql}
            )
        """
        return sql, codes_params + cat_params + ref_params

    def search_catalog(self, term: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Busca produtos do catalogo por codigo proprio ou referencia cruzada.
        Inclui os nossos produtos vinculados (com estoque total).
        """
        code = canonical_code(term)
        if len(code) < MIN_CODE_SEARCH_LENGTH:
            return []
        prefix = f"{code}*" if len(code) >= MIN_PREFIX_SEARCH_LENGTH else code

        rows = self._execute_query(
            """
            SELECT cp.id, cp.codigo, cp.descricao, cp.grupo, cp.modelo, f.nome AS fonte,
                   MAX(CASE WHEN cp.codigo_norm = ? THEN 1 ELSE 0 END) AS match_codigo,
                   GROUP_CONCAT(DISTINCT cr.fabricante || ' ' || cr.numero) AS referencias_encontradas
            FROM catalogo_produtos cp
            JOIN catalogo_fontes f ON f.id = cp.fonte_id
            LEFT JOIN catalogo_referencias cr
                   ON cr.catalogo_produto_id = cp.id
                  AND (cr.numero_norm = ? OR cr.numero_norm GLOB ?)
            WHERE cp.ativo = 1
              AND (
                  cp.codigo_norm = ? OR cp.codigo_norm GLOB ?
                  OR cp.id IN (
                      SELECT r.catalogo_produto_id FROM catalogo_referencias r
                      WHERE r.numero_norm = ? OR r.numero_norm GLOB ?
                  )
              )
            GROUP BY cp.id
            ORDER BY match_codigo DESC, cp.grupo, cp.codigo
            LIMIT ?
            """,
            (code, code, prefix, code, prefix, code, prefix, limit),
        )
        self._attach_linked_products(rows)
        return rows

    # ------------------------------------------------------------------
    # Fichas
    # ------------------------------------------------------------------

    def get_catalog_product(self, catalog_product_id: int) -> Dict[str, Any]:
        rows = self._execute_query(
            """
            SELECT cp.*, f.nome AS fonte, f.versao AS fonte_versao
            FROM catalogo_produtos cp
            JOIN catalogo_fontes f ON f.id = cp.fonte_id
            WHERE cp.id = ?
            """,
            (catalog_product_id,),
        )
        if not rows:
            raise NotFoundException(f"Produto de catálogo {catalog_product_id} não encontrado.")
        item = rows[0]
        self._expand_catalog_product(item)
        self._attach_linked_products([item])
        return item

    def get_product_catalog_links(self, product_id: int, include_rejected: bool = False) -> List[Dict[str, Any]]:
        """Fichas de catalogo vinculadas a um produto nosso."""
        status_filter = "" if include_rejected else "AND v.status <> 'REJEITADO'"
        rows = self._execute_query(
            f"""
            SELECT cp.*, f.nome AS fonte, f.versao AS fonte_versao,
                   v.status AS vinculo_status, v.codigos_em_comum
            FROM produto_catalogo_vinculo v
            JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
            JOIN catalogo_fontes f ON f.id = cp.fonte_id
            WHERE v.produto_id = ? {status_filter}
            ORDER BY CASE v.status WHEN 'CONFIRMADO' THEN 0 WHEN 'AUTO' THEN 1 ELSE 2 END, cp.codigo
            """,
            (product_id,),
        )
        for item in rows:
            self._expand_catalog_product(item)
            item["codigos_em_comum"] = [c for c in (item.get("codigos_em_comum") or "").split(",") if c]
        return rows

    def _expand_catalog_product(self, item: Dict[str, Any]) -> None:
        cp_id = item["id"]
        try:
            item["especificacoes"] = json.loads(item.get("especificacoes") or "[]")
        except (TypeError, ValueError):
            item["especificacoes"] = []

        refs = self._execute_query(
            """
            SELECT fabricante, numero FROM catalogo_referencias
            WHERE catalogo_produto_id = ?
            ORDER BY fabricante, numero
            """,
            (cp_id,),
        )
        grouped: Dict[str, List[str]] = {}
        for ref in refs:
            grouped.setdefault(ref["fabricante"], []).append(ref["numero"])
        item["referencias"] = [{"fabricante": k, "numeros": v} for k, v in grouped.items()]

        item["aplicacoes"] = self._execute_query(
            """
            SELECT montadora, veiculo, motor, tipo, complemento FROM catalogo_aplicacoes
            WHERE catalogo_produto_id = ?
            ORDER BY montadora, veiculo
            """,
            (cp_id,),
        )
        # "Não se aplica": a tela mostra riscada (com "Desfazer"); a busca do assistente nem ve.
        from core.catalog.hidden_applications import is_hidden

        try:
            hidden = {r["chave"] for r in self._execute_query("SELECT chave FROM aplicacoes_ocultas")}
        except Exception:
            hidden = set()
        for app in item["aplicacoes"]:
            app["oculta"] = is_hidden(hidden, item.get("codigo"), app)
        item["relacionados"] = self._execute_query(
            """
            SELECT r.tipo, cp.id, cp.codigo, cp.descricao, cp.grupo
            FROM catalogo_relacionados r
            JOIN catalogo_produtos cp ON cp.id = r.relacionado_id
            WHERE r.catalogo_produto_id = ?
            ORDER BY r.tipo, cp.codigo
            """,
            (cp_id,),
        )

    def _attach_linked_products(self, items: List[Dict[str, Any]]) -> None:
        if not items:
            return
        ids = [int(i["id"]) for i in items]
        placeholders = ",".join("?" for _ in ids)
        rows = self._execute_query(
            f"""
            SELECT v.catalogo_produto_id, v.status, p.id, p.nome, p.ativo,
                   COALESCE((SELECT SUM(e.quantidade) FROM produto_estoque e WHERE e.produto_id = p.id), 0)
                       AS total_stock
            FROM produto_catalogo_vinculo v
            JOIN produtos p ON p.id = v.produto_id
            WHERE v.catalogo_produto_id IN ({placeholders}) AND v.status <> 'REJEITADO'
            ORDER BY p.ativo DESC, total_stock DESC, p.nome
            """,
            tuple(ids),
        )
        by_cp: Dict[int, List[Dict[str, Any]]] = {}
        for row in rows:
            cp_id = row.pop("catalogo_produto_id")
            by_cp.setdefault(cp_id, []).append(row)
        for item in items:
            item["produtos_vinculados"] = by_cp.get(int(item["id"]), [])

    # ------------------------------------------------------------------
    # Vinculos
    # ------------------------------------------------------------------

    def set_link(self, product_id: int, catalog_product_id: int, status: str) -> None:
        if status not in VALID_LINK_STATUSES:
            raise ValidationException(f"Status de vínculo inválido: {status}")
        if not self._exists("produtos", "id = ?", (product_id,)):
            raise ProductNotFoundException(f"Produto com ID {product_id} não encontrado.")
        if not self._exists("catalogo_produtos", "id = ?", (catalog_product_id,)):
            raise NotFoundException(f"Produto de catálogo {catalog_product_id} não encontrado.")
        self._execute_command(
            """
            INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status)
            VALUES (?, ?, ?)
            ON CONFLICT(produto_id, catalogo_produto_id)
            DO UPDATE SET status = excluded.status, atualizado_em = CURRENT_TIMESTAMP
            """,
            (product_id, catalog_product_id, status),
        )

    def list_link_review(self, kind: str, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
        """
        kind = 'MULTIPLOS': produtos ativos com >1 vinculo AUTO e nenhum CONFIRMADO.
        kind = 'SEM_VINCULO': produtos ativos sem nenhum vinculo.
        """
        if kind == "MULTIPLOS":
            return self._execute_query(
                """
                SELECT p.id, p.nome, COUNT(*) AS candidatos,
                       GROUP_CONCAT(cp.codigo, ', ') AS codigos_catalogo
                FROM produtos p
                JOIN produto_catalogo_vinculo v ON v.produto_id = p.id AND v.status = 'AUTO'
                JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
                WHERE p.ativo = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM produto_catalogo_vinculo v2
                      WHERE v2.produto_id = p.id AND v2.status = 'CONFIRMADO'
                  )
                GROUP BY p.id
                HAVING COUNT(*) > 1
                ORDER BY p.nome
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )
        if kind == "SEM_VINCULO":
            return self._execute_query(
                """
                SELECT p.id, p.nome
                FROM produtos p
                WHERE p.ativo = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM produto_catalogo_vinculo v
                      WHERE v.produto_id = p.id AND v.status <> 'REJEITADO'
                  )
                ORDER BY p.nome
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )
        raise ValidationException("Tipo de revisão inválido. Use MULTIPLOS ou SEM_VINCULO.")

    def get_status(self) -> Dict[str, Any]:
        fontes = self._execute_query(
            """
            SELECT f.id, f.codigo, f.nome, f.versao, f.data_emissao, f.importado_em,
                   (SELECT COUNT(*) FROM catalogo_produtos cp WHERE cp.fonte_id = f.id AND cp.ativo = 1)
                       AS total_produtos
            FROM catalogo_fontes f
            ORDER BY f.nome
            """
        )
        counts = self._execute_query(
            """
            SELECT
                (SELECT COUNT(*) FROM catalogo_referencias) AS total_referencias,
                (SELECT COUNT(*) FROM catalogo_aplicacoes) AS total_aplicacoes,
                (SELECT COUNT(*) FROM produtos WHERE ativo = 1) AS produtos_ativos,
                (SELECT COUNT(DISTINCT v.produto_id)
                   FROM produto_catalogo_vinculo v JOIN produtos p ON p.id = v.produto_id
                  WHERE p.ativo = 1 AND v.status <> 'REJEITADO') AS produtos_vinculados,
                (SELECT COUNT(*) FROM produto_catalogo_vinculo WHERE status = 'CONFIRMADO') AS vinculos_confirmados,
                (SELECT COUNT(*) FROM produto_catalogo_vinculo WHERE status = 'AUTO') AS vinculos_auto,
                (SELECT COUNT(*) FROM produto_catalogo_vinculo WHERE status = 'REJEITADO') AS vinculos_rejeitados
            """
        )[0]
        return {"fontes": fontes, **counts}
