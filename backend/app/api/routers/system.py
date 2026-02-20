from __future__ import annotations

from fastapi import APIRouter, Depends

from app.services.stock_profile_service import StockProfileService
from backend.app.api.deps import get_stock_profile_service
from backend.app.api.responses import ok
from backend.app.schemas.common import SuccessResponse
from backend.app.schemas.system import (
    StockProfileActivateIn,
    StockProfileActivateOut,
    StockProfileCreateIn,
    StockProfileOut,
    StockProfilesStateOut,
)


router = APIRouter(prefix="/sistema", tags=["sistema"])


@router.get("/estoques", response_model=SuccessResponse[StockProfilesStateOut])
def list_stock_profiles(
    stock_profile_service: StockProfileService = Depends(get_stock_profile_service),
) -> SuccessResponse[StockProfilesStateOut]:
    state = stock_profile_service.list_profiles_state()
    return ok(
        StockProfilesStateOut(
            active_profile_id=str(state["active_profile_id"]),
            active_profile_name=str(state["active_profile_name"]),
            current_database_path=str(state["current_database_path"]),
            restart_required=bool(state.get("restart_required")),
            root_directory=str(state["root_directory"]),
            profiles=[StockProfileOut(**item) for item in state["profiles"]],
        )
    )


@router.post("/estoques", response_model=SuccessResponse[StockProfileOut], status_code=201)
def create_stock_profile(
    payload: StockProfileCreateIn,
    stock_profile_service: StockProfileService = Depends(get_stock_profile_service),
) -> SuccessResponse[StockProfileOut]:
    created = stock_profile_service.create_profile(payload.name, payload.profile_id)
    return ok(StockProfileOut(**created), status_code=201)


@router.put("/estoques/ativo", response_model=SuccessResponse[StockProfileActivateOut])
def activate_stock_profile(
    payload: StockProfileActivateIn,
    stock_profile_service: StockProfileService = Depends(get_stock_profile_service),
) -> SuccessResponse[StockProfileActivateOut]:
    result = stock_profile_service.activate_profile(payload.profile_id)
    return ok(StockProfileActivateOut(**result))
