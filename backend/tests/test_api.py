from datetime import datetime
import io
import json
import os
import zipfile

import pandas as pd


def _create_product(client, nome="Produto Teste", qtd_canoas=1, qtd_pf=0):
    payload = {"nome": nome, "qtd_canoas": qtd_canoas, "qtd_pf": qtd_pf}
    response = client.post("/produtos", json=payload)
    assert response.status_code == 201
    return response.json()["data"]["id"]


def test_health_success(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "meta" in body
    assert body["data"]["status"] == "ok"
    assert response.headers.get("X-Request-ID")


def test_list_products_success(client):
    response = client.get("/produtos")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "meta" in body
    assert isinstance(body["data"], list)
    assert set(body["meta"].keys()) == {
        "page",
        "page_size",
        "total_items",
        "total_pages",
        "has_next",
    }


def test_create_and_get_product(client):
    payload = {"nome": "Produto Teste", "qtd_canoas": 1, "qtd_pf": 0}
    create = client.post("/produtos", json=payload)
    assert create.status_code == 201
    created = create.json()["data"]
    assert created["id"]

    fetched = client.get(f"/produtos/{created['id']}")
    assert fetched.status_code == 200
    fetched_body = fetched.json()["data"]
    assert fetched_body["nome"] == "PRODUTO TESTE"


def test_patch_product_observacao(client):
    product_id = _create_product(client, "Produto Obs", qtd_canoas=1, qtd_pf=0)
    resp = client.patch(f"/produtos/{product_id}", json={"observacao": "Observacao livre"})
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["observacao"] == "Observacao livre"


def test_create_invalid_payload(client):
    response = client.post("/produtos", json={"nome": ""})
    assert response.status_code == 422
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "validation_error"


def test_movement_entry_increases_stock(client):
    product_id = _create_product(client, "Produto Entrada", qtd_canoas=1, qtd_pf=0)

    movement = {
        "tipo": "ENTRADA",
        "produto_id": product_id,
        "quantidade": 3,
        "destino": "CANOAS",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 201
    assert resp.json()["data"]["produto_nome"] == "PRODUTO ENTRADA"

    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["qtd_canoas"] == 4


def test_movement_saida_insufficient_stock(client):
    product_id = _create_product(client, "Produto Saida", qtd_canoas=1, qtd_pf=0)

    movement = {
        "tipo": "SAIDA",
        "produto_id": product_id,
        "quantidade": 2,
        "origem": "CANOAS",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "insufficient_stock"


def test_movement_transfer_updates_both(client):
    product_id = _create_product(client, "Produto Transfer", qtd_canoas=5, qtd_pf=0)

    movement = {
        "tipo": "TRANSFERENCIA",
        "produto_id": product_id,
        "quantidade": 2,
        "origem": "CANOAS",
        "destino": "PF",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 201

    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["qtd_canoas"] == 3
    assert product["qtd_pf"] == 2


def test_movement_saida_transferencia_externa_registers_metadata(client):
    product_id = _create_product(client, "Produto Externo", qtd_canoas=5, qtd_pf=0)

    movement = {
        "tipo": "SAIDA",
        "produto_id": product_id,
        "quantidade": 2,
        "origem": "CANOAS",
        "natureza": "TRANSFERENCIA_EXTERNA",
        "local_externo": "MATRIZ",
        "documento": "NF 123",
        "observacao": "Envio excepcional",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["natureza"] == "TRANSFERENCIA_EXTERNA"
    assert data["local_externo"] == "MATRIZ"
    assert data["documento"] == "NF 123"

    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["qtd_canoas"] == 3


def test_movement_devolucao_reentrada_with_reference(client):
    product_id = _create_product(client, "Produto Devolucao", qtd_canoas=1, qtd_pf=0)

    saida = client.post(
        "/movimentacoes",
        json={
            "tipo": "SAIDA",
            "produto_id": product_id,
            "quantidade": 1,
            "origem": "CANOAS",
            "documento": "NF DEV-1",
        },
    )
    assert saida.status_code == 201
    saida_id = saida.json()["data"]["id"]

    devolucao = client.post(
        "/movimentacoes",
        json={
            "tipo": "ENTRADA",
            "produto_id": product_id,
            "quantidade": 1,
            "destino": "CANOAS",
            "natureza": "DEVOLUCAO",
            "movimento_ref_id": saida_id,
            "documento": "NF DEV-1",
            "observacao": "Peca retornou",
        },
    )
    assert devolucao.status_code == 201
    devolucao_data = devolucao.json()["data"]
    assert devolucao_data["natureza"] == "DEVOLUCAO"
    assert devolucao_data["movimento_ref_id"] == saida_id

    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["qtd_canoas"] == 1

    history = client.get(f"/produtos/{product_id}/historico").json()["data"]
    assert any(item["natureza"] == "DEVOLUCAO" for item in history)


def test_movement_invalid_devolucao_for_saida(client):
    product_id = _create_product(client, "Produto Regra", qtd_canoas=1, qtd_pf=0)
    movement = {
        "tipo": "SAIDA",
        "produto_id": product_id,
        "quantidade": 1,
        "origem": "CANOAS",
        "natureza": "DEVOLUCAO",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


def test_movement_devolucao_requires_reference(client):
    product_id = _create_product(client, "Produto Sem Ref", qtd_canoas=1, qtd_pf=0)
    movement = {
        "tipo": "ENTRADA",
        "produto_id": product_id,
        "quantidade": 1,
        "destino": "CANOAS",
        "natureza": "DEVOLUCAO",
    }
    resp = client.post("/movimentacoes", json=movement)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


def test_analytics_saida_net_of_linked_devolucao(client):
    product_id = _create_product(client, "Produto Net", qtd_canoas=2, qtd_pf=0)
    date_saida = "2026-02-10T10:00:00"
    date_devolucao = "2026-02-10T12:00:00"

    saida = client.post(
        "/movimentacoes",
        json={
            "tipo": "SAIDA",
            "produto_id": product_id,
            "quantidade": 1,
            "origem": "CANOAS",
            "data": date_saida,
        },
    )
    assert saida.status_code == 201
    saida_id = saida.json()["data"]["id"]

    devolucao = client.post(
        "/movimentacoes",
        json={
            "tipo": "ENTRADA",
            "produto_id": product_id,
            "quantidade": 1,
            "destino": "CANOAS",
            "natureza": "DEVOLUCAO",
            "movimento_ref_id": saida_id,
            "data": date_devolucao,
        },
    )
    assert devolucao.status_code == 201

    top = client.get("/analytics/movements/top-saidas?date_from=2026-02-10&date_to=2026-02-10&scope=AMBOS")
    assert top.status_code == 200
    top_data = top.json()["data"]
    assert all(item["produto_id"] != product_id for item in top_data)

    ts = client.get("/analytics/movements/timeseries?date_from=2026-02-10&date_to=2026-02-10&scope=AMBOS&bucket=day")
    assert ts.status_code == 200
    ts_data = ts.json()["data"]
    assert sum(item["total_saida"] for item in ts_data) == 0

    flow = client.get("/analytics/movements/flow?date_from=2026-02-10&date_to=2026-02-10&scope=AMBOS&bucket=day")
    assert flow.status_code == 200
    flow_data = flow.json()["data"]
    assert len(flow_data) >= 1
    assert sum(item["saidas"] for item in flow_data) == 0


def test_list_movements_pagination(client):
    product_id = _create_product(client, "Produto List", qtd_canoas=1, qtd_pf=0)
    movement = {
        "tipo": "ENTRADA",
        "produto_id": product_id,
        "quantidade": 1,
        "destino": "PF",
    }
    client.post("/movimentacoes", json=movement)

    resp = client.get("/movimentacoes?page=1&page_size=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"][0]["produto_nome"] == "PRODUTO LIST"
    assert "meta" in body
    assert set(body["meta"].keys()) == {
        "page",
        "page_size",
        "total_items",
        "total_pages",
        "has_next",
    }


def test_backup_create(client):
    resp = client.post("/backup/criar")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["path"]
    assert body["size"] >= 0


def test_backup_list_and_validate(client):
    created = client.post("/backup/criar")
    assert created.status_code == 200
    created_path = created.json()["data"]["path"]
    created_name = os.path.basename(created_path)

    listed = client.get("/backup/listar")
    assert listed.status_code == 200
    items = listed.json()["data"]
    assert any(item["name"] == created_name for item in items)

    current_validation = client.get("/backup/validar")
    assert current_validation.status_code == 200
    assert bool(current_validation.json()["data"]["ok"]) is True

    selected_validation = client.get(f"/backup/validar?backup_name={created_name}")
    assert selected_validation.status_code == 200
    assert bool(selected_validation.json()["data"]["ok"]) is True


def test_backup_restore_roundtrip(client):
    product_id = _create_product(client, "Produto Restore", qtd_canoas=1, qtd_pf=0)

    snap = client.post("/backup/criar")
    assert snap.status_code == 200
    backup_name = os.path.basename(snap.json()["data"]["path"])

    movement = client.post(
        "/movimentacoes",
        json={
            "tipo": "SAIDA",
            "produto_id": product_id,
            "quantidade": 1,
            "origem": "CANOAS",
        },
    )
    assert movement.status_code == 201

    changed = client.get(f"/produtos/{product_id}")
    assert changed.status_code == 200
    assert changed.json()["data"]["qtd_canoas"] == 0

    restored = client.post("/backup/restaurar", json={"backup_name": backup_name})
    assert restored.status_code == 200

    after = client.get(f"/produtos/{product_id}")
    assert after.status_code == 200
    assert after.json()["data"]["qtd_canoas"] == 1


def test_backup_diagnostics_download(client):
    resp = client.get("/backup/diagnostico")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("application/zip")
    assert resp.content

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        names = set(zf.namelist())
        assert "summary.json" in names
        assert "logs/backend.log.tail.txt" in names
        assert "logs/tauri.log.tail.txt" in names
        summary = json.loads(zf.read("summary.json").decode("utf-8"))
        assert "database" in summary
        assert "backups" in summary


def test_export_products(client):
    _create_product(client, "Produto Export", qtd_canoas=1, qtd_pf=0)
    resp = client.post("/export/produtos")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert resp.content


def test_import_excel(client, tmp_path):
    df = pd.DataFrame([
        {"ID": 1, "Produto": "Item A", "Canoas": 1, "PF": 2},
    ])
    file_path = tmp_path / "import.xlsx"
    df.to_excel(file_path, index=False)

    with open(file_path, "rb") as f:
        files = {"file": ("import.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        resp = client.post("/import/excel", files=files)

    assert resp.status_code == 200
    body = resp.json()["data"]
    assert "imported" in body


def test_dashboard_summary(client):
    _create_product(client, "Produto A", qtd_canoas=2, qtd_pf=3)
    product_b = _create_product(client, "Produto B", qtd_canoas=1, qtd_pf=0)
    movement = {
        "tipo": "SAIDA",
        "produto_id": product_b,
        "quantidade": 1,
        "origem": "CANOAS",
    }
    client.post("/movimentacoes", json=movement)

    resp = client.get("/dashboard/resumo")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total_canoas"] == 2
    assert data["total_pf"] == 3
    assert data["total_geral"] == 5
    assert data["itens_distintos"] >= 2
    assert data["zerados"] >= 1


def test_upload_product_image(client):
    from PIL import Image

    product_id = _create_product(client, "Produto Imagem", qtd_canoas=1, qtd_pf=0)

    buffer = io.BytesIO()
    image = Image.new("RGB", (10, 10), color=(255, 0, 0))
    image.save(buffer, format="PNG")
    buffer.seek(0)

    files = {"file": ("produto.png", buffer, "image/png")}
    resp = client.post(f"/produtos/{product_id}/imagem", files=files)
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["size_bytes"] > 0


def test_analytics_top_saidas_filters_and_order(client):
    product_a = _create_product(client, "Produto A", qtd_canoas=10, qtd_pf=0)
    product_b = _create_product(client, "Produto B", qtd_canoas=5, qtd_pf=0)
    product_c = _create_product(client, "Produto C", qtd_canoas=2, qtd_pf=0)

    base_date = "2026-02-10T10:00:00"

    client.post("/movimentacoes", json={
        "tipo": "SAIDA",
        "produto_id": product_a,
        "quantidade": 5,
        "origem": "CANOAS",
        "data": base_date,
    })
    client.post("/movimentacoes", json={
        "tipo": "SAIDA",
        "produto_id": product_b,
        "quantidade": 2,
        "origem": "PF",
        "data": base_date,
    })
    client.post("/movimentacoes", json={
        "tipo": "TRANSFERENCIA",
        "produto_id": product_c,
        "quantidade": 10,
        "origem": "CANOAS",
        "destino": "PF",
        "data": base_date,
    })

    resp = client.get("/analytics/top-saidas?date_from=2026-02-10&date_to=2026-02-10&scope=AMBOS")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data[0]["produto_id"] == product_a
    assert data[0]["total_saida"] == 5

    resp_canoas = client.get("/analytics/top-saidas?date_from=2026-02-10&date_to=2026-02-10&scope=CANOAS")
    assert resp_canoas.status_code == 200
    data_canoas = resp_canoas.json()["data"]
    assert all(item["produto_id"] == product_a for item in data_canoas)

    resp_pf = client.get("/analytics/top-saidas?date_from=2026-02-10&date_to=2026-02-10&scope=PF")
    assert resp_pf.status_code == 200
    data_pf = resp_pf.json()["data"]
    assert all(item["produto_id"] == product_b for item in data_pf)


def test_analytics_entradas_saidas_and_distribuicao(client):
    product_id = _create_product(client, "Produto Mov", qtd_canoas=1, qtd_pf=0)

    client.post("/movimentacoes", json={
        "tipo": "ENTRADA",
        "produto_id": product_id,
        "quantidade": 2,
        "destino": "CANOAS",
        "data": "2026-02-05T10:00:00",
    })
    client.post("/movimentacoes", json={
        "tipo": "SAIDA",
        "produto_id": product_id,
        "quantidade": 1,
        "origem": "CANOAS",
        "data": "2026-02-06T10:00:00",
    })
    client.post("/movimentacoes", json={
        "tipo": "TRANSFERENCIA",
        "produto_id": product_id,
        "quantidade": 1,
        "origem": "CANOAS",
        "destino": "PF",
        "data": "2026-02-06T12:00:00",
    })

    resp = client.get("/analytics/entradas-saidas?date_from=2026-02-05&date_to=2026-02-06")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
    assert data[0]["entradas"] == 2
    assert data[1]["saidas"] == 1

    distrib = client.get("/analytics/estoque-distribuicao")
    assert distrib.status_code == 200
    distrib_data = distrib.json()["data"]
    assert distrib_data["total"] >= 0


def test_analytics_top_sem_mov(client):
    product_id = _create_product(client, "Produto SemMov", qtd_canoas=1, qtd_pf=0)

    client.post("/movimentacoes", json={
        "tipo": "SAIDA",
        "produto_id": product_id,
        "quantidade": 1,
        "origem": "CANOAS",
        "data": "2025-12-01T10:00:00",
    })

    resp = client.get("/analytics/top-sem-mov?days=30&date_to=2026-02-10")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert any(item["produto_id"] == product_id for item in data)


def test_product_images_multiple_flow(client):
    from PIL import Image

    product_id = _create_product(client, "Produto Multi Imagem", qtd_canoas=1, qtd_pf=0)

    def _img_bytes(color: tuple[int, int, int]) -> io.BytesIO:
        buffer = io.BytesIO()
        image = Image.new("RGB", (12, 12), color=color)
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer

    files = [
        ("files", ("img1.png", _img_bytes((255, 0, 0)), "image/png")),
        ("files", ("img2.png", _img_bytes((0, 255, 0)), "image/png")),
    ]
    upload = client.post(f"/produtos/{product_id}/imagens", files=files)
    assert upload.status_code == 201
    assert upload.json()["data"]["total"] == 2

    listed = client.get(f"/produtos/{product_id}/imagens")
    assert listed.status_code == 200
    items = listed.json()["data"]["items"]
    assert len(items) == 2
    primary = [item for item in items if item["is_primary"]]
    assert len(primary) == 1

    second_id = [item["id"] for item in items if not item["is_primary"]][0]
    set_primary = client.patch(f"/produtos/{product_id}/imagens/{second_id}/principal")
    assert set_primary.status_code == 200

    listed_again = client.get(f"/produtos/{product_id}/imagens")
    assert listed_again.status_code == 200
    items_again = listed_again.json()["data"]["items"]
    assert any(item["id"] == second_id and item["is_primary"] for item in items_again)

    to_delete = items_again[0]["id"]
    deleted = client.delete(f"/produtos/{product_id}/imagens/{to_delete}")
    assert deleted.status_code == 200

    final_list = client.get(f"/produtos/{product_id}/imagens")
    assert final_list.status_code == 200
    assert final_list.json()["data"]["total"] == 1


def test_analytics_v2_endpoints(client):
    product_a = _create_product(client, "Produto V2 A", qtd_canoas=10, qtd_pf=0)
    product_b = _create_product(client, "Produto V2 B", qtd_canoas=5, qtd_pf=0)

    client.post("/movimentacoes", json={
        "tipo": "SAIDA",
        "produto_id": product_a,
        "quantidade": 3,
        "origem": "CANOAS",
        "data": "2026-02-10T10:00:00",
    })
    client.post("/movimentacoes", json={
        "tipo": "ENTRADA",
        "produto_id": product_b,
        "quantidade": 4,
        "destino": "PF",
        "data": "2026-02-11T10:00:00",
    })
    client.post("/movimentacoes", json={
        "tipo": "TRANSFERENCIA",
        "produto_id": product_b,
        "quantidade": 2,
        "origem": "CANOAS",
        "destino": "PF",
        "data": "2026-02-11T12:00:00",
    })

    summary = client.get("/analytics/stock/summary")
    assert summary.status_code == 200
    summary_data = summary.json()["data"]
    assert "total_geral" in summary_data
    assert "zerados" in summary_data

    distribution = client.get("/analytics/stock/distribution")
    assert distribution.status_code == 200
    dist_data = distribution.json()["data"]
    assert "items" in dist_data
    assert len(dist_data["items"]) == 2

    top = client.get("/analytics/movements/top-saidas?date_from=2026-02-10&date_to=2026-02-12&scope=AMBOS")
    assert top.status_code == 200
    top_data = top.json()["data"]
    assert len(top_data) >= 1
    assert top_data[0]["produto_id"] == product_a

    ts = client.get("/analytics/movements/timeseries?date_from=2026-02-10&date_to=2026-02-12&scope=AMBOS&bucket=day")
    assert ts.status_code == 200
    assert isinstance(ts.json()["data"], list)

    flow = client.get("/analytics/movements/flow?date_from=2026-02-10&date_to=2026-02-12&scope=PF&bucket=day")
    assert flow.status_code == 200
    assert isinstance(flow.json()["data"], list)

    evolution = client.get("/analytics/stock/evolution?date_from=2026-02-10&date_to=2026-02-12&bucket=day")
    assert evolution.status_code == 200
    assert isinstance(evolution.json()["data"], list)

    inactive = client.get("/analytics/products/inactive?days=30&date_to=2026-02-12&limit=5")
    assert inactive.status_code == 200
    assert isinstance(inactive.json()["data"], list)
