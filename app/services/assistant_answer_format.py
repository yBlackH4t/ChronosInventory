"""
Respostas prontas no estilo WhatsApp a partir dos resultados das buscas.

Usadas pela busca direta (sem IA) e devolvidas pelas ferramentas no campo
"texto_pronto": o modelo de IA gratuito erra formato e regras com frequencia,
entao a resposta vem montada pelo sistema e a IA so escolhe a busca e junta os
textos quando precisa ("a IA entende, o sistema responde").
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.assistant_common import (
    CATEGORY_CORE,
    MATCH_CATALOG,
    MATCH_EXACT,
    MATCH_EXPERT_SAME,
    MATCH_EXPERT_SIMILAR,
    MATCH_FAMILY,
)
from core.catalog.normalization import search_words

MAX_LINES = 6
CORE_WORDS = {"CONJUNTO", "CONJUNTOS", "CENTRAL", "CENTRAIS", "MIOLO", "CORE", "CHRA"}

HELP_TEXT = (
    "Não encontrei nada para essa pergunta. Mande o código da peça (ex.: 4031196) "
    "ou o veículo/motor (ex.: scania 440, volvo fh 460)."
)


def wants_core(text: Optional[str]) -> bool:
    """A pergunta e sobre conjunto central (miolo), e nao sobre a turbina completa?"""
    return bool(CORE_WORDS & set(search_words(text)))


def stock_text(product: Dict[str, Any]) -> str:
    places = product.get("estoque_por_local") or {}
    if not places:
        return "sem estoque"
    parts = [f"{qty} em {place}" for place, qty in places.items()]
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " e " + parts[-1]


def _match_note(product: Dict[str, Any]) -> Optional[str]:
    match = product.get("correspondencia")
    note = product.get("obs_especialista")
    if match == MATCH_FAMILY:
        return "versão nova/reman do mesmo código"
    if match == MATCH_EXPERT_SAME:
        return f"igual, segundo o especialista: {note}" if note else "igual, segundo o especialista"
    if match == MATCH_EXPERT_SIMILAR:
        return f"similar: {note}" if note else "similar, segundo o especialista; conferir"
    if match == MATCH_CATALOG:
        return "equivalente pelo catálogo, conferir"
    return None


def product_line(product: Dict[str, Any]) -> str:
    notes = [n for n in (_match_note(product),) if n]
    if product.get("categoria") == CATEGORY_CORE:
        notes.append("conjunto central")
    suffix = f" ({'; '.join(notes)})" if notes else ""
    return f"• *{product['nome']}* — {stock_text(product)}{suffix}"


def _kind(item: Dict[str, Any]) -> str:
    return "conjunto central" if item.get("tipo") == CATEGORY_CORE else "turbo"


def _short_applications(item: Dict[str, Any], limit: int = 2) -> str:
    labels: List[str] = []
    for app in item.get("aplicacoes") or []:
        text = app.get("veiculo") or ""
        if app.get("motor"):
            text += f" ({app['motor']})"
        if text and text not in labels:
            labels.append(text)
    return "; ".join(labels[:limit])


def _application_label(app: Dict[str, Any]) -> str:
    label = app.get("motor") or app.get("veiculo") or "?"
    if app.get("obs"):
        label += f" ({app['obs']})"
    return label


def format_code_answer(code_label: str, output: Dict[str, Any]) -> str:
    """Resposta para buscar_por_codigo. `code_label` e o codigo como a pessoa escreveu."""
    if "erro" in output:
        return HELP_TEXT
    label = f"*{code_label}*"
    products = output.get("produtos") or []
    items = [i for i in output.get("fichas_catalogo") or [] if i.get("atendemos_marca")] or (
        output.get("fichas_catalogo") or []
    )
    # A ficha da turbina completa explica melhor a aplicacao que a do conjunto central.
    items = sorted(items, key=lambda i: 1 if i.get("tipo") == CATEGORY_CORE else 0)
    taught = output.get("conhecimento_especialista") or []

    with_stock = [p for p in products if p["estoque_total"] > 0]
    own_stock = [p for p in with_stock if p.get("correspondencia") in (MATCH_EXACT, MATCH_FAMILY)]
    if own_stock:
        lines = [f"{label}: temos."] + [product_line(p) for p in with_stock[:MAX_LINES]]
    elif with_stock:
        lines = [f"{label}: não temos esse código, mas temos:"] + [product_line(p) for p in with_stock[:MAX_LINES]]
    elif products:
        lines = [f"{label}: não temos em estoque no momento."] + [product_line(p) for p in products[:3]]
    elif items or taught:
        lines = [f"{label}: não temos esse código no estoque."]
    else:
        return f"{label}: não encontrei no estoque nem no catálogo. Confira o número."

    # O que o especialista ensinou e nao temos cadastrado: avisa mesmo assim.
    shown = {p.get("codigo_relacionado") for p in products}
    for relation in taught:
        if relation["codigo"] in shown:
            continue
        kind = "igual" if relation.get("relacao") == "igual" else "similar"
        note = f" ({relation['obs']})" if relation.get("obs") else ""
        lines.append(f"• {kind.capitalize()} segundo o especialista: {relation['codigo']}{note} — não temos")

    if items:
        item = items[0]
        apps = _short_applications(item)
        info = f"Catálogo: {_kind(item)} {item.get('modelo') or item.get('ficha')}"
        lines.append(f"{info} — {apps}" if apps else info)
    return "\n".join(lines)


def format_application_answer(output: Dict[str, Any], core_question: bool = False) -> str:
    """Resposta para buscar_por_aplicacao."""
    if "erro" in output:
        return HELP_TEXT
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
    if core_question:
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
            status = f"*{in_stock[0]['nome']}* — {stock_text(in_stock[0])}"
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
