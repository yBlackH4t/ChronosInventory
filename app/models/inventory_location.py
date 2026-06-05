"""
Novos modelos para sistema White-Label v2.0.0

Modelos para gerenciar estoques configuráveis dinamicamente
(antes: hardcoded Canoas/PF, agora: totalmente dinâmico)
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict


@dataclass
class InventoryLocation:
    """
    Representa um local/estoque configurável.
    
    Antes (hardcoded):
      - Canoas
      - Passo Fundo
      
    Agora (dinâmico):
      - Usuário pode criar quantos quiser com nomes customizados
    """
    
    id: Optional[int] = None
    name: str = ""                    # Identificador único: "CANOAS", "ALMOXARIFADO", etc
    label: str = ""                   # Display: "Canoas", "Almoxarifado Central", etc
    color: str = "#808080"            # Cor para UI: "#1f538d", "#e74c3c", etc
    ordem: int = 0                    # Ordem de exibição
    ativo: bool = True                # Está ativo?
    criado_em: Optional[str] = None   # Data de criação
    atualizado_em: Optional[str] = None  # Última atualização
    
    def to_dict(self) -> dict:
        """Converte para dicionário."""
        return {
            'id': self.id,
            'name': self.name,
            'label': self.label,
            'color': self.color,
            'ordem': self.ordem,
            'ativo': self.ativo,
            'criado_em': self.criado_em,
            'atualizado_em': self.atualizado_em,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'InventoryLocation':
        """Cria a partir de dicionário."""
        return cls(
            id=data.get('id'),
            name=data.get('name', ''),
            label=data.get('label', ''),
            color=data.get('color', '#808080'),
            ordem=data.get('ordem', 0),
            ativo=bool(data.get('ativo', 1)),
            criado_em=data.get('criado_em'),
            atualizado_em=data.get('atualizado_em'),
        )
    
    def __str__(self) -> str:
        return f"Location(id={self.id}, name='{self.name}', label='{self.label}')"


@dataclass
class ProductInventory:
    """
    Relação M:N entre Produto e Location.
    
    Substitui as colunas hardcoded qtd_canoas e qtd_pf.
    
    Exemplo:
      Produto "Canoa Fibra" pode ter:
        - 50 unidades em "Canoas"
        - 30 unidades em "Passo Fundo"
        - 20 unidades em "Novo Estoque"
        
      Totalizando 100 unidades (soma dinâmica)
    """
    
    id: Optional[int] = None
    produto_id: int = 0
    inventory_location_id: int = 0
    quantidade: int = 0
    atualizado_em: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Converte para dicionário."""
        return {
            'id': self.id,
            'produto_id': self.produto_id,
            'inventory_location_id': self.inventory_location_id,
            'quantidade': self.quantidade,
            'atualizado_em': self.atualizado_em,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'ProductInventory':
        """Cria a partir de dicionário."""
        return cls(
            id=data.get('id'),
            produto_id=data.get('produto_id', 0),
            inventory_location_id=data.get('inventory_location_id', 0),
            quantidade=data.get('quantidade', 0),
            atualizado_em=data.get('atualizado_em'),
        )
    
    def __str__(self) -> str:
        return f"ProductInventory(product={self.produto_id}, location={self.inventory_location_id}, qty={self.quantidade})"


@dataclass
class AppConfig:
    """
    Configurações globais da aplicação.
    
    Permite armazenar chave-valor de configurações (ex: versão do banco, etc)
    """
    
    id: Optional[int] = None
    chave: str = ""                   # Chave única: "version", "white_label_enabled", etc
    valor: str = ""                   # Valor: "2.0.0", "true", etc
    tipo: str = "string"              # Tipo: "string", "int", "bool", "json"
    descricao: Optional[str] = None   # Descrição para documentação
    atualizado_em: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Converte para dicionário."""
        return {
            'id': self.id,
            'chave': self.chave,
            'valor': self.valor,
            'tipo': self.tipo,
            'descricao': self.descricao,
            'atualizado_em': self.atualizado_em,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'AppConfig':
        """Cria a partir de dicionário."""
        return cls(
            id=data.get('id'),
            chave=data.get('chave', ''),
            valor=data.get('valor', ''),
            tipo=data.get('tipo', 'string'),
            descricao=data.get('descricao'),
            atualizado_em=data.get('atualizado_em'),
        )
    
    def __str__(self) -> str:
        return f"AppConfig({self.chave}={self.valor})"
