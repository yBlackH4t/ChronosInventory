"""
Entidade Product (Produto).
Representa um produto no sistema com suas regras de negócio.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Product:
    """
    Entidade Produto.
    Responsabilidade: Representar dados e comportamentos de um produto.
    """
    
    id: Optional[int]
    nome: str
    qtd_canoas: int
    qtd_pf: int
    observacao: Optional[str] = ""
    ativo: bool = True
    inativado_em: Optional[str] = None
    motivo_inativacao: Optional[str] = None
    
    def __post_init__(self):
        """Validações após inicialização."""
        # Normaliza nome para uppercase
        if self.nome:
            self.nome = self.nome.strip().upper()
    
    @property
    def total_stock(self) -> int:
        """
        Retorna estoque total (soma de ambos os locais).
        
        Returns:
            Total de unidades em estoque
        """
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
    
    def has_stock_in_canoas(self, quantity: int) -> bool:
        """
        Verifica se há estoque suficiente em Canoas.
        
        Args:
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.qtd_canoas >= quantity
    
    def has_stock_in_pf(self, quantity: int) -> bool:
        """
        Verifica se há estoque suficiente em Passo Fundo.
        
        Args:
            quantity: Quantidade desejada
            
        Returns:
            True se há estoque suficiente, False caso contrário
        """
        return self.qtd_pf >= quantity
    
    def to_dict(self) -> dict:
        """
        Converte produto para dicionário.
        
        Returns:
            Dicionário com dados do produto
        """
        return {
            'id': self.id,
            'nome': self.nome,
            'qtd_canoas': self.qtd_canoas,
            'qtd_pf': self.qtd_pf,
            'observacao': self.observacao,
            'ativo': self.ativo,
            'inativado_em': self.inativado_em,
            'motivo_inativacao': self.motivo_inativacao,
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
            qtd_canoas=data.get('qtd_canoas', 0),
            qtd_pf=data.get('qtd_pf', 0),
            observacao=data.get('observacao', ''),
            ativo=bool(data.get('ativo', 1)),
            inativado_em=data.get('inativado_em'),
            motivo_inativacao=data.get('motivo_inativacao'),
        )
    
    def __str__(self) -> str:
        """Representação em string do produto."""
        return f"Product(id={self.id}, nome='{self.nome}', canoas={self.qtd_canoas}, pf={self.qtd_pf})"
    
    def __repr__(self) -> str:
        """Representação técnica do produto."""
        return self.__str__()
