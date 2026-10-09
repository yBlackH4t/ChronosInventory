"""Regression tests for the backend hardening (LAN exposure, CORS, import paths, concurrency)."""

import concurrent.futures as cf
import os

from fastapi.testclient import TestClient

from core.utils.file_utils import FileUtils


def _remote(client: TestClient) -> TestClient:
    return TestClient(client.app, client=("192.168.0.50", 50000))


def _create_product(client: TestClient, stock: int = 5) -> int:
    response = client.post(
        "/produtos",
        json={"nome": "TURBO TESTE CONCORRENCIA", "inventories": {"11": stock}},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def test_remote_clients_cannot_use_the_api(client):
    remote = _remote(client)
    for method, path in [
        ("get", "/produtos"),
        ("get", "/backup/listar"),
        ("post", "/backup/restaurar"),
        ("delete", "/produtos/1"),
        ("post", "/import-dynamic/execute"),
    ]:
        response = getattr(remote, method)(path)
        assert response.status_code == 403, (method, path, response.status_code)
        assert response.json()["error"]["code"] == "forbidden"


def test_remote_clients_can_still_use_the_phone_scanner(client):
    remote = _remote(client)
    assert remote.get("/api/scanner/app").status_code == 200
    response = remote.post("/api/scanner/barcode", json={"code": "CI-1"})
    assert response.status_code == 200


def test_lan_api_can_be_enabled_explicitly(client, monkeypatch):
    monkeypatch.setenv("CHRONOS_ALLOW_LAN_API", "1")
    assert _remote(client).get("/produtos").status_code == 200


def test_cors_does_not_allow_arbitrary_websites(client):
    evil = client.get("/produtos", headers={"Origin": "https://site-malicioso.example"})
    assert "access-control-allow-origin" not in evil.headers

    tauri = client.get("/produtos", headers={"Origin": "http://tauri.localhost"})
    assert tauri.headers.get("access-control-allow-origin") == "http://tauri.localhost"


def test_import_execute_rejects_paths_outside_temp_and_keeps_the_file(client, tmp_path):
    victim = tmp_path / "contrato.docx"
    victim.write_text("documento importante", encoding="utf-8")

    for file_id in [str(victim), "..\\..\\contrato.docx", "../contrato.docx", "import_20260101_000000_x/../../a.xlsx"]:
        response = client.post(
            "/import-dynamic/execute",
            json={"file_id": file_id, "match_by": "name", "name_col": "x", "location_mappings": {}},
        )
        assert response.status_code == 400, (file_id, response.text)

    assert victim.exists()


def test_upload_filename_cannot_escape_temp_directory(client, tmp_path):
    temp_dir = os.path.realpath(FileUtils.get_temp_directory())
    response = client.post(
        "/import-dynamic/analyze",
        files={"file": ("..\\..\\escape.csv", b"nome;CANOAS\nTURBO X;1\n", "text/csv")},
    )
    assert response.status_code == 200, response.text
    file_id = response.json()["data"]["file_id"]
    assert os.path.basename(file_id) == file_id
    assert os.path.dirname(os.path.realpath(os.path.join(temp_dir, file_id))) == temp_dir


def test_concurrent_movements_all_succeed_and_stock_is_consistent(client):
    product_id = _create_product(client, stock=5)

    def entrada(_):
        return client.post(
            "/movimentacoes",
            json={"tipo": "ENTRADA", "produto_id": product_id, "quantidade": 1, "destino_location_id": 11},
        ).status_code

    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        statuses = list(pool.map(entrada, range(24)))

    assert statuses == [201] * 24
    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["total_stock"] == 5 + 24


def test_concurrent_exits_never_oversell(client):
    product_id = _create_product(client, stock=5)

    def saida(_):
        return client.post(
            "/movimentacoes",
            json={"tipo": "SAIDA", "produto_id": product_id, "quantidade": 1, "origem_location_id": 11},
        ).status_code

    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        statuses = list(pool.map(saida, range(12)))

    assert statuses.count(201) == 5
    assert all(code in (201, 409) for code in statuses)
    product = client.get(f"/produtos/{product_id}").json()["data"]
    assert product["total_stock"] == 0
