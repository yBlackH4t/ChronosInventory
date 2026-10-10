"""
Ferramentas de consulta do assistente de IA (Fase 1 do docs/PLANO_IA.md).

O modelo de linguagem nao consulta o banco sozinho: ele escolhe uma destas
ferramentas, o backend executa a busca (SQL deterministico) e devolve um JSON
enxuto. A resposta ao usuario e escrita so com o que voltou daqui, entao estas
funcoes sao a fonte da verdade sobre o que temos em estoque.

Todas sao somente leitura.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from core.catalog.normalization import (
    canonical_code,
    expand_family_codes,
    extract_codes_from_name,
    search_words,
)
from core.database.repositories.assistant_repository import AssistantRepository
from core.database.repositories.catalog_repository import CatalogRepository, MIN_PREFIX_SEARCH_LENGTH
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import ValidationException

# Marcas com que a empresa trabalha. Referencias de outros fabricantes (OEM, Mahle,
# Master Power...) continuam valendo para a busca, mas nao aparecem nas respostas.
SERVED_BRANDS = ("GARRETT", "HOLSET", "BORGWARNER")



@dataclass(frozen=True)
class ResultLimits:
    """Quanto cada ferramenta devolve. O modo compacto cabe em limites gratuitos (ex.: Groq)."""

    products: int = 15
    catalog_items: int = 12
    code_catalog_items: int = 5
    applications_per_item: int = 8
    detail_applications: int = 15
    refs_per_brand: int = 5


DEFAULT_LIMITS = ResultLimits()
COMPACT_LIMITS = ResultLimits(
    products=8, catalog_items=6, code_catalog_items=3, applications_per_item=3, detail_applications=6, refs_per_brand=3
)

MATCH_EXACT = "exato"
MATCH_FAMILY = "familia"
MATCH_CATALOG = "equivalente_catalogo"

CATEGORY_TURBO = "TURBO"
CATEGORY_CORE = "CONJUNTO CENTRAL"

# Palavras da pergunta que nao ajudam a achar a aplicacao.
_STOPWORDS = {
    "A", "AS", "O", "OS", "E", "UM", "UMA", "DE", "DA", "DO", "DAS", "DOS", "PARA", "PRA", "PRO",
    "TEM", "TEMOS", "TENHO", "TENS", "QUAL", "QUAIS", "ESTOQUE", "NO", "NA",
    "TURBINA", "TURBINAS", "TURBO", "TURBOS", "TURBOCOMPRESSOR", "TURBOCOMPRESSORES",
    "CAMINHAO", "CAMINHOES", "ONIBUS", "MOTOR", "CV", "HP", "CAVALOS",
    "CONJUNTO", "CONJUNTOS", "CENTRAL", "CENTRAIS", "MIOLO", "CORE", "CHRA",
}

# Apelidos de montadora -> palavras como aparecem no catalogo (qualquer uma serve).
_SYNONYMS = {
    "VW": ("VW", "VOLKSWAGEN"),
    "VOLKS": ("VOLKSWAGEN",),
    "MB": ("MB", "MERCEDES"),
    "MERCEDEZ": ("MERCEDES",),
    "CHEVROLET": ("CHEVROLET", "GM"),
    "CAT": ("CAT", "CATERPILLAR"),
    "MF": ("MF", "MASSEY"),
    "NH": ("NH", "HOLLAND"),
    "JD": ("JD", "DEERE"),
}

_PARENS = re.compile(r"\(([^)]*)\)")


def _product_category(nome: str) -> str:
    upper = (nome or "").upper()
    return CATEGORY_CORE if ("CONJ" in upper or "CENTRAL" in upper or "MIOLO" in upper) else CATEGORY_TURBO


def _turbo_models(modelo: Optional[str]) -> Optional[str]:
    """'MP530w (HX55W HE500WG)' -> 'HX55W HE500WG' (o que vem antes e o modelo Master Power)."""
    if not modelo:
        return None
    match = _PARENS.search(modelo)
    return (match.group(1) if match else modelo).strip() or None


def _application_label(app: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "montadora": app.get("montadora"),
        "veiculo": app.get("veiculo"),
        "motor": app.get("motor"),
    }
    complemento = " ".join(str(app.get("complemento") or "").split())
    if complemento:
        item["obs"] = complemento
    return item


class AssistantToolsService:
    """Buscas que o assistente pode pedir. Cada metodo devolve um dict pronto para virar JSON."""

    def __init__(
        self,
        repository: Optional[AssistantRepository] = None,
        product_repository: Optional[ProductRepository] = None,
        catalog_repository: Optional[CatalogRepository] = None,
        limits: ResultLimits = DEFAULT_LIMITS,
    ) -> None:
        self.repository = repository or AssistantRepository()
        self.products = product_repository or ProductRepository()
        self.catalog = catalog_repository or CatalogRepository()
        self.limits = limits

    def with_limits(self, limits: ResultLimits) -> "AssistantToolsService":
        """Mesmo servico (mesmos repositorios) com outros limites de tamanho."""
        return AssistantToolsService(self.repository, self.products, self.catalog, limits)

    # ------------------------------------------------------------------
    # Ferramentas
    # ------------------------------------------------------------------

    def search_by_code(self, codigo: str) -> Dict[str, Any]:
        code = canonical_code(codigo)
        if len(code) < 4 or not any(ch.isdigit() for ch in code):
            raise ValidationException(
                "Codigo muito curto. Informe o numero da peca (ex.: 4031196, 466646-5041S)."
            )

        locations = self.repository.get_location_labels()
        found = self.products.get_all(search_term=code, status="ATIVO")
        products = [
            {**self._product_summary(p, locations), "correspondencia": self._code_match(code, p["nome"])}
            for p in found
        ]
        rank = {MATCH_EXACT: 0, MATCH_FAMILY: 1, MATCH_CATALOG: 2}
        products.sort(key=lambda p: (rank[p["correspondencia"]], -p["estoque_total"], p["nome"]))

        catalog_ids = [int(row["id"]) for row in self.catalog.search_catalog(code, limit=self.limits.code_catalog_items)]
        catalog_items = self._catalog_items(catalog_ids, highlight=set(expand_family_codes([code])))
        applications = self._group_applications(self.repository.get_applications(catalog_ids))
        for item in catalog_items:
            apps = applications.get(item["id"], [])
            item["aplicacoes"] = [_application_label(a) for a in apps[:self.limits.applications_per_item]]
            if len(apps) > self.limits.applications_per_item:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.applications_per_item

        result: Dict[str, Any] = {
            "codigo_pesquisado": code,
            "temos_em_estoque": any(p["estoque_total"] > 0 for p in products),
            "produtos": products[:self.limits.products],
            "fichas_catalogo": [self._public_item(i) for i in catalog_items],
        }
        if len(products) > self.limits.products:
            result["produtos_omitidos"] = len(products) - self.limits.products
        return result

    def search_by_application(self, texto: str) -> Dict[str, Any]:
        terms = [w for w in search_words(texto) if w not in _STOPWORDS]
        if not terms:
            raise ValidationException(
                "Informe a montadora, o modelo do veiculo ou o motor (ex.: 'scania 440', 'volvo fh 460', 'om 366')."
            )
        alternatives = [set(_SYNONYMS.get(term, (term,))) for term in terms]

        matched: "OrderedDict[int, List[Dict[str, Any]]]" = OrderedDict()
        for app in self.repository.list_applications():
            words = set(
                search_words(
                    " ".join(str(app.get(k) or "") for k in ("montadora", "veiculo", "motor", "complemento"))
                )
            )
            if all(options & words for options in alternatives):
                matched.setdefault(int(app["catalogo_produto_id"]), []).append(app)

        catalog_items = self._catalog_items(list(matched.keys()))
        self._attach_our_products(catalog_items)
        for item in catalog_items:
            apps = self._dedupe_applications(matched[item["id"]])
            item["aplicacoes"] = [_application_label(a) for a in apps[:self.limits.applications_per_item]]
            if len(apps) > self.limits.applications_per_item:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.applications_per_item

        catalog_items.sort(
            key=lambda i: (
                -sum(p["estoque_total"] for p in i["nossos_produtos"]),
                0 if i["nossos_produtos"] else 1,
                0 if i["atendemos_marca"] else 1,
                0 if i["tipo"] == CATEGORY_TURBO else 1,
                i["ficha"],
            )
        )

        result: Dict[str, Any] = {
            "termos_usados": terms,
            "total_fichas": len(catalog_items),
            "temos_em_estoque": any(p["estoque_total"] > 0 for i in catalog_items for p in i["nossos_produtos"]),
            "fichas_catalogo": [self._public_item(i) for i in catalog_items[:self.limits.catalog_items]],
        }
        if len(catalog_items) > self.limits.catalog_items:
            result["fichas_omitidas"] = len(catalog_items) - self.limits.catalog_items
            result["dica"] = "Muitos resultados: peca ao usuario o motor, o ano ou o modelo exato."
        if not catalog_items:
            result["dica"] = "Nada encontrado com todas as palavras. Tente com menos palavras ou so o motor."
        return result

    def product_details(self, produto_id: int) -> Dict[str, Any]:
        product = self.products.get_by_id(int(produto_id))
        if not product:
            raise ValidationException(f"Produto {produto_id} nao encontrado.")

        summary = self._product_summary(product, self.repository.get_location_labels())
        summary["ativo"] = bool(product.get("ativo", 1))
        if product.get("observacao"):
            summary["observacao"] = str(product["observacao"])[:300]

        catalog_ids = [int(r["catalogo_produto_id"]) for r in self.repository.get_product_catalog_ids([product["id"]])]
        catalog_items = self._catalog_items(catalog_ids, highlight=set(extract_codes_from_name(product["nome"])))
        applications = self._group_applications(self.repository.get_applications(catalog_ids))
        for item in catalog_items:
            apps = applications.get(item["id"], [])
            item["aplicacoes"] = [_application_label(a) for a in apps[: self.limits.detail_applications]]
            if len(apps) > self.limits.detail_applications:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.detail_applications
        summary["fichas_catalogo"] = [self._public_item(i) for i in catalog_items]
        return summary

    # ------------------------------------------------------------------
    # Execucao por nome (usado pelo modelo de linguagem)
    # ------------------------------------------------------------------

    def run_tool(self, name: str, arguments: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Executa uma ferramenta pelo nome. Erros voltam como {'erro': ...} para o modelo ler."""
        handlers: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
            "buscar_por_codigo": lambda a: self.search_by_code(str(a["codigo"])),
            "buscar_por_aplicacao": lambda a: self.search_by_application(str(a["texto"])),
            "detalhe_produto": lambda a: self.product_details(int(a["produto_id"])),
        }
        handler = handlers.get(name)
        if handler is None:
            return {"erro": f"Ferramenta desconhecida: {name}"}
        try:
            return handler(arguments or {})
        except KeyError as exc:
            return {"erro": f"Parametro obrigatorio ausente: {exc.args[0]}"}
        except (TypeError, ValueError):
            return {"erro": "Parametro invalido."}
        except ValidationException as exc:
            return {"erro": str(exc)}

    # ------------------------------------------------------------------
    # Montagem das respostas
    # ------------------------------------------------------------------

    @staticmethod
    def _product_summary(product: Dict[str, Any], locations: Dict[int, str]) -> Dict[str, Any]:
        stock: Dict[str, int] = {}
        for location_id, qty in (product.get("inventories") or {}).items():
            qty = int(qty or 0)
            if qty and int(location_id) in locations:
                stock[locations[int(location_id)]] = qty
        return {
            "id": int(product["id"]),
            "nome": product["nome"],
            "categoria": _product_category(product["nome"]),
            "estoque_total": sum(stock.values()),
            "estoque_por_local": stock,
        }

    @staticmethod
    def _code_match(code: str, nome: str) -> str:
        own = extract_codes_from_name(nome, expand_family=False)
        prefix_ok = len(code) >= MIN_PREFIX_SEARCH_LENGTH
        if any(c == code or (prefix_ok and c.startswith(code)) for c in own):
            return MATCH_EXACT
        family = set(expand_family_codes([code])) - {code}
        if any(c in family for c in extract_codes_from_name(nome)):
            return MATCH_FAMILY
        if code in canonical_code(nome):
            return MATCH_EXACT
        return MATCH_CATALOG

    def _catalog_items(self, catalog_ids: List[int], highlight: Optional[set] = None) -> List[Dict[str, Any]]:
        """Resumo das fichas. Referencias em `highlight` (o codigo pesquisado) vem primeiro."""
        if not catalog_ids:
            return []
        rows = {int(r["id"]): r for r in self.repository.get_catalog_products(catalog_ids)}
        refs: Dict[int, Dict[str, List[str]]] = {}
        references = self.repository.get_references(catalog_ids, SERVED_BRANDS)
        if highlight:
            references.sort(key=lambda r: 0 if canonical_code(r["numero"]) in highlight else 1)
        for ref in references:
            by_brand = refs.setdefault(int(ref["catalogo_produto_id"]), {})
            numbers = by_brand.setdefault(ref["fabricante"], [])
            if ref["numero"] not in numbers:
                numbers.append(ref["numero"])

        items = []
        for cp_id in catalog_ids:
            row = rows.get(cp_id)
            if not row:
                continue
            brand_refs = refs.get(cp_id, {})
            items.append(
                {
                    "id": cp_id,
                    "ficha": row["codigo"],
                    "tipo": CATEGORY_CORE if "CONJUNTO" in str(row.get("grupo") or "").upper() else CATEGORY_TURBO,
                    "modelo": _turbo_models(row.get("modelo")),
                    "atendemos_marca": bool(brand_refs),
                    "referencias": {
                        brand: numbers[:self.limits.refs_per_brand] for brand, numbers in brand_refs.items()
                    },
                }
            )
        return items

    def _attach_our_products(self, items: List[Dict[str, Any]]) -> None:
        links = self.repository.get_linked_product_ids([i["id"] for i in items])
        product_ids = sorted({int(link["produto_id"]) for link in links})
        locations = self.repository.get_location_labels()
        products = {
            int(p["id"]): self._product_summary(p, locations) for p in self.products.get_by_ids(product_ids)
        }
        by_item: Dict[int, List[Dict[str, Any]]] = {}
        for link in links:
            summary = products.get(int(link["produto_id"]))
            if summary:
                by_item.setdefault(int(link["catalogo_produto_id"]), []).append(summary)
        for item in items:
            ours = by_item.get(item["id"], [])
            ours.sort(key=lambda p: (-p["estoque_total"], p["nome"]))
            item["nossos_produtos"] = ours

    @staticmethod
    def _group_applications(rows: List[Dict[str, Any]]) -> Dict[int, List[Dict[str, Any]]]:
        grouped: Dict[int, List[Dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(int(row["catalogo_produto_id"]), []).append(row)
        return {k: AssistantToolsService._dedupe_applications(v) for k, v in grouped.items()}

    @staticmethod
    def _dedupe_applications(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out = []
        for row in rows:
            key = (row.get("montadora"), row.get("veiculo"), row.get("motor"), row.get("complemento"))
            if key not in seen:
                seen.add(key)
                out.append(row)
        return out

    @staticmethod
    def _public_item(item: Dict[str, Any]) -> Dict[str, Any]:
        """Tira o id interno da ficha (o modelo usa o codigo da ficha, nao o id)."""
        return {k: v for k, v in item.items() if k != "id"}


# Definicao das ferramentas para o modelo de linguagem (formato tool use: name,
# description, input_schema). As descricoes sao as instrucoes que o modelo le.
ASSISTANT_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "buscar_por_codigo",
        "description": (
            "Procura no estoque pelo codigo de uma peca: numero Holset, Garrett, BorgWarner, "
            "codigo OEM da montadora ou Master Power. Aceita o codigo como o usuario escreveu "
            "(com hifen, espacos, sufixo S ou RX). Devolve nossos produtos com estoque por local "
            "e o tipo de correspondencia: 'exato' (o codigo esta no nome do produto), 'familia' "
            "(variante nova/remanufaturada do mesmo codigo) ou 'equivalente_catalogo' (outro codigo "
            "que o catalogo diz ser intercambiavel). Tambem devolve as fichas do catalogo com as aplicacoes."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "codigo": {"type": "string", "description": "Codigo da peca, ex.: 4031196, 466646-5041S, 53279887116."}
            },
            "required": ["codigo"],
        },
    },
    {
        "name": "buscar_por_aplicacao",
        "description": (
            "Procura turbinas pela aplicacao: montadora, modelo do veiculo ou maquina, potencia e/ou motor "
            "(ex.: 'scania 440', 'volvo fh 460', 'mercedes om 366', 'dc13'). Todas as palavras precisam "
            "aparecer na aplicacao; se nada voltar, tente de novo com menos palavras. O mesmo veiculo pode "
            "usar turbinas diferentes conforme motor e ano: cada ficha vem com as aplicacoes que bateram e "
            "com nossos produtos ligados a ela (com estoque). So encontra produtos ligados a uma ficha do catalogo."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "texto": {"type": "string", "description": "Montadora, modelo e/ou motor, ex.: 'scania r 440 dc13'."}
            },
            "required": ["texto"],
        },
    },
    {
        "name": "detalhe_produto",
        "description": (
            "Detalhes de um produto nosso pelo id (que vem nas outras buscas): estoque por local, "
            "observacao e todas as fichas do catalogo ligadas a ele, com referencias e aplicacoes."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {"produto_id": {"type": "integer"}},
            "required": ["produto_id"],
        },
    },
]
