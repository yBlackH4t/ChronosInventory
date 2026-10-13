"""Ficha propria (turbina que o catalogo nao tem) e "Atualizar catálogo"."""

import sqlite3

import pytest

from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService
from app.services.own_ficha_service import OwnFichaReadOnlyError, OwnFichaService
from core.catalog import own_fichas
from core.catalog.bundle import apply_catalog_bundle, catalog_status, import_catalog_file, run_catalog_startup
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from test_assistant_tools import CANOAS, _create_product, tools  # noqa: F401  (fixture: catalogo + produtos)

FICHA = {
    "codigo": "6513409",
    "marca": "holset",
    "modelo": "HE150WG",
    "observacao": "Lançamento de fábrica",
    "aplicacoes": [
        {"montadora": "Foton", "veiculo": "Foton Aumark", "motor": "BFCEC F2.5", "complemento": "Euro 5"},
        {"veiculo": ""},  # linha vazia da tela
    ],
    "codigos": [{"fabricante": "OEM", "numero": "6393680"}, {"fabricante": "HOLSET", "numero": "6496779"}],
}


def _service(role="publisher", source=""):
    published = []
    config = {"role": role, "remote_server_url": source}
    return OwnFichaService(config_reader=lambda: config, after_change=lambda: published.append(1)), published


def test_own_ficha_makes_the_turbine_findable(client, tools):  # noqa: F811
    product_id = _create_product(client, "TURBO HE150WG - 6513409", {CANOAS: 2})
    service, published = _service()
    ficha = service.save(FICHA)
    assert ficha["marca"] == "HOLSET" and len(ficha["aplicacoes"]) == 1 and published == [1]

    # Liga ao produto pelo codigo do nome e aparece na aba Catalogo.
    links = client.get(f"/produtos/{product_id}/catalogo").json()["data"]["vinculos"]
    assert [(link["fonte"], link["codigo"]) for link in links] == [("Ficha própria", "6513409")]

    # O assistente acha pelo veiculo e pelos outros codigos.
    by_vehicle = tools.search_by_application("foton aumark")["texto_pronto"]
    assert "TURBO HE150WG - 6513409" in by_vehicle
    by_oem = tools.search_by_code("6393680")["texto_pronto"].splitlines()
    assert by_oem[0] == "*6393680*: temos."
    assert by_oem[1].startswith("É código OEM (original da montadora); na ficha própria é a *6513409*")
    # Nao e codigo Master Power.
    assert "não achei" in tools.catalog_code("6513409")["texto_pronto"]

    # Editar e apagar refazem a copia no catalogo.
    service.save({**FICHA, "aplicacoes": [{"veiculo": "Foton Tunland", "motor": "F2.5"}]}, ficha["id"])
    assert "TURBO HE150WG - 6513409" in tools.search_by_application("tunland")["texto_pronto"]
    service.delete(ficha["id"])
    assert client.get(f"/produtos/{product_id}/catalogo").json()["data"]["vinculos"] == []


def test_own_ficha_survives_a_catalog_bundle_and_validates(client, tools):  # noqa: F811
    service, _ = _service()
    service.save(FICHA)
    db = DatabaseConnection()
    conn = db.get_connection()
    try:
        # Simula o pacote do catalogo apagando as tabelas catalogo_* (como ao aplicar uma versao nova).
        conn.execute("DELETE FROM catalogo_aplicacoes")
        conn.commit()
    finally:
        conn.close()
    conn = db.get_connection()
    try:
        conn.execute("DELETE FROM catalogo_produtos WHERE fonte_id = (SELECT id FROM catalogo_fontes WHERE codigo='PROPRIA')")
        conn.commit()
    finally:
        conn.close()
    run_catalog_startup(db)  # a abertura do app recopia
    assert catalog_status(db)["fichas_proprias"] == 1

    with pytest.raises(ValidationException, match="Já existe"):
        service.save(FICHA)
    with pytest.raises(ValidationException, match="Marca inválida"):
        service.save({**FICHA, "codigo": "6513410", "marca": "xyz"})
    with pytest.raises(ValidationException, match="não é um número de peça"):
        service.save({**FICHA, "codigo": "HE150"})


def test_only_the_publisher_or_a_standalone_machine_edits(client, tools):  # noqa: F811
    consumer, _ = _service(role="consumer", source="http://192.168.0.10:8765")
    assert consumer.can_edit()["pode_editar"] is False
    with pytest.raises(OwnFichaReadOnlyError):
        consumer.save(FICHA)
    standalone, _ = _service(role="consumer", source="")
    assert standalone.can_edit()["pode_editar"] is True


def test_own_fichas_travel_with_the_knowledge(client, tools, tmp_path):  # noqa: F811
    service, _ = _service()
    service.save(FICHA)
    sync = AssistantKnowledgeSyncService(config_reader=lambda: {}, state_path=str(tmp_path / "estado.json"))
    payload = {"fichas": sync._export_fichas()}
    payload["fichas_sha256"] = own_fichas.fichas_hash(payload["fichas"])
    received = sync._validated_fichas(payload)
    assert [f["codigo"] for f in received] == ["6513409"]
    # Arquivo alterado no caminho: nada entra.
    payload["fichas"][0]["modelo"] = "OUTRO"
    with pytest.raises(ValidationException):
        sync._validated_fichas(payload)
    # Publicadora da 2.4.0 (sem fichas): nao mexe nas daqui.
    assert sync._validated_fichas({"regras": []}) is None


def test_import_rejects_a_file_that_is_not_the_catalog(client, tools, tmp_path):  # noqa: F811
    bogus = tmp_path / "planilha.db"
    sqlite3.connect(bogus).execute("CREATE TABLE x (a)").connection.close()
    with pytest.raises(ValidationException, match="não parece ser o catálogo"):
        import_catalog_file(DatabaseConnection(), str(bogus))
    response = client.post("/catalogo/importar", files={"file": ("vazio.db", b"", "application/octet-stream")})
    assert response.status_code == 400
    status = client.get("/catalogo/status").json()["data"]
    assert status["fichas_master_power"] >= 1
    assert apply_catalog_bundle(DatabaseConnection(), str(tmp_path / "nao_existe.gz"))["status"] == "sem_pacote"
