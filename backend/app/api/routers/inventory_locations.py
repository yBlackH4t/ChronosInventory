"""
API Router para Inventory Locations (v2.0.0 white-label)

Endpoints para gerenciar locations configuráveis de estoque
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.models.inventory_location import InventoryLocation
from app.services.inventory_location_service import InventoryLocationService
from backend.app.api.deps import get_db_connection
from backend.app.api.responses import ok
from backend.app.schemas.white_label import (
    InventoryLocationOut,
    InventoryLocationCreate,
    InventoryLocationUpdate,
)
from core.exceptions import DuplicateException, NotFoundException, ValidationException


router = APIRouter(prefix="/inventory-locations", tags=["inventory-locations"])


def get_inventory_location_service(connection = Depends(get_db_connection)) -> InventoryLocationService:
    """Dependency para InventoryLocationService."""
    return InventoryLocationService(connection)


def _to_inventory_location_out(location: InventoryLocation) -> InventoryLocationOut:
    """Converte modelo para schema de saída."""
    return InventoryLocationOut(
        id=location.id or 0,
        name=location.name,
        label=location.label,
        color=location.color,
        ordem=location.ordem,
        ativo=location.ativo,
    )


@router.get("", response_model=ok[List[InventoryLocationOut]])
async def list_locations(
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[List[InventoryLocationOut]]:
    """
    Retorna todas as locations (ativas e inativas).
    
    Returns:
        Lista de locations
    """
    try:
        locations = service.get_all()
        return ok(data=[_to_inventory_location_out(loc) for loc in locations])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar locations: {str(e)}"
        )


@router.get("/active", response_model=ok[List[InventoryLocationOut]])
async def list_active_locations(
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[List[InventoryLocationOut]]:
    """
    Retorna apenas locations ativas.
    
    Útil para dropdowns e formulários.
    
    Returns:
        Lista de locations ativas
    """
    try:
        locations = service.get_all_active()
        return ok(data=[_to_inventory_location_out(loc) for loc in locations])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar locations ativas: {str(e)}"
        )


@router.get("/{location_id}", response_model=ok[InventoryLocationOut])
async def get_location(
    location_id: int,
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[InventoryLocationOut]:
    """
    Retorna um location específico pelo ID.
    
    Args:
        location_id: ID do location
        
    Returns:
        Location detalhes
    """
    try:
        location = service.get_by_id(location_id)
        return ok(data=_to_inventory_location_out(location))
    except NotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao recuperar location: {str(e)}"
        )


@router.post("", response_model=ok[InventoryLocationOut], status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: InventoryLocationCreate,
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[InventoryLocationOut]:
    """
    Cria novo location.
    
    Args:
        payload: Dados do novo location
        
    Returns:
        Location criado com ID
    """
    try:
        location = service.create(
            name=payload.name,
            label=payload.label,
            color=payload.color,
            ordem=payload.ordem,
        )
        return ok(data=_to_inventory_location_out(location))
    except DuplicateException as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except (ValueError, ValidationException) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar location: {str(e)}"
        )


@router.put("/{location_id}", response_model=ok[InventoryLocationOut])
async def update_location(
    location_id: int,
    payload: InventoryLocationUpdate,
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[InventoryLocationOut]:
    """
    Atualiza um location existente.
    
    Note: 'name' não pode ser alterado (é a chave única).
    
    Args:
        location_id: ID do location
        payload: Dados a atualizar
        
    Returns:
        Location atualizado
    """
    try:
        location = service.update(
            location_id,
            label=payload.label,
            color=payload.color,
            ordem=payload.ordem,
        )
        return ok(data=_to_inventory_location_out(location))
    except NotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except (ValueError, ValidationException) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar location: {str(e)}"
        )


@router.delete("/{location_id}", response_model=ok[InventoryLocationOut])
async def delete_location(
    location_id: int,
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[InventoryLocationOut]:
    """
    Desativa um location (soft delete).
    
    Dados são preservados, apenas marcado como inativo.
    
    Args:
        location_id: ID do location
        
    Returns:
        Location desativado
    """
    try:
        location = service.soft_delete(location_id)
        return ok(data=_to_inventory_location_out(location))
    except NotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar location: {str(e)}"
        )


@router.post("/{location_id}/reactivate", response_model=ok[InventoryLocationOut])
async def reactivate_location(
    location_id: int,
    service: InventoryLocationService = Depends(get_inventory_location_service),
) -> ok[InventoryLocationOut]:
    """
    Reativa um location que foi desativado.
    
    Args:
        location_id: ID do location
        
    Returns:
        Location reativado
    """
    try:
        location = service.reactivate(location_id)
        return ok(data=_to_inventory_location_out(location))
    except NotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao reativar location: {str(e)}"
        )
