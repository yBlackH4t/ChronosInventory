"""
Assistente de IA: escolhe o provedor e garante que sempre ha resposta (docs/PLANO_IA.md).

- Provedor configurado (padrao: Groq, gratuito) responde com tool use sobre as
  buscas de `AssistantToolsService`.
- Se a IA nao puder responder (sem chave, limite gratuito atingido, sem internet...),
  a busca direta (sem IA) responde e a resposta traz um `aviso`.
- Provedor "nenhum": so busca direta.

O backend nao guarda conversa: o historico chega como texto a cada pergunta.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

from app.services.assistant_common import (
    MODE_AI,
    AssistantUnavailableError,
    cited_products,
    history_messages,
    make_result,
)
from app.services.assistant_config_store import PROVIDERS, AssistantConfigStore
from app.services.assistant_direct_service import AssistantDirectService
from app.services.assistant_tools_service import COMPACT_LIMITS, AssistantToolsService

LOG = logging.getLogger(__name__)

# Esforco de raciocinio aceito pelo Groq (gpt-oss): low, medium, high.
_OPENAI_EFFORT = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


class AssistantChatService:
    def __init__(
        self,
        tools: Optional[AssistantToolsService] = None,
        config_store: Optional[AssistantConfigStore] = None,
        client_factory: Optional[Callable[[str], Any]] = None,
        http_post: Optional[Callable[..., Any]] = None,
        sleep: Optional[Callable[[float], None]] = None,
    ) -> None:
        self.tools = tools or AssistantToolsService()
        self.config_store = config_store or AssistantConfigStore()
        self.client_factory = client_factory  # Claude (testes injetam um cliente falso)
        self.http_post = http_post  # Groq/Gemini/Ollama (testes injetam um POST falso)
        self.sleep = sleep
        self.direct = AssistantDirectService(self.tools)

    # ------------------------------------------------------------------
    # Configuracao
    # ------------------------------------------------------------------

    def status(self) -> Dict[str, Any]:
        config = self.config_store.load()
        providers = []
        for provider_id, preset in PROVIDERS.items():
            key, origin = AssistantConfigStore.key_for(config, provider_id)
            providers.append(
                {
                    "id": provider_id,
                    "nome": preset["nome"],
                    "gratuito": preset["gratuito"],
                    "precisa_chave": preset["precisa_chave"],
                    "configurado": bool(key) or not preset["precisa_chave"],
                    "origem_chave": origin,
                    "chave_mascarada": AssistantConfigStore.masked_key(config["chaves"].get(provider_id, "")),
                    "modelo": AssistantConfigStore.model_for(config, provider_id),
                }
            )
        current = next(p for p in providers if p["id"] == config["provedor"])
        return {
            "provedor": config["provedor"],
            "configurado": current["configurado"],
            # Campos do provedor atual no nivel de cima (contrato original da tela de Configuracoes).
            "origem_chave": current["origem_chave"],
            "chave_mascarada": current["chave_mascarada"],
            "modelo": current["modelo"],
            "esforco": config["esforco"],
            "provedores": providers,
        }

    # ------------------------------------------------------------------
    # Conversa
    # ------------------------------------------------------------------

    def chat(self, mensagem: str, historico: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        historico = historico or []
        config = self.config_store.load()
        provider = config["provedor"]
        if PROVIDERS[provider]["tipo"] == "nenhum":
            return self.direct.answer(mensagem, historico)

        try:
            text, found, tools_used = self._run_provider(provider, config, mensagem, historico)
        except AssistantUnavailableError as exc:
            LOG.warning("assistente: %s -> respondendo pela busca direta", exc)
            result = self.direct.answer(mensagem, historico)
            result["aviso"] = f"{exc} Resposta pela busca direta (sem IA)."
            return result
        return make_result(text, cited_products(text, found), tools_used, MODE_AI)

    def _run_provider(
        self, provider: str, config: Dict[str, Any], mensagem: str, historico: List[Dict[str, str]]
    ) -> tuple:
        preset = PROVIDERS[provider]
        short_name = preset["nome"].split(" (")[0]
        api_key, _ = AssistantConfigStore.key_for(config, provider)
        if preset["precisa_chave"] and not api_key:
            raise AssistantUnavailableError(f"A IA ({short_name}) não está configurada: falta a chave da API.")

        model = AssistantConfigStore.model_for(config, provider)
        tools = self.tools.with_limits(COMPACT_LIMITS) if preset["compacto"] else self.tools
        messages = history_messages(mensagem, historico)

        if preset["tipo"] == "anthropic":
            from app.services.assistant_anthropic import run_anthropic

            return run_anthropic(
                api_key=api_key,
                model=model,
                effort=config["esforco"],
                messages=messages,
                tools=tools,
                client_factory=self.client_factory,
            )

        from app.services.assistant_openai_compat import run_openai_compatible

        extra: Dict[str, Any] = {}
        if preset["reasoning_effort"]:
            extra["reasoning_effort"] = _OPENAI_EFFORT[config["esforco"]]
            extra["include_reasoning"] = False
        kwargs: Dict[str, Any] = {}
        if self.sleep is not None:
            kwargs["sleep"] = self.sleep
        return run_openai_compatible(
            provider_name=short_name,
            base_url=preset["base_url"],
            api_key=api_key,
            model=model,
            messages=messages,
            tools=tools,
            extra_params=extra,
            http_post=self.http_post,
            **kwargs,
        )
