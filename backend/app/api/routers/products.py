from __future__ import annotations

import base64
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from app.models.product import Product
from app.services.image_service import ImageService
from app.services.movement_service import MovementService
from app.services.stock_service import StockService
from backend.app.api.deps import get_image_service, get_movement_service, get_stock_service
from backend.app.api.responses import ok
from backend.app.schemas.common import PaginationMeta, SuccessResponse
from backend.app.schemas.movement import MovementOut
from backend.app.schemas.product import (
    ProductCreate,
    ProductDeleteOut,
    ProductImageListOut,
    ProductImageOut,
    ProductImageSetPrimaryOut,
    ProductImageUploadOut,
    ProductImagesUploadOut,
    ProductOut,
    ProductPatch,
    ProductPut,
)
from core.exceptions import ValidationException


router = APIRouter(prefix="/produtos", tags=["produtos"])

_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _to_product_out(product: Product) -> ProductOut:
    return ProductOut(
        id=product.id or 0,
        nome=product.nome,
        qtd_canoas=product.qtd_canoas,
        qtd_pf=product.qtd_pf,
        total_stock=product.total_stock,
        observacao=product.observacao,
    )


def _parse_sort(sort: str | None) -> tuple[str, str]:
    if not sort:
        return "nome", "ASC"

    direction = "DESC" if sort.startswith("-") else "ASC"
    field = sort.lstrip("-").lower()

    allowed = {"id", "nome", "qtd_canoas", "qtd_pf"}
    if field not in allowed:
        raise ValidationException("Parametro 'sort' invalido.")

    return field, direction


def _parse_movement_sort(sort: str | None) -> tuple[str, str]:
    if not sort:
        return "data", "DESC"

    direction = "DESC" if sort.startswith("-") else "ASC"
    field = sort.lstrip("-").lower()

    allowed = {"data", "tipo", "quantidade", "id"}
    if field not in allowed:
        raise ValidationException("Parametro 'sort' invalido.")

    return field, direction


def _validate_upload_file(file: UploadFile, contents: bytes) -> None:
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise ValidationException("Tipo de imagem invalido. Use JPEG, PNG ou WEBP.")
    if not contents:
        raise ValidationException("Arquivo vazio.")
    if len(contents) > _MAX_IMAGE_SIZE:
        raise ValidationException("Imagem muito grande. Limite: 5MB.")


@router.get("", response_model=SuccessResponse[list[ProductOut]])
def list_products(
    query: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = None,
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[list[ProductOut]]:
    sort_column, sort_direction = _parse_sort(sort)
    start = (page - 1) * page_size
    products, total_items = stock_service.get_products_paginated(
        search_term=query,
        sort_column=sort_column,
        sort_direction=sort_direction,
        limit=page_size,
        offset=start,
    )

    total_pages = ceil(total_items / page_size) if total_items else 0
    has_next = page < total_pages

    meta = PaginationMeta(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        has_next=has_next,
    )
    return ok([_to_product_out(p) for p in products], meta)


@router.get("/{product_id}", response_model=SuccessResponse[ProductOut])
def get_product(
    product_id: int,
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[ProductOut]:
    product = stock_service.get_product_by_id(product_id)
    return ok(_to_product_out(product))


@router.post("", response_model=SuccessResponse[ProductOut], status_code=201)
def create_product(
    payload: ProductCreate,
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[ProductOut]:
    product = stock_service.add_product(
        payload.nome,
        payload.qtd_canoas,
        payload.qtd_pf,
        payload.observacao,
    )
    return ok(_to_product_out(product), status_code=201)


@router.put("/{product_id}", response_model=SuccessResponse[ProductOut])
def replace_product(
    product_id: int,
    payload: ProductPut,
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[ProductOut]:
    product = stock_service.update_product(
        product_id=product_id,
        nome=payload.nome,
        qtd_canoas=payload.qtd_canoas,
        qtd_pf=payload.qtd_pf,
        observacao=payload.observacao,
    )
    return ok(_to_product_out(product))


@router.patch("/{product_id}", response_model=SuccessResponse[ProductOut])
def update_product(
    product_id: int,
    payload: ProductPatch,
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[ProductOut]:
    if (
        payload.nome is None
        and payload.qtd_canoas is None
        and payload.qtd_pf is None
        and payload.observacao is None
    ):
        raise ValidationException("Pelo menos um campo deve ser informado.")

    product = stock_service.update_product(
        product_id=product_id,
        nome=payload.nome,
        qtd_canoas=payload.qtd_canoas,
        qtd_pf=payload.qtd_pf,
        observacao=payload.observacao,
    )
    return ok(_to_product_out(product))


@router.delete("/{product_id}", response_model=SuccessResponse[ProductDeleteOut])
def delete_product(
    product_id: int,
    stock_service: StockService = Depends(get_stock_service),
):
    product_name = stock_service.delete_product(product_id)
    return ok(
        ProductDeleteOut(
            id=product_id,
            nome=product_name,
            message="Produto removido",
        )
    )


@router.get("/{product_id}/imagem", response_model=SuccessResponse[ProductImageOut])
def get_product_image(
    product_id: int,
    image_service: ImageService = Depends(get_image_service),
) -> SuccessResponse[ProductImageOut]:
    image_bytes = image_service.get_photo_bytes(product_id)
    if not image_bytes:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")

    encoded = base64.b64encode(image_bytes).decode("ascii")
    return ok(ProductImageOut(image_base64=encoded))


@router.get("/{product_id}/imagens", response_model=SuccessResponse[ProductImageListOut])
def list_product_images(
    product_id: int,
    image_service: ImageService = Depends(get_image_service),
) -> SuccessResponse[ProductImageListOut]:
    items = image_service.list_photos(product_id)
    payload = []
    for item in items:
        row = image_service.get_photo_by_id(product_id, int(item["id"]))
        if not row:
            continue
        payload.append(
            {
                "id": int(item["id"]),
                "mime_type": row.get("mime_type", "image/jpeg"),
                "is_primary": bool(item.get("is_primary")),
                "size_bytes": int(item.get("size_bytes") or 0),
                "created_at": item.get("created_at"),
                "image_base64": base64.b64encode(row["image_data"]).decode("ascii"),
            }
        )

    return ok(
        ProductImageListOut(
            items=payload,
            total=len(payload),
            max_images=image_service.MAX_IMAGES_PER_PRODUCT,
        )
    )


@router.post("/{product_id}/imagem", response_model=SuccessResponse[ProductImageUploadOut])
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    image_service: ImageService = Depends(get_image_service),
) -> SuccessResponse[ProductImageUploadOut]:
    contents = await file.read()
    _validate_upload_file(file, contents)

    uploaded = image_service.replace_primary_photo_bytes(product_id, contents)
    return ok(
        ProductImageUploadOut(
            id=uploaded["id"],
            message="Imagem principal atualizada",
            size_bytes=uploaded["size_bytes"],
            mime_type=uploaded["mime_type"],
        )
    )


@router.post("/{product_id}/imagens", response_model=SuccessResponse[ProductImagesUploadOut], status_code=201)
async def upload_product_images(
    product_id: int,
    files: list[UploadFile] = File(...),
    image_service: ImageService = Depends(get_image_service),
) -> SuccessResponse[ProductImagesUploadOut]:
    if not files:
        raise ValidationException("Nenhum arquivo enviado.")

    added: list[ProductImageUploadOut] = []
    for file in files:
        contents = await file.read()
        _validate_upload_file(file, contents)
        uploaded = image_service.upload_photo_bytes(
            product_id=product_id,
            file_bytes=contents,
            mime_type=file.content_type or "image/jpeg",
            as_primary=False,
        )
        added.append(
            ProductImageUploadOut(
                id=uploaded["id"],
                message="Imagem adicionada",
                size_bytes=uploaded["size_bytes"],
                mime_type=uploaded["mime_type"],
            )
        )

    return ok(
        ProductImagesUploadOut(
            added=added,
            total=image_service.get_product_photo_count(product_id),
            max_images=image_service.MAX_IMAGES_PER_PRODUCT,
        ),
        status_code=201,
    )


@router.patch("/{product_id}/imagens/{image_id}/principal", response_model=SuccessResponse[ProductImageSetPrimaryOut])
def set_primary_product_image(
    product_id: int,
    image_id: int,
    image_service: ImageService = Depends(get_image_service),
) -> SuccessResponse[ProductImageSetPrimaryOut]:
    changed = image_service.set_primary_photo(product_id, image_id)
    if not changed:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")

    return ok(ProductImageSetPrimaryOut(id=image_id, message="Imagem principal definida"))


@router.delete("/{product_id}/imagens/{image_id}", response_model=SuccessResponse[dict])
def delete_product_image(
    product_id: int,
    image_id: int,
    image_service: ImageService = Depends(get_image_service),
):
    removed = image_service.delete_photo_by_id(product_id, image_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    return ok({"id": image_id, "message": "Imagem removida"})


@router.get("/{product_id}/historico", response_model=SuccessResponse[list[MovementOut]])
def get_product_history(
    product_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = None,
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[MovementOut]]:
    sort_column, sort_direction = _parse_movement_sort(sort)
    start = (page - 1) * page_size

    records, total_items = movement_service.list_movements(
        produto_id=product_id,
        tipo=None,
        origem=None,
        destino=None,
        date_from=None,
        date_to=None,
        sort_column=sort_column,
        sort_direction=sort_direction,
        limit=page_size,
        offset=start,
    )

    total_pages = ceil(total_items / page_size) if total_items else 0
    has_next = page < total_pages

    meta = PaginationMeta(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        has_next=has_next,
    )

    items = [
        MovementOut(
            id=record.id,
            produto_id=record.produto_id,
            produto_nome=record.produto_nome,
            tipo=record.tipo,
            quantidade=record.quantidade,
            origem=record.origem,
            destino=record.destino,
            observacao=record.observacao,
            data=record.data,
        )
        for record in records
    ]

    return ok(items, meta)
