from __future__ import annotations

from fastapi import APIRouter, Depends

from app.services.stock_compare_service import StockCompareService
from app.services.stock_profile_service import StockProfileService
from backend.app.api.deps import get_stock_compare_service, get_stock_profile_service
from backend.app.api.responses import ok
from backend.app.schemas.common import SuccessResponse
from backend.app.schemas.system import (
    PublishedCompareBaseOut,
    PublishedComparePublishOut,
    PublishedCompareStatusOut,
    StockCompareIn,
    StockCompareOut,
    StockProfileActivateIn,
    StockProfileActivateOut,
    StockProfileCreateIn,
    StockProfileDeleteOut,
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


@router.delete("/estoques/{profile_id}", response_model=SuccessResponse[StockProfileDeleteOut])
def delete_stock_profile(
    profile_id: str,
    stock_profile_service: StockProfileService = Depends(get_stock_profile_service),
) -> SuccessResponse[StockProfileDeleteOut]:
    result = stock_profile_service.delete_profile(profile_id)
    return ok(StockProfileDeleteOut(**result))


@router.post("/comparar-bases", response_model=SuccessResponse[StockCompareOut])
def compare_stock_databases(
    payload: StockCompareIn,
    stock_compare_service: StockCompareService = Depends(get_stock_compare_service),
) -> SuccessResponse[StockCompareOut]:
    result = stock_compare_service.compare_databases(
        left_path=payload.left_path,
        right_path=payload.right_path,
        left_label=payload.left_label,
        right_label=payload.right_label,
    )
    return ok(StockCompareOut(**result))


@router.get("/comparativo-publicado/status", response_model=SuccessResponse[PublishedCompareStatusOut])
def get_published_compare_status(
    stock_compare_service: StockCompareService = Depends(get_stock_compare_service),
) -> SuccessResponse[PublishedCompareStatusOut]:
    result = stock_compare_service.get_published_compare_status()
    return ok(
        PublishedCompareStatusOut(
            compare_root_dir=result.get("compare_root_dir"),
            official_base_dir=result.get("official_base_dir"),
            machine_label=str(result["machine_label"]),
            configured=bool(result["configured"]),
            local_snapshot_available=bool(result["local_snapshot_available"]),
            local_snapshot=PublishedCompareBaseOut(**result["local_snapshot"]) if result.get("local_snapshot") else None,
            available_bases=[PublishedCompareBaseOut(**item) for item in result["available_bases"]],
        )
    )


@router.post("/comparativo-publicado/publicar", response_model=SuccessResponse[PublishedComparePublishOut])
def publish_compare_snapshot(
    stock_compare_service: StockCompareService = Depends(get_stock_compare_service),
) -> SuccessResponse[PublishedComparePublishOut]:
    result = stock_compare_service.publish_current_compare_base()
    return ok(PublishedComparePublishOut(**result))


@router.post("/comparativo-publicado/{machine_label}/comparar", response_model=SuccessResponse[StockCompareOut])
def compare_against_published_snapshot(
    machine_label: str,
    stock_compare_service: StockCompareService = Depends(get_stock_compare_service),
) -> SuccessResponse[StockCompareOut]:
    result = stock_compare_service.compare_with_published_base(machine_label)
    return ok(StockCompareOut(**result))
