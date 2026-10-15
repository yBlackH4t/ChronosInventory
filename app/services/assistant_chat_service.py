"""
Assistente de IA: escolhe quem responde e garante que sempre ha resposta (docs/PLANO_IA.md).

- A busca direta (sem IA) tenta primeiro: se entendeu a pergunta (codigo, veiculo/motor,
  "essa daí", resposta a uma pergunta), ela responde (`modo` = busca_direta, sem aviso).
- Se nao entendeu, o provedor configurado (padrao: Groq, gratuito) interpreta com tool use
  sobre as buscas de `AssistantToolsService`; a resposta dele so vale se trouxer o texto
  pronto das buscas inteiro.
- Se a IA nao puder responder (sem chave, limite gratuito atingido, sem internet...),
  a busca direta responde e a resposta traz um `aviso`.
- Provedor "nenhum": so busca direta.

O backend nao guarda o contexto da conversa: o historico chega como texto a cada
pergunta. Cada pergunta e resposta (com as buscas feitas) vai para o historico do
assistente (AssistantHistoryService), usado na revisao do admin e exportavel em JSONL.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services.assistant_common import (
    MODE_AI,
    MODE_DIRECT,
    AssistantUnavailableError,
    cited_products,
    history_messages,
    keeps_ready_texts,
    make_result,
    whatsapp_text,
    with_price_note,
)
from app.services.assistant_config_store import PROVIDERS, AssistantConfigStore
from app.services.assistant_direct_service import AssistantDirectService
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_interpreter_service import AssistantInterpreter
from app.services.assistant_teach_service import (
    TEACH_HINT,
    AssistantTeachService,
    pair_in_answer,
    parse_teach_reply,
    pending_pair,
    wants_search,
    with_teach_hint,
)
from app.services.assistant_web_search_service import AssistantWebSearchService, format_web_answer
from app.services.assistant_tools_service import COMPACT_LIMITS, AssistantToolsService

LOG = logging.getLogger(__name__)

_DEFAULT = object()

# Esforco de raciocinio aceito pelo Groq (gpt-oss): low, medium, high.
_OPENAI_EFFORT = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


def _summarize_call(name: str, arguments: Any, output: Dict[str, Any]) -> Dict[str, Any]:
    """Resumo de uma busca para o historico (sem o JSON inteiro)."""
    summary: Dict[str, Any] = {"ferramenta": name, "entrada": arguments}
    for key, label in (("erro", "erro"), ("codigo_pesquisado", "codigo"), ("temos_em_estoque", "temos_em_estoque"),
                       ("total_fichas", "total_fichas"), ("outro_codigo", "outro_codigo"), ("relacao", "relacao"),
                       ("fonte", "fonte")):
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
    """
    Repassa as chamadas para as ferramentas e anota cada uma: o resumo vai para o
    historico e o texto pronto serve para conferir a resposta da IA.
    """

    def __init__(self, inner: Any, calls: List[Dict[str, Any]], ready: Optional[List[Tuple[str, bool]]] = None) -> None:
        self.inner = inner
        self.calls = calls
        self.ready: List[Tuple[str, bool]] = ready if ready is not None else []

    def run_tool(self, name: str, arguments: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        output = self.inner.run_tool(name, arguments)
        self.calls.append(_summarize_call(name, arguments, output))
        if output.get("texto_pronto"):
            # Busca por aplicacao sem nenhuma ficha (a IA vai tentar de novo) nao conta como resposta.
            useful = "erro" not in output and output.get("total_fichas", 1) != 0
            self.ready.append((output["texto_pronto"], useful))
        return output

    def ready_texts(self) -> List[str]:
        useful = [text for text, ok in self.ready if ok]
        chosen = useful or [text for text, _ in self.ready][-1:]
        return list(dict.fromkeys(chosen))

    def with_limits(self, limits: Any) -> "_RecordingTools":
        return _RecordingTools(self.inner.with_limits(limits), self.calls, self.ready)


class AssistantChatService:
    def __init__(
        self,
        tools: Optional[AssistantToolsService] = None,
        config_store: Optional[AssistantConfigStore] = None,
        client_factory: Optional[Callable[[str], Any]] = None,
        http_post: Optional[Callable[..., Any]] = None,
        sleep: Optional[Callable[[float], None]] = None,
        history: Optional[AssistantHistoryService] = None,
        interpreter: Any = _DEFAULT,
        teacher: Optional[AssistantTeachService] = None,
        web_search: Optional[AssistantWebSearchService] = None,
    ) -> None:
        self.teacher = teacher or AssistantTeachService()
        self.web_search = web_search
        self.tools = tools or AssistantToolsService()
        self.history = history or AssistantHistoryService()
        self.config_store = config_store or AssistantConfigStore()
        self.client_factory = client_factory  # Claude (testes injetam um cliente falso)
        self.http_post = http_post  # Groq/Gemini/Ollama (testes injetam um POST falso)
        self.sleep = sleep
        if interpreter is _DEFAULT:
            # A IA entende toda mensagem antes da busca direta. Testes que injetam um POST falso
            # para o provedor nao ligam esta etapa sem pedir (ela gastaria as respostas falsas).
            interpreter = (
                None if (http_post is not None or client_factory is not None)
                else AssistantInterpreter(self.config_store)
            )
        self.interpreter = interpreter

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
        pode_ensinar: bool = False,
    ) -> Dict[str, Any]:
        """
        `canal`: "app", "whatsapp" (resposta ao cliente) ou "particular" (o dono pergunta na
        "Mensagem para mim"). `pode_ensinar`: quem pergunta e o admin, e "igual" vira regra na hora.
        """
        historico = historico or []
        calls: List[Dict[str, Any]] = []
        tools = _RecordingTools(self.tools, calls)
        private = canal != "whatsapp"  # nunca pede para o cliente ensinar
        reply = parse_teach_reply(mensagem) if private else None
        search = private and not reply and wants_search(mensagem)
        pair = pending_pair(historico) if (reply or search) else None
        if search and pair:
            # "pesquisar" depois de um "nao sei": a internet, marcada "conferir"; quem ensina e a pessoa.
            calls.append({"ferramenta": "pesquisar_internet", "codigos": list(pair)})
            try:
                found = self._web().compare(pair[0], pair[1])
                text = f"{format_web_answer(pair[0], pair[1], found)}\n{TEACH_HINT}"
            except AssistantUnavailableError as exc:
                text = f"*{pair[0]}* e *{pair[1]}*: não consegui pesquisar. {exc}\n{TEACH_HINT}"
            except Exception:
                LOG.exception("assistente: falha na pesquisa na internet")
                text = f"*{pair[0]}* e *{pair[1]}*: a pesquisa falhou agora.\n{TEACH_HINT}"
            result = make_result(text, [], ["pesquisar_internet"], MODE_AI)
        elif reply and pair:
            calls.append({"ferramenta": "ensinar", "codigos": list(pair), "tipo": reply[0]})
            try:
                text = self.teacher.teach(pair[0], pair[1], reply[0], reply[1], pode_ensinar, autor or canal)
            except Exception as exc:  # codigo invalido, publicadora fora do ar...
                LOG.warning("assistente: nao consegui ensinar %s: %s", pair, exc)
                text = f"Não consegui guardar agora: {exc}"
            result = make_result(text, [], ["ensinar"], MODE_DIRECT)
        else:
            result = self._answer(mensagem, historico, tools, canal)
        if private:
            result["resposta"] = with_teach_hint(result["resposta"], can_search=self._web().available())
            if canal == "particular":  # na "Mensagem para mim", so o que comeca com / e comando
                result["resposta"] = (
                    result["resposta"]
                    .replace("*igual*, *similar* ou *diferente*", "/igual, /similar ou /diferente")
                    .replace("*pesquisar*", "/pesquisar")
                )
            result["ensinar"] = pair_in_answer(result["resposta"])
        try:
            self.history.record(
                canal=canal, autor=autor, pergunta=mensagem, historico=historico, result=result, consultas=calls
            )
        except Exception:  # o historico nunca pode impedir a resposta
            LOG.exception("assistente: falha ao gravar o historico")
        return result

    def _web(self) -> AssistantWebSearchService:
        if self.web_search is None:
            self.web_search = AssistantWebSearchService(self.config_store)
        return self.web_search

    def _answer(self, mensagem: str, historico: List[Dict[str, str]], tools: Any, canal: str = "app") -> Dict[str, Any]:
        config = self.config_store.load()
        provider = config["provedor"]
        # WhatsApp: estoque no formato curto do chefe; no app, a resposta completa.
        direct = AssistantDirectService(tools, compact=canal == "whatsapp")
        if PROVIDERS[provider]["tipo"] == "nenhum":
            result = direct.answer(mensagem, historico)
            result["resposta"] = with_price_note(mensagem, result["resposta"])
            return result

        # A IA entende a mensagem ("montada a reman", "da Garte", "aquela do 540") e a transforma
        # numa pergunta padrao; quem responde continua sendo a busca direta, pelo banco.
        understood = self.interpreter.interpret(mensagem, historico) if self.interpreter else None
        if understood:
            if hasattr(tools, "calls"):
                tools.calls.append(
                    {"ferramenta": "entender", "pergunta": understood["pergunta"], "entendido": understood["entendido"]}
                )
            quick = direct.try_answer(understood["pergunta"], historico)
            if quick is not None:
                quick["resposta"] = with_price_note(mensagem, quick["resposta"])
                return quick

        # Busca direta: acerta as perguntas do dia a dia (codigo, veiculo/motor, "temos essa daí?",
        # resposta a uma pergunta) sem a IA. Na avaliacao com o Groq real, o modelo gratuito errava
        # a busca ou estragava o texto; a busca direta, nao.
        quick = direct.try_answer(mensagem, historico)
        if quick is not None:
            quick["resposta"] = with_price_note(mensagem, quick["resposta"])
            return quick

        # A busca direta nao entendeu a mensagem: a IA interpreta (frase diferente, varios
        # veiculos, assunto fora do estoque...). So conta o que ela mesma buscar.
        if hasattr(tools, "ready"):
            tools.ready.clear()
        try:
            text, found, tools_used = self._run_provider(provider, config, mensagem, historico, tools)
        except AssistantUnavailableError as exc:
            LOG.warning("assistente: %s -> respondendo pela busca direta", exc)
            result = direct.answer(mensagem, historico)
            result["resposta"] = with_price_note(mensagem, result["resposta"])
            result["aviso"] = f"{exc} Resposta pela busca direta (sem IA)."
            return result
        text = whatsapp_text(text)
        # A IA so pode acrescentar ao texto pronto, nao estraga-lo (o modelo gratuito as vezes
        # troca codigos e nomes ao copiar): se nao veio inteiro, vale o texto pronto.
        ready = tools.ready_texts() if hasattr(tools, "ready_texts") else []
        if ready and not keeps_ready_texts(text, ready):
            LOG.info("assistente: resposta da IA nao trouxe o texto pronto inteiro; usando o texto pronto")
            text = "\n\n".join(ready)
        text = with_price_note(mensagem, text)
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
