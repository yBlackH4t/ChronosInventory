from __future__ import annotations

from datetime import datetime
from math import ceil

from fastapi import APIRouter, Depends, Query

from core.exceptions import ValidationException
from app.services.movement_service import MovementService
from backend.app.api.deps import get_movement_service
from backend.app.api.responses import ok
from backend.app.schemas.common import PaginationMeta, SuccessResponse
from backend.app.schemas.movement import MovementCreate, MovementOut


router = APIRouter(prefix="/movimentacoes", tags=["movimentacoes"])


def _parse_sort(sort: str | None) -> tuple[str, str]:
    if not sort:
        return "data", "DESC"

    direction = "DESC" if sort.startswith("-") else "ASC"
    field = sort.lstrip("-").lower()

    allowed = {"data", "tipo", "quantidade", "id"}
    if field not in allowed:
        raise ValidationException("Parametro 'sort' invalido.")

    return field, direction


def _validate_location(loc: str | None) -> str | None:
    if loc is None:
        return None
    loc = loc.upper()
    if loc not in {"CANOAS", "PF"}:
        raise ValidationException("Local invalido. Use CANOAS ou PF.")
    return loc


@router.post("", response_model=SuccessResponse[MovementOut], status_code=201)
def create_movement(
    payload: MovementCreate,
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[MovementOut]:
    record = movement_service.create_movement(
        tipo=payload.tipo,
        produto_id=payload.produto_id,
        quantidade=payload.quantidade,
        origem=payload.origem,
        destino=payload.destino,
        observacao=payload.observacao,
        data=payload.data,
    )

    return ok(MovementOut(
        id=record.id,
        produto_id=record.produto_id,
        produto_nome=record.produto_nome,
        tipo=record.tipo,
        quantidade=record.quantidade,
        origem=record.origem,
        destino=record.destino,
        observacao=record.observacao,
        data=record.data,
    ), status_code=201)


@router.get("", response_model=SuccessResponse[list[MovementOut]])
def list_movements(
    produto_id: int | None = None,
    tipo: str | None = None,
    origem: str | None = None,
    destino: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = None,
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[MovementOut]]:
    sort_column, sort_direction = _parse_sort(sort)

    tipo = tipo.upper() if tipo else None
    if tipo and tipo not in {"ENTRADA", "SAIDA", "TRANSFERENCIA"}:
        raise ValidationException("Tipo invalido.")

    origem = _validate_location(origem)
    destino = _validate_location(destino)

    start = (page - 1) * page_size
    records, total_items = movement_service.list_movements(
        produto_id=produto_id,
        tipo=tipo,
        origem=origem,
        destino=destino,
        date_from=date_from,
        date_to=date_to,
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
