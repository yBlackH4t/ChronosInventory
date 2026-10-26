import pytest

from app.services.assistant_direct_service import AssistantDirectService
from core.catalog import bundle
from core.catalog.normalization import expand_family_codes
from core.database.connection import DatabaseConnection
from test_assistant_tools import CANOAS, _create_product, tools as stock_tools_fixture

tools = stock_tools_fixture


@pytest.mark.parametrize("code", ["7961555005", "7961550005", "7961559005"])
def test_garrett_family_preserves_the_full_part_number(code):
    family = set(expand_family_codes([code]))
    assert "796155" not in family
    assert "7961559005" in family
    assert not family.intersection({"7961555006", "7961559006", "7961555011", "7961559011"})


def test_whatsapp_does_not_add_other_garrett_suffixes_to_stock(client, tools):
    exact_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5005S", {CANOAS: 1})
    other_id = _create_product(client, "TURBO GARRETT GT35 - 800891-5001S / 796155-5011S", {CANOAS: 1})
    _create_product(client, "TURBO GARRETT GT35 - 796155-5006S", {})
    _create_product(client, "TURBO GARRETT GT35 - 796155-9005S", {})
    _create_product(client, "TURBO GARRETT GT35 - 796155-9005S (MONTADO)", {})

    result = tools.search_by_code("796155-5005")
    assert exact_id in {product["id"] for product in result["produtos"]}
    assert other_id not in {product["id"] for product in result["produtos"]}
    answer = AssistantDirectService(tools, compact=True).answer("quantas temos da 796155-5005?")
    lines = answer["resposta"].splitlines()
    assert "📍Canoas: 01 - 796155-5005" in lines
    assert "📍Canoas: 00 - 796155-5005 REMAN" in lines
    assert "📍Canoas: 00 - 796155-5005 MONTADA" in lines
    assert "📍Canoas: 02 - 796155-5005" not in lines


@pytest.mark.parametrize("code", ["796155-5005", "796155-0005", "796155-9005"])
def test_garrett_keeps_new_and_reman_stock_separate(client, tools, code):
    new_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5005S", {CANOAS: 1})
    reman_id = _create_product(client, "TURBO GARRETT GT35 - 796155-9005S", {CANOAS: 2})
    mounted_id = _create_product(client, "TURBO GARRETT GT35 - 796155-9005S (MONTADO)", {CANOAS: 3})
    other_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5006S", {CANOAS: 4})

    result = tools.search_by_code(code)
    found = {product["id"]: product for product in result["produtos"]}
    assert set(found) == {new_id, reman_id, mounted_id}
    assert found[new_id]["condicao"] == "nova"
    assert found[reman_id]["condicao"] == "reman"
    assert found[mounted_id]["condicao"] == "montada"
    assert other_id not in found
    lines = result["texto_compacto"].splitlines()
    assert f"📍Canoas: 01 - {code}" in lines
    assert f"📍Canoas: 02 - {code} REMAN" in lines
    assert f"📍Canoas: 03 - {code} MONTADA" in lines


def test_garrett_short_prefix_still_finds_different_part_numbers(client, tools):
    first_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5005S", {CANOAS: 1})
    second_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5006S", {CANOAS: 1})
    found = tools.search_by_code("796155")
    assert {product["id"] for product in found["produtos"]} == {first_id, second_id}
    assert found["codigo_incompleto"] is True
    assert "Qual é o código completo?" in found["texto_pronto"]
    assert "texto_compacto" not in found


def test_garrett_different_suffixes_are_not_confirmed_as_same_part(tools):
    relation = tools.knowledge.relation_between("796155-5005", "796155-5011")
    assert relation["relacao"] is None
    relation = tools.knowledge.relation_between("796155-5005", "796155-9005")
    assert relation["fonte"] == "familia"


def test_expert_can_distinguish_garrett_suffixes(tools):
    tools.knowledge.add_rule("796155-5005", "796155-5006", "diferente")
    relation = tools.knowledge.relation_between("796155-5005", "796155-5006")
    assert relation["relacao"] == "diferente"
    assert relation["fonte"] == "especialista"


def test_matching_rule_update_rebuilds_legacy_codes_and_keeps_manual_links(client, tools, monkeypatch):
    product_id = _create_product(client, "TURBO GARRETT GT35 - 796155-5005S", {CANOAS: 1})
    database = DatabaseConnection()
    bundle.relink_catalog(database, force=True)
    connection = database.get_connection()
    try:
        before_stock = connection.execute("SELECT SUM(quantidade) FROM produto_estoque").fetchone()[0]
        before_movements = connection.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0]
        connection.execute(
            "INSERT INTO produto_codigos (produto_id, numero_norm, origem) VALUES (?, '796155', 'NOME')",
            (product_id,),
        )
        connection.executemany(
            "INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status) VALUES (?, ?, ?)",
            [(product_id, 1, "CONFIRMADO"), (product_id, 2, "AUTO")],
        )
        connection.commit()
    finally:
        connection.close()

    monkeypatch.setattr(bundle, "LINK_RULES_VERSION", bundle.LINK_RULES_VERSION + 1)
    assert bundle.relink_catalog(database)["status"] == "religado"
    assert bundle.relink_catalog(database)["status"] == "atualizado"
    connection = database.get_connection()
    try:
        codes = {
            row[0] for row in connection.execute(
                "SELECT numero_norm FROM produto_codigos WHERE produto_id = ?", (product_id,)
            )
        }
        assert "796155" not in codes
        links = [tuple(row) for row in connection.execute(
            "SELECT catalogo_produto_id, status FROM produto_catalogo_vinculo WHERE produto_id = ?",
            (product_id,),
        )]
        assert links == [(1, "CONFIRMADO")]
        assert connection.execute("SELECT SUM(quantidade) FROM produto_estoque").fetchone()[0] == before_stock
        assert connection.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0] == before_movements
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        connection.close()
