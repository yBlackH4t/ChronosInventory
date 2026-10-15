"""IA que entende a mensagem, grafo de codigos e formato curto do WhatsApp (2.4.5)."""

import json
from types import SimpleNamespace

from app.services.assistant_chat_service import AssistantChatService
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_direct_service import AssistantDirectService
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_interpreter_service import AssistantInterpreter, question_from, supported_codes
from app.services.code_graph import CodeGraph
from test_assistant_tools import CANOAS, _create_product, tools  # noqa: F401  (fixture: catalogo + produtos)


class FakePost:
    def __init__(self, content):
        self.content, self.calls = content, []

    def __call__(self, url, headers=None, json=None, timeout=None):  # noqa: A002
        self.calls.append(json)
        body = {"choices": [{"message": {"content": self.content}}], "usage": {}}
        return SimpleNamespace(status_code=200, json=lambda: body, headers={})


# ----------------------------------------------------------------------
# A IA entende, as regras conferem
# ----------------------------------------------------------------------


def test_understood_message_becomes_a_standard_question():
    texts = ["Bom dia, olha aí 403-1195, montada a reman"]
    assert question_from(
        {"intencao": "estoque", "codigos": ["4031195"], "versoes": ["montada", "reman"]}, texts
    ) == "temos 4031195 reman montada"
    assert question_from({"intencao": "comparar", "codigos": ["4031195", "4031196"]}, ["4031195 ou 4031196?"]) == (
        "4031195 é igual a 4031196?"
    )
    assert question_from({"intencao": "aplicacao", "veiculo": "volvo fh", "motor": "d13", "ano": "2015"}, ["..."]) == (
        "turbina volvo fh d13 2015"
    )
    assert question_from({"intencao": "outro"}, texts) is None
    # Codigo que nao esta no texto (a IA inventou ou "corrigiu") nao vale.
    assert supported_codes(["4031196", "403-1195"], texts) == ["4031195"]


def test_chat_uses_what_the_ai_understood(tmp_path, tools):  # noqa: F811
    store =AssistantConfigStore(str(tmp_path / "cfg.json"))
    store.update(provedor="groq", api_key="gsk_teste")
    understood = {"intencao": "estoque", "codigos": ["4031196"], "versoes": [], "veiculo": None, "motor": None, "ano": None}
    post = FakePost(json.dumps(understood))
    history = AssistantHistoryService(str(tmp_path / "historico.db"))
    chat = AssistantChatService(
        tools=tools, config_store=store, history=history, interpreter=AssistantInterpreter(store, http_post=post)
    )
    # Frase que a busca direta sozinha nao entende ("aquela do Joao"): a IA tira o codigo.
    result = chat.chat("vê pra mim aquela HX55W que o João falou, a 4031196, tem?", [])
    assert result["resposta"].startswith("*4031196*: temos.")
    assert post.calls[0]["response_format"] == {"type": "json_object"}
    (conversation,) = history.list_conversations()
    assert conversation["consultas"][0]["ferramenta"] == "entender"

    # A IA inventou um codigo que nao esta na mensagem: ignora e segue a busca direta.
    post.content = json.dumps({**understood, "codigos": ["9999999"]})
    assert AssistantInterpreter(store, http_post=post).interpret("tem a 4031196?", []) is None


def test_euro_norm_is_a_filter_and_never_dropped(client, tools):  # noqa: F811
    # A IA esqueceu a norma: a regra poe de volta a da mensagem.
    assert question_from({"intencao": "aplicacao", "veiculo": "volvo fh 520"}, ["Volvo fh 520 euro 3"]) == (
        "turbina volvo fh 520 euro 3"
    )
    # "Euro 3" tira a aplicacao so Euro 5 (era o FH 520 trazendo a 4031196).
    euro3 = tools.search_by_application("scania 440 euro 3")
    assert [i["ficha"] for i in euro3["fichas_catalogo"]] == ["805470"]
    euro5 = tools.search_by_application("scania 440 euro 5")
    assert [i["ficha"] for i in euro5["fichas_catalogo"]] == ["805310"]


def test_application_marked_as_not_applicable(client, tools):  # noqa: F811
    wrong = {"ficha": "805310", "montadora": "Scania", "veiculo": "Scania R 440", "motor": "DC13 SCR Euro 5",
             "complemento": "A partir de 2012"}
    before = [i["ficha"] for i in tools.search_by_application("scania r 440 dc13")["fichas_catalogo"]]
    assert "805310" in before
    assert client.post("/catalogo/aplicacoes-ocultas", json=wrong).status_code == 200
    after = [i["ficha"] for i in tools.search_by_application("scania r 440 dc13")["fichas_catalogo"]]
    assert "805310" not in after  # sobrou so o Scania G 440, que nao foi marcado
    assert "805310" in [i["ficha"] for i in tools.search_by_application("scania g 440 dc13")["fichas_catalogo"]]
    # A aba Catalogo do produto mostra a linha riscada.
    links = client.get(f"/produtos/{tools.ids['gta42']}/catalogo").json()["data"]["vinculos"]
    marked = {(a["veiculo"], a["oculta"]) for link in links for a in link["aplicacoes"]}
    assert ("Scania R 440", True) in marked and ("Scania G 440", False) in marked
    # Desfazer volta a valer.
    assert client.post("/catalogo/aplicacoes-ocultas/desfazer", json=wrong).status_code == 200
    assert "805310" in [i["ficha"] for i in tools.search_by_application("scania r 440 dc13")["fichas_catalogo"]]


# ----------------------------------------------------------------------
# Grafo de codigos
# ----------------------------------------------------------------------


def test_code_graph_paths_and_blocks():
    products = [
        {"id": 1, "nome": "TURBO HOLSET HX55 - 4031195/4044201"},
        {"id": 2, "nome": "TURBO HOLSET HX55 4044201 / 3785479"},
        # Pedaco de codigo de kit em muitos produtos nao liga nada.
        *({"id": 10 + i, "nome": f"CONJUNTO 1000-010-{i:03d} 100001"} for i in range(8)),
    ]
    rules = [
        {"codigo_a_norm": "3785479", "codigo_b_norm": "5452302", "codigo_a": "3785479", "codigo_b": "5452302", "tipo": "IGUAL"},
        {"codigo_a_norm": "4031195", "codigo_b_norm": "4031196", "codigo_a": "4031195", "codigo_b": "4031196", "tipo": "DIFERENTE"},
    ]
    graph = CodeGraph(products, rules, [{"codigo": "HX55-998877", "produto_id": 1}])
    steps = graph.path("4031195", "5452302")
    assert [reason for _, _, reason in steps] == [
        "mesmo produto: TURBO HOLSET HX55 - 4031195/4044201",
        "mesmo produto: TURBO HOLSET HX55 4044201 / 3785479",
        "igual, ensinado pelo especialista",
    ]
    assert graph.path("4031195", "4031196") is None  # "diferente" bloqueia
    assert graph.path("1000010001", "1000010002") is None  # codigo de kit nao liga
    assert "HX55998877" in [code for code, _ in graph.neighbors("4031195", 1)]  # item da NF-e


def test_compare_explains_a_longer_path(client, tools):  # noqa: F811
    _create_product(client, "TURBO HX55 - 4031195/4044201", {CANOAS: 1})
    _create_product(client, "TURBO HX55 4044201 / 3785479", {})
    lines = tools.compare_codes("4031195", "3785479")["texto_pronto"].splitlines()
    assert lines[0] == "*4031195* e *3785479*: provavelmente são iguais, pelo caminho:"
    assert lines[1] == "• 4031195 → 4044201 (mesmo produto: TURBO HX55 - 4031195/4044201)"


# ----------------------------------------------------------------------
# Formato curto do chefe no WhatsApp
# ----------------------------------------------------------------------


def test_whatsapp_stock_answer_in_the_boss_format(client, tools):  # noqa: F811
    _create_product(client, "TURBO HOLSET HX55 - 4031195", {CANOAS: 1})
    _create_product(client, "TURBO HOLSET HX55 - 4031195RX (MONTADO)", {})
    compact = AssistantDirectService(tools, compact=True).answer("tem a 4031195?")["resposta"]
    assert compact.splitlines() == [
        "*Consulta Estoque*",
        "",
        "📍Canoas: 01 - 4031195",
        "📍Passo Fundo: 00 - 4031195",
        "📍Canoas: 00 - 4031195 MONTADA",
        "📍Passo Fundo: 00 - 4031195 MONTADA",
    ]
    # No app, a resposta completa continua.
    assert AssistantDirectService(tools).answer("tem a 4031195?")["resposta"].startswith("*4031195*: temos.")


def test_whatsapp_vehicle_answer_in_the_boss_format(client, tools):  # noqa: F811
    lines = AssistantDirectService(tools, compact=True).answer("scania 440 euro 3")["resposta"].splitlines()
    assert lines == [
        "*Consulta Estoque*",
        "",
        "*DT12-06/18 Euro 3* · HX52 / HE500GF",
        "📍Canoas: 00 - 4031343",
        "📍Passo Fundo: 00 - 4031343",
    ]
    assert not any(line.startswith(("•", "✅", "Depende")) for line in lines)
    # No app, a resposta completa continua.
    assert not AssistantDirectService(tools).answer("scania 440 euro 3")["resposta"].startswith("*Consulta")


def test_vehicle_question_ignores_the_previous_code_and_unknown_words(tools):  # noqa: F811
    # Pergunta por veiculo: o codigo da conversa anterior era outro pedido.
    assert question_from(
        {"intencao": "aplicacao", "codigos": ["876271515151517"], "veiculo": "scania r460"},
        ["turbina do scania super R460", "876271515151517"],
    ) == "turbina scania r460"
    # "super" nao esta no catalogo junto com o R 440: sai, e a busca acha o R 440.
    found = tools.search_by_application("scania super r440")
    assert "SUPER" in found["termos_ignorados"] and found["total_fichas"]


def test_same_catalog_model_links_codes_from_different_fichas(tools, monkeypatch):  # noqa: F811
    fichas = {
        "4031196": [{"id": 901, "modelo": "MP530 (HX55W / HE500WG)"}, {"id": 902, "modelo": "MP530w (HX55W HE500WG)"}],
        "5455609": [{"id": 903, "modelo": "MP530w (HE500WG)"}],
        "4031343": [{"id": 904, "modelo": "MP530 (HX52 / HE500GF)"}],
    }
    monkeypatch.setattr(tools.catalog, "search_catalog", lambda code, limit=50: fichas.get(code, []))
    text = tools.compare_codes("4031196", "5455609")["texto_pronto"]
    assert text.startswith("*4031196* e *5455609*: provavelmente servem uma no lugar da outra.")
    assert "(MP530w / HE500WG)" in text and text.endswith("Deixei para o especialista confirmar.")
    # Mesmo "MP530", mas outra turbina (HX52 x HX55W): nao liga.
    assert "não sei dizer" in tools.compare_codes("4031196", "4031343")["texto_pronto"]
