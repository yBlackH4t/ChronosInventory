"""Assistente de IA (docs/PLANO_IA.md): provedores simulados, reserva pela busca direta e endpoints."""

import copy
import json
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
import requests

from app.services.assistant_chat_service import AssistantChatService
from app.services.assistant_common import MAX_TOOL_ROUNDS, NO_ANSWER_TEXT, REFUSAL_TEXT, spoken_digits_to_numbers
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_direct_service import HELP_TEXT, AssistantDirectService
from app.services.assistant_requests import RequestItem
from app.services.assistant_tools_service import COMPACT_LIMITS
from backend.app.api.deps import get_assistant_chat_service
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)

GROQ_KEY = "gsk_chave-de-teste-groq-5678"
# Mensagem que a busca direta nao entende: e ai que a IA entra (as comuns a busca direta responde).
VAGUE = "me ajuda com uma coisa"
CLAUDE_KEY = "sk-ant-api03-chave-de-teste-1234"


@pytest.fixture(autouse=True)
def _no_env_keys(monkeypatch):
    for name in ("ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture()
def store(tmp_path):
    return AssistantConfigStore(str(tmp_path / "assistente_config.json"))


# ----------------------------------------------------------------------
# Groq / Gemini / Ollama (formato OpenAI), com POST simulado
# ----------------------------------------------------------------------


def _http(status=200, body=None, headers=None):
    return SimpleNamespace(status_code=status, json=lambda: body, headers=headers or {}, text=json.dumps(body))


def _completion(content=None, tool_calls=None):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return _http(
        body={
            "choices": [{"message": message, "finish_reason": "tool_calls" if tool_calls else "stop"}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 20},
        }
    )


def _call(call_id, name, arguments):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


class FakePost:
    def __init__(self, responses=None, error=None):
        self.responses = list(responses or [])
        self.error = error
        self.calls = []

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "json": copy.deepcopy(json)})
        if self.error is not None:
            raise self.error
        return self.responses.pop(0)


def _groq_service(tools_service, store, fake_post, sleeps=None):
    store.update(provedor="groq", api_key=GROQ_KEY)
    return AssistantChatService(
        tools=tools_service,
        config_store=store,
        http_post=fake_post,
        sleep=(sleeps.append if sleeps is not None else lambda s: None),
    )


def test_groq_runs_tools_and_returns_cited_products(tools, store):  # noqa: F811
    fake = FakePost(
        [
            _completion(tool_calls=[_call("call_1", "buscar_por_codigo", {"codigo": "4031196"})]),
            _completion("Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas."),
        ]
    )
    result = _groq_service(tools, store, fake).chat(VAGUE)

    assert result["modo"] == "ia"
    assert result["aviso"] is None
    # A IA resumiu e perdeu linhas do texto pronto: vale o texto pronto da busca.
    assert result["resposta"].startswith("*4031196*: temos.\n• *TURBINA HOLSET HX55W 4031196* — 2 em Canoas")
    assert result["ferramentas_usadas"] == ["buscar_por_codigo"]
    assert [p["nome"] for p in result["produtos"]] == ["TURBINA HOLSET HX55W 4031196", "TURBO HOLSET HX55W 4044318"]

    first, second = fake.calls
    assert first["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert first["headers"]["Authorization"] == f"Bearer {GROQ_KEY}"
    body = first["json"]
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["reasoning_effort"] == "low"
    assert body["tool_choice"] == "auto"
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][1] == {"role": "user", "content": VAGUE}
    assert {t["function"]["name"] for t in body["tools"]} == {
        "buscar_por_codigo", "buscar_por_aplicacao", "comparar_codigos", "movimentacoes_produto",
        "codigo_master_power", "detalhe_produto",
    }

    # Segunda chamada: pedido de ferramenta + resultado, em JSON compacto.
    assistant_turn, tool_turn = second["json"]["messages"][2:4]
    assert assistant_turn["tool_calls"][0]["id"] == "call_1"
    assert tool_turn["role"] == "tool" and tool_turn["tool_call_id"] == "call_1"
    assert json.loads(tool_turn["content"])["temos_em_estoque"] is True
    assert '": ' not in tool_turn["content"] and ', "' not in tool_turn["content"]  # JSON sem espacos


def test_ai_answers_are_converted_to_whatsapp_format(tools, store):  # noqa: F811
    fake = FakePost(
        [
            _completion(
                "Sim. Temos **TURBINA HOLSET HX55W 4031196** – 2 unidades em Canoas.\n"
                "- conferir o motor\n\n"
                "Se precisar de outro modelo ou do conjunto central, avise."
            )
        ]
    )
    result = _groq_service(tools, store, fake).chat(VAGUE)
    assert result["resposta"] == (
        "Sim. Temos *TURBINA HOLSET HX55W 4031196* – 2 unidades em Canoas.\n• conferir o motor"
    )


def test_ai_can_add_to_the_ready_text_but_not_garble_it(tools, store):  # noqa: F811
    ready = tools.with_limits(COMPACT_LIMITS).search_by_code("4031196")["texto_pronto"]

    # Estragou ao copiar (trocou o nome): vale o texto pronto.
    garbled = FakePost(
        [
            _completion(tool_calls=[_call("c1", "buscar_por_codigo", {"codigo": "4031196"})]),
            _completion("*4031196*: temos.\n• *TURBO K26  ***  **  ***"),
        ]
    )
    assert _groq_service(tools, store, garbled).chat(VAGUE)["resposta"] == ready

    # Copiou certo e acrescentou uma frase: fica a resposta da IA.
    added = FakePost(
        [
            _completion(tool_calls=[_call("c1", "buscar_por_codigo", {"codigo": "4031196"})]),
            _completion(ready + "\nPosso separar para o cliente."),
        ]
    )
    assert _groq_service(tools, store, added).chat(VAGUE)["resposta"] == ready + "\nPosso separar para o cliente."


def test_price_questions_get_a_note(tools, store):  # noqa: F811
    store.update(provedor="nenhum")
    answer = AssistantChatService(tools=tools, config_store=store).chat("quanto custa a 4031196?")["resposta"]
    assert answer.startswith("*4031196*: temos.")
    assert answer.endswith("Não tenho informação de preço; só de estoque.")


def test_groq_uses_compact_tool_results(tools, store):  # noqa: F811
    fake = FakePost(
        [
            _completion(tool_calls=[_call("call_1", "buscar_por_aplicacao", {"texto": "scania 440"})]),
            _completion("Depende do motor."),
        ]
    )
    _groq_service(tools, store, fake).chat(VAGUE)
    output = json.loads(fake.calls[1]["json"]["messages"][3]["content"])
    for item in output["fichas_catalogo"]:
        assert all(len(numbers) <= 3 for numbers in item["referencias"].values())
        assert len(item["aplicacoes"]) <= 3


def test_groq_bad_arguments_are_reported_to_the_model(tools, store):  # noqa: F811
    bad_call = {"id": "call_1", "type": "function", "function": {"name": "buscar_por_codigo", "arguments": "{nao"}}
    fake = FakePost([_completion(tool_calls=[bad_call]), _completion("Mande o código.")])
    _groq_service(tools, store, fake).chat("?")
    assert "erro" in json.loads(fake.calls[1]["json"]["messages"][3]["content"])


def test_rate_limit_waits_briefly_then_falls_back_to_direct_search(tools, store):  # noqa: F811
    sleeps = []
    short_wait = FakePost(
        [
            _http(429, {"error": {"message": "rate limit"}}, {"retry-after": "3"}),
            _completion("Sim, temos."),
        ]
    )
    assert _groq_service(tools, store, short_wait, sleeps).chat(VAGUE)["modo"] == "ia"
    assert sleeps == [3.0]

    long_wait = FakePost([_http(429, {"error": {"message": "rate limit"}}, {"retry-after": "600"})])
    result = _groq_service(tools, store, long_wait).chat(VAGUE)
    assert result["modo"] == "busca_direta"
    assert "Limite de uso do Groq atingido" in result["aviso"]
    assert result["resposta"] == HELP_TEXT


@pytest.mark.parametrize(
    "fake, expected",
    [
        (FakePost(error=requests.ConnectionError("offline")), "Sem conexão com o Groq"),
        (FakePost([_http(401, {"error": {"message": "invalid key"}})]), "chave do Groq foi recusada"),
        (FakePost([_http(413, {"error": {"message": "too large"}})]), "grande demais"),
        (FakePost([_http(500, {"error": {"message": "boom"}})]), "instável"),
    ],
)
def test_provider_errors_fall_back_to_direct_search(tools, store, fake, expected):  # noqa: F811
    result = _groq_service(tools, store, fake).chat(VAGUE)
    assert result["modo"] == "busca_direta"
    assert expected in result["aviso"]
    assert "Resposta pela busca direta" in result["aviso"]


def test_missing_key_falls_back_and_env_key_is_used(tools, store, monkeypatch):  # noqa: F811
    service = AssistantChatService(tools=tools, config_store=store, http_post=FakePost())
    result = service.chat(VAGUE)
    assert result["modo"] == "busca_direta"
    assert "falta a chave" in result["aviso"]

    monkeypatch.setenv("GROQ_API_KEY", "gsk_env-0000")
    fake = FakePost([_completion("ok")])
    service = AssistantChatService(tools=tools, config_store=store, http_post=fake)
    assert service.chat("oi")["modo"] == "ia"
    assert fake.calls[0]["headers"]["Authorization"] == "Bearer gsk_env-0000"


def test_endless_tool_loop_stops(tools, store):  # noqa: F811
    fake = FakePost(
        [_completion(tool_calls=[_call(f"c{i}", "buscar_por_codigo", {"codigo": "4031196"})]) for i in range(10)]
    )
    # A IA nao terminou, mas a busca ja tinha a resposta: vale o texto pronto (e nao "nao consegui").
    answer = _groq_service(tools, store, fake).chat(VAGUE)["resposta"]
    assert answer != NO_ANSWER_TEXT and answer.startswith("*4031196*: temos.")
    assert len(fake.calls) == MAX_TOOL_ROUNDS


def test_direct_search_answers_first_without_spending_the_ai(tools, store):  # noqa: F811
    fake = FakePost()
    service = _groq_service(tools, store, fake)

    for question, start in (
        ("temos turbina 4031196?", "*4031196*: temos."),
        ("temos turbina do scania 440?", "Depende do motor:"),
    ):
        result = service.chat(question)
        assert result["modo"] == "busca_direta" and result["aviso"] is None
        assert result["resposta"].startswith(start)
    assert fake.calls == []  # a IA nem foi chamada


def test_provider_none_answers_only_by_direct_search(tools, store):  # noqa: F811
    store.update(provedor="nenhum")
    fake = FakePost()
    result = AssistantChatService(tools=tools, config_store=store, http_post=fake).chat("temos turbina 4031196?")
    assert result["modo"] == "busca_direta"
    assert result["aviso"] is None
    assert fake.calls == []



def test_code_spoken_in_words_becomes_digits(tools, store):  # noqa: F811
    store.update(provedor="nenhum")
    service = AssistantChatService(tools=tools, config_store=store, http_post=FakePost())
    # "meia" = 6; o vendedor digitou o codigo como fala.
    spoken = service.chat("tem a quatro zero três um um nove meia?")
    assert spoken["resposta"].startswith("*4031196*: temos.")
    mixed = service.chat("403 um um nove meia temos?")
    assert mixed["resposta"].startswith("*4031196*: temos.")
    # "essa" na mensagem seguinte usa o codigo falado da anterior.
    historico = [{"papel": "usuario", "texto": "tem a quatro zero três um um nove meia?"},
                 {"papel": "assistente", "texto": spoken["resposta"]}]
    assert service.chat("temos essa daí?", historico)["resposta"].startswith("*4031196*: temos.")


@pytest.mark.parametrize("text, expected", [
    ("tem a cinco quatro cinco cinco meia  zero nove?", "tem a 5455609?"),
    ("Três-sete, oito oito zero", "37880"),
    ("tem uma quatro zero tres um um nove seis reman", "tem uma 4031196 reman"),
    ("tem um turbo do scania 440?", "tem um turbo do scania 440?"),  # "um" sozinho e artigo
    ("dois zero", "dois zero"),  # curto demais para ser codigo
    ("4031196 e 5455609", "4031196 e 5455609"),
])
def test_spoken_digits_to_numbers(text, expected):
    assert spoken_digits_to_numbers(text) == expected

# ----------------------------------------------------------------------
# Claude (API da Anthropic), com cliente simulado
# ----------------------------------------------------------------------


def _text(text):
    return SimpleNamespace(type="text", text=text)


def _tool(block_id, name, tool_input):
    return SimpleNamespace(type="tool_use", id=block_id, name=name, input=tool_input)


def _response(stop_reason, *blocks):
    usage = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=list(blocks), usage=usage, _request_id="req_teste")


class FakeClaude:
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


def _claude_service(tools_service, store, fake, **config):
    store.update(provedor="anthropic", api_key=CLAUDE_KEY, **config)
    return AssistantChatService(tools=tools_service, config_store=store, client_factory=lambda key: fake)


def test_claude_runs_tools_with_fallback_and_cache(tools, store):  # noqa: F811
    fake = FakeClaude(
        [
            _response("tool_use", _tool("tu_1", "buscar_por_codigo", {"codigo": "4031196"})),
            _response("end_turn", _text("Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas.")),
        ]
    )
    result = _claude_service(tools, store, fake, esforco="medium").chat(VAGUE)

    assert result["modo"] == "ia"
    assert result["resposta"].startswith("*4031196*: temos.")  # texto pronto (a IA resumiu demais)
    assert [p["nome"] for p in result["produtos"]] == ["TURBINA HOLSET HX55W 4031196", "TURBO HOLSET HX55W 4044318"]
    first, second = fake.calls
    assert first["model"] == "claude-opus-5-5"
    assert first["output_config"] == {"effort": "medium"}
    assert first["fallbacks"] == "default"
    assert first["betas"] == ["server-side-fallback-2026-07-01"]
    assert first["cache_control"] == {"type": "ephemeral"}
    assert all(tool["strict"] for tool in first["tools"])
    (tool_result,) = second["messages"][2]["content"]
    assert tool_result["tool_use_id"] == "tu_1" and tool_result["is_error"] is False


def test_claude_history_refusal_and_models_without_fallback(tools, store):  # noqa: F811
    fake = FakeClaude([_response("end_turn", _text("Qual delas?"))])
    history = [
        {"papel": "assistente", "texto": "Olá!"},
        {"papel": "usuario", "texto": "tem a 4031196?"},
        {"papel": "assistente", "texto": "Sim, 2 em Canoas."},
    ]
    _claude_service(tools, store, fake).chat("e a outra?", history)
    assert fake.calls[0]["messages"] == [
        {"role": "user", "content": "tem a 4031196?"},
        {"role": "assistant", "content": "Sim, 2 em Canoas."},
        {"role": "user", "content": "e a outra?"},
    ]

    refused = FakeClaude([_response("refusal")])
    assert _claude_service(tools, store, refused).chat("?")["resposta"] == REFUSAL_TEXT

    haiku = FakeClaude([_response("end_turn", _text("ok"))])
    _claude_service(tools, store, haiku, modelo="claude-haiku-5-5").chat("oi")
    assert "fallbacks" not in haiku.calls[0] and "betas" not in haiku.calls[0]


def test_claude_errors_fall_back_to_direct_search(tools, store):  # noqa: F811
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    bad_key = FakeClaude(
        error=anthropic.AuthenticationError("invalid x-api-key", response=httpx2.Response(401, request=request), body=None)
    )
    result = _claude_service(tools, store, bad_key).chat(VAGUE)
    assert result["modo"] == "busca_direta"
    assert "chave da Claude foi recusada" in result["aviso"]


# ----------------------------------------------------------------------
# Busca direta (sem IA)
# ----------------------------------------------------------------------


def test_direct_search_by_code(tools):  # noqa: F811
    direct = AssistantDirectService(tools)

    found = direct.answer("temos turbina 4031196?")
    assert found["modo"] == "busca_direta"
    assert found["resposta"].splitlines()[:2] == [
        "*4031196*: temos.",
        "• *TURBINA HOLSET HX55W 4031196* — 2 em Canoas",
    ]
    assert "equivalente pelo catálogo" in found["resposta"]  # o HX55W 4044318 tambem serve
    assert [p["nome"] for p in found["produtos"]][0] == "TURBINA HOLSET HX55W 4031196"

    reman = direct.answer("tem a 53279907116?")["resposta"]
    assert "*TURBO K27 - 53279887116* — 3 em Passo Fundo (versão nova do mesmo código)" in reman

    no_stock = direct.answer("4031343")["resposta"]
    assert no_stock.startswith("*4031343*: não temos em estoque no momento.")

    unknown = direct.answer("999999999")["resposta"]
    assert unknown == "*999999999*: não encontrei no estoque nem no catálogo. Confira o número."


def test_direct_search_joins_spoken_codes_with_spaces(tools):  # noqa: F811
    direct = AssistantDirectService(tools)
    # A transcricao do audio escreveu o codigo em pedacos.
    spoken = direct.try_answer("5327 988 7116 temos?")
    assert spoken is not None and spoken["resposta"].startswith("*53279887116*: temos.")
    # Numeros que nao formam um codigo conhecido continuam sendo veiculo/motor.
    vehicle = direct.answer("temos turbina do scania 440 2015?")["resposta"]
    assert vehicle.startswith("Depende do motor:")
    # "460 500" nao e codigo: continua sendo busca por veiculo/motor (aqui, o MD13 460/480/500 HP).
    assert not direct.answer("tem turbina 460 500?")["resposta"].startswith("*460500*")


def test_chassis_number_is_not_a_part_code(tools):  # noqa: F811
    direct = AssistantDirectService(tools)
    vin = "9BYC31Y2F7C000805"
    # So o chassi: explica o que mandar, sem gastar a IA.
    alone = direct.try_answer(f"tem turbina pro chassi {vin}?")
    assert alone is not None and alone["resposta"].startswith("Pelo número do chassi")
    # Chassi + veiculo: vale o veiculo.
    with_vehicle = direct.answer(f"turbina do scania 440 chassi {vin}")["resposta"]
    assert with_vehicle.startswith("Depende do motor:")
    # Se o admin ensinou uma regra para o chassi, ela vale.
    tools.knowledge.add_rule(vin, "53279887116", "igual", "so este caminhao")
    taught = direct.answer(f"chassi {vin}")["resposta"]
    assert taught.startswith(f"*{vin}*: não temos esse código, mas temos:")
    assert "*TURBO K27 - 53279887116*" in taught


def test_direct_search_by_application(tools):  # noqa: F811
    direct = AssistantDirectService(tools)

    scania = direct.answer("temos turbina do scania 440?")["resposta"].splitlines()
    assert scania[0] == "Depende do motor:"
    # Cada opcao em duas linhas: o motor e, embaixo, se temos.
    assert scania[1:5] == [
        "• DC13 SCR Euro 5 (A partir de 2012) → turbo GTA42S / HE500WG",
        "   ✅ *TURBO GTA42S - 779839-0025* — 1 em Passo Fundo",
        "• DT12-06/18 Euro 3 → turbo HX52 / HE500GF",
        "   ❌ não temos (cadastrado, sem estoque)",
    ]
    assert scania[-1] == "Qual é o motor ou o ano do veículo?"

    # Resposta curta depois de o assistente perguntar: junta com a pergunta anterior.
    history = [
        {"papel": "usuario", "texto": "temos turbina do scania 440?"},
        {"papel": "assistente", "texto": "Depende do motor: ... Qual é o motor ou o ano do veículo?"},
    ]
    follow_up = direct.answer("dc13", history)["resposta"].splitlines()
    assert follow_up[0] == "Temos:"
    assert "*TURBO GTA42S - 779839-0025*" in follow_up[2]
    # Com o ano junto (que o catalogo nao cita), continua achando.
    with_year = direct.answer("é o dc13, 2015", history)["resposta"]
    assert "*TURBO GTA42S - 779839-0025*" in with_year
    # So o ano: vale o que o catalogo diz ("A partir de 2012" nao serve para 2010).
    older = direct.answer("2010", history)["resposta"].splitlines()
    assert older[:2] == ["Não temos no momento:", "• DT12-06/18 Euro 3 → turbo HX52 / HE500GF"]
    # Segunda resposta seguida ("dc13" e depois "2015"): continua sendo o Scania 440.
    chained = history + [
        {"papel": "usuario", "texto": "dc13"},
        {"papel": "assistente", "texto": "\n".join(follow_up)},
    ]
    assert "*TURBO GTA42S - 779839-0025*" in direct.answer("2015", chained)["resposta"]
    # Texto colado de uma resposta nao e veiculo (achava uma aplicacao pela palavra "não").
    assert direct.try_answer("Não temos esse código, mas temos:") is None
    # "Qual o código master dessa?" logo depois: a turbina que a resposta mostrou (nao a Renault Master).
    master = direct.answer("qual o codigo master dessa?", chained)["resposta"]
    assert master == "*779839-0025*: no catálogo Master Power é a *805310* — MP500W (turbo GTA42S / HE500WG)."
    # E "quando saiu essa?" depois disso continua na mesma turbina.
    after = chained + [
        {"papel": "usuario", "texto": "qual o codigo master dessa?"},
        {"papel": "assistente", "texto": master},
    ]
    assert direct.answer("quando saiu essa?", after)["resposta"].startswith("*779839-0025*:")
    assert direct.answer("qual o codigo master power?")["resposta"].startswith("De qual peça?")

    # Chefe cola o codigo e depois manda (em audio) "temos essa daí?".
    pasted = [{"papel": "usuario", "texto": "805314"}]
    that_one = direct.answer("temos essa daí?", pasted)["resposta"]
    assert that_one.startswith("*805314*:")

    assert direct.answer("bom dia")["resposta"] == HELP_TEXT
    assert direct.answer("turbina do caminhao")["resposta"] == HELP_TEXT


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------


def test_config_endpoints_never_return_keys(client):
    initial = client.get("/assistente/config").json()["data"]
    assert initial["provedor"] == "groq"
    assert initial["configurado"] is False
    assert {p["id"] for p in initial["provedores"]} == {"groq", "gemini", "ollama", "anthropic", "nenhum"}

    saved = client.put("/assistente/config", json={"api_key": GROQ_KEY})
    assert saved.status_code == 200, saved.text
    data = saved.json()["data"]
    groq = next(p for p in data["provedores"] if p["id"] == "groq")
    assert data["configurado"] is True
    assert groq["chave_mascarada"] == "gsk_cha...5678"
    assert groq["origem_chave"] == "configuracoes"
    # Campos do provedor atual tambem no nivel de cima (contrato original da tela).
    assert data["chave_mascarada"] == "gsk_cha...5678"
    assert data["origem_chave"] == "configuracoes"
    assert data["modelo"] == "openai/gpt-oss-120b"
    assert GROQ_KEY not in saved.text

    claude = client.put("/assistente/config", json={"provedor": "anthropic", "api_key": CLAUDE_KEY, "esforco": "medium"})
    data = claude.json()["data"]
    assert data["provedor"] == "anthropic" and data["esforco"] == "medium"
    assert CLAUDE_KEY not in claude.text and GROQ_KEY not in client.get("/assistente/config").text

    assert client.put("/assistente/config", json={"provedor": "openai"}).status_code == 422
    assert client.put("/assistente/config", json={"esforco": "turbo"}).status_code == 422
    removed = client.put("/assistente/config", json={"api_key": ""}).json()["data"]
    assert removed["configurado"] is False  # removeu a chave do provedor atual (Claude)


def test_chat_endpoint(client, tools):  # noqa: F811
    # Pergunta comum: a busca direta responde (sem IA e sem aviso).
    direct = client.post("/assistente/chat", json={"mensagem": "temos turbina 4031196?"})
    assert direct.status_code == 200, direct.text
    data = direct.json()["data"]
    assert data["modo"] == "busca_direta"
    assert data["aviso"] is None
    assert data["produtos"][0]["nome"] == "TURBINA HOLSET HX55W 4031196"

    # Mensagem que a busca nao entende e sem chave da IA: ajuda + aviso.
    vague = client.post("/assistente/chat", json={"mensagem": VAGUE}).json()["data"]
    assert vague["resposta"] == HELP_TEXT and "falta a chave" in vague["aviso"]

    assert client.post("/assistente/chat", json={"mensagem": ""}).status_code == 422
    assert client.post("/assistente/chat", json={"mensagem": "   "}).status_code == 422
    assert client.post("/assistente/chat", json={"mensagem": "x" * 1001}).status_code == 200
    assert client.post("/assistente/chat", json={"mensagem": "x" * 8001}).status_code == 422

    client.put("/assistente/config", json={"api_key": GROQ_KEY})
    fake = FakePost(
        [
            _completion(tool_calls=[_call("call_1", "buscar_por_aplicacao", {"texto": "scania 440"})]),
            _completion("Depende do motor:\n• DC13 → *TURBO GTA42S - 779839-0025* — 1 em Passo Fundo\n• DT12 → não temos"),
        ]
    )
    client.app.dependency_overrides[get_assistant_chat_service] = lambda: AssistantChatService(http_post=fake)
    try:
        response = client.post(
            "/assistente/chat",
            json={
                "mensagem": "aquela do caminhao do cliente de ontem",
                "historico": [{"papel": "usuario", "texto": "oi"}, {"papel": "assistente", "texto": "Olá!"}],
            },
        )
    finally:
        client.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["modo"] == "ia" and data["aviso"] is None
    assert data["ferramentas_usadas"] == ["buscar_por_aplicacao"]
    assert [p["nome"] for p in data["produtos"]] == ["TURBO GTA42S - 779839-0025"]
    assert len(fake.calls[0]["json"]["messages"]) == 4  # system + historico (2) + pergunta


def test_api_keys_are_stored_protected_and_plain_files_are_migrated(store):
    store.update(provedor="groq", api_key=GROQ_KEY)
    raw = open(store.config_path, encoding="utf-8").read()
    assert GROQ_KEY not in raw  # nunca em texto puro no arquivo
    assert store.load()["chaves"]["groq"] == GROQ_KEY  # quem usa recebe em claro
    assert AssistantConfigStore.key_for(store.load(), "groq") == (GROQ_KEY, "configuracoes")

    # Arquivo de versao antiga: chave em texto puro e outra secao (admin) que nao pode sumir.
    with open(store.config_path, "w", encoding="utf-8") as f:
        json.dump({"provedor": "anthropic", "chaves": {"anthropic": CLAUDE_KEY}, "admin": {"hash": "x"}}, f)
    assert store.load()["chaves"] == {"anthropic": CLAUDE_KEY}
    migrated = json.loads(open(store.config_path, encoding="utf-8").read())
    assert CLAUDE_KEY not in json.dumps(migrated)
    assert migrated["admin"] == {"hash": "x"}
    assert store.load()["chaves"] == {"anthropic": CLAUDE_KEY}

    # Salvar uma secao nao desprotege as chaves.
    store.save_section("whatsapp", {"ligado": False})
    assert CLAUDE_KEY not in open(store.config_path, encoding="utf-8").read()
    assert store.load()["chaves"] == {"anthropic": CLAUDE_KEY}


def test_whatsapp_customers_never_get_product_movements(tools, store):  # noqa: F811
    question = "qual foi a ultima vez que ela saiu? 53279887116"
    # Busca direta: no app vai para as movimentacoes; no WhatsApp do cliente, vira consulta de estoque.
    store.update(provedor="nenhum")
    service = AssistantChatService(tools=tools, config_store=store)
    assert service.chat(question, canal="app")["ferramentas_usadas"] == ["movimentacoes_produto"]
    on_whatsapp = service.chat(question, canal="whatsapp")
    assert "movimentacoes_produto" not in on_whatsapp["ferramentas_usadas"]
    assert "Última saída" not in on_whatsapp["resposta"]

    # IA: a ferramenta nem aparece para o modelo, e se ele insistir, nao roda.
    fake = FakePost(
        [
            _completion(tool_calls=[_call("call_1", "movimentacoes_produto", {"codigo": "53279887116"})]),
            _completion("Não tenho essa informação."),
        ]
    )
    result = _groq_service(tools, store, fake).chat("me conta o giro dessa peça aí", canal="whatsapp")
    names = {t["function"]["name"] for t in fake.calls[0]["json"]["tools"]}
    assert "movimentacoes_produto" not in names and "buscar_por_codigo" in names
    tool_turn = fake.calls[1]["json"]["messages"][-1]
    assert "indispon" in tool_turn["content"]
    assert "Última saída" not in result["resposta"]


@pytest.mark.parametrize("canal,allowed", [("app", True), ("particular", True), ("whatsapp", False)])
def test_structured_requests_keep_channel_movement_restrictions(tools, store, canal, allowed):  # noqa: F811
    question = "qual foi a ultima vez que ela saiu? 53279887116"
    store.update(provedor="groq")
    plan = [RequestItem(id="1", intencao="movimentacao", trecho=question, codigos=["53279887116"])]
    interpreter = SimpleNamespace(interpret=lambda message, history: {
        "pergunta": question, "entendido": {}, "pedidos": plan,
    })
    service = AssistantChatService(tools=tools, config_store=store, interpreter=interpreter)
    result = service.chat(question, canal=canal)
    assert ("movimentacoes_produto" in result["ferramentas_usadas"]) is allowed
    assert len(result["pedidos"]) == 1
    if not allowed:
        assert "Última saída" not in result["resposta"]
