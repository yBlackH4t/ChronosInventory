"""
Provedor Claude (API da Anthropic, pago) do assistente de IA.

Loop de ferramentas manual (e nao o tool runner do SDK) para guardar o que cada
ferramenta devolveu. O historico chega como texto, sem blocos de raciocinio de
turnos anteriores; dentro de uma pergunta o historico da API so cresce por append.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services.assistant_common import (
    MAX_TOOL_ROUNDS,
    NO_ANSWER_TEXT,
    REFUSAL_TEXT,
    SYSTEM_PROMPT,
    AssistantUnavailableError,
    collect_products,
    tool_output_json,
)
from app.services.assistant_tools_service import ASSISTANT_TOOLS, AssistantToolsService

LOG = logging.getLogger(__name__)

MAX_TOKENS = 16000
REQUEST_TIMEOUT_SECONDS = 90.0

# Recusa por classificador de seguranca: a API tenta de novo em outro modelo.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5", "claude-sonnet-5-5"}


def default_client_factory(api_key: str) -> Any:
    # Import tardio: o SDK so e carregado quando a Claude e o provedor escolhido.
    import anthropic

    return anthropic.Anthropic(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=2)


def run_anthropic(
    *,
    api_key: str,
    model: str,
    effort: str,
    messages: List[Dict[str, Any]],
    tools: AssistantToolsService,
    client_factory: Optional[Callable[[str], Any]] = None,
) -> Tuple[str, Dict[int, Dict[str, Any]], List[str]]:
    """Roda a conversa ate a resposta final. Devolve (texto, produtos encontrados, ferramentas usadas)."""
    import anthropic

    found: Dict[int, Dict[str, Any]] = {}
    tools_used: List[str] = []
    try:
        client = (client_factory or default_client_factory)(api_key)
        response = None
        for _ in range(MAX_TOOL_ROUNDS):
            response = _create(client, model, effort, messages)
            _log_usage(model, response, tools_used)

            if response.stop_reason == "refusal":
                return REFUSAL_TEXT, {}, tools_used
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            if response.stop_reason != "tool_use":
                break

            messages.append({"role": "assistant", "content": response.content})
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                output = tools.run_tool(block.name, block.input)
                tools_used.append(block.name)
                collect_products(output, found)
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": tool_output_json(output),
                        "is_error": "erro" in output,
                    }
                )
            # Todos os resultados da rodada voltam juntos, numa so mensagem.
            messages.append({"role": "user", "content": results})
        else:
            return NO_ANSWER_TEXT, {}, tools_used
    except anthropic.AuthenticationError as exc:
        raise AssistantUnavailableError("A chave da Claude foi recusada.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise AssistantUnavailableError(f"A chave da Claude não tem permissão para usar o modelo {model}.") from exc
    except anthropic.NotFoundError as exc:
        raise AssistantUnavailableError(f"Modelo '{model}' não encontrado.") from exc
    except anthropic.RateLimitError as exc:
        raise AssistantUnavailableError("Limite de uso da Claude atingido.") from exc
    except anthropic.BadRequestError as exc:
        LOG.error("assistente claude: requisicao recusada pela API: %s", exc.message)
        raise AssistantUnavailableError("A Claude recusou a requisição.") from exc
    except anthropic.APIStatusError as exc:
        LOG.error("assistente claude: erro da API status=%s: %s", exc.status_code, exc.message)
        raise AssistantUnavailableError("O serviço da Claude está instável.") from exc
    except anthropic.APIConnectionError as exc:
        raise AssistantUnavailableError("Sem conexão com o serviço de IA.") from exc

    text = "\n".join(b.text for b in response.content if b.type == "text").strip() if response else ""
    return text or NO_ANSWER_TEXT, found, tools_used


def _create(client: Any, model: str, effort: str, messages: List[Dict[str, Any]]) -> Any:
    kwargs: Dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "tools": ASSISTANT_TOOLS,
        "messages": messages,
        "output_config": {"effort": effort},
        # Cacheia system + ferramentas + historico: as rodadas de ferramenta reaproveitam o prefixo.
        "cache_control": {"type": "ephemeral"},
    }
    if model in FALLBACK_MODELS:
        kwargs["betas"] = [FALLBACK_BETA]
        kwargs["fallbacks"] = "default"
    return client.beta.messages.create(**kwargs)


def _log_usage(model: str, response: Any, tools_used: List[str]) -> None:
    usage = getattr(response, "usage", None)
    LOG.info(
        "assistente claude modelo=%s stop=%s ferramentas=%s input=%s output=%s cache_read=%s cache_write=%s request_id=%s",
        model,
        getattr(response, "stop_reason", None),
        ",".join(tools_used) or "-",
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
        getattr(usage, "cache_read_input_tokens", None),
        getattr(usage, "cache_creation_input_tokens", None),
        getattr(response, "_request_id", None),
    )
