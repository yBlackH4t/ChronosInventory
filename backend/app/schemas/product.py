from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

PRODUCT_OBSERVACAO_MAX_LENGTH = 2000


class ProductOut(BaseModel):
    id: int
    nome: str
    qtd_canoas: int
    qtd_pf: int
    total_stock: int
    observacao: str | None = None


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=255)
    qtd_canoas: int = Field(ge=0)
    qtd_pf: int = Field(ge=0)
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)


class ProductPut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=255)
    qtd_canoas: int = Field(ge=0)
    qtd_pf: int = Field(ge=0)
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)


class ProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Optional[str] = Field(default=None, min_length=1, max_length=255)
    qtd_canoas: Optional[int] = Field(default=None, ge=0)
    qtd_pf: Optional[int] = Field(default=None, ge=0)
    observacao: Optional[str] = Field(default=None, max_length=PRODUCT_OBSERVACAO_MAX_LENGTH)


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
