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
