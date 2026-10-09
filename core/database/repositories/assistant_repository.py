"""
Repository de leitura usado pelo assistente de IA.

So consultas (nenhuma escrita): o assistente responde perguntas sobre estoque,
nunca altera dados. As regras de busca e o formato das respostas ficam em
`app/services/assistant_tools_service.py`.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from core.database.repositories.base_repository import BaseRepository


def _placeholders(values: List[Any]) -> str:
    return ",".join("?" for _ in values)


class AssistantRepository(BaseRepository):
    """Consultas de catalogo, vinculos e locais no formato que o assistente precisa."""

    def list_applications(self) -> List[Dict[str, Any]]:
        """Todas as aplicacoes de fichas ativas (alguns milhares de linhas curtas)."""
        return self._execute_query(
            """
            SELECT a.catalogo_produto_id, a.montadora, a.veiculo, a.motor, a.tipo, a.complemento
            FROM catalogo_aplicacoes a
            JOIN catalogo_produtos cp ON cp.id = a.catalogo_produto_id
            WHERE cp.ativo = 1
            ORDER BY a.id
            """
        )

    def get_applications(self, catalog_ids: List[int]) -> List[Dict[str, Any]]:
        if not catalog_ids:
            return []
        return self._execute_query(
            f"""
            SELECT catalogo_produto_id, montadora, veiculo, motor, tipo, complemento
            FROM catalogo_aplicacoes
            WHERE catalogo_produto_id IN ({_placeholders(catalog_ids)})
            ORDER BY id
            """,
            tuple(catalog_ids),
        )

    def get_catalog_products(self, catalog_ids: List[int]) -> List[Dict[str, Any]]:
        if not catalog_ids:
            return []
        return self._execute_query(
            f"""
            SELECT id, codigo, descricao, grupo, modelo
            FROM catalogo_produtos
            WHERE id IN ({_placeholders(catalog_ids)})
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

    def get_location_labels(self) -> Dict[int, str]:
        rows = self._execute_query(
            "SELECT id, COALESCE(NULLIF(TRIM(label), ''), nome) AS nome FROM locais WHERE ativo = 1 ORDER BY ordem, id"
        )
        return {int(row["id"]): str(row["nome"]) for row in rows}
