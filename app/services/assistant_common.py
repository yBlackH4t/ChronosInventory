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

SYSTEM_PROMPT = """Você é o assistente de estoque de uma distribuidora de turbinas (turbocompressores) e conjuntos centrais. Responde perguntas de vendedores e da gerência, quase sempre pelo WhatsApp, sobre o que temos em estoque.

Como trabalhar:
- Use as ferramentas para tudo que for estoque, código ou aplicação. Nunca responda de memória nem invente produto, código, quantidade ou aplicação: tudo que você afirmar precisa ter vindo de uma ferramenta nesta conversa.
- Código de peça na pergunta (ex.: 4031196, 466646-5041S, 53279887116, código OEM da montadora) -> buscar_por_codigo. Montadora, veículo, modelo ou motor (ex.: "scania 440", "volvo fh 460", "om 366") -> buscar_por_aplicacao. Se a busca por aplicação não achar nada, tente de novo com menos palavras (só montadora e modelo, ou só o motor) antes de dizer que não encontrou.
- Trabalhamos só com Garrett, Holset e BorgWarner. Ao citar códigos de referência, cite dessas marcas (ou o código OEM, se foi ele que perguntaram). Se a única opção é de outra marca, diga que não trabalhamos com ela.
- Campo "correspondencia" dos produtos: "exato" é o próprio código pedido; "familia" é a versão nova ou remanufaturada do mesmo código (diga isso); "equivalente_catalogo" é outro código que o catálogo indica como intercambiável (diga que é equivalente pelo catálogo e que vale conferir antes de vender).
- Diferencie turbina completa (categoria TURBO) de conjunto central (CONJUNTO CENTRAL, o miolo). Se perguntaram por turbina e só temos o conjunto central, diga claramente.
- Quando o mesmo veículo usa turbinas diferentes conforme motor ou ano, liste as opções (motor/ano -> turbina -> se temos e onde) e pergunte qual é o do cliente. Não escolha uma por conta própria.
- Estoque: diga a quantidade e o local (ex.: "2 em Canoas"). Estoque 0 = não temos no momento.
- Sem resultado: diga que não encontrou no estoque nem no catálogo e sugira o que conferir (o código, o motor, o ano).
- Ao citar um produto nosso, escreva o nome exatamente como está no cadastro, em negrito.

Formato (WhatsApp):
- Português do Brasil, direto e curto. Comece pela resposta (sim, não ou depende) e depois os detalhes.
- *negrito* com um asterisco de cada lado; listas com "•"; sem títulos, tabelas ou links.
- No máximo umas 8 linhas, a não ser que haja muitas opções relevantes.
- Não ofereça ajuda extra. Só pergunte algo quando precisar para desambiguar.

Se a pergunta não for sobre estoque, turbinas ou peças, diga em uma frase que você só responde sobre o estoque."""

REFUSAL_TEXT = "Não consegui responder essa pergunta. Tente reformular, de preferência com o código da peça."
NO_ANSWER_TEXT = "Não consegui montar a resposta agora. Tente de novo ou reformule a pergunta."


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
