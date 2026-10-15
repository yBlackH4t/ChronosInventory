"""
Repository de leitura usado pelo assistente de IA.

So consultas (nenhuma escrita): o assistente responde perguntas sobre estoque,
nunca altera dados. As regras de busca e o formato das respostas ficam em
`app/services/assistant_tools_service.py`.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from core.catalog.hidden_applications import filter_rows
from core.database.repositories.base_repository import BaseRepository


def _placeholders(values: List[Any]) -> str:
    return ",".join("?" for _ in values)


class AssistantRepository(BaseRepository):
    """Consultas de catalogo, vinculos e locais no formato que o assistente precisa."""

    def _hidden_application_keys(self) -> set:
        """Aplicacoes que o especialista marcou como "não se aplica" (core/catalog/hidden_applications.py)."""
        try:
            rows = self._execute_query("SELECT chave FROM aplicacoes_ocultas")
        except Exception:
            return set()
        return {row["chave"] for row in rows}

    def list_applications(self) -> List[Dict[str, Any]]:
        """Todas as aplicacoes de fichas ativas (alguns milhares de linhas curtas), sem as escondidas."""
        rows = self._execute_query(
            """
            SELECT a.catalogo_produto_id, a.montadora, a.veiculo, a.motor, a.tipo, a.complemento,
                   cp.codigo_norm AS ficha_norm
            FROM catalogo_aplicacoes a
            JOIN catalogo_produtos cp ON cp.id = a.catalogo_produto_id
            WHERE cp.ativo = 1
            ORDER BY a.id
            """
        )
        return filter_rows(rows, self._hidden_application_keys())

    def get_applications(self, catalog_ids: List[int]) -> List[Dict[str, Any]]:
        if not catalog_ids:
            return []
        rows = self._execute_query(
            f"""
            SELECT a.catalogo_produto_id, a.montadora, a.veiculo, a.motor, a.tipo, a.complemento,
                   cp.codigo_norm AS ficha_norm
            FROM catalogo_aplicacoes a
            JOIN catalogo_produtos cp ON cp.id = a.catalogo_produto_id
            WHERE a.catalogo_produto_id IN ({_placeholders(catalog_ids)})
            ORDER BY a.id
            """,
            tuple(catalog_ids),
        )
        return filter_rows(rows, self._hidden_application_keys())

    def get_catalog_products(self, catalog_ids: List[int]) -> List[Dict[str, Any]]:
        if not catalog_ids:
            return []
        return self._execute_query(
            f"""
            SELECT cp.id, cp.codigo, cp.descricao, cp.grupo, cp.modelo, f.codigo AS fonte
            FROM catalogo_produtos cp
            LEFT JOIN catalogo_fontes f ON f.id = cp.fonte_id
            WHERE cp.id IN ({_placeholders(catalog_ids)})
            """,
            tuple(catalog_ids),
        )

    def get_references(self, catalog_ids: List[int], manufacturers: Iterable[str]) -> List[Dict[str, Any]]:
        """Referencias cruzadas das fichas, so dos fabricantes pedidos, na ordem do catalogo."""
        brands = list(manufacturers)
        if not catalog_ids or not brands:
            return []
        return self._execute_query(
            f"""
            SELECT catalogo_produto_id, fabricante, numero
            FROM catalogo_referencias
            WHERE catalogo_produto_id IN ({_placeholders(catalog_ids)})
              AND fabricante IN ({_placeholders(brands)})
            ORDER BY id
            """,
            tuple(catalog_ids) + tuple(brands),
        )

    def get_reference_brands(self, catalog_ids: List[int], codes: List[str]) -> List[Dict[str, Any]]:
        """De que fabricante e o codigo em cada ficha (OEM, Mahle, Garrett...): as referencias que batem."""
        if not catalog_ids or not codes:
            return []
        return self._execute_query(
            f"""
            SELECT catalogo_produto_id, fabricante, numero
            FROM catalogo_referencias
            WHERE catalogo_produto_id IN ({_placeholders(catalog_ids)})
              AND numero_norm IN ({_placeholders(codes)})
            ORDER BY id
            """,
            (*catalog_ids, *codes),
        )

    def get_linked_product_ids(self, catalog_ids: List[int]) -> List[Dict[str, Any]]:
        """Nossos produtos ativos ligados as fichas (vinculos rejeitados ficam de fora)."""
        if not catalog_ids:
            return []
        return self._execute_query(
            f"""
            SELECT v.catalogo_produto_id, v.produto_id
            FROM produto_catalogo_vinculo v
            JOIN produtos p ON p.id = v.produto_id
            WHERE v.catalogo_produto_id IN ({_placeholders(catalog_ids)})
              AND v.status <> 'REJEITADO'
              AND p.ativo = 1
            """,
            tuple(catalog_ids),
        )

    def get_product_catalog_ids(self, product_ids: List[int]) -> List[Dict[str, Any]]:
        """Fichas ligadas a cada um dos nossos produtos (vinculos rejeitados ficam de fora)."""
        if not product_ids:
            return []
        return self._execute_query(
            f"""
            SELECT produto_id, catalogo_produto_id
            FROM produto_catalogo_vinculo
            WHERE produto_id IN ({_placeholders(product_ids)})
              AND status <> 'REJEITADO'
            ORDER BY CASE status WHEN 'CONFIRMADO' THEN 0 ELSE 1 END, catalogo_produto_id
            """,
            tuple(product_ids),
        )

    def codes_ending_with(self, suffix: str, limit: int = 50) -> List[str]:
        """
        Codigos completos que terminam com `suffix` ("9887101" -> "53279887101"): nos nossos
        produtos, nas referencias do catalogo e na base de conhecimento.
        """
        pattern, size = f"%{suffix}", len(suffix)
        rows = self._execute_query(
            """
            SELECT numero_norm AS codigo FROM produto_codigos WHERE numero_norm LIKE ? AND LENGTH(numero_norm) > ?
            UNION
            SELECT numero_norm FROM catalogo_referencias WHERE numero_norm LIKE ? AND LENGTH(numero_norm) > ?
            UNION
            SELECT codigo_a_norm FROM conhecimento_equivalencias WHERE codigo_a_norm LIKE ? AND LENGTH(codigo_a_norm) > ?
            UNION
            SELECT codigo_b_norm FROM conhecimento_equivalencias WHERE codigo_b_norm LIKE ? AND LENGTH(codigo_b_norm) > ?
            ORDER BY 1
            LIMIT ?
            """,
            (pattern, size, pattern, size, pattern, size, pattern, size, limit),
        )
        return [str(row["codigo"]) for row in rows]

    def known_codes(self, codes: List[str]) -> set:
        """Quais destes codigos a empresa conhece: estao no nome de um produto nosso ou na base de conhecimento."""
        if not codes:
            return set()
        marks = _placeholders(codes)
        rows = self._execute_query(
            f"""
            SELECT numero_norm AS codigo FROM produto_codigos WHERE numero_norm IN ({marks})
            UNION
            SELECT codigo_a_norm FROM conhecimento_equivalencias WHERE codigo_a_norm IN ({marks})
            UNION
            SELECT codigo_b_norm FROM conhecimento_equivalencias WHERE codigo_b_norm IN ({marks})
            """,
            tuple(codes) * 3,
        )
        return {str(row["codigo"]) for row in rows}

    def get_movements(self, product_ids: List[int], limit: int = 200) -> List[Dict[str, Any]]:
        """Movimentacoes dos produtos, da mais recente para a mais antiga, com o nome dos locais."""
        if not product_ids:
            return []
        return self._execute_query(
            f"""
            SELECT m.id, m.data_hora, m.tipo, m.produto_id, p.nome AS produto, m.quantidade, m.observacao,
                   m.natureza, m.documento, m.local_externo,
                   COALESCE(NULLIF(TRIM(lo.label), ''), lo.nome) AS origem,
                   COALESCE(NULLIF(TRIM(ld.label), ''), ld.nome) AS destino
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            LEFT JOIN locais lo ON lo.id = m.origem_local_id
            LEFT JOIN locais ld ON ld.id = m.destino_local_id
            WHERE m.produto_id IN ({_placeholders(product_ids)})
            ORDER BY m.data_hora DESC, m.id DESC
            LIMIT ?
            """,
            (*product_ids, limit),
        )

    def first_movement_date(self) -> Optional[str]:
        """Data da movimentacao mais antiga do banco (desde quando ha registro)."""
        rows = self._execute_query("SELECT MIN(data_hora) AS primeira FROM movimentacoes")
        return str(rows[0]["primeira"]) if rows and rows[0]["primeira"] else None

    def get_location_labels(self) -> Dict[int, str]:
        rows = self._execute_query(
            "SELECT id, COALESCE(NULLIF(TRIM(label), ''), nome) AS nome FROM locais WHERE ativo = 1 ORDER BY ordem, id"
        )
        return {int(row["id"]): str(row["nome"]) for row in rows}
