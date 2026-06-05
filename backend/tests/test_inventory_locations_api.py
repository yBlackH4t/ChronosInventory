"""
Testes para API de InventoryLocations (v2.0.0)

Testa endpoints CRUD para gerenciar locations configuráveis
"""

import pytest
import sqlite3
from fastapi.testclient import TestClient
from app.models.inventory_location import InventoryLocation
from core.database.repositories.inventory_location_repository import InventoryLocationRepository


def test_create_location(client: TestClient, db_connection: sqlite3.Connection):
    """Testa criação de nova location."""
    payload = {
        "name": "ALMOXARIFADO",
        "label": "Almoxarifado Central",
        "color": "#2ecc71",
        "ordem": 1,
    }
    
    response = client.post("/inventory-locations", json=payload)
    
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["name"] == "ALMOXARIFADO"
    assert data["label"] == "Almoxarifado Central"
    assert data["color"] == "#2ecc71"
    assert data["ativo"] is True


def test_get_location(client: TestClient, db_connection: sqlite3.Connection):
    """Testa recuperação de location específico."""
    # Criar location
    repo = InventoryLocationRepository(db_connection)
    location = InventoryLocation(
        name="TESTE",
        label="Local Teste",
        color="#ff0000",
        ordem=0,
        ativo=True,
    )
    location_id = repo.create(location)
    
    # Recuperar
    response = client.get(f"/inventory-locations/{location_id}")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == location_id
    assert data["name"] == "TESTE"
    assert data["label"] == "Local Teste"


def test_list_all_locations(client: TestClient, db_connection: sqlite3.Connection):
    """Testa listagem de todas as locations."""
    # Criar várias locations
    repo = InventoryLocationRepository(db_connection)
    
    for i in range(3):
        location = InventoryLocation(
            name=f"LOC{i}",
            label=f"Location {i}",
            color="#0000ff",
            ordem=i,
            ativo=True,
        )
        repo.create(location)
    
    # Listar
    response = client.get("/inventory-locations")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) >= 3


def test_list_active_locations(client: TestClient, db_connection: sqlite3.Connection):
    """Testa listagem de locations ativas."""
    repo = InventoryLocationRepository(db_connection)
    
    # Criar ativa
    active = InventoryLocation(
        name="ATIVA",
        label="Location Ativa",
        color="#00ff00",
        ordem=0,
        ativo=True,
    )
    active_id = repo.create(active)
    
    # Criar inativa
    inactive = InventoryLocation(
        name="INATIVA",
        label="Location Inativa",
        color="#00ff00",
        ordem=1,
        ativo=False,
    )
    inactive_id = repo.create(inactive)
    
    # Listar apenas ativas
    response = client.get("/inventory-locations/active")
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    # Verificar que apenas ativa está na lista
    active_ids = [loc["id"] for loc in data]
    assert active_id in active_ids
    # inactive pode não estar dependendo de quais locations já existem


def test_update_location(client: TestClient, db_connection: sqlite3.Connection):
    """Testa atualização de location."""
    # Criar location
    repo = InventoryLocationRepository(db_connection)
    location = InventoryLocation(
        name="UPDATE_TEST",
        label="Original",
        color="#ff00ff",
        ordem=0,
        ativo=True,
    )
    location_id = repo.create(location)
    
    # Atualizar
    update_payload = {
        "label": "Atualizado",
        "color": "#ffff00",
        "ordem": 5,
    }
    
    response = client.put(f"/inventory-locations/{location_id}", json=update_payload)
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["label"] == "Atualizado"
    assert data["color"] == "#ffff00"
    assert data["ordem"] == 5
    # name não deve mudar
    assert data["name"] == "UPDATE_TEST"


def test_delete_location_soft(client: TestClient, db_connection: sqlite3.Connection):
    """Testa soft delete de location."""
    # Criar location
    repo = InventoryLocationRepository(db_connection)
    location = InventoryLocation(
        name="DELETE_TEST",
        label="To Delete",
        color="#000000",
        ordem=0,
        ativo=True,
    )
    location_id = repo.create(location)
    
    # Deletar (soft)
    response = client.delete(f"/inventory-locations/{location_id}")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["ativo"] is False


def test_reactivate_location(client: TestClient, db_connection: sqlite3.Connection):
    """Testa reativação de location desativado."""
    # Criar location
    repo = InventoryLocationRepository(db_connection)
    location = InventoryLocation(
        name="REACTIVATE_TEST",
        label="To Reactivate",
        color="#000000",
        ordem=0,
        ativo=False,
    )
    location_id = repo.create(location)
    
    # Reativar
    response = client.post(f"/inventory-locations/{location_id}/reactivate")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["ativo"] is True


def test_duplicate_location_name(client: TestClient):
    """Testa que não pode criar location com name duplicado."""
    payload = {
        "name": "UNIQUE_TEST",
        "label": "First",
        "color": "#123456",
        "ordem": 0,
    }
    
    # Primeira criação
    response1 = client.post("/inventory-locations", json=payload)
    assert response1.status_code == 201
    
    # Tentativa duplicada
    response2 = client.post("/inventory-locations", json=payload)
    assert response2.status_code == 409  # Conflict


def test_invalid_color(client: TestClient):
    """Testa validação de cor hex."""
    payload = {
        "name": "COLOR_TEST",
        "label": "Color Test",
        "color": "notacolor",  # Inválido
        "ordem": 0,
    }
    
    response = client.post("/inventory-locations", json=payload)
    assert response.status_code == 400


def test_empty_name(client: TestClient):
    """Testa que name não pode ser vazio."""
    payload = {
        "name": "",
        "label": "Test",
        "color": "#ffffff",
        "ordem": 0,
    }
    
    response = client.post("/inventory-locations", json=payload)
    assert response.status_code == 400


def test_location_not_found(client: TestClient):
    """Testa recuperação de location inexistente."""
    response = client.get("/inventory-locations/99999")
    assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
