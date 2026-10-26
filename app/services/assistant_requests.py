from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.services.assistant_common import MODE_DIRECT, collect_products, make_result
from core.catalog.normalization import canonical_code, extract_codes_from_name, search_words

LOG = logging.getLogger(__name__)
MAX_REQUESTS = 30
MAX_LOOKUPS = 60
VERSIONS = {"NOVA": "nova", "NOVO": "nova", "REMAN": "reman", "REMANUFATURADA": "reman",
            "RECONDICIONADA": "reman", "MONTADA": "montada", "MONTADO": "montada", "RX": "reman"}
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9.\-]*")
_SPOKEN = re.compile(r"(?<!\w)(?:\d{4}[ \t]+\d{3}[ \t]+\d{4}|\d{6}[ \t]+[059]\d{3}|\d{3}[ \t]+\d{4})(?!\w)")
_SUFFIX = re.compile(r"[ \t]*(ou|e|/|,)[ \t]*(?:a[ \t]+)?(\d{4})(?!\d)", re.IGNORECASE)
_YEAR = re.compile(r"^(?:19[5-9]\d|20[0-4]\d)$")
_VEHICLE = re.compile(r"\b(?:scania|volvo|mercedes|ford|iveco|agrale|volkswagen|cummins|axor|atego|actros)\b|\b(?:fh|fm)\s*\d{2,4}\b", re.IGNORECASE)
_OTHER_INTENTS = {"IGUAL", "IGUAIS", "MESMA", "MESMO", "EQUIVALENTE", "SUBSTITUI", "COMPATIVEL",
                  "DIFERENTE", "SERVE", "SAIU", "SAIRAM", "ENTROU", "ENTRARAM", "CHEGOU", "CHEGARAM",
                  "VENDEMOS", "VENDEU", "MOVIMENTACAO", "MOVIMENTACOES", "HISTORICO", "FICHA", "MASTER"}


class RequestItem(BaseModel):
    id: str = ""
    intencao: str = "estoque"
    trecho: str = Field(default="", max_length=8000)
    codigos: list[str] = Field(default_factory=list, max_length=10)
    alternativas: bool = False
    versoes: list[str] = Field(default_factory=list, max_length=3)
    local: str | None = Field(default=None, max_length=60)
    veiculo: str | None = Field(default=None, max_length=100)
    motor: str | None = Field(default=None, max_length=60)
    ano: str | None = Field(default=None, max_length=20)
    norma: str | None = Field(default=None, max_length=30)
    quantidade_pedida: int | None = Field(default=None, ge=1, le=100000)
    pendencias: list[str] = Field(default_factory=list, max_length=10)


def code_mentions(text: str) -> list[dict[str, Any]]:
    mentions: list[dict[str, Any]] = []
    combined = [(match.start(), match.end(), canonical_code(match.group())) for match in _SPOKEN.finditer(text)
                if not any(_YEAR.fullmatch(part) for part in match.group().split())]
    for start, end, code in combined:
        mentions.append({"codigo": code, "inicio": start, "fim": end, "grupo": start})
    for match in _TOKEN.finditer(text):
        if any(start <= match.start() < end for start, end, _ in combined):
            continue
        codes = extract_codes_from_name(match.group(), expand_family=False)
        if codes:
            mentions.append({"codigo": codes[0], "inicio": match.start(), "fim": match.end(), "grupo": match.start()})
    for mention in list(mentions):
        code = mention["codigo"]
        if not (code.isdigit() and len(code) in (10, 11)):
            continue
        end = mention["fim"]
        while match := _SUFFIX.match(text, end):
            expanded = code[:-4] + match.group(2)
            if len(code) == 10 and expanded[6] not in "059":
                break
            connector = match.group(1).lower()
            mentions.append({"codigo": expanded, "inicio": match.start(2), "fim": match.end(2),
                             "grupo": mention["grupo"] if connector in ("ou", "/") else match.start(2),
                             "prefixo": code[:-4]})
            end = match.end()
    mentions.sort(key=lambda mention: (mention["inicio"], mention["fim"]))
    for previous, current in zip(mentions, mentions[1:]):
        connector = text[previous["fim"]:current["inicio"]].strip().lower()
        if connector in ("ou", "/"):
            current["grupo"] = previous["grupo"]
    return mentions


def supported_codes(codes: list[str], texts: list[str]) -> list[str]:
    allowed = {mention["codigo"] for text in texts for mention in code_mentions(text)}
    return list(dict.fromkeys(canonical_code(code) for code in codes if canonical_code(code) in allowed))


def literal_plan(text: str) -> list[RequestItem]:
    if _OTHER_INTENTS & set(search_words(text)):
        return []
    mentions = code_mentions(text)
    items: list[RequestItem] = []
    groups: dict[int, list[dict[str, Any]]] = {}
    for mention in mentions:
        groups.setdefault(mention["grupo"], []).append(mention)
    ordered = list(groups.values())
    for index, group in enumerate(ordered):
        start = group[0]["inicio"]
        end = group[-1]["fim"]
        next_start = ordered[index + 1][0]["inicio"] if index + 1 < len(ordered) else len(text)
        previous_end = ordered[index - 1][-1]["fim"] if index else 0
        following = re.split(r"\b(?:e|ou)\b|[,;\n]", text[end:next_start], maxsplit=1, flags=re.IGNORECASE)[0]
        preceding = re.split(r"\b(?:e|ou)\b|[,;\n]", text[previous_end:start], flags=re.IGNORECASE)[-1]
        version_text = following.strip() or preceding.strip()
        versions = sorted({VERSIONS[word] for word in search_words(version_text) if word in VERSIONS})
        local_match = re.search(r"\b(?:em|na filial|no estoque de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,40})", following, re.IGNORECASE)
        items.append(RequestItem(id=str(index + 1), trecho=text[start:next_start].strip(),
                                 codigos=list(dict.fromkeys(mention["codigo"] for mention in group)),
                                 alternativas=len(group) > 1, versoes=versions,
                                 local=local_match.group(1).strip() if local_match else None))
    for match in re.finditer(r"\bou\s+(?:(?:nova|reman|montada)\s+)?(\d{4})(?!\d)", text, re.IGNORECASE):
        if not any(mention["inicio"] <= match.start(1) < mention["fim"] for mention in mentions):
            previous = [index for index, group in enumerate(ordered) if group[0]["inicio"] < match.start()]
            if previous:
                items[previous[-1]].pendencias = ["codigo"]
    if items:
        for clause in re.split(r"\s+e\s+|[;\n]", text, flags=re.IGNORECASE):
            if _VEHICLE.search(clause) and not code_mentions(clause):
                items.append(RequestItem(intencao="aplicacao", trecho=clause.strip()))
        items.sort(key=lambda item: text.find(item.trecho))
        for index, item in enumerate(items, 1):
            item.id = str(index)
    return items


def needs_plan(items: list[RequestItem], text: str) -> bool:
    return bool(items) and (len(items) > 1 or any(item.alternativas or item.local or item.pendencias for item in items)
        or set(code for item in items for code in item.codigos) != set(extract_codes_from_name(text, expand_family=False)))


def validated_plan(raw: Any, text: str, history: list[dict[str, str]] | None = None,
                   examples: list[dict[str, str]] | None = None) -> list[RequestItem]:
    if not isinstance(raw, list) or len(raw) > MAX_REQUESTS:
        return []
    items: list[RequestItem] = []
    reference = bool({"ESSA", "ESSE", "DELA", "DAQUELA", "PRIMEIRA", "SEGUNDA", "DESSA"} & set(search_words(text)))
    texts = [text] + ([str(item.get("texto") or "") for item in (history or [])[-6:]] if reference else [])
    for value in raw:
        try:
            item = RequestItem.model_validate(value)
        except (ValidationError, TypeError):
            return []
        if item.intencao not in ("estoque", "aplicacao", "comparar", "movimentacao", "codigo_master_power"):
            return []
        if item.trecho and item.trecho not in text:
            return []
        item.trecho = item.trecho or text
        source = " ".join(texts) if reference else item.trecho
        source_key = " " + " ".join(search_words(source)) + " "
        approved = [example["consulta"] for example in examples or []
                    if " " + " ".join(search_words(example["pergunta"])) + " " in source_key]
        codes = supported_codes(item.codigos, texts + approved)
        if item.codigos and len(codes) != len(set(map(canonical_code, item.codigos))):
            return []
        item.codigos = codes
        item.versoes = [version for version in item.versoes if version in ("nova", "reman", "montada")]
        source_words = set(search_words(" ".join([source, *approved])))
        for field in ("veiculo", "motor", "ano", "norma", "local"):
            value = getattr(item, field)
            if value and not set(search_words(value)) <= source_words:
                return []
        if not codes and item.intencao != "aplicacao" and not item.pendencias:
            return []
        item.id = str(len(items) + 1)
        items.append(item)
    if not items:
        return []
    covered = {code for item in items for code in item.codigos}
    for literal in literal_plan(text):
        if literal.pendencias:
            for item in items:
                if item.intencao == "estoque" and set(item.codigos) & set(literal.codigos):
                    item.pendencias = literal.pendencias
        missing = [code for code in literal.codigos if code not in covered]
        if missing:
            literal.codigos = missing
            literal.id = str(len(items) + 1)
            items.append(literal)
            covered.update(missing)
        if literal.intencao == "aplicacao" and not any(item.intencao == "aplicacao" and literal.trecho in item.trecho for item in items):
            literal.id = str(len(items) + 1)
            items.append(literal)
    return items


def pending_fields(answer: str) -> list[str]:
    if "?" not in answer:
        return []
    question = " ".join(line for line in answer.splitlines() if "?" in line)
    words = set(search_words(question))
    return [field for field, options in (("motor", {"MOTOR", "MOTORES"}), ("ano", {"ANO"}),
                                         ("codigo", {"CODIGO", "PECA"}), ("veiculo", {"VEICULO", "MODELO"}),
                                         ("norma", {"NORMA", "EURO", "EMISSAO"}),
                                         ("versao", {"VERSAO", "CONDICAO", "NOVA", "REMAN", "MONTADA"}),
                                         ("local", {"FILIAL", "LOCAL", "LOJA"}))
            if words & options]


def execute_plan(items: list[RequestItem], tools: Any, compact: bool = False) -> dict[str, Any]:
    from app.services.assistant_answer_format import COMPACT_HEADER
    from app.services.assistant_direct_service import AssistantDirectService

    if len(items) > MAX_REQUESTS or sum(max(1, len(item.codigos)) for item in items) > MAX_LOOKUPS:
        return make_result(f"O pedido é grande demais para uma consulta. Divida em até {MAX_REQUESTS} itens; "
                           "nenhuma peça foi consultada ou descartada.", [], [], MODE_DIRECT, "limite_de_pedidos")
    parts: list[str] = []
    found: dict[int, dict[str, Any]] = {}
    statuses: list[dict[str, Any]] = []
    used: list[str] = []
    for item in items:
        entry = item.model_dump()
        entry["resultados"] = []
        if (compact and len(items) > 1) or item.alternativas:
            parts.append(f"*Pedido {item.id}" + (" — alternativas (ou)*" if item.alternativas else "*"))
        if item.pendencias:
            parts.append(f"Preciso confirmar: {', '.join(item.pendencias)}?")
        elif item.intencao == "estoque":
            for code in item.codigos:
                try:
                    arguments = {"codigo": code, "versoes": item.versoes}
                    if item.local:
                        arguments["local"] = item.local
                    output = tools.run_tool("buscar_por_codigo", arguments)
                    used.append("buscar_por_codigo")
                    if output.get("erro"):
                        raise ValueError("consulta_recusada")
                    collect_products(output, found)
                    answer = output.get("texto_compacto") if compact else None
                    answer = answer or output.get("texto_pronto") or "Não consegui montar o resultado desta consulta."
                    if item.local:
                        parts.append(f"Filial consultada: {item.local}.")
                    parts.append(answer)
                    products = output.get("produtos") or []
                    confirmed = [product for product in products if product.get("correspondencia") in ("exato", "familia", "igual_especialista")
                                 and (not item.versoes or product.get("condicao", "nova") in item.versoes)]
                    if output.get("codigo_incompleto"):
                        entry["pendencias"] = ["codigo"]
                    entry["resultados"].append({"codigo": code, "status": "precisa_confirmar" if output.get("codigo_incompleto") else "encontrado" if any(
                        product.get("estoque_total", 0) > 0 for product in confirmed) else "alternativas" if any(
                        product.get("estoque_total", 0) > 0 for product in products) else "sem_estoque" if products else "sem_cadastro",
                        "produtos": [{key: product.get(key) for key in ("id", "nome", "estoque_total", "estoque_por_local", "correspondencia", "condicao")}
                                     for product in products]})
                except Exception:
                    LOG.exception("assistente: falha na consulta do pedido %s", item.id)
                    parts.append(f"*{code}*: não consegui consultar agora. O saldo não foi confirmado.")
                    entry["resultados"].append({"codigo": code, "status": "erro", "produtos": []})
        else:
            query = item.trecho
            if item.intencao == "aplicacao":
                query = " ".join(str(value) for value in (item.veiculo, item.motor, item.ano, item.norma) if value) or query
            if item.intencao == "comparar" and len(item.codigos) >= 2:
                query = f"{item.codigos[0]} é igual a {item.codigos[1]}?"
            if item.intencao == "codigo_master_power":
                query = "qual o código master power " + " ".join(item.codigos)
            try:
                result = AssistantDirectService(tools, compact=compact).answer(query)
            except Exception:
                LOG.exception("assistente: falha no pedido %s", item.id)
                parts.append(f"Pedido {item.id}: não consegui consultar agora; resultado não confirmado.")
                entry["resultados"].append({"status": "erro"})
                statuses.append(entry)
                continue
            parts.append(result["resposta"].removeprefix(COMPACT_HEADER + "\n\n"))
            used.extend(result["ferramentas_usadas"])
            for product in result["produtos"]:
                found[product["id"]] = product
            entry["pendencias"] = pending_fields(result["resposta"])
        statuses.append(entry)
    answer = "\n\n".join(parts)
    if compact and any(item.intencao == "estoque" for item in items):
        answer = COMPACT_HEADER + "\n\n" + answer
    result = make_result(answer, list(found.values()), used, MODE_DIRECT)
    result["pedidos"] = statuses
    result["pendencias"] = [{"pedido_id": item["id"], "campos": item["pendencias"], "trecho": item["trecho"]}
                            for item in statuses if item["pendencias"]]
    return result
