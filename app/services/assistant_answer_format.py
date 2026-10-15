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


def _match_note(product: Dict[str, Any], catalog_note: bool = True) -> Optional[str]:
    match = product.get("correspondencia")
    note = product.get("obs_especialista")
    if match == MATCH_CATALOG and not catalog_note:
        return None
    if match == MATCH_FAMILY:
        condition = product.get("condicao")
        return f"versão {condition} do mesmo código" if condition else "versão nova/reman do mesmo código"
    if match == MATCH_EXPERT_SAME:
        return f"igual, segundo o especialista: {note}" if note else "igual, segundo o especialista"
    if match == MATCH_EXPERT_SIMILAR:
        return f"similar: {note}" if note else "similar, segundo o especialista; conferir"
    if match == MATCH_CATALOG:
        return "equivalente pelo catálogo, conferir"
    return None


def product_line(product: Dict[str, Any], catalog_note: bool = True, show_new: bool = False) -> str:
    """`show_new`: perguntaram pelas versoes, entao a nova tambem diz que e nova."""
    notes = [n for n in (_match_note(product, catalog_note),) if n]
    shown = ("nova", "reman", "montada") if show_new else ("reman", "montada")
    if product.get("correspondencia") == MATCH_EXACT and product.get("condicao") in shown:
        notes.insert(0, str(product["condicao"]))  # sem perguntar, a nova fica sem nota, como sempre
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


_BRAND_LABELS = {
    "OEM": "OEM (original da montadora)",
    "MASTER POWER": "Master Power",
    "BORGWARNER": "BorgWarner",
    "REFERÊNCIA": "de referência",
    "BTS": "BTS",
    "MWM": "MWM",
    "IHI": "IHI",
    "CZ": "CZ",
    "PAI": "PAI",
}


def _brand_label(brand: str) -> str:
    return _BRAND_LABELS.get(brand.upper(), brand.capitalize())


def _ficha_label(item: Dict[str, Any]) -> str:
    """'*805314* (MP530w — turbo HX55W HE500WG)'."""
    kind = "conjunto central" if item.get("tipo") == CATEGORY_CORE else "turbo"
    mp_name = None if item.get("ficha_propria") else item.get("modelo_master_power")
    parts = [p for p in (mp_name, f"{kind} {item['modelo']}" if item.get("modelo") else None) if p]
    return f"*{item['ficha']}*" + (f" ({' — '.join(parts)})" if parts else "")


def _identification(items: List[Dict[str, Any]]) -> Optional[str]:
    """
    'É código OEM (original da montadora); no catálogo Master Power é a *805314* (...).' para um
    codigo que nao e nosso mas esta no catalogo. None se o catalogo nao diz de quem e o codigo.
    """
    own_ficha = [i for i in items if i.get("e_o_codigo_da_ficha")]
    if own_ficha:
        return f"É o código Master Power da ficha {_ficha_label(own_ficha[0])}."
    found = [i for i in items if i.get("codigo_pesquisado_e")]
    if not found:
        return None
    found.sort(key=lambda i: 1 if i.get("tipo") == CATEGORY_CORE else 0)
    brands = list(dict.fromkeys(b for i in found for b in i["codigo_pesquisado_e"]))
    fichas = ", ".join(_ficha_label(i) for i in found[:3])
    where = "é a" if len(found) == 1 else "aparece em"
    if all(i.get("ficha_propria") for i in found):
        place = "na ficha própria"
    elif any(i.get("ficha_propria") for i in found):
        place = "no catálogo e na ficha própria"
    else:
        place = "no catálogo Master Power"
    return f"É código {' e '.join(_brand_label(b) for b in brands)}; {place} {where} {fichas}."


_VERSION_LABELS = {"nova": "Nova", "reman": "Reman", "montada": "Montada"}


def _version_lines(products: List[Dict[str, Any]], wanted: List[str]) -> List[str]:
    """
    "Tem montada ou reman?": uma linha por versao pedida, dizendo se temos, mesmo que seja "nao".
    So o proprio codigo e a versao nova/reman dele contam (nao os equivalentes).
    """
    own = [p for p in products if p.get("correspondencia") in (MATCH_EXACT, MATCH_FAMILY)]
    lines = []
    for version in wanted:
        of_version = [p for p in own if p.get("condicao") == version]
        in_stock = [p for p in of_version if p["estoque_total"] > 0]
        label = _VERSION_LABELS.get(version, version.capitalize())
        if in_stock:
            listed = "; ".join(f"*{p['nome']}* — {stock_text(p)}" for p in in_stock[:3])
            lines.append(f"{label}: temos — {listed}")
        elif of_version:
            lines.append(f"{label}: não temos em estoque (cadastrada, zerada).")
        else:
            lines.append(f"{label}: não temos.")
    return lines


COMPACT_HEADER = "*Consulta Estoque*"
_COMPACT_SUFFIX = {"nova": "", "reman": " REMAN", "montada": " MONTADA"}
_COMPACT_NOTE = {
    MATCH_EXPERT_SAME: "igual",
    MATCH_EXPERT_SIMILAR: "similar",
    MATCH_CATALOG: "equivalente",
}


def _main_code(name: str) -> Optional[str]:
    from core.catalog.normalization import extract_codes_from_name

    codes = extract_codes_from_name(name, expand_family=False)
    if not codes:
        return None
    # O numero da peca, nao o modelo: "GTC4594SBN - 852915-5007S" -> 852915-5007S.
    best = max(codes, key=lambda c: sum(ch.isdigit() for ch in c))
    return display_code(best, garrett=len(re.sub(r"\D", "", best)) == 10)


def format_code_compact(code_label: str, output: Dict[str, Any], locations: List[str]) -> Optional[str]:
    """
    Formato do chefe no WhatsApp: uma linha por versao e por filial, sem aplicacao.
        📍Canoas: 01 - 4031195
        📍Canoas: 00 - 4031195 MONTADA
    Mostra a nova, as versoes que temos cadastradas e as que a pessoa pediu (mesmo zeradas).
    None quando nao ha produto nosso do codigo (a resposta normal explica melhor).
    """
    products = output.get("produtos") or []
    own = [p for p in products if p.get("correspondencia") in (MATCH_EXACT, MATCH_FAMILY)]
    others = [p for p in products if p.get("correspondencia") in _COMPACT_NOTE and p["estoque_total"] > 0]
    if not own and not others:
        return None
    places = locations or sorted({loc for p in products for loc in (p.get("estoque_por_local") or {})}) or ["Estoque"]
    wanted = set(output.get("versoes_pedidas") or [])
    lines: List[str] = []
    for version in ("nova", "reman", "montada"):
        of_version = [p for p in own if (p.get("condicao") or "nova") == version]
        if not of_version and version not in wanted and not (version == "nova" and not own):
            continue
        for place in places:
            qty = sum(int((p.get("estoque_por_local") or {}).get(place, 0)) for p in of_version)
            lines.append(f"📍{place}: {qty:02d} - {code_label}{_COMPACT_SUFFIX[version]}")
    for product in others[:3]:
        code = _main_code(product["nome"]) or product["nome"]
        for place, qty in (product.get("estoque_por_local") or {}).items():
            lines.append(f"📍{place}: {int(qty):02d} - {code} ({_COMPACT_NOTE[product['correspondencia']]})")
    return "\n".join(lines)


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
    own = any(p.get("correspondencia") in (MATCH_EXACT, MATCH_FAMILY) for p in products)
    identified = None if own else _identification(output.get("fichas_catalogo") or [])
    asked_versions = bool(output.get("versoes_pedidas"))
    if own_stock:
        lines = [f"{label}: temos."] + [product_line(p, show_new=asked_versions) for p in with_stock[:MAX_LINES]]
    elif identified:
        # Codigo de outro fabricante (OEM, Mahle, Master Power...): o cliente pediu por ele, e as nossas
        # turbinas daquela ficha sao a mesma peca na marca que vendemos. Entao "temos", sem "conferir".
        if with_stock:
            lines = [f"{label}: temos.", identified] + [
                product_line(p, catalog_note=False) for p in with_stock[:MAX_LINES]
            ]
        elif products:
            lines = [f"{label}: não temos em estoque no momento.", identified]
        else:
            lines = [f"{label}: não temos.", f"{identified[:-1]}; não temos nenhuma turbina dela cadastrada."]
    elif with_stock:
        lines = [f"{label}: não temos esse código, mas temos:"] + [product_line(p) for p in with_stock[:MAX_LINES]]
    elif products:
        # Cadastrado e zerado: a lista de produtos "sem estoque" so poluia a resposta.
        lines = [f"{label}: não temos em estoque no momento."]
    elif items or taught:
        lines = [f"{label}: não temos esse código no estoque."]
    elif output.get("parecidos"):
        # Numero que nao existe (audio transcrito errado): as Garrett com o mesmo comeco.
        lookalikes = output["parecidos"]
        lines = [f"{label}: não encontrei esse número. Será uma destas (mesmo começo Garrett)?"]
        lines += [
            f"• *{p['codigo_parecido']}* — *{p['nome']}* — {stock_text(p)}" for p in lookalikes
        ]
        return "\n".join(lines)
    else:
        return f"{label}: não encontrei no estoque nem no catálogo. Confira o número."

    lines += _version_lines(products, output.get("versoes_pedidas") or [])

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
    elif source == "cadastro" and relation.get("produto"):
        confirmed = False
        lines = [f"{pair}: provavelmente são iguais. O cadastro junta os dois em *{relation.get('produto')}*."]
    elif source == "cadastro":
        # Mais de um passo no grafo de codigos: mostra o caminho, para o especialista conferir.
        confirmed = False
        lines = [f"{pair}: provavelmente são iguais, pelo caminho:"]
        lines += [f"• {a} → {b} ({reason})" for a, b, reason in relation.get("caminho") or []]
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


def _application_items(output: Dict[str, Any], core_question: bool) -> "tuple[List[Dict[str, Any]], Optional[str]]":
    """As fichas que a resposta por veiculo mostra, ou o texto para quando nao ha nenhuma."""
    if "erro" in output:
        return [], HELP_TEXT
    all_items = output.get("fichas_catalogo") or []
    if not all_items:
        return [], HELP_TEXT
    served = [i for i in all_items if i.get("atendemos_marca")]
    if not served:
        return [], "Para essa aplicação o catálogo só tem turbinas de marcas com que não trabalhamos."
    turbos = [i for i in served if i.get("tipo") != CATEGORY_CORE]
    cores = [i for i in served if i.get("tipo") == CATEGORY_CORE]
    if core_question:
        return cores or turbos, None
    if turbos:
        # Conjunto central so aparece numa pergunta de turbina quando temos em estoque.
        return turbos + [i for i in cores if _has_stock(i)], None
    return cores, None


def _has_stock(item: Dict[str, Any]) -> bool:
    return any(p["estoque_total"] > 0 for p in item.get("nossos_produtos") or [])


def _asks_engine(output: Dict[str, Any], items: List[Dict[str, Any]]) -> bool:
    """Ha opcoes de motores diferentes e a pergunta nao disse qual: pergunta o motor ou o ano."""
    engines = set()
    for item in items:
        first_app = (item.get("aplicacoes") or [{}])[0]
        engines.add(first_app.get("motor") or first_app.get("veiculo"))
    # Motor ja informado ("scania 440" + "dc13") e ainda ha opcoes: lista sem perguntar de novo.
    return len(engines) > 1 and not _engine_given(output, items)


ENGINE_QUESTION = "Qual é o motor ou o ano do veículo?"  # a resposta curta ("d13", "2015") junta com esta pergunta
MORE_OPTIONS = "Há mais opções; mande o motor ou o ano para filtrar."


def _year_note(output: Dict[str, Any]) -> Optional[str]:
    year = output.get("ano_fora_do_catalogo")
    return f"⚠️ O catálogo não tem essa aplicação em {year}; estas são de outros anos. Conferir." if year else None


def format_application_answer(output: Dict[str, Any], core_question: bool = False) -> str:
    """Resposta para buscar_por_aplicacao."""
    items, message = _application_items(output, core_question)
    if message:
        return message

    lines = []
    for item in items[:MAX_LINES]:
        first_app = (item.get("aplicacoes") or [{}])[0]
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

    asks_engine = _asks_engine(output, items[:MAX_LINES])
    if asks_engine:
        header = "Depende do motor:"
    else:
        header = "Temos:" if any(_has_stock(i) for i in items[:MAX_LINES]) else "Não temos no momento:"
    text = "\n".join([header, *lines])
    if _year_note(output):
        text += f"\n{_year_note(output)}"
    if output.get("fichas_omitidas") or len(items) > MAX_LINES:
        text += f"\n{MORE_OPTIONS}"
    if asks_engine:
        text += f"\n{ENGINE_QUESTION}"
    return text


def format_application_compact(output: Dict[str, Any], core_question: bool, locations: List[str]) -> Optional[str]:
    """
    Busca por veiculo no formato do chefe no WhatsApp: um bloco por opcao, com o motor, o modelo
    e o codigo nosso por filial.
        *MD13 Euro 3 450 - 490HP* · HX55
        📍Canoas: 05 - 4031195
        📍Passo Fundo: 00 - 4031195
    None quando nao ha opcao para mostrar (a mensagem normal explica).
    """
    items, message = _application_items(output, core_question)
    if message:
        return None
    shown = items[:MAX_LINES]
    blocks = []
    for item in shown:
        first_app = (item.get("aplicacoes") or [{}])[0]
        models = " / ".join(str(item.get("modelo") or "").split(" / ")[:2])  # "GTA42S / GTC4294BNS"
        kind = "conjunto central " if item.get("tipo") == CATEGORY_CORE else ""
        lines = [f"*{_application_label(first_app)}* · {kind}{models}".rstrip(" ·")]
        ours = sorted(item.get("nossos_produtos") or [], key=lambda p: -p["estoque_total"])
        if ours:
            product = ours[0]
            code = _main_code(product["nome"]) or product["nome"]
            stock = product.get("estoque_por_local") or {}
            for place in locations or list(stock) or ["Estoque"]:
                lines.append(f"📍{place}: {int(stock.get(place, 0)):02d} - {code}")
        else:
            lines.append("❌ Não temos")
        blocks.append("\n".join(lines))
    tail = [_year_note(output)] if _year_note(output) else []
    if output.get("fichas_omitidas") or len(items) > MAX_LINES:
        tail.append(MORE_OPTIONS)
    if _asks_engine(output, shown):
        tail.append(ENGINE_QUESTION)
    return "\n\n".join(blocks + (["\n".join(tail)] if tail else []))
