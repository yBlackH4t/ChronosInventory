"""
Partes do assistente de IA comuns a todos os provedores (docs/PLANO_IA.md).

Prompt com as regras do negocio, formato do historico, coleta dos produtos que as
ferramentas devolveram e o formato da resposta da API.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

MAX_TOOL_ROUNDS = 6
MAX_HISTORY_MESSAGES = 20
MAX_PRODUCTS_IN_ANSWER = 10

MODE_AI = "ia"
MODE_DIRECT = "busca_direta"

# Como um produto bateu com o codigo pesquisado (campo "correspondencia").
MATCH_EXACT = "exato"
MATCH_FAMILY = "familia"
MATCH_EXPERT_SAME = "igual_especialista"
MATCH_EXPERT_SIMILAR = "similar_especialista"
MATCH_CATALOG = "equivalente_catalogo"

CATEGORY_TURBO = "TURBO"
CATEGORY_CORE = "CONJUNTO CENTRAL"

SYSTEM_PROMPT = """Você é o assistente de estoque de uma distribuidora de turbinas (turbocompressores) e conjuntos centrais. Responde vendedores e a gerência, quase sempre pelo WhatsApp.

Regras obrigatórias:
1. Só afirme o que veio das ferramentas nesta conversa. Nunca invente produto, código, quantidade, preço ou aplicação.
2. Código de peça (ex.: 4031196, 466646-5041S, código OEM ou da Master Power) -> buscar_por_codigo, um código por chamada. Montadora, veículo, modelo ou motor (ex.: "scania 440", "volvo fh 460", "om 366") -> buscar_por_aplicacao; se não achar nada, tente de novo com menos palavras.
3. Cada busca devolve "texto_pronto": a resposta já montada pelo sistema, com os nomes do cadastro, o estoque, as opções e o que o especialista ensinou. RESPONDA COM O texto_pronto, sem reescrever. Se a pergunta tiver vários códigos, junte os textos_prontos, um embaixo do outro. Não acrescente perguntas nem comentários.
4. "essa", "essa daí", "esse código" = o código da mensagem anterior do usuário.
5. Mensagem curta que responde a uma pergunta sua (ex.: "dc13", "é o 2015"): junte com a pergunta anterior do usuário e busque de novo (ex.: "scania 440 dc13").
6. Só escreva com suas palavras quando nenhuma busca servir: pergunta fora do assunto (diga em uma frase que só responde sobre o estoque), pedido de preço (diga que não temos informação de preço e mande o texto_pronto do código) ou pergunta vaga (peça o código da peça ou o veículo/motor).
7. Trabalhamos só com Garrett, Holset e BorgWarner.

Formato (WhatsApp): português do Brasil, *negrito* com um asterisco de cada lado, listas com "•", sem títulos, tabelas ou links."""

REFUSAL_TEXT = "Não consegui responder essa pergunta. Tente reformular, de preferência com o código da peça."
NO_ANSWER_TEXT = "Não consegui montar a resposta agora. Tente de novo ou reformule a pergunta."


_MD_BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)
_MD_HEADING = re.compile(r"^[ \t]{0,3}#{1,6}[ \t]*", re.M)
_MD_BULLET = re.compile(r"^[ \t]*[-*][ \t]+", re.M)
_COURTESY = re.compile(
    r"^(se precisar|caso precise|qualquer d[uú]vida|posso ajudar|se quiser|fico [àa] disposi|estou [àa] disposi)",
    re.IGNORECASE,
)


_PRICE_WORDS = {"PRECO", "PRECOS", "VALOR", "CUSTA", "CUSTO", "QUANTO"}
PRICE_NOTE = "Não tenho informação de preço; só de estoque."


def with_price_note(question: str, text: str) -> str:
    """Pergunta de preco: o banco nao tem preco, entao o sistema avisa (nao depende da IA lembrar)."""
    from core.catalog.normalization import search_words

    if _PRICE_WORDS & set(search_words(question)) and "preço" not in (text or "").lower():
        return f"{text}\n{PRICE_NOTE}" if text else PRICE_NOTE
    return text


def _flat(text: str) -> str:
    # O modelo as vezes troca o hifen comum pelo hifen sem quebra (U+2011).
    return re.sub(r"\s+", " ", (text or "").replace("‑", "-")).strip()


def keeps_ready_texts(answer: str, ready_texts: List[str]) -> bool:
    """A resposta da IA traz, sem estragar, todas as linhas dos textos prontos das buscas?"""
    flat_answer = _flat(answer)
    return all(_flat(line) in flat_answer for text in ready_texts for line in text.splitlines() if _flat(line))


def whatsapp_text(text: str) -> str:
    """
    Ajusta a resposta da IA ao formato do WhatsApp, sem depender do modelo obedecer:
    **negrito** -> *negrito*, titulos e marcadores markdown -> texto e "•", e tira
    frases finais de cortesia ("Se precisar, avise.").
    """
    text = _MD_BOLD.sub(r"*\1*", text or "")
    text = _MD_HEADING.sub("", text)
    text = _MD_BULLET.sub("• ", text)
    lines = [line.rstrip() for line in text.strip().splitlines()]
    while lines and (not lines[-1].strip() or _COURTESY.match(lines[-1].strip())):
        lines.pop()
    return "\n".join(lines).strip()


class AssistantUnavailableError(Exception):
    """A IA nao pode responder (sem chave, sem internet, limite atingido...)."""


def history_messages(mensagem: str, historico: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Historico em texto + pergunta, no formato {role, content} (serve para todos os provedores)."""
    messages: List[Dict[str, Any]] = []
    for item in historico[-MAX_HISTORY_MESSAGES:]:
        text = str(item.get("texto") or "").strip()
        if not text:
            continue
        role = "assistant" if item.get("papel") == "assistente" else "user"
        if not messages and role == "assistant":
            continue  # a conversa precisa comecar pelo usuario
        messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": mensagem.strip()})
    return messages


def tool_output_json(output: Dict[str, Any]) -> str:
    """Resultado de ferramenta para o modelo, sem espacos (economiza tokens)."""
    return json.dumps(output, ensure_ascii=False, separators=(",", ":"))


def collect_products(output: Dict[str, Any], found: Dict[int, Dict[str, Any]]) -> None:
    """Guarda os nossos produtos que uma ferramenta devolveu (fonte da lista `produtos`)."""
    candidates: List[Dict[str, Any]] = list(output.get("produtos") or [])
    for item in output.get("fichas_catalogo") or []:
        candidates.extend(item.get("nossos_produtos") or [])
    if "id" in output and "nome" in output:
        candidates.append(output)
    for product in candidates:
        found[int(product["id"])] = {
            "id": int(product["id"]),
            "nome": product["nome"],
            "categoria": product.get("categoria"),
            "estoque_total": int(product.get("estoque_total") or 0),
            "estoque_por_local": dict(product.get("estoque_por_local") or {}),
        }


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("*", "")).strip().upper()


def cited_products(text: str, found: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Produtos que a resposta cita pelo nome (o prompt pede o nome exato do cadastro)."""
    answer = _normalize(text)
    cited = [p for p in found.values() if _normalize(p["nome"]) and _normalize(p["nome"]) in answer]
    cited.sort(key=lambda p: answer.find(_normalize(p["nome"])))
    return cited[:MAX_PRODUCTS_IN_ANSWER]


def make_result(
    text: str,
    products: List[Dict[str, Any]],
    tools_used: List[str],
    mode: str,
    notice: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "resposta": text,
        "produtos": products,
        "ferramentas_usadas": list(dict.fromkeys(tools_used)),
        "modo": mode,
        "aviso": notice,
    }
