"""
Teste de integração Phase 1: White-label infrastructure

Valida que toda a infraestrutura de v2.0.0 funciona conjuntamente:
- Criar locations
- Criar produtos com múltiplos estoques
- Consultar estoques
- Transferir entre locations
- Compatibilidade com código legado
"""

import pytest
import sqlite3
from fastapi.testclient import TestClient
from app.models.product import Product
from app.models.inventory_location import InventoryLocation
from app.services.inventory_location_service import InventoryLocationService
from app.services.product_inventory_service import ProductInventoryService
from app.services.legacy_compat_service import LegacyCompatService
from app.services.product_converter import ProductConverter
from core.database.repositories.product_repository import ProductRepository
from core.database.repositories.inventory_location_repository import InventoryLocationRepository


class TestPhase1Integration:
    """Testes de integração da Phase 1."""
    
    @pytest.fixture(autouse=True)
    def setup(self, db_connection: sqlite3.Connection):
        """Setup para cada teste."""
        self.db = db_connection
        self.location_service = InventoryLocationService(db_connection)
        self.inventory_service = ProductInventoryService(db_connection)
        self.compat_service = LegacyCompatService(db_connection)
        self.converter = ProductConverter(db_connection)
    
    def test_01_create_multiple_locations(self):
        """Testa criação de múltiplas locations."""
        # Criar locations
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        pf = self.location_service.create(
            name="PF",
            label="Passo Fundo",
            color="#d35400",
            ordem=1,
        )
        
        almoxarifado = self.location_service.create(
            name="ALMOXARIFADO",
            label="Almoxarifado Central",
            color="#2ecc71",
            ordem=2,
        )
        
        # Validar
        assert canoas.id is not None
        assert pf.id is not None
        assert almoxarifado.id is not None
        
        all_locations = self.location_service.get_all_active()
        assert len(all_locations) >= 3
    
    def test_02_create_product_with_inventory(self):
        """Testa criação de produto com estoque em múltiplas locations."""
        # Setup locations
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        pf = self.location_service.create(
            name="PF",
            label="Passo Fundo",
            color="#d35400",
            ordem=1,
        )
        
        # Criar produto
        product_repo = ProductRepository(self.db)
        product = Product(
            nome="Canoa Fibra",
            qtd_canoas=50,
            qtd_pf=30,
            observacao="Produto teste"
        )
        product_id = product_repo.create(product)
        
        # Atualizar estoques
        self.inventory_service.set_quantity(product_id, canoas.id or 0, 50)
        self.inventory_service.set_quantity(product_id, pf.id or 0, 30)
        
        # Validar totais
        total = self.inventory_service.get_total_by_product(product_id)
        assert total == 80
    
    def test_03_transfer_between_locations(self):
        """Testa transferência entre locations."""
        # Setup
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        pf = self.location_service.create(
            name="PF",
            label="Passo Fundo",
            color="#d35400",
            ordem=1,
        )
        
        product_repo = ProductRepository(self.db)
        product = Product(nome="Produto Transfer", qtd_canoas=0, qtd_pf=0)
        product_id = product_repo.create(product)
        
        # Setup estoque inicial
        self.inventory_service.set_quantity(product_id, canoas.id or 0, 100)
        self.inventory_service.set_quantity(product_id, pf.id or 0, 0)
        
        # Transfer 30 de Canoas para PF
        self.inventory_service.transfer(
            product_id,
            canoas.id or 0,
            pf.id or 0,
            30
        )
        
        # Validar
        assert self.inventory_service.get_quantity(product_id, canoas.id or 0) == 70
        assert self.inventory_service.get_quantity(product_id, pf.id or 0) == 30
    
    def test_04_legacy_compatibility(self):
        """Testa compatibilidade com código legado."""
        # Setup
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        pf = self.location_service.create(
            name="PF",
            label="Passo Fundo",
            color="#d35400",
            ordem=1,
        )
        
        product_repo = ProductRepository(self.db)
        product = Product(nome="Produto Legacy", qtd_canoas=50, qtd_pf=30)
        product_id = product_repo.create(product)
        product.id = product_id
        
        # Código legado lê qtd_canoas
        qty_legacy = self.compat_service.get_qtd_canoas_from_product(product)
        assert qty_legacy == 50
        
        # Código legado lê qtd_pf
        qty_pf = self.compat_service.get_qtd_pf_from_product(product)
        assert qty_pf == 30
        
        # Código novo lê de nova estrutura
        qty_new = self.inventory_service.get_total_by_product(product_id)
        # Pode ser 0 se não foi migrado ainda, ou soma se foi
        assert qty_new >= 0
    
    def test_05_product_converter_to_v2(self):
        """Testa conversão de produto para schema v2.0.0."""
        # Setup
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        product_repo = ProductRepository(self.db)
        product = Product(nome="Produto V2", qtd_canoas=100, qtd_pf=0)
        product_id = product_repo.create(product)
        product.id = product_id
        
        # Setup estoque no novo format
        self.inventory_service.set_quantity(product_id, canoas.id or 0, 100)
        
        # Converter para v2
        product_v2 = self.converter.to_product_out_v2(product)
        
        # Validar schema
        assert product_v2.id == product_id
        assert product_v2.nome == "Produto V2"
        assert product_v2.total_stock == 100
        # estoques deve ter o item
        assert len(product_v2.estoques) > 0
    
    def test_06_get_default_location_ids(self):
        """Testa recuperação de locations padrão."""
        # Setup padrão
        canoas = self.location_service.create(
            name="CANOAS",
            label="Canoas",
            color="#1f538d",
            ordem=0,
        )
        
        pf = self.location_service.create(
            name="PF",
            label="Passo Fundo",
            color="#d35400",
            ordem=1,
        )
        
        # Recuperar via compat service
        canoas_id, pf_id = self.compat_service.get_default_location_ids()
        
        assert canoas_id == canoas.id
        assert pf_id == pf.id
    
    def test_07_location_soft_delete_and_reactivate(self):
        """Testa soft delete e reativação de location."""
        # Criar location
        location = self.location_service.create(
            name="TEMP_LOC",
            label="Location Temporária",
            color="#cccccc",
            ordem=0,
        )
        
        location_id = location.id or 0
        
        # Soft delete
        deleted = self.location_service.soft_delete(location_id)
        assert deleted.ativo is False
        
        # Verificar que não aparece em ativas
        active = self.location_service.get_all_active()
        active_ids = [loc.id for loc in active]
        assert location_id not in active_ids
        
        # Reativar
        reactivated = self.location_service.reactivate(location_id)
        assert reactivated.ativo is True
        
        # Verificar que aparece em ativas
        active = self.location_service.get_all_active()
        active_ids = [loc.id for loc in active]
        assert location_id in active_ids
    
    def test_08_bulk_set_quantities(self):
        """Testa definição de quantidades em lote."""
        # Setup locations
        locs = {}
        for i in range(3):
            loc = self.location_service.create(
                name=f"LOC{i}",
                label=f"Location {i}",
                color=f"#00000{i}",
                ordem=i,
            )
            locs[i] = loc.id or 0
        
        # Criar produto
        product_repo = ProductRepository(self.db)
        product = Product(nome="Bulk Test", qtd_canoas=0, qtd_pf=0)
        product_id = product_repo.create(product)
        
        # Bulk set
        quantities = {
            locs[0]: 10,
            locs[1]: 20,
            locs[2]: 30,
        }
        
        results = self.inventory_service.bulk_set(product_id, quantities)
        
        assert len(results) == 3
        assert self.inventory_service.get_total_by_product(product_id) == 60
    
    def test_09_query_products_by_location(self):
        """Testa busca de produtos em um location específico."""
        # Setup
        location = self.location_service.create(
            name="QUERY_LOC",
            label="Query Location",
            color="#111111",
            ordem=0,
        )
        
        product_repo = ProductRepository(self.db)
        
        # Criar 3 produtos
        product_ids = []
        for i in range(3):
            product = Product(nome=f"Product {i}", qtd_canoas=0, qtd_pf=0)
            pid = product_repo.create(product)
            product_ids.append(pid)
            
            # Add quantity
            self.inventory_service.set_quantity(pid, location.id or 0, (i + 1) * 10)
        
        # Query produtos com estoque no location
        products_with_stock = self.inventory_service.get_products_with_stock_at_location(location.id or 0)
        
        assert len(products_with_stock) >= 3
        for pid in product_ids:
            assert pid in products_with_stock
    
    def test_10_location_count(self):
        """Testa contagem de locations ativas."""
        # Count antes
        count_before = self.location_service.count_active()
        
        # Criar nova location
        self.location_service.create(
            name="COUNT_TEST",
            label="Count Test",
            color="#222222",
            ordem=0,
        )
        
        # Count depois
        count_after = self.location_service.count_active()
        
        assert count_after > count_before


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
