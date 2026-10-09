"""
Cerebro do assistente de IA (docs/PLANO_IA.md, Fase 2).

Recebe a pergunta (e o historico da conversa em texto), chama a API da Claude com
as ferramentas de `AssistantToolsService` e devolve a resposta no estilo WhatsApp.
O loop de ferramentas e manual (e nao o tool runner do SDK) para guardar o que
cada ferramenta devolveu: a lista de produtos da resposta sai dali, nao do texto
do modelo.

O backend nao guarda conversa. O historico chega como texto, sem os blocos de
raciocinio de turnos anteriores, entao cada pergunta e uma requisicao nova; so
dentro de uma mesma pergunta o historico da API cresce (sempre por append).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional

import anthropic

from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_tools_service import ASSISTANT_TOOLS, AssistantToolsService

LOG = logging.getLogger(__name__)

MAX_TOKENS = 16000
MAX_TOOL_ROUNDS = 6
MAX_HISTORY_MESSAGES = 20
MAX_PRODUCTS_IN_ANSWER = 10
REQUEST_TIMEOUT_SECONDS = 90.0

# Recusa por classificador de seguranca: a API tenta de novo em outro modelo.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5", "claude-sonnet-5-5"}

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
    """A IA nao pode responder (sem chave, sem internet, chave recusada...)."""


def _default_client_factory(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=2)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("*", "")).strip().upper()


class AssistantChatService:
    def __init__(
        self,
        tools: Optional[AssistantToolsService] = None,
        config_store: Optional[AssistantConfigStore] = None,
        client_factory: Optional[Callable[[str], Any]] = None,
    ) -> None:
        self.tools = tools or AssistantToolsService()
        self.config_store = config_store or AssistantConfigStore()
        self.client_factory = client_factory or _default_client_factory

    # ------------------------------------------------------------------
    # Configuracao
    # ------------------------------------------------------------------

    def resolve_api_key(self, config: Optional[Dict[str, Any]] = None) -> str:
        """Chave salva nas Configuracoes; sem ela, a variavel ANTHROPIC_API_KEY."""
        config = config or self.config_store.load()
        return config["api_key"] or os.getenv("ANTHROPIC_API_KEY", "").strip()

    def status(self) -> Dict[str, Any]:
        config = self.config_store.load()
        saved = config["api_key"]
        return {
            "configurado": bool(self.resolve_api_key(config)),
            "origem_chave": "configuracoes" if saved else ("ambiente" if self.resolve_api_key(config) else None),
            "chave_mascarada": AssistantConfigStore.masked_key(saved),
            "modelo": config["modelo"],
            "esforco": config["esforco"],
        }

    # ------------------------------------------------------------------
    # Conversa
    # ------------------------------------------------------------------

    def chat(self, mensagem: str, historico: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        config = self.config_store.load()
        api_key = self.resolve_api_key(config)
        if not api_key:
            raise AssistantUnavailableError(
                "A IA não está configurada. Informe a chave da API da Anthropic em Configurações."
            )

        messages = self._build_messages(mensagem, historico or [])
        found_products: Dict[int, Dict[str, Any]] = {}
        tools_used: List[str] = []

        try:
            client = self.client_factory(api_key)
            response = None
            for _ in range(MAX_TOOL_ROUNDS):
                response = self._create(client, config, messages)
                self._log_usage(config, response, tools_used)

                if response.stop_reason == "refusal":
                    return self._result(REFUSAL_TEXT, [], tools_used)
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
                    output = self.tools.run_tool(block.name, block.input)
                    tools_used.append(block.name)
                    self._collect_products(output, found_products)
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(output, ensure_ascii=False),
                            "is_error": "erro" in output,
                        }
                    )
                # Todos os resultados da rodada voltam juntos, numa so mensagem.
                messages.append({"role": "user", "content": results})
            else:
                return self._result(NO_ANSWER_TEXT, [], tools_used)
        except anthropic.AuthenticationError as exc:
            raise AssistantUnavailableError("A chave da API foi recusada. Confira a chave em Configurações.") from exc
        except anthropic.PermissionDeniedError as exc:
            raise AssistantUnavailableError(
                f"A chave da API não tem permissão para usar o modelo {config['modelo']}."
            ) from exc
        except anthropic.NotFoundError as exc:
            raise AssistantUnavailableError(
                f"Modelo '{config['modelo']}' não encontrado. Confira o modelo em Configurações."
            ) from exc
        except anthropic.RateLimitError as exc:
            raise AssistantUnavailableError("Muitas perguntas ao mesmo tempo. Tente de novo em instantes.") from exc
        except anthropic.BadRequestError as exc:
            LOG.error("assistente: requisicao recusada pela API: %s", exc.message)
            raise AssistantUnavailableError("A IA recusou a requisição. Veja o log do backend.") from exc
        except anthropic.APIStatusError as exc:
            LOG.error("assistente: erro da API status=%s: %s", exc.status_code, exc.message)
            raise AssistantUnavailableError("O serviço de IA está instável. Tente de novo em instantes.") from exc
        except anthropic.APIConnectionError as exc:
            raise AssistantUnavailableError(
                "Sem conexão com o serviço de IA. Verifique a internet deste computador."
            ) from exc

        text = "\n".join(b.text for b in response.content if b.type == "text").strip() if response else ""
        return self._result(text or NO_ANSWER_TEXT, self._cited_products(text, found_products), tools_used)

    # ------------------------------------------------------------------
    # Auxiliares
    # ------------------------------------------------------------------

    @staticmethod
    def _build_messages(mensagem: str, historico: List[Dict[str, str]]) -> List[Dict[str, Any]]:
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

    @staticmethod
    def _create(client: Any, config: Dict[str, Any], messages: List[Dict[str, Any]]) -> Any:
        kwargs: Dict[str, Any] = {
            "model": config["modelo"],
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "tools": ASSISTANT_TOOLS,
            "messages": messages,
            "output_config": {"effort": config["esforco"]},
            # Cacheia system + ferramentas + historico: as rodadas de ferramenta reaproveitam o prefixo.
            "cache_control": {"type": "ephemeral"},
        }
        if config["modelo"] in FALLBACK_MODELS:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        return client.beta.messages.create(**kwargs)

    @staticmethod
    def _log_usage(config: Dict[str, Any], response: Any, tools_used: List[str]) -> None:
        usage = getattr(response, "usage", None)
        LOG.info(
            "assistente modelo=%s stop=%s ferramentas=%s input=%s output=%s cache_read=%s cache_write=%s request_id=%s",
            config["modelo"],
            getattr(response, "stop_reason", None),
            ",".join(tools_used) or "-",
            getattr(usage, "input_tokens", None),
            getattr(usage, "output_tokens", None),
            getattr(usage, "cache_read_input_tokens", None),
            getattr(usage, "cache_creation_input_tokens", None),
            getattr(response, "_request_id", None),
        )

    @staticmethod
    def _collect_products(output: Dict[str, Any], found: Dict[int, Dict[str, Any]]) -> None:
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

    @staticmethod
    def _cited_products(text: str, found: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Produtos que a resposta cita pelo nome (o prompt pede o nome exato do cadastro)."""
        answer = _normalize(text)
        cited = [p for p in found.values() if _normalize(p["nome"]) and _normalize(p["nome"]) in answer]
        cited.sort(key=lambda p: answer.find(_normalize(p["nome"])))
        return cited[:MAX_PRODUCTS_IN_ANSWER]

    @staticmethod
    def _result(text: str, products: List[Dict[str, Any]], tools_used: List[str]) -> Dict[str, Any]:
        return {
            "resposta": text,
            "produtos": products,
            "ferramentas_usadas": list(dict.fromkeys(tools_used)),
        }
