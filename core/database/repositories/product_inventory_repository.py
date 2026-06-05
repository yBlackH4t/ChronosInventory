"""
Repository para ProductInventory (v2.0.0 white-label)

Gerencia relação M:N entre produtos e locations
Substitui a lógica de qtd_canoas/qtd_pf
"""

import sqlite3
from typing import List, Optional, Dict, Tuple
from core.database.repositories.base_repository import BaseRepository
from app.models.inventory_location import ProductInventory


class ProductInventoryRepository(BaseRepository):
    """Repositório para gerenciar estoque de produtos por location."""
    
    def __init__(self, connection: sqlite3.Connection):
        super().__init__(connection)
    
    def get_all_by_product(self, product_id: int) -> List[ProductInventory]:
        """
        Retorna todo estoque de um produto (todas as locations).
        
        Args:
            product_id: ID do produto
            
        Returns:
            Lista de ProductInventory para esse produto
        """
        cursor = self.connection.execute("""
            SELECT id, produto_id, inventory_location_id, quantidade, atualizado_em
            FROM product_inventory
            WHERE produto_id = ?
            ORDER BY inventory_location_id ASC
        """, (product_id,))
        
        return [self._row_to_product_inventory(row) for row in cursor.fetchall()]
    
    def get_by_product_and_location(
        self, 
        product_id: int, 
        location_id: int
    ) -> Optional[ProductInventory]:
        """
        Retorna quantidade de um produto em um location específico.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            
        Returns:
            ProductInventory ou None se não encontrado
        """
        cursor = self.connection.execute("""
            SELECT id, produto_id, inventory_location_id, quantidade, atualizado_em
            FROM product_inventory
            WHERE produto_id = ? AND inventory_location_id = ?
        """, (product_id, location_id))
        
        row = cursor.fetchone()
        return self._row_to_product_inventory(row) if row else None
    
    def get_quantity(self, product_id: int, location_id: int) -> int:
        """
        Retorna quantidade disponível de um produto em um location.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            
        Returns:
            Quantidade em estoque (0 se não existe registro)
        """
        cursor = self.connection.execute("""
            SELECT quantidade FROM product_inventory
            WHERE produto_id = ? AND inventory_location_id = ?
        """, (product_id, location_id))
        
        row = cursor.fetchone()
        return row[0] if row else 0
    
    def get_total_by_product(self, product_id: int) -> int:
        """
        Retorna quantidade total de um produto (soma de todos os locations).
        
        Args:
            product_id: ID do produto
            
        Returns:
            Total de estoque
        """
        cursor = self.connection.execute("""
            SELECT SUM(quantidade) FROM product_inventory
            WHERE produto_id = ?
        """, (product_id,))
        
        row = cursor.fetchone()
        return row[0] or 0
    
    def get_quantity_map(self, product_id: int) -> Dict[int, int]:
        """
        Retorna mapa de {location_id: quantidade} para um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Dict com {location_id: quantidade}
        """
        cursor = self.connection.execute("""
            SELECT inventory_location_id, quantidade
            FROM product_inventory
            WHERE produto_id = ?
        """, (product_id,))
        
        return {row[0]: row[1] for row in cursor.fetchall()}
    
    def set_quantity(
        self, 
        product_id: int, 
        location_id: int, 
        quantity: int
    ) -> bool:
        """
        Define quantidade de um produto em um location.
        
        Cria novo registro se não existe, ou atualiza se existe.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            quantity: Quantidade a definir
            
        Returns:
            True se foi bem-sucedido
        """
        if quantity < 0:
            raise ValueError(f"Quantidade não pode ser negativa: {quantity}")
        
        # Tenta atualizar primeiro
        cursor = self.connection.execute("""
            UPDATE product_inventory
            SET quantidade = ?, atualizado_em = datetime('now')
            WHERE produto_id = ? AND inventory_location_id = ?
        """, (quantity, product_id, location_id))
        
        if cursor.rowcount > 0:
            return True
        
        # Se não atualizou, insere novo
        try:
            self.connection.execute("""
                INSERT INTO product_inventory 
                (produto_id, inventory_location_id, quantidade, atualizado_em)
                VALUES (?, ?, ?, datetime('now'))
            """, (product_id, location_id, quantity))
            return True
        except sqlite3.IntegrityError:
            # Pode ter sido inserido por outra thread, tenta atualizar novamente
            cursor = self.connection.execute("""
                UPDATE product_inventory
                SET quantidade = ?, atualizado_em = datetime('now')
                WHERE produto_id = ? AND inventory_location_id = ?
            """, (quantity, product_id, location_id))
            return cursor.rowcount > 0
    
    def add_quantity(
        self,
        product_id: int,
        location_id: int,
        quantity: int
    ) -> bool:
        """
        Adiciona quantidade a um produto em um location.
        
        Args:
            product_id: ID do produto
            location_id: ID do location
            quantity: Quantidade a adicionar (positiva ou negativa)
            
        Returns:
            True se bem-sucedido
        """
        current = self.get_quantity(product_id, location_id)
        new_quantity = current + quantity
        
        if new_quantity < 0:
            raise ValueError(
                f"Quantidade não pode ser negativa: "
                f"{current} + {quantity} = {new_quantity}"
            )
        
        return self.set_quantity(product_id, location_id, new_quantity)
    
    def delete_by_product(self, product_id: int) -> int:
        """
        Remove todos os registros de estoque de um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Número de registros removidos
        """
        cursor = self.connection.execute("""
            DELETE FROM product_inventory
            WHERE produto_id = ?
        """, (product_id,))
        
        return cursor.rowcount
    
    def delete_by_location(self, location_id: int) -> int:
        """
        Remove todos os registros de um location.
        
        Usado ao desativar uma location (rare operation).
        
        Args:
            location_id: ID do location
            
        Returns:
            Número de registros removidos
        """
        cursor = self.connection.execute("""
            DELETE FROM product_inventory
            WHERE inventory_location_id = ?
        """, (location_id,))
        
        return cursor.rowcount
    
    def get_products_with_stock_at_location(self, location_id: int) -> List[int]:
        """
        Retorna lista de IDs de produtos que têm estoque em um location.
        
        Args:
            location_id: ID do location
            
        Returns:
            Lista de product_ids
        """
        cursor = self.connection.execute("""
            SELECT DISTINCT produto_id
            FROM product_inventory
            WHERE inventory_location_id = ? AND quantidade > 0
            ORDER BY produto_id
        """, (location_id,))
        
        return [row[0] for row in cursor.fetchall()]
    
    def get_total_stock_by_location(self, location_id: int) -> int:
        """
        Retorna quantidade total de produtos em um location.
        
        Args:
            location_id: ID do location
            
        Returns:
            Total de estoque no location
        """
        cursor = self.connection.execute("""
            SELECT SUM(quantidade) FROM product_inventory
            WHERE inventory_location_id = ?
        """, (location_id,))
        
        row = cursor.fetchone()
        return row[0] or 0
    
    def _row_to_product_inventory(self, row: Tuple) -> ProductInventory:
        """Converte row do banco em ProductInventory."""
        return ProductInventory(
            id=row[0],
            produto_id=row[1],
            inventory_location_id=row[2],
            quantidade=row[3],
            atualizado_em=row[4]
        )
