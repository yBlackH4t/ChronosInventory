"""
Provedores de IA com API no formato do OpenAI (Groq, Google Gemini, Ollama local).

Usa `requests` direto no endpoint /chat/completions: o formato e simples e o
mesmo nos tres provedores, sem dependencia nova. Loop de ferramentas manual,
como no provedor Claude, para guardar o que cada ferramenta devolveu.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests

from app.services.assistant_common import (
    MAX_TOOL_ROUNDS,
    NO_ANSWER_TEXT,
    SYSTEM_PROMPT,
    AssistantUnavailableError,
    collect_products,
    tool_output_json,
)
from app.services.assistant_tools_service import ASSISTANT_TOOLS, AssistantToolsService

LOG = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 60
# Limite por minuto: se o provedor pedir para esperar ate isso, espera e tenta de novo uma vez.
MAX_RETRY_WAIT_SECONDS = 20.0

HttpPost = Callable[..., Any]


def openai_tools() -> List[Dict[str, Any]]:
    """Ferramentas no formato do OpenAI (sem `strict`/`additionalProperties`, que nem todos aceitam)."""
    tools = []
    for tool in ASSISTANT_TOOLS:
        parameters = {k: v for k, v in tool["input_schema"].items() if k != "additionalProperties"}
        tools.append(
            {
                "type": "function",
                "function": {"name": tool["name"], "description": tool["description"], "parameters": parameters},
            }
        )
    return tools


def run_openai_compatible(
    *,
    provider_name: str,
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, Any]],
    tools: AssistantToolsService,
    extra_params: Optional[Dict[str, Any]] = None,
    http_post: Optional[HttpPost] = None,
    sleep: Callable[[float], None] = time.sleep,
) -> Tuple[str, Dict[int, Dict[str, Any]], List[str]]:
    """Roda a conversa ate a resposta final. Devolve (texto, produtos encontrados, ferramentas usadas)."""
    post = http_post or requests.post
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    conversation: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
    found: Dict[int, Dict[str, Any]] = {}
    tools_used: List[str] = []
    tool_defs = openai_tools()

    for _ in range(MAX_TOOL_ROUNDS):
        payload = {
            "model": model,
            "messages": conversation,
            "tools": tool_defs,
            "tool_choice": "auto",
            **(extra_params or {}),
        }
        data = _post_with_retry(post, url, headers, payload, provider_name, model, sleep)
        _log_usage(provider_name, model, data, tools_used)

        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AssistantUnavailableError(f"Resposta inesperada do {provider_name}.") from exc

        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            text = (message.get("content") or "").strip()
            return text or NO_ANSWER_TEXT, found, tools_used

        conversation.append({"role": "assistant", "content": message.get("content") or None, "tool_calls": tool_calls})
        for call in tool_calls:
            function = call.get("function") or {}
            name = str(function.get("name") or "")
            try:
                arguments = json.loads(function.get("arguments") or "{}")
            except ValueError:
                arguments = None
            if not isinstance(arguments, dict):
                output: Dict[str, Any] = {"erro": "Argumentos da ferramenta em formato invalido (esperado JSON)."}
            else:
                output = tools.run_tool(name, arguments)
            tools_used.append(name)
            collect_products(output, found)
            conversation.append({"role": "tool", "tool_call_id": call.get("id"), "content": tool_output_json(output)})

    return NO_ANSWER_TEXT, found, tools_used


def _post_with_retry(
    post: HttpPost,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    provider_name: str,
    model: str,
    sleep: Callable[[float], None],
) -> Dict[str, Any]:
    for attempt in range(2):
        try:
            response = post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.Timeout as exc:
            raise AssistantUnavailableError(f"O {provider_name} demorou demais para responder.") from exc
        except requests.RequestException as exc:
            raise AssistantUnavailableError(f"Sem conexão com o {provider_name}.") from exc

        status = response.status_code
        if status == 200:
            try:
                return response.json()
            except ValueError as exc:
                raise AssistantUnavailableError(f"Resposta inválida do {provider_name}.") from exc

        detail = _error_message(response)
        if status == 429:
            wait = _retry_after_seconds(response)
            if attempt == 0 and wait is not None and wait <= MAX_RETRY_WAIT_SECONDS:
                LOG.info("assistente %s: limite por minuto, aguardando %.1fs", provider_name, wait)
                sleep(wait)
                continue
            raise AssistantUnavailableError(f"Limite de uso do {provider_name} atingido.")
        if status == 413:
            raise AssistantUnavailableError(f"A pergunta ficou grande demais para o limite do {provider_name}.")
        if status in (401, 403):
            raise AssistantUnavailableError(f"A chave do {provider_name} foi recusada.")
        if status == 404:
            raise AssistantUnavailableError(f"Modelo '{model}' não encontrado no {provider_name}.")
        if status >= 500:
            LOG.error("assistente %s: erro %s: %s", provider_name, status, detail)
            raise AssistantUnavailableError(f"O serviço do {provider_name} está instável.")
        LOG.error("assistente %s: requisicao recusada status=%s: %s", provider_name, status, detail)
        raise AssistantUnavailableError(f"O {provider_name} recusou a requisição.")
    raise AssistantUnavailableError(f"Limite de uso do {provider_name} atingido.")


def _retry_after_seconds(response: Any) -> Optional[float]:
    value = (getattr(response, "headers", None) or {}).get("retry-after")
    try:
        return max(0.0, float(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def _error_message(response: Any) -> str:
    try:
        body = response.json()
        return str((body.get("error") or {}).get("message") or body)[:300]
    except (ValueError, AttributeError):
        return str(getattr(response, "text", ""))[:300]


def _log_usage(provider_name: str, model: str, data: Dict[str, Any], tools_used: List[str]) -> None:
    usage = data.get("usage") or {}
    choice = (data.get("choices") or [{}])[0]
    LOG.info(
        "assistente %s modelo=%s fim=%s ferramentas=%s input=%s output=%s",
        provider_name,
        model,
        choice.get("finish_reason"),
        ",".join(tools_used) or "-",
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
    )
