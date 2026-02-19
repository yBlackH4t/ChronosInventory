from __future__ import annotations

from math import ceil

from fastapi import APIRouter, Depends, Query

from app.services.inventory_service import InventoryService
from backend.app.api.deps import get_inventory_service
from backend.app.api.responses import ok
from backend.app.schemas.common import PaginationMeta, SuccessResponse
from backend.app.schemas.inventory import (
    InventoryApplyOut,
    InventoryCountOut,
    InventoryCountsUpdateIn,
    InventorySessionCreateIn,
    InventorySessionOut,
)


router = APIRouter(prefix="/inventario", tags=["inventario"])


def _to_session_out(session) -> InventorySessionOut:
    return InventorySessionOut(
        id=session.id,
        nome=session.nome,
        local=session.local,
        status=session.status,
        observacao=session.observacao,
        created_at=session.created_at,
        updated_at=session.updated_at,
        applied_at=session.applied_at,
        total_items=session.total_items,
        counted_items=session.counted_items,
        divergent_items=session.divergent_items,
    )


def _to_count_out(item) -> InventoryCountOut:
    return InventoryCountOut(
        produto_id=item.produto_id,
        produto_nome=item.produto_nome,
        qtd_sistema=item.qtd_sistema,
        qtd_fisico=item.qtd_fisico,
        divergencia=item.divergencia,
        motivo_ajuste=item.motivo_ajuste,
        observacao=item.observacao,
        applied_movement_id=item.applied_movement_id,
        updated_at=item.updated_at,
    )


@router.post("/sessoes", response_model=SuccessResponse[InventorySessionOut], status_code=201)
def create_inventory_session(
    payload: InventorySessionCreateIn,
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[InventorySessionOut]:
    session = inventory_service.create_session(
        nome=payload.nome,
        local=payload.local,
        observacao=payload.observacao,
    )
    return ok(_to_session_out(session), status_code=201)


@router.get("/sessoes", response_model=SuccessResponse[list[InventorySessionOut]])
def list_inventory_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[list[InventorySessionOut]]:
    offset = (page - 1) * page_size
    rows = inventory_service.list_sessions(limit=page_size, offset=offset)
    total_items = inventory_service.count_sessions()
    total_pages = ceil(total_items / page_size) if total_items else 0
    meta = PaginationMeta(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        has_next=page < total_pages,
    )
    return ok([_to_session_out(row) for row in rows], meta)


@router.get("/sessoes/{session_id}", response_model=SuccessResponse[InventorySessionOut])
def get_inventory_session(
    session_id: int,
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[InventorySessionOut]:
    row = inventory_service.get_session(session_id)
    return ok(_to_session_out(row))


@router.get("/sessoes/{session_id}/itens", response_model=SuccessResponse[list[InventoryCountOut]])
def list_inventory_session_items(
    session_id: int,
    only_divergent: bool = False,
    query: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[list[InventoryCountOut]]:
    offset = (page - 1) * page_size
    rows, total_items = inventory_service.list_session_counts(
        session_id=session_id,
        limit=page_size,
        offset=offset,
        only_divergent=only_divergent,
        query=query,
    )
    total_pages = ceil(total_items / page_size) if total_items else 0
    meta = PaginationMeta(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        has_next=page < total_pages,
    )
    return ok([_to_count_out(row) for row in rows], meta)


@router.put("/sessoes/{session_id}/itens", response_model=SuccessResponse[InventorySessionOut])
def update_inventory_session_items(
    session_id: int,
    payload: InventoryCountsUpdateIn,
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[InventorySessionOut]:
    session = inventory_service.update_counts(
        session_id=session_id,
        items=[item.model_dump() for item in payload.items],
    )
    return ok(_to_session_out(session))


@router.post("/sessoes/{session_id}/aplicar", response_model=SuccessResponse[InventoryApplyOut])
def apply_inventory_session(
    session_id: int,
    inventory_service: InventoryService = Depends(get_inventory_service),
) -> SuccessResponse[InventoryApplyOut]:
    result = inventory_service.apply_session_adjustments(session_id=session_id)
    return ok(
        InventoryApplyOut(
            session_id=int(result["session_id"]),
            applied_items=int(result["applied_items"]),
            movement_ids=[int(item) for item in result["movement_ids"]],
            status=str(result["status"]),
        )
    )
