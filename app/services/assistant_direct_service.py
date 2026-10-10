"""
Busca direta: responde perguntas de estoque sem IA (docs/PLANO_IA.md).

Usada quando nenhum provedor de IA esta configurado e como reserva quando a IA
falha (limite gratuito atingido, sem internet...). Regras simples:
- a mensagem tem codigo de peca -> buscar_por_codigo para cada codigo (ate 3);
- senao -> buscar_por_aplicacao com o texto. Se a ultima resposta foi uma pergunta
  ("Qual e o motor?"), junta a pergunta anterior do usuario com a resposta dele
  ("scania 440" + "dc13").
A resposta sai de textos prontos, no estilo WhatsApp, so com o que as buscas devolveram.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.assistant_common import MODE_DIRECT, cited_products, collect_products, make_result
from app.services.assistant_tools_service import CATEGORY_CORE, MATCH_CATALOG, MATCH_FAMILY, AssistantToolsService
from core.catalog.normalization import canonical_code, extract_codes_from_name, search_words

MAX_CODES_PER_MESSAGE = 3
MAX_LINES = 6

CORE_WORDS = {"CONJUNTO", "CENTRAL", "MIOLO", "CORE", "CHRA"}

HELP_TEXT = (
    "Não encontrei nada para essa pergunta. Mande o código da peça (ex.: 4031196) "
    "ou o veículo/motor (ex.: scania 440, volvo fh 460)."
)


def _stock_text(product: Dict[str, Any]) -> str:
    places = product.get("estoque_por_local") or {}
    if not places:
        return "sem estoque"
    parts = [f"{qty} em {place}" for place, qty in places.items()]
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " e " + parts[-1]


def _product_line(product: Dict[str, Any]) -> str:
    notes = []
    if product.get("correspondencia") == MATCH_FAMILY:
        notes.append("versão nova/reman do mesmo código")
    elif product.get("correspondencia") == MATCH_CATALOG:
        notes.append("equivalente pelo catálogo, conferir")
    if product.get("categoria") == CATEGORY_CORE:
        notes.append("conjunto central")
    suffix = f" ({'; '.join(notes)})" if notes else ""
    return f"• *{product['nome']}* — {_stock_text(product)}{suffix}"


def _application_label(app: Dict[str, Any]) -> str:
    label = app.get("motor") or app.get("veiculo") or "?"
    if app.get("obs"):
        label += f" ({app['obs']})"
    return label


def _short_applications(item: Dict[str, Any], limit: int = 2) -> str:
    labels = []
    for app in item.get("aplicacoes") or []:
        text = app.get("veiculo") or ""
        if app.get("motor"):
            text += f" ({app['motor']})"
        if text and text not in labels:
            labels.append(text)
    return "; ".join(labels[:limit])


def _kind(item: Dict[str, Any]) -> str:
    return "conjunto central" if item.get("tipo") == CATEGORY_CORE else "turbo"


class AssistantDirectService:
    def __init__(self, tools: Optional[AssistantToolsService] = None) -> None:
        self.tools = tools or AssistantToolsService()

    def answer(self, mensagem: str, historico: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        found: Dict[int, Dict[str, Any]] = {}
        tools_used: List[str] = []

        codes = extract_codes_from_name(mensagem, expand_family=False)[:MAX_CODES_PER_MESSAGE]
        if codes:
            parts = []
            for code in codes:
                output = self.tools.run_tool("buscar_por_codigo", {"codigo": code})
                tools_used.append("buscar_por_codigo")
                collect_products(output, found)
                parts.append(self._format_code(code, output))
            text = "\n\n".join(parts)
        else:
            output = None
            for query in self._application_queries(mensagem, historico or []):
                output = self.tools.run_tool("buscar_por_aplicacao", {"texto": query})
                tools_used.append("buscar_por_aplicacao")
                if "erro" not in output and output.get("total_fichas"):
                    break
            if output is None or "erro" in output:
                text = HELP_TEXT
            else:
                collect_products(output, found)
                wants_core = bool(CORE_WORDS & set(search_words(mensagem)))
                text = self._format_application(output, wants_core)

        return make_result(text, cited_products(text, found), tools_used, MODE_DIRECT)

    # ------------------------------------------------------------------

    @staticmethod
    def _application_queries(mensagem: str, historico: List[Dict[str, str]]) -> List[str]:
        """Pergunta atual; antes dela, a pergunta anterior + a atual se o assistente tinha perguntado algo."""
        queries = [mensagem]
        if len(historico) >= 2:
            last, previous = historico[-1], historico[-2]
            asked_back = last.get("papel") == "assistente" and str(last.get("texto") or "").strip().endswith("?")
            previous_text = str(previous.get("texto") or "")
            if (
                asked_back
                and previous.get("papel") == "usuario"
                and not extract_codes_from_name(previous_text, expand_family=False)
            ):
                queries.insert(0, f"{previous_text} {mensagem}")
        return queries

    @staticmethod
    def _format_code(code: str, output: Dict[str, Any]) -> str:
        if "erro" in output:
            return HELP_TEXT
        label = f"*{canonical_code(code)}*"
        products = output.get("produtos") or []
        items = [i for i in output.get("fichas_catalogo") or [] if i.get("atendemos_marca")] or (
            output.get("fichas_catalogo") or []
        )
        # A ficha da turbina completa explica melhor a aplicacao que a do conjunto central.
        items = sorted(items, key=lambda i: 1 if i.get("tipo") == CATEGORY_CORE else 0)
        with_stock = [p for p in products if p["estoque_total"] > 0]

        if with_stock:
            lines = [f"{label}: temos."] + [_product_line(p) for p in with_stock[:MAX_LINES]]
        elif products:
            lines = [f"{label}: não temos em estoque no momento."]
            lines += [_product_line(p) for p in products[:3]]
        elif items:
            lines = [f"{label}: não temos esse código no estoque."]
        else:
            return f"{label}: não encontrei no estoque nem no catálogo. Confira o número."

        if items:
            item = items[0]
            apps = _short_applications(item)
            info = f"Catálogo: {_kind(item)} {item.get('modelo') or item.get('ficha')}"
            lines.append(f"{info} — {apps}" if apps else info)
        return "\n".join(lines)

    @staticmethod
    def _format_application(output: Dict[str, Any], wants_core: bool = False) -> str:
        all_items = output.get("fichas_catalogo") or []
        if not all_items:
            return HELP_TEXT
        served = [i for i in all_items if i.get("atendemos_marca")]
        if not served:
            return "Para essa aplicação o catálogo só tem turbinas de marcas com que não trabalhamos."

        def has_stock(item: Dict[str, Any]) -> bool:
            return any(p["estoque_total"] > 0 for p in item.get("nossos_produtos") or [])

        turbos = [i for i in served if i.get("tipo") != CATEGORY_CORE]
        cores = [i for i in served if i.get("tipo") == CATEGORY_CORE]
        if wants_core:
            items = cores or turbos
        elif turbos:
            # Conjunto central so aparece numa pergunta de turbina quando temos em estoque.
            items = turbos + [i for i in cores if has_stock(i)]
        else:
            items = cores

        lines = []
        engines = set()
        for item in items[:MAX_LINES]:
            first_app = (item.get("aplicacoes") or [{}])[0]
            engines.add(first_app.get("motor") or first_app.get("veiculo"))
            ours = item.get("nossos_produtos") or []
            in_stock = [p for p in ours if p["estoque_total"] > 0]
            if in_stock:
                status = f"*{in_stock[0]['nome']}* — {_stock_text(in_stock[0])}"
            elif ours:
                status = "não temos (cadastrado, sem estoque)"
            else:
                status = "não temos"
            lines.append(f"• {_application_label(first_app)} → {_kind(item)} {item.get('modelo') or ''}: {status}")

        any_stock = any(has_stock(i) for i in items[:MAX_LINES])
        if len(engines) > 1:
            header = "Depende do motor:"
            footer = "Qual é o motor do cliente?"
        else:
            header = "Temos:" if any_stock else "Não temos no momento:"
            footer = None
        text = "\n".join([header, *lines])
        if output.get("fichas_omitidas") or len(items) > MAX_LINES:
            text += "\nHá mais opções; mande o motor ou o ano para filtrar."
        if footer:
            text += f"\n{footer}"
        return text
