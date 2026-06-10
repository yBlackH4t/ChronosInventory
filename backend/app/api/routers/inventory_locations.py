"""
API Router para Inventory Locations (v2.0.0 white-label)

Endpoints para gerenciar locations configuráveis de estoque
"""

from fastapi import APIRouter, Depends, Query

from app.models.inventory_location import InventoryLocation
from app.services.inventory_location_service import InventoryLocationService
from backend.app.api.deps import get_inventory_location_service
from backend.app.api.responses import ok
from backend.app.schemas.white_label import (
    InventoryLocationOut,
    InventoryLocationCreate,
    InventoryLocationUpdate,
)


router = APIRouter(prefix="/inventory-locations", tags=["inventory-locations"])


def _to_out(location: InventoryLocation) -> InventoryLocationOut:
    """Converte modelo para schema de saída."""
    return InventoryLocationOut(
        id=location.id or 0,
        name=location.name,
        label=location.label,
        color=location.color,
        ordem=location.ordem,
        ativo=location.ativo,
    )


@router.get("")
async def list_locations(
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """Retorna todas as locations (ativas e inativas)."""
    locations = service.get_all()
    return ok(data=[_to_out(loc) for loc in locations])


@router.get("/active")
async def list_active_locations(
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """Retorna apenas locations ativas (para dropdowns/formulários)."""
    locations = service.get_all_active()
    return ok(data=[_to_out(loc) for loc in locations])


@router.get("/{location_id}")
async def get_location(
    location_id: int,
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """Retorna um location específico pelo ID."""
    location = service.get_by_id(location_id)
    return ok(data=_to_out(location))


@router.post("", status_code=201)
async def create_location(
    payload: InventoryLocationCreate,
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """
    Cria novo location.

    Limite: máximo de 5 locations ativas.
    """
    location = service.create(
        name=payload.name,
        label=payload.label,
        color=payload.color,
        ordem=payload.ordem,
    )
    return ok(data=_to_out(location), status_code=201)


@router.put("/{location_id}")
async def update_location(
    location_id: int,
    payload: InventoryLocationUpdate,
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """Atualiza um location existente. 'name' não pode ser alterado."""
    location = service.update(
        location_id,
        label=payload.label,
        color=payload.color,
        ordem=payload.ordem,
        ativo=payload.ativo,
    )
    return ok(data=_to_out(location))


@router.delete("/{location_id}")
async def delete_location(
    location_id: int,
    force: bool = Query(False, description="Se True, zera estoque e desativa mesmo com estoque"),
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """
    Desativa um location (soft delete).

    Se o location possui estoque e force=False, retorna 409 com detalhes
    do estoque para o frontend mostrar confirmação.
    Se force=True, zera estoque e desativa.
    """
    location = service.soft_delete(location_id, force=force)
    return ok(data=_to_out(location))


@router.post("/{location_id}/reactivate")
async def reactivate_location(
    location_id: int,
    service: InventoryLocationService = Depends(get_inventory_location_service),
):
    """Reativa um location que foi desativado."""
    location = service.reactivate(location_id)
    return ok(data=_to_out(location))
