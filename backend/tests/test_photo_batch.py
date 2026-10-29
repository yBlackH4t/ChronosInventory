"""
Fotos em lote (2.7.19): uma pasta com "178045.jpg", "178045_2.jpg"... vai para os produtos
cujo nome cita o codigo, sem duplicar foto que o produto ja tem.
"""

import io

from PIL import Image

from app.services.photo_batch_service import parse_file_name


def _create_product(client, nome):
    response = client.post("/produtos", json={"nome": nome, "inventories": {11: 1}})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _jpg(color):
    buffer = io.BytesIO()
    Image.new("RGB", (12, 12), color=color).save(buffer, format="JPEG")
    return buffer.getvalue()


def _send(client, name, color):
    response = client.post("/produtos/fotos-lote", files=[("file", (name, _jpg(color), "image/jpeg"))])
    assert response.status_code == 200
    return response.json()["data"]


def _photos(client, product_id):
    return client.get(f"/produtos/{product_id}/imagens").json()["data"]["items"]


def test_parse_file_name():
    assert parse_file_name("178045.jpg") == ("178045", 1)
    assert parse_file_name("178045_2.jpg") == ("178045", 2)
    assert parse_file_name("fotos/766595_5.JPG") == ("766595", 5)
    assert parse_file_name("178045 (3).png") == ("178045", 3)
    assert parse_file_name("856457-009.jpg") == ("856457009", 1)
    assert parse_file_name("53169887156-1.jpg") == ("53169887156", 1)


def test_preview_matches_codes_in_product_names(client):
    s100 = _create_product(client, "TURBO BORG S100 178045")
    _create_product(client, "TURBO BORG S200 318706")

    response = client.post(
        "/produtos/fotos-lote/previa",
        json={"arquivos": ["178045.jpg", "178045_2.jpg", "999999.jpg", "leia-me.txt"]},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    status = {item["arquivo"]: item["status"] for item in data["itens"]}
    assert status == {
        "178045.jpg": "ok",
        "178045_2.jpg": "ok",
        "999999.jpg": "sem_produto",
        "leia-me.txt": "nao_e_imagem",
    }
    assert data["arquivos_ok"] == 2
    assert data["produtos"] == 1
    assert data["itens"][0]["produtos"][0]["id"] == s100


def test_import_adds_photos_without_duplicates(client):
    product = _create_product(client, "TURBO BORG S100 178045")

    first = _send(client, "178045.jpg", (255, 0, 0))
    assert first["resultados"] == [{"produto_id": product, "resultado": "adicionada"}]
    _send(client, "178045_2.jpg", (0, 0, 255))
    again = _send(client, "178045.jpg", (255, 0, 0))
    assert again["resultados"][0]["resultado"] == "ja_tinha"

    photos = _photos(client, product)
    assert len(photos) == 2
    assert sum(1 for p in photos if p["is_primary"]) == 1


def test_import_keeps_existing_primary_and_respects_limit(client):
    product = _create_product(client, "TURBO BORG S2EL 766595")
    for n in range(1, 6):
        assert _send(client, f"766595_{n}.jpg", (n * 40, 0, 0))["resultados"][0]["resultado"] == "adicionada"
    primary_before = [p["id"] for p in _photos(client, product) if p["is_primary"]]

    over = _send(client, "766595_6.jpg", (0, 255, 0))
    assert over["resultados"][0]["resultado"] == "limite"
    assert [p["id"] for p in _photos(client, product) if p["is_primary"]] == primary_before


def test_unmatched_file_is_not_saved(client):
    data = _send(client, "123456789.jpg", (10, 10, 10))
    assert data["status"] == "sem_produto"
    assert data["resultados"] == []


def test_code_glued_to_model_is_found(client):
    product = _create_product(client, "TURBO BORG S200G-12709880050")
    data = client.post("/produtos/fotos-lote/previa", json={"arquivos": ["12709880050.jpg"]}).json()["data"]
    assert [p["id"] for p in data["itens"][0]["produtos"]] == [product]


def test_glued_and_spaced_codes_both_match_but_not_a_prefix(client):
    glued = _create_product(client, "TURBO BORG S200G-12709880050")
    spaced = _create_product(client, "TURBO BORG S200G 12709880050")
    _create_product(client, "TURBO GARRETT 856457-009")
    data = client.post(
        "/produtos/fotos-lote/previa", json={"arquivos": ["12709880050.jpg", "856457.jpg"]}
    ).json()["data"]
    assert sorted(p["id"] for p in data["itens"][0]["produtos"]) == sorted([glued, spaced])
    assert data["itens"][1]["status"] == "sem_produto"
