"""Aba Produtos em colunas (2.7.11): o codigo pesquisado separado por coluna."""

from backend.tests.test_assistant_tools import CANOAS, _create_product, _link, _seed_catalog
from core.catalog.bundle import relink_catalog
from core.database.connection import DatabaseConnection


def _columns(client, codigo: str) -> dict:
    response = client.get("/produtos/colunas", params={"codigo": codigo})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_code_search_splits_new_reman_assembled_core_and_similar(client):
    _seed_catalog()
    nova = _create_product(client, "TURBINA HOLSET HX55W 4031196", {CANOAS: 2})
    reman = _create_product(client, "TURBO HOLSET HX55W - 4031196RX", {})
    core_of_reman = _create_product(client, "CONJUNTO CENTRAL - 4032382", {CANOAS: 3})
    _link(reman, core_of_reman)
    core = _create_product(client, "CONJUNTO CENTRAL HX55W 4031196", {CANOAS: 4})
    similar = _create_product(client, "TURBO HOLSET HX55W 4044318", {CANOAS: 1})
    relink_catalog(DatabaseConnection(), force=True)

    data = _columns(client, "403-1196")

    assert data["codigo"] == "4031196"
    by_key = {col["chave"]: col for col in data["colunas"]}
    assert list(by_key) == ["nova", "reman", "montada", "conjunto", "similares"]
    assert [i["produto"]["id"] for i in by_key["nova"]["itens"]] == [nova]
    assert by_key["nova"]["itens"][0]["produto"]["total_stock"] == 2
    assert [i["produto"]["id"] for i in by_key["reman"]["itens"]] == [reman]

    # A montada e o conjunto onde ela e faturada: o saldo e o dele, e ele nao repete na coluna de conjunto.
    (montada,) = by_key["montada"]["itens"]
    assert montada["produto"]["id"] == core_of_reman
    assert montada["relacao"] == "montada_no_conjunto"
    assert montada["turbo_id"] == reman
    assert montada["produto"]["total_stock"] == 3
    assert [i["produto"]["id"] for i in by_key["conjunto"]["itens"]] == [core]

    (sim,) = by_key["similares"]["itens"]
    assert sim["produto"]["id"] == similar
    assert sim["rotulo"] == "Catálogo"

    assert data["aplicacoes"] == ["Volvo FH 460 · MD13 460/480/500/520 HP Euro 5"]


def test_only_the_new_turbo_gives_a_single_column(client):
    _create_product(client, "TURBO R2S SPRINTER 415 / 515 EURO 5 - 10009880037", {CANOAS: 2})
    data = _columns(client, "10009880037")
    assert [col["chave"] for col in data["colunas"]] == ["nova"]


def test_unknown_code_has_no_columns(client):
    assert _columns(client, "9999999")["colunas"] == []
    assert client.get("/produtos/colunas", params={"codigo": "ab"}).status_code == 400


def test_links_made_on_the_screen_show_up(client):
    turbo = _create_product(client, "TURBO HOLSET HX40W - 4038790", {CANOAS: 1})
    core = _create_product(client, "CONJUNTO CENTRAL HX40W - 1000-020-112", {})
    twin = _create_product(client, "TURBO HOLSET HX40W - 3536306", {CANOAS: 2})
    _link(turbo, core)  # sem saldo no conjunto: ainda nao e montada, mas o vinculo aparece
    _link(twin, turbo)

    by_key = {col["chave"]: col for col in _columns(client, "4038790")["colunas"]}
    assert [i["produto"]["id"] for i in by_key["conjunto"]["itens"]] == [core]
    assert by_key["conjunto"]["itens"][0]["rotulo"] == "Vinculado"
    assert [i["produto"]["id"] for i in by_key["similares"]["itens"]] == [twin]
    assert "montada" not in by_key
