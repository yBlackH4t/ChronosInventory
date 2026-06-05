"""
Serviço para gerenciar ProductInventory (v2.0.0 white-label)

Operações de negócio para estoque de produtos por location
"""

from typing import List, Dict, Optional
import sqlite3
from app.models.inventory_location import ProductInventory
from core.database.repositories.product_inventory_repository import ProductInventoryRepository
from core.exceptions import NotFoundException, ValidationException


class ProductInventoryService:
    """Serviço de negócio para estoque de produtos."""
    
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection
        self.repository = ProductInventoryRepository(connection)
    
    def get_all_by_product(self, product_id: int) -> List[ProductInventory]:
        """
        Retorna estoque de um produto em todos os locations.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Lista de ProductInventory para esse produto
        """
        return self.repository.get_all_by_product(product_id)
    
    def get_quantity(self, product_id: int, location_id: int) -> int:
        """
        Retorna quantidade de um produto em um location.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            
        Returns:
            Quantidade em estoque (0 se não existe)
        """
        return self.repository.get_quantity(product_id, location_id)
    
    def get_total_by_product(self, product_id: int) -> int:
        """
        Retorna quantidade total de um produto (soma de todos os locations).
        
        Args:
            product_id: ID do produto
            
        Returns:
            Total de estoque
        """
        return self.repository.get_total_by_product(product_id)
    
    def get_quantity_map(self, product_id: int) -> Dict[int, int]:
        """
        Retorna mapa {location_id: quantidade} para um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Dict com {location_id: quantidade}
        """
        return self.repository.get_quantity_map(product_id)
    
    def set_quantity(
        self,
        product_id: int,
        location_id: int,
        quantity: int
    ) -> ProductInventory:
        """
        Define quantidade de um produto em um location.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            quantity: Quantidade a definir (>= 0)
            
        Returns:
            ProductInventory atualizado
            
        Raises:
            ValidationException: Se quantity negativa
        """
        if quantity < 0:
            raise ValidationException(f"Quantidade não pode ser negativa: {quantity}")
        
        if not self.repository.set_quantity(product_id, location_id, quantity):
            raise ValidationException(f"Falha ao atualizar estoque do produto {product_id}")
        
        inventory = self.repository.get_by_product_and_location(product_id, location_id)
        if not inventory:
            raise ValidationException("Falha ao recuperar ProductInventory atualizado")
        
        return inventory
    
    def add_quantity(
        self,
        product_id: int,
        location_id: int,
        quantity: int
    ) -> ProductInventory:
        """
        Adiciona quantidade a um produto em um location.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            quantity: Quantidade a adicionar (positiva ou negativa)
            
        Returns:
            ProductInventory atualizado
            
        Raises:
            ValidationException: Se resultado negativo
        """
        current = self.get_quantity(product_id, location_id)
        new_quantity = current + quantity
        
        if new_quantity < 0:
            raise ValidationException(
                f"Quantidade não pode ser negativa: "
                f"{current} + {quantity} = {new_quantity}"
            )
        
        return self.set_quantity(product_id, location_id, new_quantity)
    
    def transfer(
        self,
        product_id: int,
        from_location_id: int,
        to_location_id: int,
        quantity: int
    ) -> tuple:
        """
        Transfere quantidade de um product de um location para outro.
        
        Args:
            product_id: ID do produto
            from_location_id: ID do location origem
            to_location_id: ID do location destino
            quantity: Quantidade a transferir
            
        Returns:
            Tupla (from_inventory, to_inventory) após transferência
            
        Raises:
            ValidationException: Se não há estoque suficiente
        """
        # Validar disponibilidade
        current_quantity = self.get_quantity(product_id, from_location_id)
        if current_quantity < quantity:
            raise ValidationException(
                f"Estoque insuficiente em location {from_location_id}: "
                f"{current_quantity} < {quantity}"
            )
        
        # Executar transferência
        from_inventory = self.add_quantity(product_id, from_location_id, -quantity)
        to_inventory = self.add_quantity(product_id, to_location_id, quantity)
        
        return (from_inventory, to_inventory)
    
    def bulk_set(self, product_id: int, quantities: Dict[int, int]) -> List[ProductInventory]:
        """
        Define quantidades para múltiplas locations de uma vez.
        
        Args:
            product_id: ID do produto
            quantities: Dict {location_id: quantidade}
            
        Returns:
            Lista de ProductInventory atualizados
            
        Raises:
            ValidationException: Se alguma quantidade negativa
        """
        results = []
        
        for location_id, quantity in quantities.items():
            if quantity < 0:
                raise ValidationException(
                    f"Quantidade não pode ser negativa para location {location_id}: {quantity}"
                )
            
            inventory = self.set_quantity(product_id, location_id, quantity)
            results.append(inventory)
        
        return results
    
    def delete_by_product(self, product_id: int) -> int:
        """
        Remove todos os registros de estoque de um produto.
        
        Usado ao deletar um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Número de registros removidos
        """
        return self.repository.delete_by_product(product_id)
    
    def get_products_with_stock_at_location(self, location_id: int) -> List[int]:
        """
        Retorna IDs dos produtos que têm estoque em um location.
        
        Args:
            location_id: ID do location
            
        Returns:
            Lista de product_ids
        """
        return self.repository.get_products_with_stock_at_location(location_id)
    
    def get_total_stock_by_location(self, location_id: int) -> int:
        """
        Retorna quantidade total de produtos em um location.
        
        Args:
            location_id: ID do location
            
        Returns:
            Total de estoque no location
        """
        return self.repository.get_total_stock_by_location(location_id)
    
    def has_sufficient_stock(
        self,
        product_id: int,
        location_id: int,
        quantity: int
    ) -> bool:
        """
        Verifica se há estoque suficiente.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            quantity: Quantidade necessária
            
        Returns:
            True se há estoque suficiente
        """
        current = self.get_quantity(product_id, location_id)
        return current >= quantity
    
    def validate_transfer_possible(
        self,
        product_id: int,
        from_location_id: int,
        to_location_id: int,
        quantity: int
    ) -> bool:
        """
        Valida se transferência é possível.
        
        Args:
            product_id: ID do produto
            from_location_id: ID do location origem
            to_location_id: ID do location destino
            quantity: Quantidade a transferir
            
        Returns:
            True se possível
        """
        # Simples validação: há estoque suficiente na origem?
        return self.has_sufficient_stock(product_id, from_location_id, quantity)
