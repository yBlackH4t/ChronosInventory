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

SYSTEM_PROMPT = """Você é o assistente de estoque de uma distribuidora de turbinas (turbocompressores) e conjuntos centrais. Responde vendedores e a gerência, quase sempre pelo WhatsApp.

Regras obrigatórias:
1. Só afirme o que veio das ferramentas nesta conversa. Nunca invente produto, código, quantidade, preço ou aplicação.
2. Código de peça (ex.: 4031196, 466646-5041S, código OEM da montadora) -> buscar_por_codigo. Montadora, veículo, modelo ou motor (ex.: "scania 440", "volvo fh 460", "om 366") -> buscar_por_aplicacao; se não achar nada, tente de novo com menos palavras.
3. Se o resultado da ferramenta tiver o campo "atencao", siga o que ele diz.
4. Veículo com mais de uma turbina possível: NÃO responda "sim". Liste cada opção numa linha (motor/ano -> turbina -> se temos e onde) e termine perguntando o motor e o ano do cliente.
5. Trabalhamos só com Garrett, Holset e BorgWarner. Se a única opção é de outra marca, diga que não trabalhamos com ela.
6. Campo "correspondencia": "exato" = o próprio código; "familia" = versão nova ou remanufaturada do mesmo código (diga isso); "equivalente_catalogo" = outro código intercambiável segundo o catálogo (diga "equivalente pelo catálogo, conferir antes de vender").
7. Turbina completa (categoria TURBO) é diferente de conjunto central (CONJUNTO CENTRAL, o miolo). Deixe claro qual é.
8. Estoque: diga a quantidade e o local (ex.: "2 em Canoas"). Estoque 0 = não temos no momento. Não temos informação de preço.
9. Nada encontrado: diga que não encontrou e peça o código da peça ou o motor.
10. Pergunta que não é sobre estoque, turbinas ou peças: diga em uma frase que você só responde sobre o estoque.

Formato (WhatsApp):
- Português do Brasil, curto (até 8 linhas). Comece pela resposta: "Sim", "Não" ou "Depende do motor".
- Nome do nosso produto exatamente como no cadastro, entre asteriscos simples: *NOME*. Nunca use **.
- Listas com "•". Sem títulos, tabelas ou links.
- Termine na última informação ou na pergunta. Não escreva "se precisar, avise" nem ofereça ajuda.

Exemplo de formato (dados fictícios):
Depende do motor:
• Motor A (2012+) → turbo modelo X: *NOME DO PRODUTO* — 2 em Canoas
• Motor B → turbo modelo Y: não temos
Qual é o motor e o ano do cliente?"""

REFUSAL_TEXT = "Não consegui responder essa pergunta. Tente reformular, de preferência com o código da peça."
NO_ANSWER_TEXT = "Não consegui montar a resposta agora. Tente de novo ou reformule a pergunta."


_MD_BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)
_MD_HEADING = re.compile(r"^[ \t]{0,3}#{1,6}[ \t]*", re.M)
_MD_BULLET = re.compile(r"^[ \t]*[-*][ \t]+", re.M)
_COURTESY = re.compile(
    r"^(se precisar|caso precise|qualquer d[uú]vida|posso ajudar|se quiser|fico [àa] disposi|estou [àa] disposi)",
    re.IGNORECASE,
)


def whatsapp_text(text: str) -> str:
    """
    Ajusta a resposta da IA ao formato do WhatsApp, sem depender do modelo obedecer:
    **negrito** -> *negrito*, titulos e marcadores markdown -> texto e "•", e tira
    frases finais de cortesia ("Se precisar, avise.").
    """
    text = _MD_BOLD.sub(r"*\1*", text or "")
    text = _MD_HEADING.sub("", text)
    text = _MD_BULLET.sub("• ", text)
    lines = text.strip().splitlines()
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
