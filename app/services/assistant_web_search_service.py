"""
Pesquisa na internet, so quando a pessoa pede ("pesquisar" depois de um "nao sei").

A resposta vem marcada "segundo a internet, conferir", com os links, e nunca vira regra sozinha:
quem confirma e a pessoa (igual / similar / diferente), como em qualquer ensino.

Provedor: o Gemini com a pesquisa do Google (plano gratis, com limite diario), se a chave dele
estiver salva; senao o Groq (gpt-oss com "browser_search"), que tambem pesquisa. O Groq continua entendendo as
mensagens; a pesquisa e a unica coisa que usa o Gemini.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, Dict, List, Optional

import requests

from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import AssistantConfigStore

LOG = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_MODEL = "gemini-flash-latest"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_SEARCH_MODEL = "openai/gpt-oss-120b"  # com a ferramenta "browser_search" do Groq
TIMEOUT = 40
MAX_SOURCES = 3

PROMPT = (
    "Você ajuda uma loja de turbinas (turbocompressores) no Brasil. Pesquise na internet e responda em "
    "português, em no máximo 3 frases curtas: {pergunta} Diga claramente se são iguais (troca direta), "
    "similares (servem com alguma diferença, diga qual) ou diferentes. Se a internet não for clara, diga "
    "que não achou confirmação. Não invente códigos."
)


class AssistantWebSearchService:
    def __init__(
        self, config_store: Optional[AssistantConfigStore] = None, http_post: Optional[Callable[..., Any]] = None
    ) -> None:
        self.config_store = config_store or AssistantConfigStore()
        self.post = http_post or requests.post

    def available(self) -> bool:
        config = self.config_store.load()
        return any(AssistantConfigStore.key_for(config, p)[0] for p in ("gemini", "groq"))

    def compare(self, codigo_a: str, codigo_b: str) -> Dict[str, Any]:
        """{'texto', 'fontes': [{'titulo', 'url'}], 'provedor'}. Erro: AssistantUnavailableError."""
        question = f"o turbo de código {codigo_a} é o mesmo que o de código {codigo_b}?"
        config = self.config_store.load()
        gemini_key = AssistantConfigStore.key_for(config, "gemini")[0]
        if gemini_key:
            return self._gemini(gemini_key, question)
        groq_key = AssistantConfigStore.key_for(config, "groq")[0]
        if groq_key:
            return self._groq(groq_key, question)
        raise AssistantUnavailableError(
            "Para pesquisar na internet, salve a chave do Gemini (ou do Groq) em Configurações > Assistente."
        )

    def _gemini(self, key: str, question: str) -> Dict[str, Any]:
        body = {"contents": [{"parts": [{"text": PROMPT.format(pergunta=question)}]}], "tools": [{"google_search": {}}]}
        response = self.post(
            GEMINI_URL.format(model=GEMINI_MODEL), headers={"x-goog-api-key": key}, json=body, timeout=TIMEOUT
        )
        if response.status_code == 429:
            raise AssistantUnavailableError("A pesquisa do Gemini chegou no limite de hoje. Tente amanhã.")
        if response.status_code >= 400:
            raise AssistantUnavailableError(f"O Gemini não respondeu à pesquisa (erro {response.status_code}).")
        data = response.json()
        candidate = (data.get("candidates") or [{}])[0]
        text = " ".join(p.get("text", "") for p in (candidate.get("content") or {}).get("parts") or []).strip()
        chunks = (candidate.get("groundingMetadata") or {}).get("groundingChunks") or []
        sources = [
            {"titulo": str(c["web"].get("title") or "fonte"), "url": str(c["web"].get("uri") or "")}
            for c in chunks
            if isinstance(c.get("web"), dict) and c["web"].get("uri")
        ]
        return {"texto": text, "fontes": _unique(sources)[:MAX_SOURCES], "provedor": "Gemini"}

    def _groq(self, key: str, question: str) -> Dict[str, Any]:
        body = {
            "model": GROQ_SEARCH_MODEL,
            "messages": [{"role": "user", "content": PROMPT.format(pergunta=question)}],
            "tools": [{"type": "browser_search"}],
            "reasoning_effort": "medium",
        }
        response = self.post(GROQ_URL, headers={"Authorization": f"Bearer {key}"}, json=body, timeout=TIMEOUT)
        if response.status_code == 429:
            raise AssistantUnavailableError("A pesquisa do Groq chegou no limite. Tente mais tarde.")
        if response.status_code >= 400:
            raise AssistantUnavailableError(f"O Groq não respondeu à pesquisa (erro {response.status_code}).")
        message = ((response.json().get("choices") or [{}])[0]).get("message") or {}
        sources: List[Dict[str, str]] = []
        for tool in message.get("executed_tools") or []:
            for result in ((tool.get("search_results") or {}).get("results") or []):
                if result.get("url"):
                    sources.append({"titulo": str(result.get("title") or "fonte"), "url": str(result["url"])})
        # "...HE500WG【6†L4-L9】": a marca da citacao do Groq sai do texto.
        text = re.sub(r"【[^】]*】", "", str(message.get("content") or "")).replace("**", "*").strip()
        return {"texto": text, "fontes": _unique(sources)[:MAX_SOURCES], "provedor": "Groq"}


def _unique(sources: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen, out = set(), []
    for source in sources:
        if source["url"] not in seen:
            seen.add(source["url"])
            out.append(source)
    return out


def format_web_answer(codigo_a: str, codigo_b: str, found: Dict[str, Any]) -> str:
    """Comeca com '*A* e *B*:' para o 'igual' seguinte saber do que se fala."""
    text = " ".join(str(found.get("texto") or "").split()) or "não achei nada claro."
    lines = [f"*{codigo_a}* e *{codigo_b}*: 🔎 segundo a internet ({found.get('provedor')}), conferir:", text]
    if found.get("fontes"):
        lines.append("Fontes:")
        lines += [f"• {s['titulo']}: {s['url']}" for s in found["fontes"]]
    return "\n".join(lines)
