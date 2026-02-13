"""
Entidade StockMovement (Movimentação de Estoque).
Representa uma movimentação de estoque no sistema.
"""

from dataclasses import dataclass
from typing import Optional
from core.constants import OPERATION_TYPES, STOCK_LOCATIONS


@dataclass
class StockMovement:
    """
    Entidade Movimentação de Estoque.
    Responsabilidade: Representar uma operação de movimentação.
    """
    
    operation_type: str  # ENTRADA, SAIDA, TRANSFERENCIA
    product_id: int
    product_name: str
    quantity: int
    location: Optional[str] = None  # CANOAS ou PASSO_FUNDO
    transfer_direction: Optional[str] = None  # Para transferências
    observation: str = ""
    
    def __post_init__(self):
        """Validações após inicialização."""
        # Normaliza tipo de operação
        self.operation_type = self.operation_type.upper()
        
        # Normaliza nome do produto
        if self.product_name:
            self.product_name = self.product_name.strip().upper()
    
    @property
    def is_entry(self) -> bool:
        """Verifica se é uma entrada."""
        return self.operation_type == "ENTRADA"
    
    @property
    def is_exit(self) -> bool:
        """Verifica se é uma saída."""
        return self.operation_type == "SAIDA"
    
    @property
    def is_transfer(self) -> bool:
        """Verifica se é uma transferência."""
        return self.operation_type in ["TRANSF", "TRANSFERENCIA"]
    
    @property
    def is_canoas(self) -> bool:
        """Verifica se operação é em Canoas."""
        return self.location == STOCK_LOCATIONS["CANOAS"]
    
    @property
    def is_pf(self) -> bool:
        """Verifica se operação é em Passo Fundo."""
        return self.location == STOCK_LOCATIONS["PASSO_FUNDO"]
    
    def get_delta_canoas(self) -> int:
        """
        Calcula variação de estoque em Canoas.
        
        Returns:
            Variação (positivo para entrada, negativo para saída)
        """
        if self.is_transfer:
            # Aceita tanto "C→P" quanto "Canoas → Passo Fundo"
            if "C→P" in str(self.transfer_direction) or "Canoas → Passo Fundo" in str(self.transfer_direction):
                return -self.quantity
            elif "P→C" in str(self.transfer_direction) or "Passo Fundo → Canoas" in str(self.transfer_direction):
                return self.quantity
            return 0
        
        if self.is_canoas:
            return self.quantity if self.is_entry else -self.quantity
        
        return 0
    
    def get_delta_pf(self) -> int:
        """
        Calcula variação de estoque em Passo Fundo.
        
        Returns:
            Variação (positivo para entrada, negativo para saída)
        """
        if self.is_transfer:
            # Aceita tanto "C→P" quanto "Canoas → Passo Fundo"
            if "C→P" in str(self.transfer_direction) or "Canoas → Passo Fundo" in str(self.transfer_direction):
                return self.quantity
            elif "P→C" in str(self.transfer_direction) or "Passo Fundo → Canoas" in str(self.transfer_direction):
                return -self.quantity
            return 0
        
        if self.is_pf:
            return self.quantity if self.is_entry else -self.quantity
        
        return 0
    
    def get_log_observation(self) -> str:
        """
        Gera observação para o log.
        
        Returns:
            String de observação formatada
        """
        if self.is_transfer:
            return self.transfer_direction or "Transferência"
        
        operation_label = "Entrada" if self.is_entry else "Saída"
        return f"{operation_label} em {self.location}"
    
    def to_dict(self) -> dict:
        """
        Converte movimentação para dicionário.
        
        Returns:
            Dicionário com dados da movimentação
        """
        return {
            'operation_type': self.operation_type,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'quantity': self.quantity,
            'location': self.location,
            'transfer_direction': self.transfer_direction,
            'observation': self.observation
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'StockMovement':
        """
        Cria movimentação a partir de dicionário.
        
        Args:
            data: Dicionário com dados da movimentação
            
        Returns:
            Instância de StockMovement
        """
        return cls(
            operation_type=data.get('operation_type', ''),
            product_id=data.get('product_id', 0),
            product_name=data.get('product_name', ''),
            quantity=data.get('quantity', 0),
            location=data.get('location'),
            transfer_direction=data.get('transfer_direction'),
            observation=data.get('observation', '')
        )
    
    def __str__(self) -> str:
        """Representação em string da movimentação."""
        return f"StockMovement({self.operation_type}, {self.product_name}, qty={self.quantity})"
    
    def __repr__(self) -> str:
        """Representação técnica da movimentação."""
        return self.__str__()
