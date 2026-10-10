"""Base de conhecimento do especialista (docs/PLANO_IA.md): regras, busca e sugestoes."""

import pytest

from app.services.assistant_knowledge_service import AssistantKnowledgeService
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)


@pytest.fixture()
def knowledge(tools):  # noqa: F811
    return tools.knowledge


def _codes(items):
    return sorted(i["codigo"] for i in items)


def test_same_is_transitive_and_covers_new_and_reman(knowledge):
    knowledge.add_rule("5327-988-7101", "5327-988-7210", "igual", "mesma turbina, muda a etiqueta")
    knowledge.add_rule("5327-988-7210", "5327-988-7300", "igual")

    relations = knowledge.relations("53279887101")
    assert _codes(relations["iguais"]) == ["5327-988-7210", "5327-988-7300"]
    assert relations["similares"] == []

    # A versao reman (990) do codigo ensinado tambem herda a regra (e e a mesma peca da 7101).
    reman = knowledge.relations("53279907101")
    assert _codes(reman["iguais"]) == ["5327-988-7210", "5327-988-7300"]
    # E a regra vale nos dois sentidos.
    assert _codes(knowledge.relations("53279887300")["iguais"]) == ["5327-988-7101", "5327-988-7210"]


def test_similar_carries_the_note_and_different_blocks(knowledge):
    knowledge.add_rule("53279887101", "53279887116", "similar", "muda o atuador")
    knowledge.add_rule("4031196", "4044318", "diferente")

    similar = knowledge.relations("53279887101")["similares"]
    assert similar == [{"codigo_norm": "53279887116", "codigo": "53279887116", "obs": "muda o atuador"}]
    assert "4044318" in knowledge.relations("4031196")["diferentes"]


def test_add_rule_validates_and_updates_existing_pair(knowledge):
    with pytest.raises(ValidationException, match="mesma peça"):
        knowledge.add_rule("53279887101", "5327-990-7101", "igual")  # reman da mesma
    with pytest.raises(ValidationException, match="Tipo inválido"):
        knowledge.add_rule("4031196", "4044318", "parecido")
    with pytest.raises(ValidationException, match="Código inválido"):
        knowledge.add_rule("HX55", "4044318", "igual")
    # Dois codigos num campo viravam um codigo so, que ninguem pergunta: uma regra por codigo.
    with pytest.raises(ValidationException, match="Um código por regra"):
        knowledge.add_rule("9BYC31Y2F7C000805", "465819-5003 OU 53169887185", "igual")

    first = knowledge.add_rule("4044318", "4031196", "similar", "x")
    second = knowledge.add_rule("4031196", "4044318", "igual")  # mesmo par, ordem trocada
    assert first["id"] == second["id"]
    assert second["tipo"] == "igual"
    assert len(knowledge.list_rules()) == 1
    assert knowledge.list_rules(busca="4044")[0]["id"] == first["id"]
    assert knowledge.remove_rule(first["id"]) is True
    assert knowledge.list_rules() == []


def test_code_search_uses_what_the_expert_taught(tools, knowledge):  # noqa: F811
    # Sem regra: a 7101 nao existe no estoque nem no catalogo de teste.
    before = tools.search_by_code("5327-988-7101")
    assert before["produtos"] == []

    knowledge.add_rule("5327-988-7101", "5327-988-7116", "similar", "muda o atuador")
    after = tools.search_by_code("5327-988-7101")
    (k27,) = after["produtos"]
    assert k27["nome"] == "TURBO K27 - 53279887116"
    assert k27["correspondencia"] == "similar_especialista"
    assert k27["obs_especialista"] == "muda o atuador"
    assert after["temos_em_estoque"] is True
    assert after["conhecimento_especialista"] == [
        {"codigo": "5327-988-7116", "relacao": "similar", "obs": "muda o atuador"}
    ]
    assert after["texto_pronto"].splitlines() == [
        "*53279887101*: não temos esse código, mas temos:",
        "• *TURBO K27 - 53279887116* — 3 em Passo Fundo (similar: muda o atuador)",
    ]


def test_code_search_completes_the_end_of_a_code(tools, knowledge):  # noqa: F811
    # Final de um codigo que esta no nome do produto: a busca ja acha pelo nome.
    assert tools.search_by_code("988-7116")["texto_pronto"].startswith("*9887116*: temos.")

    # "tem a 988-7101?": o chefe fala so o final; o codigo completo so existe no que o especialista ensinou.
    knowledge.add_rule("5327-988-7101", "5327-988-7116", "similar", "muda o atuador")
    result = tools.search_by_code("988-7101")
    assert result["codigo_pesquisado"] == "53279887101"
    assert result["codigo_digitado"] == "988-7101"
    assert result["texto_pronto"].splitlines() == [
        "(Entendi *9887101* como *53279887101*.)",
        "*53279887101*: não temos esse código, mas temos:",
        "• *TURBO K27 - 53279887116* — 3 em Passo Fundo (similar: muda o atuador)",
    ]

    # Final que bate com mais de um codigo completo: pergunta qual.
    knowledge.add_rule("1111112468", "2222112468", "igual")
    ambiguous = tools.search_by_code("112468")
    assert ambiguous["codigos_possiveis"] == ["1111112468", "2222112468"]
    assert ambiguous["texto_pronto"] == (
        "*112468*: achei mais de um código que termina assim: 1111112468, 2222112468. Qual deles?"
    )
    # Curto demais (menos de 6 digitos): nao tenta completar.
    assert "codigos_possiveis" not in tools.search_by_code("12468")


def test_completion_prefers_the_code_the_company_knows(tools, knowledge):  # noqa: F811
    # Dois codigos completos terminam igual: um so existe no catalogo, o outro o especialista ensinou.
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute(
            "INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm) "
            "VALUES (1, 'GARRETT', '1239876543', '1239876543')"
        )
        conn.commit()
    finally:
        conn.close()
    knowledge.add_rule("4569876543", "4031196", "similar", "serve com adaptador")

    result = tools.search_by_code("9876543")
    assert result["codigo_pesquisado"] == "4569876543"
    assert result["outros_codigos_possiveis"] == ["1239876543"]
    first, second, third = result["texto_pronto"].splitlines()[:3]
    assert first == "(Entendi *9876543* como *4569876543*; também existem: 1239876543 (GTA42S).)"
    assert second == "*4569876543*: não temos esse código, mas temos:"
    assert third == "• *TURBINA HOLSET HX55W 4031196* — 2 em Canoas (similar: serve com adaptador)"


def test_expert_can_hide_a_catalog_equivalent(tools, knowledge):  # noqa: F811
    names = [p["nome"] for p in tools.search_by_code("4031196")["produtos"]]
    assert "TURBO HOLSET HX55W 4044318" in names  # equivalente pelo catalogo

    knowledge.add_rule("4031196", "4044318", "diferente")
    names = [p["nome"] for p in tools.search_by_code("4031196")["produtos"]]
    assert names == ["TURBINA HOLSET HX55W 4031196"]


def test_taught_code_without_product_is_still_mentioned(tools, knowledge):  # noqa: F811
    knowledge.add_rule("999999999", "888888888", "similar", "so serve com flange nova")
    text = tools.search_by_code("999999999")["texto_pronto"]
    assert text.splitlines() == [
        "*999999999*: não temos esse código no estoque.",
        "• Similar segundo o especialista: 888888888 (so serve com flange nova) — não temos",
    ]


def test_suggestions_for_the_admin(tools, knowledge):  # noqa: F811
    (suggestion,) = knowledge.suggestions("5327-988-7101")
    assert suggestion["nome"] == "TURBO K27 - 53279887116"
    assert suggestion["estoque_total"] == 3
    assert suggestion["motivo"] == "mesmo início de código (5327988)"

    # Recusada (diferente) ou ja ensinada: nao aparece mais.
    knowledge.add_rule("53279887101", "53279887116", "diferente")
    assert knowledge.suggestions("5327-988-7101") == []

    # So para codigos numericos longos (BorgWarner).
    assert knowledge.suggestions("4031196") == []
    assert isinstance(AssistantKnowledgeService.suggestions, object)
