"""
Schemas para White-Label v2.0.0

Novos schemas para suportar múltiplos estoques/locations
Mantém compatibilidade com schemas antigos
"""

from __future__ import annotations

from typing import Dict, Optional, List
from pydantic import BaseModel, Field, ConfigDict


class InventoryLocationOut(BaseModel):
    """Schema de output para InventoryLocation."""
    id: int
    name: str                              # Identificador único
    label: str                             # Display name
    color: str                             # Cor para UI
    ordem: int
    ativo: bool


class InventoryLocationCreate(BaseModel):
    """Schema para criar novo InventoryLocation."""
    model_config = ConfigDict(extra="forbid")
    
    name: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=100)
    color: str = Field(default="#808080", max_length=7)  # Formato hex
    ordem: int = Field(default=0, ge=0)


class InventoryLocationUpdate(BaseModel):
    """Schema para atualizar InventoryLocation."""
    model_config = ConfigDict(extra="forbid")
    
    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    color: Optional[str] = Field(default=None, max_length=7)
    ordem: Optional[int] = Field(default=None, ge=0)
    ativo: Optional[bool] = None


class ProductInventoryItem(BaseModel):
    """Item de inventário de um produto (quantidade em uma location)."""
    location_id: int
    location_name: str                     # Nome do local (CANOAS, PF, etc)
    location_label: str                    # Label do local (Canoas, Passo Fundo, etc)
    location_color: str                    # Cor para UI
    quantidade: int = Field(ge=0)


class AppConfigOut(BaseModel):
    """Schema de output para AppConfig."""
    chave: str
    valor: str
    tipo: str
    descricao: Optional[str] = None


class AppConfigCreate(BaseModel):
    """Schema para criar novo AppConfig."""
    model_config = ConfigDict(extra="forbid")
    
    chave: str = Field(min_length=1, max_length=100)
    valor: str = Field(max_length=1000)
    tipo: str = Field(default="string")
    descricao: Optional[str] = None


class AppConfigUpdate(BaseModel):
    """Schema para atualizar AppConfig."""
    model_config = ConfigDict(extra="forbid")
    
    valor: Optional[str] = None
    tipo: Optional[str] = None
    descricao: Optional[str] = None


# ============================================================================
# UPDATED Product Schemas (v2.0.0 compatible)
# ============================================================================

class ProductOutV2(BaseModel):
    """
    v2.0.0: Novo schema com suporte a múltiplos estoques.
    
    Mantém qtd_canoas/qtd_pf para compatibilidade,
    mas agora também inclui 'estoques' array com todos os locations
    """
    id: int
    nome: str
    qtd_canoas: int                        # Legacy (mantido para compatibilidade)
    qtd_pf: int                            # Legacy (mantido para compatibilidade)
    estoques: List[ProductInventoryItem]   # Novo: lista de estoques com locations
    total_stock: int
    observacao: Optional[str] = None
    ativo: bool = True
    inativado_em: Optional[str] = None
    motivo_inativacao: Optional[str] = None


class ProductCreateV2(BaseModel):
    """
    v2.0.0: Schema para criar produto com suporte a múltiplos estoques.
    
    Aceita quantidades para múltiplos locations via 'estoques' dict
    """
    model_config = ConfigDict(extra="forbid")
    
    nome: str = Field(min_length=1, max_length=255)
    # Legacy: ainda aceita qtd_canoas/qtd_pf
    qtd_canoas: int = Field(default=0, ge=0)
    qtd_pf: int = Field(default=0, ge=0)
    # Novo: dict de {location_id: quantidade}
    estoques: Optional[Dict[int, int]] = Field(default=None)
    observacao: Optional[str] = Field(default=None, max_length=2000)


class ProductPutV2(BaseModel):
    """
    v2.0.0: Schema para atualizar produto (PUT - substituição completa).
    """
    model_config = ConfigDict(extra="forbid")
    
    nome: str = Field(min_length=1, max_length=255)
    qtd_canoas: int = Field(ge=0)
    qtd_pf: int = Field(ge=0)
    estoques: Optional[Dict[int, int]] = None
    observacao: Optional[str] = Field(default=None, max_length=2000)


class ProductPatchV2(BaseModel):
    """
    v2.0.0: Schema para atualizar produto (PATCH - atualização parcial).
    """
    model_config = ConfigDict(extra="forbid")
    
    nome: Optional[str] = Field(default=None, min_length=1, max_length=255)
    qtd_canoas: Optional[int] = Field(default=None, ge=0)
    qtd_pf: Optional[int] = Field(default=None, ge=0)
    estoques: Optional[Dict[int, int]] = None
    observacao: Optional[str] = Field(default=None, max_length=2000)


# ============================================================================
# Backward Compatibility: Manter schemas antigos funcionando
# ============================================================================

# Aliases para manter compatibilidade com código antigo
ProductOut_Legacy = BaseModel  # Será definido no arquivo antigo
ProductCreate_Legacy = BaseModel
ProductPut_Legacy = BaseModel
ProductPatch_Legacy = BaseModel

"""
Estratégia de migração de schemas:

1. Novo código usa: ProductOutV2, ProductCreateV2, ProductPutV2, ProductPatchV2
2. Código antigo continua usando: ProductOut, ProductCreate, ProductPut, ProductPatch
3. API endpoints terão lógica para converter entre versões conforme necessário
4. Dados são sempre armazenados em ambos os formatos (qtd_canoas/pf + estoques dict)

Timeline:
- v2.0.0: Ambos os formatos funcionam lado a lado
- v2.1.0+: Deprecate schemas legados, apenas V2 é suportado
- v3.0.0+: Remove schemas legados completamente
"""
