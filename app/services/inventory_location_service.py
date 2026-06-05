"""
Serviço para gerenciar InventoryLocations (v2.0.0 white-label)

Operações de negócio para locations configuráveis
"""

from typing import List, Optional, Tuple
import sqlite3
from app.models.inventory_location import InventoryLocation
from core.database.repositories.inventory_location_repository import InventoryLocationRepository
from core.exceptions import DuplicateException, NotFoundException


class InventoryLocationService:
    """Serviço de negócio para locations de estoque."""
    
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection
        self.repository = InventoryLocationRepository(connection)
    
    def get_all_active(self) -> List[InventoryLocation]:
        """
        Retorna todas as locations ativas.
        
        Returns:
            Lista de locations ativas
        """
        return self.repository.get_all_active()
    
    def get_all(self) -> List[InventoryLocation]:
        """Retorna todas as locations (ativas e inativas)."""
        return self.repository.get_all()
    
    def get_by_id(self, location_id: int) -> InventoryLocation:
        """
        Retorna um location pelo ID.
        
        Args:
            location_id: ID do location
            
        Returns:
            InventoryLocation
            
        Raises:
            NotFoundException: Se location não existe
        """
        location = self.repository.get_by_id(location_id)
        if not location:
            raise NotFoundException(f"Location com ID {location_id} não encontrado")
        return location
    
    def get_by_name(self, name: str) -> Optional[InventoryLocation]:
        """Retorna um location pelo name (identificador único)."""
        return self.repository.get_by_name(name)
    
    def create(self, name: str, label: str, color: str = "#808080", ordem: int = 0) -> InventoryLocation:
        """
        Cria novo location.
        
        Args:
            name: Identificador único (ex: "CANOAS", "ALMOXARIFADO")
            label: Nome para display (ex: "Canoas", "Almoxarifado Central")
            color: Cor para UI (hex format, ex: "#1f538d")
            ordem: Ordem de exibição
            
        Returns:
            InventoryLocation criado com ID
            
        Raises:
            DuplicateException: Se name já existe
            ValueError: Se name ou label vazios
        """
        # Validações
        name = name.upper().strip()
        label = label.strip()
        
        if not name or not label:
            raise ValueError("name e label são obrigatórios e não podem ser vazios")
        
        # Verificar duplicata
        existing = self.repository.get_by_name(name)
        if existing:
            raise DuplicateException(f"Location com name '{name}' já existe")
        
        # Validar formato de cor
        if color and not self._is_valid_hex_color(color):
            raise ValueError(f"Cor inválida (esperado formato hex): {color}")
        
        # Criar
        location = InventoryLocation(
            name=name,
            label=label,
            color=color,
            ordem=ordem,
            ativo=True
        )
        
        location_id = self.repository.create(location)
        location.id = location_id
        return location
    
    def update(
        self,
        location_id: int,
        label: Optional[str] = None,
        color: Optional[str] = None,
        ordem: Optional[int] = None
    ) -> InventoryLocation:
        """
        Atualiza um location.
        
        Note: 'name' não pode ser alterado (é a chave única)
        
        Args:
            location_id: ID do location
            label: Novo label (opcional)
            color: Nova cor (opcional)
            ordem: Nova ordem (opcional)
            
        Returns:
            InventoryLocation atualizado
            
        Raises:
            NotFoundException: Se location não existe
        """
        location = self.get_by_id(location_id)  # Valida existência
        
        # Aplicar mudanças
        if label is not None:
            location.label = label.strip()
        
        if color is not None:
            if not self._is_valid_hex_color(color):
                raise ValueError(f"Cor inválida (esperado formato hex): {color}")
            location.color = color
        
        if ordem is not None:
            if ordem < 0:
                raise ValueError("ordem não pode ser negativa")
            location.ordem = ordem
        
        # Persistir
        if not self.repository.update(location_id, location):
            raise NotFoundException(f"Falha ao atualizar location {location_id}")
        
        return location
    
    def soft_delete(self, location_id: int) -> InventoryLocation:
        """
        Desativa um location (soft delete).
        
        Dados são preservados, apenas marcado como inativo.
        
        Args:
            location_id: ID do location a desativar
            
        Returns:
            InventoryLocation desativado
            
        Raises:
            NotFoundException: Se location não existe
        """
        location = self.get_by_id(location_id)  # Valida existência
        
        if not self.repository.soft_delete(location_id):
            raise NotFoundException(f"Falha ao desativar location {location_id}")
        
        location.ativo = False
        return location
    
    def reactivate(self, location_id: int) -> InventoryLocation:
        """
        Reativa um location desativado.
        
        Args:
            location_id: ID do location a reativar
            
        Returns:
            InventoryLocation reativado
            
        Raises:
            NotFoundException: Se location não existe
        """
        location = self.get_by_id(location_id)
        
        if not self.repository.reactivate(location_id):
            raise NotFoundException(f"Falha ao reativar location {location_id}")
        
        location.ativo = True
        return location
    
    def get_default_locations(self) -> Tuple[Optional[InventoryLocation], Optional[InventoryLocation]]:
        """
        Retorna locations padrão (Canoas e Passo Fundo).
        
        Usado para compatibilidade com código legado durante transição.
        
        Returns:
            Tupla (canoas_location, pf_location) onde qualquer um pode ser None
        """
        canoas_id, pf_id = self.repository.get_default_locations()
        
        canoas = self.repository.get_by_id(canoas_id) if canoas_id else None
        pf = self.repository.get_by_id(pf_id) if pf_id else None
        
        return (canoas, pf)
    
    def count_active(self) -> int:
        """Retorna total de locations ativas."""
        return len(self.get_all_active())
    
    @staticmethod
    def _is_valid_hex_color(color: str) -> bool:
        """Valida se string é cor hex válida (ex: #1f538d)."""
        if not color.startswith('#'):
            return False
        
        hex_part = color[1:]
        if len(hex_part) not in (3, 6):
            return False
        
        try:
            int(hex_part, 16)
            return True
        except ValueError:
            return False
