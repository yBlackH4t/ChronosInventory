"""
Assistente de IA: escolhe o provedor e garante que sempre ha resposta (docs/PLANO_IA.md).

- Provedor configurado (padrao: Groq, gratuito) responde com tool use sobre as
  buscas de `AssistantToolsService`.
- Se a IA nao puder responder (sem chave, limite gratuito atingido, sem internet...),
  a busca direta (sem IA) responde e a resposta traz um `aviso`.
- Provedor "nenhum": so busca direta.

O backend nao guarda o contexto da conversa: o historico chega como texto a cada
pergunta. Cada pergunta e resposta (com as buscas feitas) vai para o historico do
assistente (AssistantHistoryService), usado na revisao do admin e exportavel em JSONL.
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
    whatsapp_text,
)
from app.services.assistant_config_store import PROVIDERS, AssistantConfigStore
from app.services.assistant_direct_service import AssistantDirectService
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_tools_service import COMPACT_LIMITS, AssistantToolsService

LOG = logging.getLogger(__name__)

# Esforco de raciocinio aceito pelo Groq (gpt-oss): low, medium, high.
_OPENAI_EFFORT = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


def _summarize_call(name: str, arguments: Any, output: Dict[str, Any]) -> Dict[str, Any]:
    """Resumo de uma busca para o historico (sem o JSON inteiro)."""
    summary: Dict[str, Any] = {"ferramenta": name, "entrada": arguments}
    for key, label in (("erro", "erro"), ("codigo_pesquisado", "codigo"), ("temos_em_estoque", "temos_em_estoque"),
                       ("total_fichas", "total_fichas")):
        if key in output:
            summary[label] = output[key]
    products = list(output.get("produtos") or [])
    for item in output.get("fichas_catalogo") or []:
        products.extend(item.get("nossos_produtos") or [])
    if products:
        summary["produtos"] = [
            {k: p[k] for k in ("id", "nome", "estoque_total", "correspondencia") if k in p} for p in products[:10]
        ]
    return summary


class _RecordingTools:
    """Repassa as chamadas para as ferramentas e anota cada uma (para o historico)."""

    def __init__(self, inner: Any, calls: List[Dict[str, Any]]) -> None:
        self.inner = inner
        self.calls = calls

    def run_tool(self, name: str, arguments: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        output = self.inner.run_tool(name, arguments)
        self.calls.append(_summarize_call(name, arguments, output))
        return output

    def with_limits(self, limits: Any) -> "_RecordingTools":
        return _RecordingTools(self.inner.with_limits(limits), self.calls)


class AssistantChatService:
    def __init__(
        self,
        tools: Optional[AssistantToolsService] = None,
        config_store: Optional[AssistantConfigStore] = None,
        client_factory: Optional[Callable[[str], Any]] = None,
        http_post: Optional[Callable[..., Any]] = None,
        sleep: Optional[Callable[[float], None]] = None,
        history: Optional[AssistantHistoryService] = None,
    ) -> None:
        self.tools = tools or AssistantToolsService()
        self.history = history or AssistantHistoryService()
        self.config_store = config_store or AssistantConfigStore()
        self.client_factory = client_factory  # Claude (testes injetam um cliente falso)
        self.http_post = http_post  # Groq/Gemini/Ollama (testes injetam um POST falso)
        self.sleep = sleep

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

    def chat(
        self,
        mensagem: str,
        historico: Optional[List[Dict[str, str]]] = None,
        canal: str = "app",
        autor: Optional[str] = None,
    ) -> Dict[str, Any]:
        historico = historico or []
        calls: List[Dict[str, Any]] = []
        tools = _RecordingTools(self.tools, calls)
        result = self._answer(mensagem, historico, tools)
        try:
            self.history.record(
                canal=canal, autor=autor, pergunta=mensagem, historico=historico, result=result, consultas=calls
            )
        except Exception:  # o historico nunca pode impedir a resposta
            LOG.exception("assistente: falha ao gravar o historico")
        return result

    def _answer(self, mensagem: str, historico: List[Dict[str, str]], tools: Any) -> Dict[str, Any]:
        config = self.config_store.load()
        provider = config["provedor"]
        direct = AssistantDirectService(tools)
        if PROVIDERS[provider]["tipo"] == "nenhum":
            return direct.answer(mensagem, historico)

        try:
            text, found, tools_used = self._run_provider(provider, config, mensagem, historico, tools)
        except AssistantUnavailableError as exc:
            LOG.warning("assistente: %s -> respondendo pela busca direta", exc)
            result = direct.answer(mensagem, historico)
            result["aviso"] = f"{exc} Resposta pela busca direta (sem IA)."
            return result
        text = whatsapp_text(text)
        return make_result(text, cited_products(text, found), tools_used, MODE_AI)

    def _run_provider(
        self, provider: str, config: Dict[str, Any], mensagem: str, historico: List[Dict[str, str]], all_tools: Any
    ) -> tuple:
        preset = PROVIDERS[provider]
        short_name = preset["nome"].split(" (")[0]
        api_key, _ = AssistantConfigStore.key_for(config, provider)
        if preset["precisa_chave"] and not api_key:
            raise AssistantUnavailableError(f"A IA ({short_name}) não está configurada: falta a chave da API.")

        model = AssistantConfigStore.model_for(config, provider)
        tools = all_tools.with_limits(COMPACT_LIMITS) if preset["compacto"] else all_tools
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
