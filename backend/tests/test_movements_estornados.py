"""Lista de movimentacoes: o par lancamento errado + estorno sai da visao normal, nunca do banco."""

CANOAS = 11


def _product(client, nome, qtd):
    response = client.post("/produtos", json={"nome": nome, "inventories": {str(CANOAS): qtd}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _move(client, **body):
    response = client.post("/movimentacoes", json=body)
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _ids(client, **params):
    body = client.get("/movimentacoes", params={"page_size": 100, **params}).json()
    return {m["id"] for m in body["data"]}, body["meta"]["total_items"]


def test_reversed_pair_is_hidden_only_when_asked(client):
    certo = _product(client, "TURBO CERTO - 4031195", 0)
    errado = _product(client, "TURBO ERRADO - 5351848", 0)

    entrada_errada = _move(client, tipo="ENTRADA", produto_id=errado, quantidade=2, destino_location_id=CANOAS)
    estorno = _move(
        client, tipo="SAIDA", produto_id=errado, quantidade=2, origem_location_id=CANOAS,
        natureza="ESTORNO", movimento_ref_id=entrada_errada,
    )
    entrada_certa = _move(client, tipo="ENTRADA", produto_id=certo, quantidade=2, destino_location_id=CANOAS)

    todos, total = _ids(client)
    assert {entrada_errada, estorno, entrada_certa} <= todos

    limpos, total_limpo = _ids(client, ocultar_estornados="true")
    assert entrada_certa in limpos
    assert entrada_errada not in limpos and estorno not in limpos
    assert total_limpo == total - 2

    # Quem filtra pela natureza Estorno continua vendo o estorno.
    so_estornos, _ = _ids(client, natureza="ESTORNO", ocultar_estornados="true")
    assert estorno in so_estornos

    # O saldo e o historico do produto nao mudam.
    assert client.get(f"/produtos/{errado}").json()["data"]["inventories"][str(CANOAS)] == 0
    historico = client.get(f"/produtos/{errado}/historico").json()["data"]
    assert {m["id"] for m in historico} == {entrada_errada, estorno}
