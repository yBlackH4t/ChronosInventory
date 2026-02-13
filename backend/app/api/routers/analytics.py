from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.services.movement_service import MovementService
from backend.app.api.deps import get_movement_service
from backend.app.api.responses import ok
from backend.app.schemas.analytics import (
    EntradasSaidasPoint,
    EstoqueEvolucaoPoint,
    FlowPoint,
    SaidasPoint,
    StockDistributionOut,
    StockEvolutionPoint,
    StockSummaryOut,
    TopSaidaItem,
    TopSemMovItem,
)
from backend.app.schemas.common import SuccessResponse
from core.exceptions import ValidationException


router = APIRouter(prefix="/analytics", tags=["analytics"])

_ALLOWED_SCOPE = {"CANOAS", "PF", "AMBOS"}
_ALLOWED_BUCKET = {"day", "week", "month"}


def _validate_scope(scope: str) -> str:
    value = scope.upper()
    if value not in _ALLOWED_SCOPE:
        raise ValidationException("Scope invalido. Use CANOAS, PF ou AMBOS.")
    return value


def _validate_bucket(bucket: str) -> str:
    value = bucket.lower()
    if value not in _ALLOWED_BUCKET:
        raise ValidationException("Bucket invalido. Use day, week ou month.")
    return value


def _validate_dates(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise ValidationException("date_from deve ser menor ou igual a date_to.")


@router.get("/stock/summary", response_model=SuccessResponse[StockSummaryOut])
def stock_summary(
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockSummaryOut]:
    return ok(StockSummaryOut(**movement_service.get_stock_summary()))


@router.get("/stock/distribution", response_model=SuccessResponse[StockDistributionOut])
def stock_distribution(
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockDistributionOut]:
    return ok(StockDistributionOut(**movement_service.get_stock_distribution()))


@router.get("/movements/top-saidas", response_model=SuccessResponse[list[TopSaidaItem]])
def top_saidas_v2(
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: str = Query("AMBOS"),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSaidaItem]]:
    _validate_dates(date_from, date_to)
    scope = _validate_scope(scope)

    origem = None if scope == "AMBOS" else scope
    items = movement_service.get_top_saidas(date_from, date_to, origem, limit=limit)
    return ok([TopSaidaItem(**item) for item in items])


@router.get("/movements/timeseries", response_model=SuccessResponse[list[SaidasPoint]])
def saidas_timeseries(
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: str = Query("AMBOS"),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[SaidasPoint]]:
    _validate_dates(date_from, date_to)
    scope = _validate_scope(scope)
    bucket = _validate_bucket(bucket)

    origem = None if scope == "AMBOS" else scope
    series = movement_service.get_saidas_timeseries(date_from, date_to, bucket=bucket, origem=origem)
    return ok([SaidasPoint(**item) for item in series])


@router.get("/movements/flow", response_model=SuccessResponse[list[FlowPoint]])
def movements_flow(
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: str = Query("AMBOS"),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[FlowPoint]]:
    _validate_dates(date_from, date_to)
    scope = _validate_scope(scope)
    bucket = _validate_bucket(bucket)

    series = movement_service.get_flow_timeseries(date_from, date_to, bucket=bucket, scope=scope)
    return ok([FlowPoint(**item) for item in series])


@router.get("/stock/evolution", response_model=SuccessResponse[list[StockEvolutionPoint]])
def stock_evolution(
    date_from: date = Query(...),
    date_to: date = Query(...),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[StockEvolutionPoint]]:
    _validate_dates(date_from, date_to)
    bucket = _validate_bucket(bucket)

    series = movement_service.get_stock_evolution_series(date_from, date_to, bucket=bucket)
    return ok([StockEvolutionPoint(**item) for item in series])


@router.get("/products/inactive", response_model=SuccessResponse[list[TopSemMovItem]])
def products_inactive(
    days: int = Query(30, ge=1, le=365),
    date_to: date | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSemMovItem]]:
    date_to = date_to or date.today()
    items = movement_service.get_top_sem_mov(days, date_to, limit=limit)
    return ok([TopSemMovItem(**item) for item in items])


# -----------------------------------------------------------------------------
# Compatibilidade com endpoints antigos
# -----------------------------------------------------------------------------
@router.get("/top-saidas", response_model=SuccessResponse[list[TopSaidaItem]])
def top_saidas_legacy(
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: str = Query("AMBOS"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSaidaItem]]:
    return top_saidas_v2(date_from, date_to, scope, 5, movement_service)


@router.get("/estoque-distribuicao", response_model=SuccessResponse[StockDistributionOut])
def estoque_distribuicao_legacy(
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockDistributionOut]:
    return stock_distribution(movement_service)


@router.get("/entradas-saidas", response_model=SuccessResponse[list[EntradasSaidasPoint]])
def entradas_saidas_legacy(
    date_from: date = Query(...),
    date_to: date = Query(...),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[EntradasSaidasPoint]]:
    _validate_dates(date_from, date_to)
    series = movement_service.get_entradas_saidas(date_from, date_to)
    return ok([EntradasSaidasPoint(**item) for item in series])


@router.get("/estoque-evolucao", response_model=SuccessResponse[list[EstoqueEvolucaoPoint]])
def estoque_evolucao_legacy(
    date_from: date = Query(...),
    date_to: date = Query(...),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[EstoqueEvolucaoPoint]]:
    _validate_dates(date_from, date_to)
    series = movement_service.get_estoque_evolucao(date_from, date_to)
    return ok([EstoqueEvolucaoPoint(**item) for item in series])


@router.get("/top-sem-mov", response_model=SuccessResponse[list[TopSemMovItem]])
def top_sem_mov_legacy(
    days: int = Query(30, ge=1, le=365),
    date_to: date | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSemMovItem]]:
    date_to = date_to or date.today()
    items = movement_service.get_top_sem_mov(days, date_to, limit=5)
    return ok([TopSemMovItem(**item) for item in items])
