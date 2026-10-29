"""
Celular: a foto da caixa traz varios codigos de barras e o Chronos fica so com o da peca
(Garrett, BorgWarner e Holset, como nas etiquetas reais); modo Inventario conta direto na sessao.
"""

from fastapi.testclient import TestClient

from app.services.label_reader_service import is_junk, part_number_score


def _create_product(client, nome, stock=2):
    response = client.post("/produtos", json={"nome": nome, "inventories": {"11": stock}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _ler(client, codigos):
    response = client.post("/api/scanner/ler", json={"codigos": codigos})
    assert response.status_code == 200, response.text
    return response.json()


def test_etiqueta_garrett_fica_com_o_item_e_ignora_serie_e_modelo(client):
    turbo = _create_product(client, "TURBO GARRET GT4594BNS - 876272-5017S", stock=3)
    _create_product(client, "CONJUNTO CENTRAL GT4594BNS - BC.0670")

    # O que o celular leu na foto da caixa (o codigo de barras do ITEM vem sem hifen).
    data = _ler(client, ["8762725017S", "GT4594BNS", "DE50473"])
    assert data["situacao"] == "produto"
    assert data["produtos"][0]["id"] == turbo
    assert data["produtos"][0]["codigo_lido"] == "8762725017S"
    assert data["produtos"][0]["total"] == 3


def test_etiqueta_borgwarner_fica_com_o_codigo_da_peca(client):
    viscosa = _create_product(client, "EMBREAGEM VISCOSA S610/CW - 15.17559-2.A")
    data = _ler(client, ["EM7559", "7898243744750", "15.17559-2.A", "2412M126650148"])
    assert data["situacao"] == "produto"
    assert data["produtos"][0]["id"] == viscosa


def test_etiqueta_holset_ignora_quantidade_e_pais(client):
    turbo = _create_product(client, "TURBO HE500WG - 5457622")
    data = _ler(client, ["1", "5457622", "BR"])
    assert data["situacao"] == "produto"
    assert data["produtos"][0]["id"] == turbo
    assert set(data["ignorados"]) == {"1", "BR"}


def test_lixo_sozinho_nunca_vira_leitura(client):
    _create_product(client, "PRODUTO 1 BR")
    data = _ler(client, ["1", "BR", "https://holset.com/x"])
    assert data["situacao"] == "nenhum"
    assert data["produtos"] == []
    assert data["sugestao"] is None


def test_peca_nao_cadastrada_sugere_o_codigo_com_cara_de_peca(client):
    data = _ler(client, ["DE50473", "GT4594BNS", "8762725099S"])
    assert data["situacao"] == "nenhum"
    assert data["sugestao"] == "8762725099S"

    borg = _ler(client, ["EM7559", "7898243744750", "15.17599-2.A"])
    assert borg["sugestao"] == "15.17599-2.A"


def test_mais_de_uma_peca_com_o_mesmo_codigo_pede_para_escolher(client):
    nova = _create_product(client, "TURBO HX55 - 4031195")
    montada = _create_product(client, "TURBO HX55 - 4031195 (MONTADA)")
    data = _ler(client, ["4031195"])
    assert data["situacao"] == "escolher"
    assert {p["id"] for p in data["produtos"]} == {nova, montada}


def test_so_o_modelo_ainda_acha_a_peca(client):
    turbo = _create_product(client, "TURBO GARRET GT4594BNS - 876272-5017S")
    data = _ler(client, ["GT4594BNS", "DE50473"])
    assert data["situacao"] == "produto"
    assert data["produtos"][0]["id"] == turbo


def test_etiqueta_do_chronos_ganha_de_tudo(client):
    a = _create_product(client, "TURBO HX55 - 4031195")
    _create_product(client, "TURBO HX40 - 4040353")
    data = _ler(client, ["4040353", f"CI-{a}"])
    assert data["situacao"] == "produto"
    assert data["produtos"][0]["id"] == a


def test_chave_da_nfe_na_foto(client):
    from core.nfe_xml import chave_dv_ok

    base = "4325100389715800028555001000014564100000000"
    chave = next(base + str(dv) for dv in range(10) if chave_dv_ok(base + str(dv)))
    data = _ler(client, ["BR", chave])
    assert data["situacao"] == "nf"
    assert data["chave"] == chave


def test_regras_de_lixo_e_de_cara_de_peca():
    for junk in ["1", "BR", "00001", "QTY", "https://x.y"]:
        assert is_junk(junk), junk
    assert part_number_score("876272-5017S") > part_number_score("GT4594BNS")
    assert part_number_score("5457622") > 0
    assert part_number_score("7898243744750") == 0  # EAN da caixa
    assert part_number_score("04320115100100") == 0  # CNPJ


def test_modo_inventario_conta_direto_na_sessao(client):
    product_id = _create_product(client, "TURBO HE500WG - 5457622", stock=5)
    session = client.post(
        "/inventario/sessoes", json={"nome": "Antes das ferias", "location_id": 11, "observacao": None}
    ).json()["data"]

    abertas = client.get("/api/scanner/inventario/sessoes").json()
    assert any(s["id"] == session["id"] for s in abertas)

    url = f"/api/scanner/inventario/{session['id']}/contar"
    first = client.post(url, json={"produto_id": product_id, "delta": 1}).json()
    assert first["qtd_fisico"] == 1  # item nao contado comeca do zero
    assert first["qtd_sistema"] == 5
    assert first["contados"] == 1

    client.post(url, json={"produto_id": product_id, "delta": 1})
    minus = client.post(url, json={"produto_id": product_id, "delta": -1}).json()
    assert minus["qtd_fisico"] == 1

    typed = client.post(url, json={"produto_id": product_id, "quantidade": 5}).json()
    assert typed["qtd_fisico"] == 5
    assert typed["divergencia"] == 0

    never_negative = client.post(url, json={"produto_id": product_id, "quantidade": 0}).json()
    assert client.post(url, json={"produto_id": product_id, "delta": -1}).json()["qtd_fisico"] == 0
    assert never_negative["qtd_fisico"] == 0

    assert client.post(url, json={"produto_id": product_id}).status_code == 422
    assert client.post(url, json={"produto_id": 999999, "delta": 1}).status_code == 400


def test_modo_inventario_pede_pareamento(client):
    remote = TestClient(client.app, client=("192.168.0.50", 50000))
    assert remote.get("/api/scanner/inventario/sessoes").status_code == 403
    assert remote.post("/api/scanner/ler", json={"codigos": ["5457622"]}).status_code == 403
    assert remote.post("/api/scanner/inventario/1/contar", json={"produto_id": 1, "delta": 1}).status_code == 403
