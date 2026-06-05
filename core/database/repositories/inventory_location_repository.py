"""
Repository para InventoryLocation (v2.0.0 white-label)

Gerencia CRUD de locations configuráveis
"""

import sqlite3
from typing import List, Optional, Tuple
from core.database.repositories.base_repository import BaseRepository
from app.models.inventory_location import InventoryLocation


class InventoryLocationRepository(BaseRepository):
    """Repositório para gerenciar locations de estoque."""
    
    def __init__(self, connection: sqlite3.Connection):
        super().__init__(connection)
    
    def get_all_active(self) -> List[InventoryLocation]:
        """
        Retorna todas as locations ativas, ordenadas por 'ordem'.
        
        Returns:
            Lista de InventoryLocation ativas
        """
        cursor = self.connection.execute("""
            SELECT 
                id, name, label, color, ordem, ativo, criado_em, atualizado_em
            FROM inventory_locations
            WHERE ativo = 1
            ORDER BY ordem ASC, id ASC
        """)
        
        return [self._row_to_location(row) for row in cursor.fetchall()]
    
    def get_all(self) -> List[InventoryLocation]:
        """
        Retorna todas as locations (ativas e inativas).
        
        Returns:
            Lista de todas as InventoryLocation
        """
        cursor = self.connection.execute("""
            SELECT 
                id, name, label, color, ordem, ativo, criado_em, atualizado_em
            FROM inventory_locations
            ORDER BY ordem ASC, id ASC
        """)
        
        return [self._row_to_location(row) for row in cursor.fetchall()]
    
    def get_by_id(self, location_id: int) -> Optional[InventoryLocation]:
        """
        Retorna um location pelo ID.
        
        Args:
            location_id: ID do location
            
        Returns:
            InventoryLocation ou None se não encontrado
        """
        cursor = self.connection.execute("""
            SELECT 
                id, name, label, color, ordem, ativo, criado_em, atualizado_em
            FROM inventory_locations
            WHERE id = ?
        """, (location_id,))
        
        row = cursor.fetchone()
        return self._row_to_location(row) if row else None
    
    def get_by_name(self, name: str) -> Optional[InventoryLocation]:
        """
        Retorna um location pelo name (identificador único).
        
        Args:
            name: Nome/identificador do location
            
        Returns:
            InventoryLocation ou None se não encontrado
        """
        cursor = self.connection.execute("""
            SELECT 
                id, name, label, color, ordem, ativo, criado_em, atualizado_em
            FROM inventory_locations
            WHERE name = ?
        """, (name,))
        
        row = cursor.fetchone()
        return self._row_to_location(row) if row else None
    
    def create(self, location: InventoryLocation) -> int:
        """
        Cria novo location.
        
        Args:
            location: InventoryLocation a criar (sem id)
            
        Returns:
            ID do location criado
            
        Raises:
            sqlite3.IntegrityError: Se name já existe
        """
        if not location.name or not location.label:
            raise ValueError("name e label são obrigatórios")
        
        cursor = self.connection.execute("""
            INSERT INTO inventory_locations (name, label, color, ordem, ativo, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (
            location.name,
            location.label,
            location.color,
            location.ordem,
            1 if location.ativo else 0
        ))
        
        return cursor.lastrowid
    
    def update(self, location_id: int, location: InventoryLocation) -> bool:
        """
        Atualiza um location.
        
        Args:
            location_id: ID do location a atualizar
            location: Dados atualizados
            
        Returns:
            True se atualizado, False se não encontrado
        """
        cursor = self.connection.execute("""
            UPDATE inventory_locations
            SET 
                name = ?,
                label = ?,
                color = ?,
                ordem = ?,
                ativo = ?,
                atualizado_em = datetime('now')
            WHERE id = ?
        """, (
            location.name,
            location.label,
            location.color,
            location.ordem,
            1 if location.ativo else 0,
            location_id
        ))
        
        return cursor.rowcount > 0
    
    def soft_delete(self, location_id: int) -> bool:
        """
        Desativa um location (soft delete - não remove dados).
        
        Args:
            location_id: ID do location a desativar
            
        Returns:
            True se desativado, False se não encontrado
        """
        cursor = self.connection.execute("""
            UPDATE inventory_locations
            SET ativo = 0, atualizado_em = datetime('now')
            WHERE id = ?
        """, (location_id,))
        
        return cursor.rowcount > 0
    
    def reactivate(self, location_id: int) -> bool:
        """
        Reativa um location desativado.
        
        Args:
            location_id: ID do location a reativar
            
        Returns:
            True se reativado, False se não encontrado
        """
        cursor = self.connection.execute("""
            UPDATE inventory_locations
            SET ativo = 1, atualizado_em = datetime('now')
            WHERE id = ?
        """, (location_id,))
        
        return cursor.rowcount > 0
    
    def get_default_locations(self) -> Tuple[Optional[int], Optional[int]]:
        """
        Retorna IDs dos locations padrão (Canoas, Passo Fundo).
        
        Usado para compatibilidade com código legado durante transição.
        
        Returns:
            Tupla (canoas_id, pf_id) ou (None, None) se não encontrados
        """
        locations = {}
        cursor = self.connection.execute("""
            SELECT id, name FROM inventory_locations WHERE name IN ('CANOAS', 'PF')
        """)
        
        for location_id, name in cursor.fetchall():
            locations[name] = location_id
        
        return (locations.get('CANOAS'), locations.get('PF'))
    
    def _row_to_location(self, row: Tuple) -> InventoryLocation:
        """Converte row do banco em InventoryLocation."""
        return InventoryLocation(
            id=row[0],
            name=row[1],
            label=row[2],
            color=row[3],
            ordem=row[4],
            ativo=bool(row[5]),
            criado_em=row[6],
            atualizado_em=row[7]
        )
