"""
Fotos de produto ficam no banco: trocar o banco (base oficial, backup) nao pode perder
as fotos colocadas so nesta maquina, e um backup antigo serve para recupera-las.
"""

import io
import os

from PIL import Image


def _create_product(client, nome):
    response = client.post("/produtos", json={"nome": nome, "inventories": {11: 1}})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _add_photo(client, product_id, color=(255, 0, 0)):
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color=color).save(buffer, format="PNG")
    buffer.seek(0)
    response = client.post(
        f"/produtos/{product_id}/imagens",
        files=[("files", ("foto.png", buffer, "image/png"))],
    )
    assert response.status_code == 201


def _photo_count(client, product_id):
    response = client.get(f"/produtos/{product_id}/imagens")
    assert response.status_code == 200
    return response.json()["data"]["total"]


def _clear_photos(client, product_id):
    listed = client.get(f"/produtos/{product_id}/imagens").json()["data"]["items"]
    for item in listed:
        assert client.delete(f"/produtos/{product_id}/imagens/{item['id']}").status_code == 200


def test_official_base_apply_keeps_photos_added_on_this_machine(client, tmp_path):
    with_photo = _create_product(client, "Turbina Com Foto Local")
    publisher_photo = _create_product(client, "Turbina Com Foto Oficial")
    _add_photo(client, publisher_photo, color=(0, 0, 255))

    config = client.put(
        "/backup/base-oficial/config",
        json={
            "role": "publisher",
            "official_base_dir": str(tmp_path / "BaseOficialChronos"),
            "machine_label": "PC-TESTE",
        },
    )
    assert config.status_code == 200
    assert client.post("/backup/base-oficial/publicar", json={}).status_code == 200

    # Depois da publicacao, esta maquina coloca uma foto que a base oficial nao tem.
    _add_photo(client, with_photo)
    _add_photo(client, publisher_photo, color=(0, 255, 0))

    applied = client.post("/backup/base-oficial/aplicar")
    assert applied.status_code == 200
    data = applied.json()["data"]
    assert data["fotos_mantidas"] == 1
    assert data["produtos_com_fotos_mantidas"] == 1

    assert _photo_count(client, with_photo) == 1
    # Produto que ja veio com foto na base oficial fica como a base oficial mandou.
    assert _photo_count(client, publisher_photo) == 1


def test_recover_photos_from_backup_fills_only_products_without_photo(client):
    lost = _create_product(client, "Turbina Foto Perdida")
    kept = _create_product(client, "Turbina Foto Nova")
    _add_photo(client, lost)
    _add_photo(client, lost, color=(0, 255, 0))
    _add_photo(client, kept)

    backup = client.post("/backup/criar")
    assert backup.status_code == 200
    backup_name = os.path.basename(backup.json()["data"]["path"])

    _clear_photos(client, lost)
    _clear_photos(client, kept)
    _add_photo(client, kept, color=(0, 0, 255))

    recovered = client.post("/backup/recuperar-fotos", json={"backup_name": backup_name})
    assert recovered.status_code == 200
    data = recovered.json()["data"]
    assert data["produtos_recuperados"] == 1
    assert data["fotos_copiadas"] == 2
    assert data["produtos_ja_com_foto"] == 1
    assert data["produtos_nao_encontrados"] == 0
    assert os.path.exists(data["safety_backup"])

    assert _photo_count(client, lost) == 2
    assert _photo_count(client, kept) == 1
    primary = [i for i in client.get(f"/produtos/{lost}/imagens").json()["data"]["items"] if i["is_primary"]]
    assert len(primary) == 1


def test_recover_photos_matches_product_by_name_when_id_changed(client, tmp_path):
    import sqlite3

    product_id = _create_product(client, "Turbina Mudou De Id")
    backup = client.post("/backup/criar")
    backup_path = backup.json()["data"]["path"]

    # No backup, o mesmo produto tem outro id e uma foto.
    conn = sqlite3.connect(backup_path)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("UPDATE produtos SET id = 999 WHERE id = ?", (product_id,))
    conn.execute(
        "INSERT INTO product_images (product_id, image_data, mime_type, is_primary) VALUES (999, ?, 'image/jpeg', 1)",
        (b"jpeg",),
    )
    conn.commit()
    conn.close()

    recovered = client.post(
        "/backup/recuperar-fotos", json={"backup_name": os.path.basename(backup_path)}
    )
    assert recovered.status_code == 200
    assert recovered.json()["data"]["produtos_recuperados"] == 1
    assert _photo_count(client, product_id) == 1
