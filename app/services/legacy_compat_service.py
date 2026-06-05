"""
Serviço de compatibilidade com código legado (v1.x -> v2.0.0 transition)

Fornece funções para mapeamento entre:
- Valores hardcoded antigos (qtd_canoas, qtd_pf, strings de location)
- Nova estrutura configurável (product_inventory, location_ids)

Usado durante a fase de transição para permitir que código legado continue funcionando
"""

from typing import Dict, Optional, Tuple
import sqlite3
from app.models.inventory_location import ProductInventory
from app.services.inventory_location_service import InventoryLocationService
from app.services.product_inventory_service import ProductInventoryService
from app.models.product import Product


class LegacyCompatService:
    """Serviço para compatibilidade com código v1.x durante transição."""
    
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection
        self.location_service = InventoryLocationService(connection)
        self.inventory_service = ProductInventoryService(connection)
    
    def get_default_location_ids(self) -> Tuple[Optional[int], Optional[int]]:
        """
        Retorna IDs de locations padrão (Canoas e Passo Fundo).
        
        Returns:
            Tupla (canoas_id, pf_id) - podem ser None se não existirem
            
        Note:
            Estas locations são criadas pela migração v2.0.0 com IDs 1 e 2
        """
        canoas_loc, pf_loc = self.location_service.get_default_locations()
        canoas_id = canoas_loc.id if canoas_loc else None
        pf_id = pf_loc.id if pf_loc else None
        return (canoas_id, pf_id)
    
    def qtd_canoas_to_location_qty(self, product: Product, qtd: Optional[int]) -> Dict[int, int]:
        """
        Converte valor de qtd_canoas (legacy) para dict de inventory por location.
        
        Args:
            product: Produto com dados legados
            qtd: Valor de qtd_canoas
            
        Returns:
            Dict {location_id: quantidade} com dados já em new format
        """
        if not qtd:
            qtd = 0
        
        canoas_id, _ = self.get_default_location_ids()
        if not canoas_id:
            return {}
        
        return {canoas_id: qtd}
    
    def qtd_pf_to_location_qty(self, product: Product, qtd: Optional[int]) -> Dict[int, int]:
        """
        Converte valor de qtd_pf (legacy) para dict de inventory por location.
        
        Args:
            product: Produto com dados legados
            qtd: Valor de qtd_pf
            
        Returns:
            Dict {location_id: quantidade} com dados já em new format
        """
        if not qtd:
            qtd = 0
        
        _, pf_id = self.get_default_location_ids()
        if not pf_id:
            return {}
        
        return {pf_id: qtd}
    
    def product_to_inventories_dict(self, product: Product) -> Dict[int, int]:
        """
        Converte campos legados de produto para dict de inventories.
        
        Usado quando código legado ainda lê qtd_canoas/qtd_pf
        
        Args:
            product: Produto (pode ter dados legados ou novo format)
            
        Returns:
            Dict {location_id: quantidade} consolidado
        """
        # Se já tem inventories dict, usar direto
        if hasattr(product, 'inventories') and product.inventories:
            return product.inventories
        
        # Caso contrário, construir a partir dos campos legados
        result = {}
        
        # Adicionar qtd_canoas
        if hasattr(product, 'qtd_canoas') and product.qtd_canoas:
            canoas_dict = self.qtd_canoas_to_location_qty(product, product.qtd_canoas)
            result.update(canoas_dict)
        
        # Adicionar qtd_pf
        if hasattr(product, 'qtd_pf') and product.qtd_pf:
            pf_dict = self.qtd_pf_to_location_qty(product, product.qtd_pf)
            result.update(pf_dict)
        
        return result
    
    def location_string_to_id(self, location_name: str) -> Optional[int]:
        """
        Converte nome de location (string legado) para ID.
        
        Args:
            location_name: Ex: "CANOAS", "PASSO_FUNDO", "Canoas"
            
        Returns:
            ID do location ou None se não encontrado
        """
        location_name_normalized = location_name.upper().strip()
        
        # Mapeamento de aliases
        aliases = {
            "CANOAS": "CANOAS",
            "PASSO_FUNDO": "PF",
            "PF": "PF",
            "PASSO FUNDO": "PF",
        }
        
        normalized = aliases.get(location_name_normalized, location_name_normalized)
        
        # Buscar location por name
        location = self.location_service.get_by_name(normalized)
        return location.id if location else None
    
    def location_id_to_legacy_string(self, location_id: int) -> Optional[str]:
        """
        Converte ID de location de volta para string legada.
        
        Inverso de location_string_to_id()
        
        Args:
            location_id: ID do location
            
        Returns:
            Nome legado (ex: "CANOAS", "PF") ou None
        """
        try:
            location = self.location_service.get_by_id(location_id)
            return location.name if location else None
        except:
            return None
    
    def get_qtd_canoas_from_product(self, product: Product) -> int:
        """
        Recupera quantidade em Canoas de um produto.
        
        Compatibilidade com código que lê qtd_canoas.
        
        Args:
            product: Produto (legacy ou new format)
            
        Returns:
            Quantidade em Canoas (0 se não existe ou location não configurado)
        """
        # Se tem campo legado, usar
        if hasattr(product, 'qtd_canoas') and product.qtd_canoas:
            return product.qtd_canoas
        
        # Caso contrário, buscar de novo format
        canoas_id, _ = self.get_default_location_ids()
        if not canoas_id:
            return 0
        
        return self.inventory_service.get_quantity(product.id or 0, canoas_id)
    
    def get_qtd_pf_from_product(self, product: Product) -> int:
        """
        Recupera quantidade em PF de um produto.
        
        Compatibilidade com código que lê qtd_pf.
        
        Args:
            product: Produto (legacy ou new format)
            
        Returns:
            Quantidade em PF (0 se não existe ou location não configurado)
        """
        # Se tem campo legado, usar
        if hasattr(product, 'qtd_pf') and product.qtd_pf:
            return product.qtd_pf
        
        # Caso contrário, buscar de novo format
        _, pf_id = self.get_default_location_ids()
        if not pf_id:
            return 0
        
        return self.inventory_service.get_quantity(product.id or 0, pf_id)
    
    def set_qtd_canoas(self, product: Product, quantity: int) -> None:
        """
        Define quantidade em Canoas.
        
        Compatibilidade com código legado que define qtd_canoas.
        
        Args:
            product: Produto
            quantity: Quantidade a definir
        """
        canoas_id, _ = self.get_default_location_ids()
        if not canoas_id or not product.id:
            return
        
        self.inventory_service.set_quantity(product.id, canoas_id, quantity)
    
    def set_qtd_pf(self, product: Product, quantity: int) -> None:
        """
        Define quantidade em PF.
        
        Compatibilidade com código legado que define qtd_pf.
        
        Args:
            product: Produto
            quantity: Quantidade a definir
        """
        _, pf_id = self.get_default_location_ids()
        if not pf_id or not product.id:
            return
        
        self.inventory_service.set_quantity(product.id, pf_id, quantity)
    
    def add_qtd_canoas(self, product: Product, quantity: int) -> int:
        """
        Adiciona quantidade em Canoas.
        
        Args:
            product: Produto
            quantity: Quantidade a adicionar (positiva ou negativa)
            
        Returns:
            Nova quantidade total em Canoas
        """
        canoas_id, _ = self.get_default_location_ids()
        if not canoas_id or not product.id:
            return 0
        
        self.inventory_service.add_quantity(product.id, canoas_id, quantity)
        return self.inventory_service.get_quantity(product.id, canoas_id)
    
    def add_qtd_pf(self, product: Product, quantity: int) -> int:
        """
        Adiciona quantidade em PF.
        
        Args:
            product: Produto
            quantity: Quantidade a adicionar (positiva ou negativa)
            
        Returns:
            Nova quantidade total em PF
        """
        _, pf_id = self.get_default_location_ids()
        if not pf_id or not product.id:
            return 0
        
        self.inventory_service.add_quantity(product.id, pf_id, quantity)
        return self.inventory_service.get_quantity(product.id, pf_id)
