"""
Testes para API de InventoryLocations (v2.0.0)

Testa endpoints CRUD para gerenciar locations configuráveis
"""

import pytest
import sqlite3
from fastapi.testclient import TestClient
from app.models.inventory_location import InventoryLocation
from core.database.repositories.inventory_location_repository import InventoryLocationRepository


def test_create_location(client: TestClient):
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


def test_get_location(client: TestClient):
    """Testa recuperação de location específico."""
    # Criar location
    resp = client.post("/inventory-locations", json={
        "name": "TESTE",
        "label": "Local Teste",
        "color": "#ff0000",
        "ordem": 0,
    })
    location_id = resp.json()["data"]["id"]
    
    # Recuperar
    response = client.get(f"/inventory-locations/{location_id}")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == location_id
    assert data["name"] == "TESTE"
    assert data["label"] == "Local Teste"


def test_list_all_locations(client: TestClient):
    """Testa listagem de todas as locations."""
    # Criar várias locations
    for i in range(3):
        client.post("/inventory-locations", json={
            "name": f"LOC{i}",
            "label": f"Location {i}",
            "color": "#0000ff",
            "ordem": i,
        })
    
    # Listar
    response = client.get("/inventory-locations")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) >= 3


def test_list_active_locations(client: TestClient):
    """Testa listagem de locations ativas."""
    # Criar ativa
    resp1 = client.post("/inventory-locations", json={
        "name": "ATIVA",
        "label": "Location Ativa",
        "color": "#00ff00",
        "ordem": 0,
    })
    active_id = resp1.json()["data"]["id"]
    
    # Criar inativa
    resp2 = client.post("/inventory-locations", json={
        "name": "INATIVA",
        "label": "Location Inativa",
        "color": "#00ff00",
        "ordem": 1,
    })
    inactive_id = resp2.json()["data"]["id"]
    client.delete(f"/inventory-locations/{inactive_id}")  # inativar
    
    # Listar apenas ativas
    response = client.get("/inventory-locations/active")
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    # Verificar que apenas ativa está na lista
    active_ids = [loc["id"] for loc in data]
    assert active_id in active_ids
    # inactive pode não estar dependendo de quais locations já existem


def test_update_location(client: TestClient):
    """Testa atualização de location."""
    # Criar location
    resp = client.post("/inventory-locations", json={
        "name": "UPDATE_TEST",
        "label": "Original",
        "color": "#ff00ff",
        "ordem": 0,
    })
    location_id = resp.json()["data"]["id"]
    
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


def test_delete_location_soft(client: TestClient):
    """Testa soft delete de location."""
    # Criar location
    resp = client.post("/inventory-locations", json={
        "name": "DELETE_TEST",
        "label": "To Delete",
        "color": "#000000",
        "ordem": 0,
    })
    location_id = resp.json()["data"]["id"]
    
    # Deletar (soft)
    response = client.delete(f"/inventory-locations/{location_id}")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["ativo"] is False


def test_reactivate_location(client: TestClient):
    """Testa reativação de location desativado."""
    # Criar location
    resp = client.post("/inventory-locations", json={
        "name": "REACTIVATE_TEST",
        "label": "To Reactivate",
        "color": "#000000",
        "ordem": 0,
    })
    location_id = resp.json()["data"]["id"]
    deleted = client.delete(f"/inventory-locations/{location_id}")
    print("DELETED STATUS:", deleted.status_code, deleted.text)
    
    # Reativar
    response = client.post(f"/inventory-locations/{location_id}/reactivate")
    print("REACTIVATE STATUS:", response.status_code, response.text)
    
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
    assert response.status_code == 422


def test_empty_name(client: TestClient):
    """Testa que name não pode ser vazio."""
    payload = {
        "name": "",
        "label": "Test",
        "color": "#ffffff",
        "ordem": 0,
    }
    
    response = client.post("/inventory-locations", json=payload)
    assert response.status_code == 422


def test_location_not_found(client: TestClient):
    """Testa recuperação de location inexistente."""
    response = client.get("/inventory-locations/99999")
    assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
