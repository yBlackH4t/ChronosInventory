"""Ferramentas de busca do assistente de IA (docs/PLANO_IA.md, Fase 1)."""

import pytest

from app.services.assistant_tools_service import ASSISTANT_TOOLS, AssistantToolsService
from core.catalog.bundle import relink_catalog
from core.catalog.normalization import search_words
from core.database.connection import DatabaseConnection

CANOAS, PF = 11, 12

# (id, codigo, grupo, modelo, referencias, aplicacoes)
CATALOG = [
    (
        1, "805310", "TURBOCOMPRESSOR", "MP500W (GTA42S / HE500WG)",
        [("GARRETT", "779839-0025"), ("HOLSET", "3791212"), ("OEM", "1834010")],
        [("Scania", "Scania R 440", "DC13 SCR Euro 5", "A partir de 2012"),
         ("Scania", "Scania G 440", "DC13 SCR Euro 5", "A partir de 2012")],
    ),
    (
        2, "805470", "TURBOCOMPRESSOR", "MP530 (HX52 / HE500GF)",
        [("HOLSET", "4031343")],
        [("Scania", "Scania R 440 - Turbo Compound", "DT12-06/18 Euro 3", None)],
    ),
    (
        3, "805314", "TURBOCOMPRESSOR", "MP530w (HX55W HE500WG)",
        [("HOLSET", "4044318"), ("HOLSET", "4031196"), ("OEM", "20993930"), ("MAHLE", "TC0710447")],
        [("Volvo", "Volvo FH 460", "MD13 460/480/500/520 HP Euro 5", None)],
    ),
    (
        4, "802333", "TURBOCOMPRESSOR", "MP400WS (K27)",
        [("BORGWARNER", "53279887116")],
        [("Mercedes-Benz", "Ônibus OF 1318", "OM 366LA", None)],
    ),
    (
        5, "808280", "TURBOCOMPRESSOR", "MP300W (TB0392)",
        [("GARRETT", "452055-5004")],
        [("Volkswagen / MAN", "Caminhão 8.150", "MWM 4.10 TCA Euro 2", None)],
    ),
    (
        6, "805804", "TURBOCOMPRESSOR", "MP150 (K03)",
        [("BORGWARNER", "53039880005")],
        [("Volkswagen Cars", "Passat 1.8T", "1.8L 150/160 HP", None)],
    ),
]


def _seed_catalog() -> None:
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute("INSERT INTO catalogo_fontes (id, codigo, nome) VALUES (1, 'MASTER_POWER', 'Master Power')")
        for cp_id, codigo, grupo, modelo, refs, apps in CATALOG:
            conn.execute(
                """
                INSERT INTO catalogo_produtos (id, fonte_id, codigo, codigo_norm, descricao, grupo, modelo)
                VALUES (?, 1, ?, ?, 'Turbocompressor', ?, ?)
                """,
                (cp_id, codigo, codigo, grupo, modelo),
            )
            conn.executemany(
                """
                INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm)
                VALUES (?, ?, ?, ?)
                """,
                [(cp_id, fab, num, num.replace("-", "")) for fab, num in refs],
            )
            conn.executemany(
                """
                INSERT INTO catalogo_aplicacoes (catalogo_produto_id, montadora, veiculo, motor, complemento)
                VALUES (?, ?, ?, ?, ?)
                """,
                [(cp_id, *app) for app in apps],
            )
        conn.commit()
    finally:
        conn.close()


def _create_product(client, nome: str, inventories: dict) -> int:
    response = client.post("/produtos", json={"nome": nome, "inventories": {str(k): v for k, v in inventories.items()}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


@pytest.fixture()
def tools(client):
    _seed_catalog()
    ids = {
        "hx55w": _create_product(client, "TURBINA HOLSET HX55W 4031196", {CANOAS: 2}),
        "hx55w_eq": _create_product(client, "TURBO HOLSET HX55W 4044318", {CANOAS: 1}),
        "gta42": _create_product(client, "TURBO GTA42S - 779839-0025", {PF: 1}),
        "hx52": _create_product(client, "TURBO HX52W - 4031343", {}),
        "k27": _create_product(client, "TURBO K27 - 53279887116", {PF: 3}),
        "inativo": _create_product(client, "TURBO ANTIGO HX55W 4031196", {PF: 5}),
    }
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute("UPDATE produtos SET ativo = 0 WHERE id = ?", (ids["inativo"],))
        conn.commit()
    finally:
        conn.close()
    relink_catalog(DatabaseConnection(), force=True)
    service = AssistantToolsService()
    service.ids = ids
    return service


def test_search_words_normalizes_free_text():
    assert search_words("Scania R440") == ["SCANIA", "R", "440"]
    assert search_words("Ônibus K 440") == ["ONIBUS", "K", "440"]
    assert search_words("OM 366LA") == ["OM", "366", "LA"]
    assert search_words("Caminhão 8.150e") == ["CAMINHAO", "8150", "E"]
    assert search_words("DC13 Euro 3,4,5") == ["DC", "13", "EURO", "3", "4", "5"]
    assert search_words(None) == []


def test_code_search_returns_stock_by_location_and_match_type(tools):
    result = tools.search_by_code("4031196")

    assert result["temos_em_estoque"] is True
    names = [p["nome"] for p in result["produtos"]]
    assert names == ["TURBINA HOLSET HX55W 4031196", "TURBO HOLSET HX55W 4044318"]
    exact, equivalent = result["produtos"]
    assert exact["correspondencia"] == "exato"
    assert exact["estoque_por_local"] == {"Canoas": 2}
    assert equivalent["correspondencia"] == "equivalente_catalogo"

    (ficha,) = result["fichas_catalogo"]
    assert ficha["ficha"] == "805314"
    assert ficha["modelo"] == "HX55W HE500WG"
    # O codigo pesquisado vem primeiro; OEM e outras marcas ficam fora da resposta.
    assert ficha["referencias"] == {"HOLSET": ["4031196", "4044318"]}
    assert ficha["aplicacoes"][0]["veiculo"] == "Volvo FH 460"


def test_code_search_accepts_oem_and_family_variants(tools):
    by_oem = tools.search_by_code("20993930")
    assert {p["nome"] for p in by_oem["produtos"]} == {
        "TURBINA HOLSET HX55W 4031196",
        "TURBO HOLSET HX55W 4044318",
    }

    reman = tools.search_by_code("53279907116")
    (k27,) = reman["produtos"]
    assert k27["correspondencia"] == "familia"
    assert k27["estoque_por_local"] == {"Passo Fundo": 3}


def test_code_search_separates_code_from_text(tools):
    # O modelo as vezes manda o codigo junto com o modelo da turbina.
    result = tools.search_by_code("HX55W 4031196")
    assert result["codigo_pesquisado"] == "4031196"
    assert result["texto_pronto"].startswith("*4031196*: temos.")

    two = tools.search_by_code("4031196 / 53279887116")
    assert two["codigo_pesquisado"] == "4031196"
    assert two["outros_codigos_no_texto"] == ["53279887116"]


def test_code_search_without_stock(tools):
    result = tools.search_by_code("4031343")
    assert result["temos_em_estoque"] is False
    assert result["produtos"][0]["estoque_total"] == 0


def test_application_search_splits_same_vehicle_by_engine(tools):
    result = tools.search_by_application("temos turbina do scania 440?")

    assert result["termos_usados"] == ["SCANIA", "440"]
    assert result["total_fichas"] == 2
    in_stock, without_stock = result["fichas_catalogo"]
    assert in_stock["ficha"] == "805310"
    assert in_stock["nossos_produtos"][0]["nome"] == "TURBO GTA42S - 779839-0025"
    assert in_stock["aplicacoes"][0]["motor"] == "DC13 SCR Euro 5"
    assert in_stock["aplicacoes"][0]["obs"] == "A partir de 2012"
    assert without_stock["ficha"] == "805470"
    assert without_stock["nossos_produtos"][0]["estoque_total"] == 0
    assert without_stock["aplicacoes"][0]["motor"] == "DT12-06/18 Euro 3"

    # Mais de uma turbina possivel: o proprio resultado avisa o modelo e traz a resposta pronta.
    assert "mudam conforme o motor" in result["atencao"]
    assert list(result).index("atencao") < list(result).index("fichas_catalogo")
    assert result["texto_pronto"].startswith("Depende do motor:")
    assert result["texto_pronto"].endswith("Qual é o motor do cliente?")

    narrowed = tools.search_by_application("scania r440 dc13")
    assert [f["ficha"] for f in narrowed["fichas_catalogo"]] == ["805310"]
    assert "atencao" not in narrowed


def test_application_search_synonyms_and_model_numbers(tools):
    assert [f["ficha"] for f in tools.search_by_application("mb om 366")["fichas_catalogo"]] == ["802333"]
    # "8.150" e o modelo do caminhao, nao "8" + "150" (Passat 1.8 150 HP fica de fora).
    assert [f["ficha"] for f in tools.search_by_application("vw 8.150")["fichas_catalogo"]] == ["808280"]


def test_application_search_treats_years_as_optional(tools):
    # Ano que nenhuma aplicacao cita: ignorado (e avisado), a busca segue sem ele.
    result = tools.search_by_application("scania 440 dc13 2015")
    assert [f["ficha"] for f in result["fichas_catalogo"]] == ["805310"]
    assert result["termos_ignorados"] == ["2015"]
    assert "2015" not in result["termos_usados"]

    # Ano que aparece em alguma aplicacao ("A partir de 2012"): filtra.
    with_year = tools.search_by_application("scania 440 2012")
    assert [f["ficha"] for f in with_year["fichas_catalogo"]] == ["805310"]
    assert "termos_ignorados" not in with_year


def test_application_search_ignores_unknown_words_but_not_numbers(tools):
    # Palavras que o catalogo nao tem ("tio", "freguesia") sao ignoradas e avisadas.
    result = tools.search_by_application("turbina do scania 440 do tio da freguesia")
    assert result["total_fichas"] == 2
    assert result["termos_ignorados"] == ["TIO", "FREGUESIA"]

    # Numero desconhecido continua obrigatorio: "scania 999" nao vira "qualquer Scania".
    assert tools.search_by_application("scania 999")["total_fichas"] == 0


def test_application_search_with_no_match_gives_hint(tools):
    result = tools.search_by_application("scania 999")
    assert result["total_fichas"] == 0
    assert "dica" in result


def test_inactive_and_rejected_products_are_hidden(tools):
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute(
            "UPDATE produto_catalogo_vinculo SET status = 'REJEITADO' WHERE produto_id = ?",
            (tools.ids["hx55w_eq"],),
        )
        conn.commit()
    finally:
        conn.close()

    names = [p["nome"] for p in tools.search_by_code("4031196")["produtos"]]
    assert names == ["TURBINA HOLSET HX55W 4031196"]

    ficha = tools.search_by_application("volvo fh 460")["fichas_catalogo"][0]
    assert [p["nome"] for p in ficha["nossos_produtos"]] == ["TURBINA HOLSET HX55W 4031196"]


def test_product_details(tools):
    detail = tools.product_details(tools.ids["hx55w"])
    assert detail["estoque_por_local"] == {"Canoas": 2}
    assert detail["ativo"] is True
    (ficha,) = detail["fichas_catalogo"]
    assert ficha["referencias"]["HOLSET"][0] == "4031196"


def test_run_tool_reports_errors_instead_of_raising(tools):
    assert "erro" in tools.run_tool("buscar_por_codigo", {"codigo": "12"})
    assert "erro" in tools.run_tool("buscar_por_codigo", {})
    assert "erro" in tools.run_tool("buscar_por_aplicacao", {"texto": "turbina do caminhao"})
    assert "erro" in tools.run_tool("detalhe_produto", {"produto_id": 999999})
    assert "erro" in tools.run_tool("apagar_estoque", {})
    assert tools.run_tool("buscar_por_codigo", {"codigo": "4031196"})["temos_em_estoque"] is True


def test_tool_definitions_match_handlers():
    names = {tool["name"] for tool in ASSISTANT_TOOLS}
    assert names == {"buscar_por_codigo", "buscar_por_aplicacao", "detalhe_produto"}
    for tool in ASSISTANT_TOOLS:
        assert tool["input_schema"]["required"]
