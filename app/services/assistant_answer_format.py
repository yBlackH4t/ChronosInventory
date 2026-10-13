"""
Respostas prontas no estilo WhatsApp a partir dos resultados das buscas.

Usadas pela busca direta (sem IA) e devolvidas pelas ferramentas no campo
"texto_pronto": o modelo de IA gratuito erra formato e regras com frequencia,
entao a resposta vem montada pelo sistema e a IA so escolhe a busca e junta os
textos quando precisa ("a IA entende, o sistema responde").
"""

from __future__ import annotations

import re
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


_GARRETT_CODE = re.compile(r"^\d{6}-\d{4}[A-Z]*$")
_CODE_SEPARATORS = re.compile(r"[\s.\-/]")


def display_code(code: Optional[str], garrett: bool = False) -> str:
    """
    Codigo no formato da empresa: so a Garrett usa hifen (796155-5002); BorgWarner, Holset e os
    demais sao so digitos (53279887101), mesmo que venham com hifens ou espacos ("532-7988-7101"
    na transcricao do audio). `garrett` = a busca sabe que e Garrett (digitado sem o hifen).
    """
    text = " ".join(str(code or "").split()).upper()
    if _GARRETT_CODE.match(text):
        return text
    digits = _CODE_SEPARATORS.sub("", text)
    if not digits.isdigit():
        return text
    if garrett and len(digits) == 10:
        return f"{digits[:6]}-{digits[6:]}"
    return digits


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


def short_applications(item: Dict[str, Any], limit: int = 2) -> str:
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
        # Cadastrado e zerado: a lista de produtos "sem estoque" so poluia a resposta.
        lines = [f"{label}: não temos em estoque no momento."]
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
        lines.append(f"• {kind.capitalize()} segundo o especialista: {display_code(relation['codigo'])}{note} — não temos")

    if items:
        item = items[0]
        apps = short_applications(item)
        model = item.get("modelo") or item.get("ficha")
        if item.get("tipo") == CATEGORY_CORE:
            model = f"conjunto central {model}"
        lines.append(f"Aplicação ({model}): {apps}" if apps else f"Catálogo: {model}")
    return "\n".join(lines)


_NATURE_LABELS = {
    "AJUSTE": "ajuste de estoque",
    "DEVOLUCAO": "devolução",
    "TRANSFERENCIA_EXTERNA": "transferência externa",
}


def _br_date(value: Any) -> str:
    """'2026-03-27 17:46:22' -> '27/03/2026'."""
    text = str(value or "")[:10]
    return f"{text[8:10]}/{text[5:7]}/{text[:4]}" if len(text) == 10 and text[4] == "-" else text


def _movement_line(label: str, row: Optional[Dict[str, Any]], show_product: bool) -> str:
    if not row:
        return f"• {label}: nenhuma registrada"
    qty = int(row.get("quantidade") or 0)
    text = f"• {label}: {_br_date(row.get('data_hora'))} — {qty} un."
    origin, destination = row.get("origem"), row.get("destino") or row.get("local_externo")
    if row.get("tipo") == "TRANSFERENCIA":
        text += f" de {origin or 'outro local'} para {destination or 'outro local'}"
    elif row.get("tipo") == "SAIDA" and origin:
        text += f" de {origin}"
    elif row.get("tipo") == "ENTRADA" and destination:
        text += f" em {destination}"
    details = [
        _NATURE_LABELS.get(str(row.get("natureza") or "").upper()),
        " ".join(str(row.get("observacao") or "").split())[:60] or None,
        row.get("documento"),
    ]
    details = [d for d in details if d]
    if details:
        text += f" ({', '.join(details)})"
    if show_product:
        text += f" — {row.get('produto')}"
    return text


def format_movements_answer(code_label: str, output: Dict[str, Any], window_days: int) -> str:
    """Resposta para movimentacoes_produto: ultima saida, entrada e transferencia, e quanto saiu."""
    label = f"*{code_label}*"
    if not output.get("produtos_cadastrados"):
        return f"{label}: não achei esse código no cadastro."
    last = output.get("ultimas") or {}
    since = _br_date(output.get("registros_desde")) if output.get("registros_desde") else None
    if not any(last.values()):
        note = f" (os registros começam em {since})" if since else ""
        return f"{label}: nenhuma movimentação registrada{note}."
    # Varias versoes (nova, reman, montado): cada linha diz de qual produto foi.
    show_product = len({r.get("produto") for r in last.values() if r}) > 1
    lines = [
        f"{label}:",
        _movement_line("Última saída", last.get("SAIDA"), show_product),
        _movement_line("Última entrada", last.get("ENTRADA"), show_product),
    ]
    if last.get("TRANSFERENCIA"):
        lines.append(_movement_line("Última transferência", last["TRANSFERENCIA"], show_product))
    total = f"; desde {since}: {output.get('saidas_total', 0)} un." if since else ""
    lines.append(f"Saíram {output.get('saidas_ultimos_dias', 0)} un. nos últimos {window_days} dias{total}")
    return "\n".join(lines)


def format_catalog_code_answer(code_label: str, fichas: List[Dict[str, Any]]) -> str:
    """Resposta para codigo_master_power: a ficha (codigo Master Power) e o modelo da turbina."""
    label = f"*{code_label}*"
    if not fichas:
        return f"{label}: não achei esse código no catálogo Master Power."

    def describe(ficha: Dict[str, Any]) -> str:
        model = str(ficha.get("modelo") or "").strip()
        mp, _, turbo = model.partition("(")
        kind = "conjunto central" if ficha.get("tipo") == CATEGORY_CORE else "turbo"
        text = f"*{ficha['codigo']}*"
        if mp.strip():
            text += f" — {mp.strip()}"
        if turbo.strip(" )"):
            text += f" ({kind} {turbo.strip(' )')})"
        return text

    if len(fichas) == 1:
        return f"{label}: no catálogo Master Power é a {describe(fichas[0])}."
    return "\n".join([f"{label}: no catálogo Master Power:", *[f"• {describe(f)}" for f in fichas[:MAX_LINES]]])


def format_comparison_answer(
    code_a: str, code_b: str, relation: Dict[str, Any], catalog_lines: Optional[List[str]] = None
) -> str:
    """Resposta para comparar_codigos ("a A e a mesma que a B?"): a relacao, sem falar de estoque."""
    pair = f"*{code_a}* e *{code_b}*"
    kind, source, note = relation.get("relacao"), relation.get("fonte"), relation.get("obs")
    confirmed = True
    if kind == "mesma_peca":
        lines = [f"{pair}: é a mesma peça (versão nova/reman do mesmo código)."]
    elif kind == "igual":
        lines = [f"{pair}: sim, são iguais (troca direta), segundo o especialista."]
        if note:
            lines.append(f"Obs.: {note}")
    elif kind == "similar":
        lines = [f"{pair}: são similares, segundo o especialista: serve com ressalva."]
        lines.append(f"Ressalva: {note}" if note else "Confira antes de trocar.")
    elif kind == "diferente":
        lines = [f"{pair}: não, são diferentes; uma não serve no lugar da outra (segundo o especialista)."]
    elif source == "cadastro":
        confirmed = False
        lines = [f"{pair}: provavelmente são iguais. O cadastro junta os dois em *{relation.get('produto')}*."]
    else:
        confirmed = False
        lines = [f"{pair}: não sei dizer se são iguais. O especialista ainda não ensinou essa."]
    if catalog_lines:
        lines += ["No catálogo:", *catalog_lines]
    if not confirmed:
        lines.append("Deixei para o especialista confirmar.")
    return "\n".join(lines)


def _engine_given(output: Dict[str, Any], items: List[Dict[str, Any]]) -> bool:
    """A pergunta ja dizia o motor? (uma palavra dela esta no motor de todas as opcoes, ex.: "dc13")"""
    common: Optional[set] = None
    for item in items:
        app = (item.get("aplicacoes") or [{}])[0]
        words = set(search_words(str(app.get("motor") or ""))) - set(search_words(str(app.get("veiculo") or "")))
        common = words if common is None else common & words
    return bool(common and common & set(output.get("termos_usados") or []))


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
            status = f"✅ *{in_stock[0]['nome']}* — {stock_text(in_stock[0])}"
        elif ours:
            status = "❌ não temos (cadastrado, sem estoque)"
        else:
            status = "❌ não temos"
        # Uma opcao em duas linhas: o motor/aplicacao e, embaixo, se temos (era tudo numa linha so).
        lines.append(f"• {_application_label(first_app)} → {_kind(item)} {item.get('modelo') or ''}".rstrip())
        lines.append(f"   {status}")

    any_stock = any(has_stock(i) for i in items[:MAX_LINES])
    # Motor ja informado ("scania 440" + "dc13") e ainda ha opcoes: lista sem perguntar de novo.
    if len(engines) > 1 and not _engine_given(output, items[:MAX_LINES]):
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
