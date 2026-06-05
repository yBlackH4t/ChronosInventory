"""
Testes para LegacyCompatService

Valida que conversão entre formato legado e novo funciona corretamente
"""

import pytest
import sqlite3
from app.models.product import Product
from app.models.inventory_location import InventoryLocation
from app.services.legacy_compat_service import LegacyCompatService
from core.database.repositories.inventory_location_repository import InventoryLocationRepository
from core.database.repositories.product_repository import ProductRepository


def test_get_default_location_ids(db_connection: sqlite3.Connection):
    """Testa recuperação de IDs padrão de locations."""
    service = LegacyCompatService(db_connection)
    
    # Criar locations padrão
    repo = InventoryLocationRepository(db_connection)
    
    canoas = InventoryLocation(
        name="CANOAS",
        label="Canoas",
        color="#1f538d",
        ordem=0,
        ativo=True,
    )
    canoas_id = repo.create(canoas)
    
    pf = InventoryLocation(
        name="PF",
        label="Passo Fundo",
        color="#d35400",
        ordem=1,
        ativo=True,
    )
    pf_id = repo.create(pf)
    
    # Teste
    retrieved_canoas_id, retrieved_pf_id = service.get_default_location_ids()
    
    assert retrieved_canoas_id == canoas_id
    assert retrieved_pf_id == pf_id


def test_qtd_canoas_to_location_qty(db_connection: sqlite3.Connection):
    """Testa conversão de qtd_canoas para dict de location."""
    service = LegacyCompatService(db_connection)
    
    # Setup locations
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Create dummy product
    product = Product(nome="Test", qtd_canoas=50, qtd_pf=0)
    
    # Test conversion
    result = service.qtd_canoas_to_location_qty(product, 50)
    
    assert canoas_id in result
    assert result[canoas_id] == 50


def test_product_to_inventories_dict(db_connection: sqlite3.Connection):
    """Testa conversão de produto legacy para inventories dict."""
    service = LegacyCompatService(db_connection)
    
    # Setup locations
    repo = InventoryLocationRepository(db_connection)
    
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    pf = InventoryLocation(name="PF", label="PF", color="#fff", ordem=1, ativo=True)
    pf_id = repo.create(pf)
    
    # Create legacy product
    product = Product(nome="Test", qtd_canoas=30, qtd_pf=20)
    
    # Convert
    result = service.product_to_inventories_dict(product)
    
    assert result[canoas_id] == 30
    assert result[pf_id] == 20


def test_location_string_to_id(db_connection: sqlite3.Connection):
    """Testa conversão de string de location para ID."""
    service = LegacyCompatService(db_connection)
    
    # Setup location
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Test variations
    assert service.location_string_to_id("CANOAS") == canoas_id
    assert service.location_string_to_id("canoas") == canoas_id
    assert service.location_string_to_id(" CANOAS ") == canoas_id


def test_location_id_to_legacy_string(db_connection: sqlite3.Connection):
    """Testa conversão de ID para string de location."""
    service = LegacyCompatService(db_connection)
    
    # Setup location
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Test
    result = service.location_id_to_legacy_string(canoas_id)
    assert result == "CANOAS"


def test_get_qtd_canoas_from_product(db_connection: sqlite3.Connection):
    """Testa leitura de qtd_canoas de produto."""
    service = LegacyCompatService(db_connection)
    
    # Setup
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Create product with legacy qtd
    product = Product(nome="Test", qtd_canoas=100, qtd_pf=0)
    
    # Test - should read from legacy field
    qty = service.get_qtd_canoas_from_product(product)
    assert qty == 100


def test_set_qtd_canoas(db_connection: sqlite3.Connection):
    """Testa definição de qtd_canoas."""
    service = LegacyCompatService(db_connection)
    
    # Setup
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Create and save product
    product_repo = ProductRepository(db_connection)
    product = Product(nome="TestQty", qtd_canoas=0, qtd_pf=0)
    product_id = product_repo.create(product)
    product.id = product_id
    
    # Set quantity via legacy service
    service.set_qtd_canoas(product, 75)
    
    # Verify it was set in new format
    from app.services.product_inventory_service import ProductInventoryService
    inv_service = ProductInventoryService(db_connection)
    qty = inv_service.get_quantity(product_id, canoas_id)
    assert qty == 75


def test_add_qtd_canoas(db_connection: sqlite3.Connection):
    """Testa adição de quantidade em Canoas."""
    service = LegacyCompatService(db_connection)
    
    # Setup
    repo = InventoryLocationRepository(db_connection)
    canoas = InventoryLocation(name="CANOAS", label="Canoas", color="#fff", ordem=0, ativo=True)
    canoas_id = repo.create(canoas)
    
    # Create and save product
    product_repo = ProductRepository(db_connection)
    product = Product(nome="TestAdd", qtd_canoas=50, qtd_pf=0)
    product_id = product_repo.create(product)
    product.id = product_id
    
    # Set initial quantity
    from app.services.product_inventory_service import ProductInventoryService
    inv_service = ProductInventoryService(db_connection)
    inv_service.set_quantity(product_id, canoas_id, 50)
    
    # Add quantity
    result = service.add_qtd_canoas(product, 25)
    assert result == 75


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
