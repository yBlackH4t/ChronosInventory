"""Aba Produtos em colunas (2.7.11): o codigo pesquisado separado em nova, reman, montada,
conjunto central e similares.

Usa a mesma busca do assistente (search_by_code), para a tela e o assistente acharem as mesmas
pecas: o codigo exato e a familia (nova/reman), o que o especialista ensinou (igual/similar) e o
catalogo. A tela so muda a arrumacao.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models.product import Product
from app.services.assistant_common import (
    CATEGORY_CORE,
    MATCH_CATALOG,
    MATCH_EXACT,
    MATCH_EXPERT_SAME,
    MATCH_EXPERT_SIMILAR,
    MATCH_FAMILY,
)
from app.services.assistant_tools_service import AssistantToolsService, ResultLimits, _product_category
from core.database.repositories.product_repository import ProductRepository

# Ordem das colunas na tela. Coluna vazia nao aparece.
COLUMNS = (
    ("nova", "Turbina nova"),
    ("reman", "Turbina reman"),
    ("montada", "Turbina montada"),
    ("conjunto", "Conjunto central"),
    ("par", "Par do biturbo"),
    ("similares", "Similares"),
)

RELATION_LABELS = {
    MATCH_EXPERT_SAME: "Igual",
    MATCH_EXPERT_SIMILAR: "Similar",
    MATCH_CATALOG: "Catálogo",
}

RELATION_ASSEMBLED = "montada_no_conjunto"
# Vinculo feito na tela (botao Vincular): o turbo aponta para outro produto.
RELATION_LINK = "vinculo"

# Relacoes das observacoes do cadastro da empresa (2.7.18): (coluna, rotulo) de cada tipo.
RELATION_REGISTER = "cadastro"
REGISTER_COLUMNS = {
    "PAR": ("par", "Faz par"),
    "CONJUNTO": ("conjunto", "Pelo cadastro"),
    "TURBO": ("similares", "Usa este conjunto"),
    "SUBSTITUI": ("similares", "Serve no lugar"),
    "TROCAR_POR": ("similares", "Pode trocar por"),
}

# A tela mostra tudo que achou do codigo, nao o resumo curto do assistente.
COLUMN_LIMITS = ResultLimits(products=80, code_catalog_items=3, applications_per_item=6)
MAX_APPLICATIONS = 6


class ProductColumnsService:
    def __init__(
        self,
        tools: Optional[AssistantToolsService] = None,
        products: Optional[ProductRepository] = None,
    ) -> None:
        self.tools = (tools or AssistantToolsService()).with_limits(COLUMN_LIMITS)
        self.products = products or ProductRepository()

    def columns(self, codigo: str) -> Dict[str, Any]:
        found = self.tools.search_by_code(codigo)
        groups: Dict[str, List[Dict[str, Any]]] = {key: [] for key, _ in COLUMNS}

        for item in found.get("produtos", []):
            own = item["correspondencia"] in (MATCH_EXACT, MATCH_FAMILY)
            label = None if own else RELATION_LABELS.get(item["correspondencia"])
            if item.get("obs_cadastro"):
                label = "Igual (cadastro)" if item["obs_cadastro"].startswith("igual") else "Similar (cadastro)"
            entry = {
                "produto_id": item["id"],
                "relacao": item["correspondencia"],
                "rotulo": label,
                "codigo_relacionado": item.get("codigo_relacionado"),
                "obs": item.get("obs_especialista") or item.get("obs_cadastro"),
            }
            if item["categoria"] == CATEGORY_CORE:
                groups["conjunto"].append(entry)
            elif not own:
                groups["similares"].append(entry)
            else:
                groups[item.get("condicao") or "nova"].append(entry)

            # Turbo montado faturado pelo conjunto: o saldo e o do conjunto, entao a montada e o
            # conjunto (e e nele que se movimenta). A busca ja tirou esse conjunto da lista.
            assembled = item.get("montada_no_conjunto")
            if own and assembled:
                groups["montada"].append(
                    {
                        "produto_id": assembled["id"],
                        "relacao": RELATION_ASSEMBLED,
                        "rotulo": None,
                        "codigo_relacionado": None,
                        "obs": None,
                        "turbo_id": item["id"],
                        "turbo_nome": item["nome"],
                    }
                )

        self._add_links(found.get("produtos", []), groups)
        self._add_register_relations(found.get("relacoes_cadastro", []), groups)

        ids = sorted({entry["produto_id"] for entries in groups.values() for entry in entries})
        by_id = {int(row["id"]): Product.from_dict(row).to_dict() for row in self.products.get_by_ids(ids)}

        columns = []
        for key, title in COLUMNS:
            items = [{**entry, "produto": by_id[entry["produto_id"]]} for entry in groups[key] if entry["produto_id"] in by_id]
            if items:
                columns.append({"chave": key, "titulo": title, "itens": items})

        # Todos os campos sempre presentes: a rota devolve o dicionario direto (ok() nao aplica os
        # padroes do schema) e a tela le codigos_possiveis mesmo sem resultado.
        return {
            "codigo": found.get("codigo_pesquisado"),
            "codigo_digitado": found.get("codigo_digitado"),
            "colunas": columns,
            "aplicacoes": _applications(found.get("fichas_catalogo", [])),
            "codigos_possiveis": found.get("codigos_possiveis") or [],
            # Busca ampla (prefixo, modelo): a tela avisa e manda para a lista, que pagina.
            "produtos_omitidos": found.get("produtos_omitidos") or 0,
        }

    def _add_links(self, found: List[Dict[str, Any]], groups: Dict[str, List[Dict[str, Any]]]) -> None:
        """Produtos ligados pelo botao Vincular a peca pesquisada (turbo ou conjunto) e que a busca
        nao trouxe: o pai (conjunto sem saldo, ou outra turbina) e os filhos. Conjunto vai na coluna
        de conjunto e turbina em similares."""
        shown = {entry["produto_id"] for entries in groups.values() for entry in entries}
        own_ids = [int(item["id"]) for item in found if item["correspondencia"] in (MATCH_EXACT, MATCH_FAMILY)]
        linked: List[Dict[str, Any]] = []
        for row in self.products.get_by_ids(own_ids):
            if row.get("produto_vinculado_id"):
                linked.extend(self.products.get_by_ids([int(row["produto_vinculado_id"])]))
            linked.extend(self.products.get_linked_products(int(row["id"])))
        for row in linked:
            product_id = int(row["id"])
            if product_id in shown or not row.get("ativo", 1):
                continue
            shown.add(product_id)
            column = "conjunto" if _product_category(row["nome"]) == CATEGORY_CORE else "similares"
            groups[column].append(
                {
                    "produto_id": product_id,
                    "relacao": RELATION_LINK,
                    "rotulo": "Vinculado",
                    "codigo_relacionado": None,
                    "obs": None,
                }
            )


    @staticmethod
    def _add_register_relations(relations: List[Dict[str, Any]], groups: Dict[str, List[Dict[str, Any]]]) -> None:
        """Par do biturbo, conjunto, substituto e turbo do conjunto escritos no cadastro da empresa."""
        shown = {entry["produto_id"] for entries in groups.values() for entry in entries}
        for link in relations:
            column, label = REGISTER_COLUMNS.get(link["tipo"], ("similares", "Pelo cadastro"))
            for product in link.get("produtos") or []:
                if product["id"] in shown:
                    continue
                shown.add(product["id"])
                groups[column].append(
                    {
                        "produto_id": product["id"],
                        "relacao": RELATION_REGISTER,
                        "rotulo": label,
                        "codigo_relacionado": None,
                        "obs": link.get("obs"),
                    }
                )


def _applications(fichas: List[Dict[str, Any]]) -> List[str]:
    """Aplicacoes da primeira ficha do catalogo, em texto curto ("Volvo FH 460 · MD13 ...")."""
    if not fichas:
        return []
    labels = []
    for app in fichas[0].get("aplicacoes", [])[:MAX_APPLICATIONS]:
        parts = [app.get("veiculo") or app.get("montadora"), app.get("motor")]
        label = " · ".join(str(p) for p in parts if p)
        if label and label not in labels:
            labels.append(label)
    return labels
