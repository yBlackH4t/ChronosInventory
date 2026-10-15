"""Dados das telas novas (2.5.0): saude do estoque, saidas por natureza, ficha e miniaturas."""

import base64
import io
from datetime import date, timedelta

from PIL import Image


def _create_product(client, nome, qtd_canoas=0, qtd_pf=0):
    inventories = {}
    if qtd_canoas > 0:
        inventories[11] = qtd_canoas
    if qtd_pf > 0:
        inventories[12] = qtd_pf
    response = client.post("/produtos", json={"nome": nome, "inventories": inventories})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _move(client, **payload):
    response = client.post("/movimentacoes", json=payload)
    assert response.status_code in (200, 201), response.text
    return response


def _days_ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat() + "T10:00:00"


def test_stock_items_overview_reports_last_sale_and_recent_volume(client):
    girando = _create_product(client, "TURBINA HOLSET 4031195", qtd_canoas=5)
    parado = _create_product(client, "TURBINA GARRETT 750849-5001", qtd_canoas=3)
    sem_saldo = _create_product(client, "TURBINA ZERADA", qtd_canoas=1)

    _move(client, tipo="SAIDA", produto_id=girando, quantidade=2, origem_location_id=11, data=_days_ago(3))
    _move(client, tipo="SAIDA", produto_id=parado, quantidade=1, origem_location_id=11, data=_days_ago(200))
    # Ajuste nao conta como giro.
    _move(
        client,
        tipo="SAIDA",
        produto_id=parado,
        quantidade=1,
        origem_location_id=11,
        natureza="AJUSTE",
        motivo_ajuste="AVARIA",
        observacao="caixa amassada",
        data=_days_ago(2),
    )
    _move(client, tipo="SAIDA", produto_id=sem_saldo, quantidade=1, origem_location_id=11, data=_days_ago(1))

    resp = client.get("/analytics/stock/items?days=90")
    assert resp.status_code == 200
    by_id = {item["produto_id"]: item for item in resp.json()["data"]}

    assert sem_saldo not in by_id
    assert by_id[girando]["estoque"] == 3
    assert by_id[girando]["saidas_periodo"] == 2
    assert by_id[girando]["dias_sem_saida"] == 3
    assert by_id[parado]["estoque"] == 1
    assert by_id[parado]["saidas_periodo"] == 0
    assert by_id[parado]["dias_sem_saida"] == 200

    resp_pf = client.get("/analytics/stock/items?days=90&location_id=12")
    assert resp_pf.status_code == 200
    assert resp_pf.json()["data"] == []


def test_movements_by_nature_groups_quantities(client):
    produto = _create_product(client, "TURBINA BORGWARNER 53039880055", qtd_canoas=20)
    _move(client, tipo="SAIDA", produto_id=produto, quantidade=4, origem_location_id=11, data="2026-02-10T10:00:00")
    _move(client, tipo="SAIDA", produto_id=produto, quantidade=1, origem_location_id=11, data="2026-02-11T10:00:00")
    _move(
        client,
        tipo="SAIDA",
        produto_id=produto,
        quantidade=3,
        origem_location_id=11,
        natureza="TRANSFERENCIA_EXTERNA",
        local_externo="MATRIZ",
        data="2026-02-11T11:00:00",
    )

    resp = client.get("/analytics/movements/by-nature?date_from=2026-02-01&date_to=2026-02-28&tipo=SAIDA")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data[0] == {"natureza": "OPERACAO_NORMAL", "quantidade": 5, "movimentos": 2}
    assert data[1] == {"natureza": "TRANSFERENCIA_EXTERNA", "quantidade": 3, "movimentos": 1}

    resp_bad = client.get("/analytics/movements/by-nature?date_from=2026-02-01&date_to=2026-02-28&tipo=XYZ")
    assert resp_bad.status_code in (400, 422)


def test_product_stock_history_walks_back_from_current_balance(client):
    produto = _create_product(client, "TURBINA HOLSET 3539502", qtd_canoas=4)
    _move(client, tipo="SAIDA", produto_id=produto, quantidade=2, origem_location_id=11, data=_days_ago(20))
    _move(client, tipo="ENTRADA", produto_id=produto, quantidade=5, destino_location_id=11, data=_days_ago(10))

    resp = client.get(f"/analytics/products/{produto}/stock-history?days=60")
    assert resp.status_code == 200
    points = resp.json()["data"]
    saldos = [p["saldo"] for p in points]
    # O cadastro com saldo lanca uma entrada de 4 hoje; as outras foram antes.
    # Fica: 0 no inicio, -2 nao passa de zero, +5 = 3, hoje +4 = 7.
    assert saldos[0] == 0
    assert 3 in saldos
    assert saldos[-1] == 7
    assert points[-1]["date"] == date.today().isoformat()


def test_products_visual_summary_returns_thumb_and_weekly_sales(client):
    com_foto = _create_product(client, "TURBINA COM FOTO", qtd_canoas=6)
    sem_foto = _create_product(client, "TURBINA SEM FOTO", qtd_canoas=2)

    image = Image.new("RGB", (640, 480), (200, 80, 20))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    upload = client.post(
        f"/produtos/{com_foto}/imagens",
        files=[("files", ("foto.jpg", buffer.getvalue(), "image/jpeg"))],
    )
    assert upload.status_code in (200, 201), upload.text

    _move(client, tipo="SAIDA", produto_id=com_foto, quantidade=2, origem_location_id=11, data=_days_ago(1))
    _move(client, tipo="SAIDA", produto_id=com_foto, quantidade=1, origem_location_id=11, data=_days_ago(15))

    resp = client.get(f"/produtos/resumo-visual?ids={com_foto},{sem_foto}")
    assert resp.status_code == 200
    by_id = {item["id"]: item for item in resp.json()["data"]}

    thumb = Image.open(io.BytesIO(base64.b64decode(by_id[com_foto]["thumb_base64"])))
    assert max(thumb.size) <= 96
    assert by_id[sem_foto]["thumb_base64"] is None

    semanas = by_id[com_foto]["saidas_semanas"]
    assert len(semanas) == 13
    assert semanas[-1] == 2
    assert semanas[-3] == 1
    assert sum(by_id[sem_foto]["saidas_semanas"]) == 0

    assert client.get("/produtos/resumo-visual?ids=abc").status_code in (400, 422)
