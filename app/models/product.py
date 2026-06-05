"""
Entidade Product (Produto).
Representa um produto no sistema com suas regras de negócio.

v2.0.0: Migração para white-label
Antes: qtd_canoas, qtd_pf (hardcoded)
Agora: estoques configuráveis (inventories dict)
Compatibilidade: Mantém qtd_canoas/qtd_pf para retrocompatibilidade
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List


@dataclass
class Product:
    """
    Entidade Produto.
    Responsabilidade: Representar dados e comportamentos de um produto.
    
    v2.0.0 Changes:
    - Agora suporta múltiplos estoques (não mais apenas Canoas/PF)
    - Campo 'inventories' contém dict {location_id: quantidade}
    - Mantém qtd_canoas/qtd_pf para compatibilidade com dados antigos
    """
    
    id: Optional[int]
    nome: str
    qtd_canoas: int = 0                      # Legacy: para retrocompatibilidade
    qtd_pf: int = 0                          # Legacy: para retrocompatibilidade
    observacao: Optional[str] = ""
    ativo: bool = True
    inativado_em: Optional[str] = None
    motivo_inativacao: Optional[str] = None
    # Novo em v2.0.0:
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
        
        v2.0.0: Soma agora é dinâmica baseada em 'inventories' dict
        ou qtd_canoas + qtd_pf para compatibilidade
        
        Returns:
            Total de unidades em estoque
        """
        # Preferir inventories nova se disponível
        if self.inventories:
            return sum(self.inventories.values())
        # Fallback para legacy (qtd_canoas + qtd_pf)
        return self.qtd_canoas + self.qtd_pf
    
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
        
        v2.0.0: Novo método genérico para qualquer location
        
        Args:
            location_id: ID do local/estoque
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.inventories.get(location_id, 0) >= quantity
    
    # Legacy: manter métodos antigos por compatibilidade
    def has_stock_in_canoas(self, quantity: int) -> bool:
        """
        DEPRECATED: Use has_stock_in_location() em vez disso.
        Verifica se há estoque suficiente em Canoas.
        
        Args:
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.qtd_canoas >= quantity
    
    def has_stock_in_pf(self, quantity: int) -> bool:
        """
        DEPRECATED: Use has_stock_in_location() em vez disso.
        Verifica se há estoque suficiente em Passo Fundo.
        
        Args:
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.qtd_pf >= quantity
    
    def get_stock_by_location(self, location_id: int) -> int:
        """
        Retorna quantidade em estoque para um local específico.
        
        v2.0.0: Novo método
        
        Args:
            location_id: ID do local
            
        Returns:
            Quantidade em estoque naquele local
        """
        return self.inventories.get(location_id, 0)
    
    def set_stock_by_location(self, location_id: int, quantity: int) -> None:
        """
        Define quantidade em estoque para um local específico.
        
        v2.0.0: Novo método
        
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
        
        v2.0.0: Novo método
        
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
        
        v2.0.0: Agora inclui inventories
        
        Returns:
            Dicionário com dados do produto
        """
        return {
            'id': self.id,
            'nome': self.nome,
            'qtd_canoas': self.qtd_canoas,  # Legacy
            'qtd_pf': self.qtd_pf,          # Legacy
            'inventories': self.inventories,  # Novo
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
        
        v2.0.0: Suporta tanto formato legacy quanto novo
        
        Args:
            data: Dicionário com dados do produto
            
        Returns:
            Instância de Product
        """
        product = cls(
            id=data.get('id'),
            nome=data.get('nome', ''),
            qtd_canoas=data.get('qtd_canoas', 0),  # Legacy
            qtd_pf=data.get('qtd_pf', 0),          # Legacy
            observacao=data.get('observacao', ''),
            ativo=bool(data.get('ativo', 1)),
            inativado_em=data.get('inativado_em'),
            motivo_inativacao=data.get('motivo_inativacao'),
            inventories=data.get('inventories', {}),  # Novo
        )
        return product
    
    def __str__(self) -> str:
        """Representação em string do produto."""
        if self.inventories:
            return f"Product(id={self.id}, nome='{self.nome}', total={self.total_stock}, locations={len(self.inventories)})"
        return f"Product(id={self.id}, nome='{self.nome}', canoas={self.qtd_canoas}, pf={self.qtd_pf})"
    
    def __repr__(self) -> str:
        """Representação técnica do produto."""
        return self.__str__()
