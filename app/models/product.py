"""
Entidade Product (Produto).
Representa um produto no sistema com suas regras de negócio.

v3.0.0: Inventories como campo primário
- Removidos qtd_canoas/qtd_pf (hardcoded)
- inventories: Dict[int, int] é o único campo de estoque
- Estoques dinâmicos via tabela product_inventory
"""

from dataclasses import dataclass, field
from typing import Optional, Dict


@dataclass
class Product:
    """
    Entidade Produto.
    Responsabilidade: Representar dados e comportamentos de um produto.
    
    v3.0.0 Changes:
    - Campo 'inventories' é o único campo de estoque: {location_id: quantidade}
    - Removidos qtd_canoas/qtd_pf e métodos legados
    """
    
    id: Optional[int]
    nome: str
    observacao: Optional[str] = ""
    ativo: bool = True
    inativado_em: Optional[str] = None
    motivo_inativacao: Optional[str] = None
    inventories: Dict[int, int] = field(default_factory=dict)  # {location_id: quantidade}
    
    def __post_init__(self):
        """Validações após inicialização."""
        # Normaliza nome para uppercase
        if self.nome:
            self.nome = self.nome.strip().upper()
    
    @property
    def total_stock(self) -> int:
        """
        Retorna estoque total (soma de todos os locais).
        
        Returns:
            Total de unidades em estoque
        """
        return sum(self.inventories.values())
    
    @property
    def has_stock(self) -> bool:
        """
        Verifica se produto tem estoque disponível.
        
        Returns:
            True se tem estoque, False caso contrário
        """
        return self.total_stock > 0
    
    @property
    def is_out_of_stock(self) -> bool:
        """
        Verifica se produto está sem estoque.
        
        Returns:
            True se sem estoque, False caso contrário
        """
        return self.total_stock == 0
    
    def has_stock_in_location(self, location_id: int, quantity: int) -> bool:
        """
        Verifica se há estoque suficiente em um local específico.
        
        Args:
            location_id: ID do local/estoque
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.inventories.get(location_id, 0) >= quantity
    
    def get_stock_by_location(self, location_id: int) -> int:
        """
        Retorna quantidade em estoque para um local específico.
        
        Args:
            location_id: ID do local
            
        Returns:
            Quantidade em estoque naquele local
        """
        return self.inventories.get(location_id, 0)
    
    def set_stock_by_location(self, location_id: int, quantity: int) -> None:
        """
        Define quantidade em estoque para um local específico.
        
        Args:
            location_id: ID do local
            quantity: Quantidade a definir
        """
        if quantity < 0:
            raise ValueError(f"Quantidade não pode ser negativa: {quantity}")
        self.inventories[location_id] = quantity
    
    def add_stock_by_location(self, location_id: int, quantity: int) -> None:
        """
        Adiciona quantidade em estoque para um local específico.
        
        Args:
            location_id: ID do local
            quantity: Quantidade a adicionar (positiva ou negativa)
        """
        current = self.inventories.get(location_id, 0)
        new_quantity = current + quantity
        if new_quantity < 0:
            raise ValueError(f"Quantidade não pode ser negativa após adição: {new_quantity}")
        self.inventories[location_id] = new_quantity
    
    def to_dict(self) -> dict:
        """
        Converte produto para dicionário.
        
        Returns:
            Dicionário com dados do produto
        """
        return {
            'id': self.id,
            'nome': self.nome,
            'inventories': self.inventories,
            'observacao': self.observacao,
            'ativo': self.ativo,
            'inativado_em': self.inativado_em,
            'motivo_inativacao': self.motivo_inativacao,
            'total_stock': self.total_stock,  # Computed
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Product':
        """
        Cria produto a partir de dicionário.
        
        Args:
            data: Dicionário com dados do produto
            
        Returns:
            Instância de Product
        """
        return cls(
            id=data.get('id'),
            nome=data.get('nome', ''),
            observacao=data.get('observacao', ''),
            ativo=bool(data.get('ativo', 1)),
            inativado_em=data.get('inativado_em'),
            motivo_inativacao=data.get('motivo_inativacao'),
            inventories=data.get('inventories', {}),
        )
    
    def __str__(self) -> str:
        """Representação em string do produto."""
        return (
            f"Product(id={self.id}, nome='{self.nome}', "
            f"total={self.total_stock}, locations={len(self.inventories)})"
        )
    
    def __repr__(self) -> str:
        """Representação técnica do produto."""
        return self.__str__()
