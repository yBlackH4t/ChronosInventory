"""
2.7.22: o que foi lançado só neste computador não some ao pegar a base da principal sem aviso,
os bancos do assistente vão junto no backup, o banco recusa saldo negativo e o celular precisa
estar pareado (e recebe o saldo do que leu).
"""

import os
import sqlite3

import pytest
from fastapi.testclient import TestClient

from core.utils.file_utils import FileUtils


def _remote(client: TestClient) -> TestClient:
    return TestClient(client.app, client=("192.168.0.50", 50000))


def _create_product(client, nome, stock=3):
    response = client.post("/produtos", json={"nome": nome, "inventories": {"11": stock}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _publish(client, tmp_path):
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


def _saida(client, product_id, quantidade=1):
    response = client.post(
        "/movimentacoes",
        json={"tipo": "SAIDA", "produto_id": product_id, "quantidade": quantidade, "origem_location_id": 11},
    )
    assert response.status_code == 201, response.text


def test_pegar_a_base_avisa_o_que_foi_lancado_so_aqui(client, tmp_path):
    product_id = _create_product(client, "TURBINA 796155-5005")
    _publish(client, tmp_path)

    # Depois da publicação, este computador lança uma saída e cadastra um produto.
    _saida(client, product_id)
    _create_product(client, "TURBINA SO DESTE PC")

    blocked = client.post("/backup/base-oficial/aplicar")
    assert blocked.status_code == 409
    error = blocked.json()["error"]
    assert error["code"] == "lancamentos_locais"
    assert error["details"]["movimentacoes"] >= 1
    assert error["details"]["produtos"] == 1
    assert error["details"]["exemplos"][0]["produto_nome"] == "TURBINA 796155-5005"
    assert "1 produto" in error["message"]

    # Nada mudou: a saída continua aqui.
    assert client.get(f"/produtos/{product_id}").json()["data"]["inventories"]["11"] == 2

    applied = client.post("/backup/base-oficial/aplicar?descartar_lancamentos_locais=true")
    assert applied.status_code == 200, applied.text
    assert applied.json()["data"]["lancamentos_locais_descartados"] >= 1


def test_pegar_a_base_sem_nada_novo_aqui_nao_pergunta(client, tmp_path):
    _create_product(client, "TURBINA 4031196")
    _publish(client, tmp_path)
    applied = client.post("/backup/base-oficial/aplicar")
    assert applied.status_code == 200, applied.text
    assert applied.json()["data"]["lancamentos_locais_descartados"] == 0


def _assistant_db(name, value):
    path = os.path.join(FileUtils.get_app_directory(), name)
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS marca (valor TEXT)")
        conn.execute("DELETE FROM marca")
        conn.execute("INSERT INTO marca VALUES (?)", (value,))
        conn.commit()
    finally:
        conn.close()


def _assistant_value(name):
    conn = sqlite3.connect(os.path.join(FileUtils.get_app_directory(), name))
    try:
        return conn.execute("SELECT valor FROM marca").fetchone()[0]
    finally:
        conn.close()


def test_backup_leva_e_traz_os_bancos_do_assistente(client):
    _create_product(client, "TURBINA BACKUP IA")
    _assistant_db("assistente_historico.db", "ensinado antes")
    _assistant_db("assistente_atendimentos.db", "atendimento antes")

    created = client.post("/backup/criar")
    assert created.status_code == 200, created.text
    backups = client.get("/backup/listar").json()["data"]
    assert len(backups) == 1  # os bancos do assistente não aparecem como backups separados
    backup_name = backups[0]["name"]
    backup_path = backups[0]["path"]
    assert os.path.isfile(backup_path + ".ia-historico")
    assert os.path.isfile(backup_path + ".ia-atendimentos")

    _assistant_db("assistente_historico.db", "ensinado depois")
    restored = client.post("/backup/restaurar", json={"backup_name": backup_name})
    assert restored.status_code == 200, restored.text
    assert _assistant_value("assistente_historico.db") == "ensinado antes"
    assert _assistant_value("assistente_atendimentos.db") == "atendimento antes"


def test_apagar_backup_apaga_os_bancos_do_assistente_junto(client):
    from app.services.backup_service import BackupService

    _assistant_db("assistente_historico.db", "x")
    service = BackupService()
    ok, path = service.create_automatic_backup()
    assert ok and os.path.isfile(path + ".ia-historico")
    service._delete_backup_file(path)
    assert not os.path.exists(path)
    assert not os.path.exists(path + ".ia-historico")


def test_banco_recusa_saldo_negativo(client):
    product_id = _create_product(client, "TURBINA TRAVA", stock=1)
    from core.database.connection import DatabaseConnection

    conn = DatabaseConnection().get_connection()
    try:
        with pytest.raises(sqlite3.DatabaseError, match="negativo"):
            conn.execute(
                "UPDATE produto_estoque SET quantidade = -1 WHERE produto_id = ? AND local_id = 11",
                (product_id,),
            )
        with pytest.raises(sqlite3.DatabaseError, match="negativo"):
            conn.execute("INSERT INTO produto_estoque (produto_id, local_id, quantidade) VALUES (?, 12, -2)", (product_id,))
        conn.rollback()
    finally:
        conn.close()


def test_celular_sem_pareamento_nao_manda_codigo(client):
    remote = _remote(client)
    response = remote.post("/api/scanner/barcode", json={"code": "CI-1"})
    assert response.status_code == 403
    assert "QR code" in response.json()["error"]["message"]

    # O código só aparece para a tela deste computador, nunca para a rede.
    assert "pareamento" not in remote.get("/api/scanner/ip").json()
    code = client.get("/api/scanner/ip").json()["pareamento"]
    assert remote.post(
        "/api/scanner/barcode", json={"code": "CI-1"}, headers={"X-Chronos-Pareamento": "errado"}
    ).status_code == 403
    assert remote.post(
        "/api/scanner/barcode", json={"code": "CI-1"}, headers={"X-Chronos-Pareamento": code}
    ).status_code == 200


def test_celular_recebe_o_saldo_por_filial(client):
    product_id = _create_product(client, "TURBINA GARRETT 796155-5005", stock=4)
    data = client.post("/api/scanner/barcode", json={"code": f"CI-{product_id}"}).json()
    assert data["display_name"] == "TURBINA GARRETT 796155-5005"
    item = data["produtos"][0]
    assert item["id"] == product_id
    assert item["total"] == 4
    assert {"local": "Canoas", "quantidade": 4} in item["locais"]

    by_code = client.post("/api/scanner/barcode", json={"code": "796155-5005"}).json()
    assert by_code["produtos"][0]["id"] == product_id
