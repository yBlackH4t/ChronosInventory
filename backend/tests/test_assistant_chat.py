"""Cerebro do assistente de IA (docs/PLANO_IA.md, Fase 2), com a API da Claude simulada."""

import copy
import json
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.services.assistant_chat_service import (
    MAX_TOOL_ROUNDS,
    NO_ANSWER_TEXT,
    REFUSAL_TEXT,
    AssistantChatService,
    AssistantUnavailableError,
)
from app.services.assistant_config_store import AssistantConfigStore
from backend.app.api.deps import get_assistant_chat_service
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)

FAKE_KEY = "sk-ant-api03-chave-de-teste-1234"


def _text(text):
    return SimpleNamespace(type="text", text=text)


def _tool(block_id, name, tool_input):
    return SimpleNamespace(type="tool_use", id=block_id, name=name, input=tool_input)


def _response(stop_reason, *blocks):
    usage = SimpleNamespace(
        input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=list(blocks), usage=usage, _request_id="req_teste")


class FakeClient:
    """Imita client.beta.messages.create devolvendo respostas prontas, em ordem."""

    def __init__(self, responses=None, error=None):
        self.responses = list(responses or [])
        self.error = error
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        if self.error is not None:
            raise self.error
        return self.responses.pop(0)


@pytest.fixture(autouse=True)
def _no_env_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


@pytest.fixture()
def store(tmp_path):
    return AssistantConfigStore(str(tmp_path / "assistente_config.json"))


def _service(tools_service, store, fake, api_key=FAKE_KEY):
    if api_key:
        store.update(api_key=api_key)
    return AssistantChatService(tools=tools_service, config_store=store, client_factory=lambda key: fake)


def test_chat_runs_tools_and_returns_cited_products(tools, store):  # noqa: F811
    fake = FakeClient(
        [
            _response("tool_use", _tool("tu_1", "buscar_por_codigo", {"codigo": "4031196"})),
            _response("end_turn", _text("Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas.")),
        ]
    )
    result = _service(tools, store, fake).chat("temos turbina 4031196?")

    assert result["resposta"] == "Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas."
    assert result["ferramentas_usadas"] == ["buscar_por_codigo"]
    # So o produto citado na resposta (o equivalente encontrado na busca fica de fora).
    assert result["produtos"] == [
        {
            "id": tools.ids["hx55w"],
            "nome": "TURBINA HOLSET HX55W 4031196",
            "categoria": "TURBO",
            "estoque_total": 2,
            "estoque_por_local": {"Canoas": 2},
        }
    ]

    first, second = fake.calls
    assert first["model"] == "claude-opus-5-5"
    assert first["output_config"] == {"effort": "medium"}
    assert first["fallbacks"] == "default"
    assert first["betas"] == ["server-side-fallback-2026-07-01"]
    assert first["cache_control"] == {"type": "ephemeral"}
    assert all(tool["strict"] for tool in first["tools"])
    assert first["messages"] == [{"role": "user", "content": "temos turbina 4031196?"}]

    # Segunda chamada: historico por append, com o resultado da ferramenta.
    assert second["messages"][0] == first["messages"][0]
    assert second["messages"][1]["role"] == "assistant"
    (tool_result,) = second["messages"][2]["content"]
    assert tool_result["tool_use_id"] == "tu_1"
    assert tool_result["is_error"] is False
    assert json.loads(tool_result["content"])["temos_em_estoque"] is True


def test_history_is_sent_as_text_starting_with_user(tools, store):  # noqa: F811
    fake = FakeClient([_response("end_turn", _text("Qual é o motor?"))])
    history = [
        {"papel": "assistente", "texto": "Olá! Como posso ajudar?"},
        {"papel": "usuario", "texto": "temos turbina do scania 440?"},
        {"papel": "assistente", "texto": "Depende do motor: DC13 ou DT12?"},
        {"papel": "usuario", "texto": "   "},
    ]
    _service(tools, store, fake).chat("DC13", history)

    assert fake.calls[0]["messages"] == [
        {"role": "user", "content": "temos turbina do scania 440?"},
        {"role": "assistant", "content": "Depende do motor: DC13 ou DT12?"},
        {"role": "user", "content": "DC13"},
    ]


def test_tool_errors_are_flagged_to_the_model(tools, store):  # noqa: F811
    fake = FakeClient(
        [
            _response("tool_use", _tool("tu_1", "buscar_por_codigo", {"codigo": "12"})),
            _response("end_turn", _text("Informe o código completo da peça.")),
        ]
    )
    result = _service(tools, store, fake).chat("tem a 12?")

    (tool_result,) = fake.calls[1]["messages"][2]["content"]
    assert tool_result["is_error"] is True
    assert "erro" in json.loads(tool_result["content"])
    assert result["produtos"] == []


def test_refusal_and_endless_tool_loop(tools, store):  # noqa: F811
    refused = FakeClient([_response("refusal")])
    assert _service(tools, store, refused).chat("?")["resposta"] == REFUSAL_TEXT

    looping = FakeClient(
        [_response("tool_use", _tool(f"tu_{i}", "buscar_por_codigo", {"codigo": "4031196"})) for i in range(10)]
    )
    assert _service(tools, store, looping).chat("4031196")["resposta"] == NO_ANSWER_TEXT
    assert len(looping.calls) == MAX_TOOL_ROUNDS


def test_models_without_server_fallback_skip_it(tools, store):  # noqa: F811
    store.update(modelo="claude-haiku-5-5", esforco="low")
    fake = FakeClient([_response("end_turn", _text("ok"))])
    _service(tools, store, fake).chat("oi")

    (call,) = fake.calls
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_config"] == {"effort": "low"}
    assert "fallbacks" not in call and "betas" not in call


def test_missing_key_and_api_errors_become_unavailable(tools, store, monkeypatch):  # noqa: F811
    with pytest.raises(AssistantUnavailableError, match="não está configurada"):
        _service(tools, store, FakeClient(), api_key=None).chat("oi")

    # Sem chave salva, a variavel de ambiente serve.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-env-0000")
    env_fake = FakeClient([_response("end_turn", _text("ok"))])
    assert _service(tools, store, env_fake, api_key=None).chat("oi")["resposta"] == "ok"

    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    offline = FakeClient(error=anthropic.APIConnectionError(request=request))
    with pytest.raises(AssistantUnavailableError, match="Sem conexão"):
        _service(tools, store, offline).chat("oi")

    bad_key = FakeClient(
        error=anthropic.AuthenticationError(
            "invalid x-api-key", response=httpx2.Response(401, request=request), body=None
        )
    )
    with pytest.raises(AssistantUnavailableError, match="chave da API foi recusada"):
        _service(tools, store, bad_key).chat("oi")


def test_config_endpoints_never_return_the_key(client):
    initial = client.get("/assistente/config")
    assert initial.status_code == 200
    assert initial.json()["data"]["configurado"] is False

    saved = client.put("/assistente/config", json={"api_key": FAKE_KEY, "esforco": "low"})
    assert saved.status_code == 200, saved.text
    data = saved.json()["data"]
    assert data["configurado"] is True
    assert data["origem_chave"] == "configuracoes"
    assert data["chave_mascarada"] == "sk-ant-...1234"
    assert data["esforco"] == "low"
    assert FAKE_KEY not in saved.text
    assert FAKE_KEY not in client.get("/assistente/config").text

    assert client.put("/assistente/config", json={"esforco": "turbo"}).status_code == 422
    removed = client.put("/assistente/config", json={"api_key": ""})
    assert removed.json()["data"]["configurado"] is False


def test_chat_endpoint(client, tools):  # noqa: F811
    unavailable = client.post("/assistente/chat", json={"mensagem": "temos turbina 4031196?"})
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "assistente_indisponivel"

    assert client.post("/assistente/chat", json={"mensagem": ""}).status_code == 422
    assert client.post("/assistente/chat", json={"mensagem": "   "}).status_code == 422
    assert client.post("/assistente/chat", json={"mensagem": "x" * 1001}).status_code == 422

    client.put("/assistente/config", json={"api_key": FAKE_KEY})
    fake = FakeClient(
        [
            _response("tool_use", _tool("tu_1", "buscar_por_aplicacao", {"texto": "scania 440"})),
            _response(
                "end_turn",
                _text("Depende do motor:\n• DC13 → *TURBO GTA42S - 779839-0025* — 1 em Passo Fundo\n• DT12 → não temos"),
            ),
        ]
    )
    client.app.dependency_overrides[get_assistant_chat_service] = lambda: AssistantChatService(
        client_factory=lambda key: fake
    )
    try:
        response = client.post(
            "/assistente/chat",
            json={
                "mensagem": "temos turbina do scania 440?",
                "historico": [{"papel": "usuario", "texto": "oi"}, {"papel": "assistente", "texto": "Olá!"}],
            },
        )
    finally:
        client.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["ferramentas_usadas"] == ["buscar_por_aplicacao"]
    assert [p["nome"] for p in data["produtos"]] == ["TURBO GTA42S - 779839-0025"]
    assert data["produtos"][0]["estoque_por_local"] == {"Passo Fundo": 1}
    assert len(fake.calls[0]["messages"]) == 3
