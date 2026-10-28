from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

PRODUCT_OBSERVACAO_MAX_LENGTH = 2000


class LocationStock(BaseModel):
    """Stock quantity at a specific inventory location."""
    location_id: int
    location_name: str
    location_label: str
    color: str | None = None
    quantidade: int


class ProductOut(BaseModel):
    id: int
    nome: str
    inventories: dict[int, int]
    total_stock: int
    observacao: str | None = None
    produto_vinculado_id: int | None = None
    produto_vinculado_nome: str | None = None
    # Saldo do produto pai (ex.: conjunto central de um turbo montado). So para mostrar:
    # o estoque continua no pai e nao entra em total_stock.
    produto_vinculado_inventories: dict[int, int] = Field(default_factory=dict)
    produto_vinculado_estoque: int = 0
    linked_count: int = 0
    ativo: bool = True
    inativado_em: str | None = None
    motivo_inativacao: str | None = None


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=255)
    inventories: dict[int, int] = Field(default_factory=dict)  # {location_id: quantidade}
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)
    produto_vinculado_id: int | None = None
    documento_movimento: Optional[str] = Field(default=None, max_length=255)
    observacao_movimento: Optional[str] = Field(default=None, max_length=500)


class ProductPut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=255)
    inventories: dict[int, int] = Field(default_factory=dict)
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)
    produto_vinculado_id: int | None = None


class ProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Optional[str] = Field(default=None, min_length=1, max_length=255)
    inventories: Optional[dict[int, int]] = None
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)
    produto_vinculado_id: Optional[int] = None


class ProductImageOut(BaseModel):
    image_base64: str


class ProductImageItem(BaseModel):
    id: int
    mime_type: str
    is_primary: bool
    size_bytes: int
    created_at: str | None = None
    image_base64: str


class ProductImageListOut(BaseModel):
    items: list[ProductImageItem]
    total: int
    max_images: int


class ProductImageUploadOut(BaseModel):
    id: int
    message: str
    size_bytes: int
    mime_type: str


class ProductImagesUploadOut(BaseModel):
    added: list[ProductImageUploadOut]
    total: int
    max_images: int


class ProductImageSetPrimaryOut(BaseModel):
    id: int
    message: str


class ProductDeleteOut(BaseModel):
    id: int
    nome: str
    message: str


ProductStatusFilter = Literal["ATIVO", "INATIVO", "TODOS"]


class ProductStatusBulkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[int] = Field(min_length=1)
    ativo: bool
    motivo_inativacao: Optional[str] = Field(default=None, max_length=200)


class ProductStatusBulkOut(BaseModel):
    updated: int


class CatalogSpecItem(BaseModel):
    campo: str
    valor: str


class CatalogReferenceGroup(BaseModel):
    fabricante: str
    numeros: list[str]


class CatalogApplicationItem(BaseModel):
    montadora: Optional[str] = None
    veiculo: str
    motor: Optional[str] = None
    tipo: Optional[str] = None
    complemento: Optional[str] = None
    oculta: bool = False  # "Não se aplica": o especialista marcou como errada


class CatalogRelatedItem(BaseModel):
    tipo: str
    codigo: str
    descricao: str
    grupo: Optional[str] = None


class ProductCatalogLinkOut(BaseModel):
    id: int
    fonte: str
    codigo: str
    descricao: str
    grupo: Optional[str] = None
    modelo: Optional[str] = None
    observacao: Optional[str] = None
    foto_arquivo: Optional[str] = None
    vinculo_status: str
    codigos_em_comum: list[str] = Field(default_factory=list)
    especificacoes: list[CatalogSpecItem] = Field(default_factory=list)
    referencias: list[CatalogReferenceGroup] = Field(default_factory=list)
    aplicacoes: list[CatalogApplicationItem] = Field(default_factory=list)
    relacionados: list[CatalogRelatedItem] = Field(default_factory=list)


class ProductCatalogResponseOut(BaseModel):
    product_id: int
    product_nome: str
    vinculos: list[ProductCatalogLinkOut]


class ProductVisualItem(BaseModel):
    id: int
    thumb_base64: str | None = None
    saidas_semanas: list[int]


class ProductColumnItem(BaseModel):
    """Um produto numa coluna da busca por codigo (aba Produtos em colunas, 2.7.11)."""

    produto: ProductOut
    # exato, familia, igual_especialista, similar_especialista, equivalente_catalogo ou
    # montada_no_conjunto (o produto e o conjunto central onde o turbo montado e faturado).
    relacao: str
    rotulo: Optional[str] = None
    codigo_relacionado: Optional[str] = None
    obs: Optional[str] = None
    turbo_id: Optional[int] = None
    turbo_nome: Optional[str] = None


class ProductColumn(BaseModel):
    chave: Literal["nova", "reman", "montada", "conjunto", "similares"]
    titulo: str
    itens: list[ProductColumnItem]


class ProductColumnsOut(BaseModel):
    codigo: Optional[str] = None
    codigo_digitado: Optional[str] = None
    colunas: list[ProductColumn] = Field(default_factory=list)
    aplicacoes: list[str] = Field(default_factory=list)
    codigos_possiveis: list[str] = Field(default_factory=list)
