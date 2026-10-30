from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.services.movement_service import MovementService
from backend.app.api.deps import get_movement_service
from backend.app.api.responses import ok
from backend.app.schemas.analytics import (
    EntradasSaidasPoint,
    ExternalTransferItem,
    EstoqueEvolucaoPoint,
    FlowPoint,
    MovementNatureTotal,
    ProductStockHistoryPoint,
    RecentStockoutItem,
    SaidasPoint,
    StockDistributionOut,
    StockCountPoint,
    StockEvolutionPoint,
    StockHealthOut,
    StockItemOverview,
    StockSummaryOut,
    StockoutRiskItem,
    TopSaidaItem,
    TopSemMovItem,
)
from backend.app.schemas.common import SuccessResponse
from core.exceptions import ValidationException


router = APIRouter(prefix="/analytics", tags=["analytics"])

_ALLOWED_BUCKET = {"day", "week", "month"}
_ALLOWED_MOVEMENT_TYPE = {"ENTRADA", "SAIDA"}


def _validate_bucket(bucket: str) -> str:
    value = bucket.lower()
    if value not in _ALLOWED_BUCKET:
        raise ValidationException("Bucket inválido. Use day, week ou month.")
    return value


def _validate_dates(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise ValidationException("date_from deve ser menor ou igual a date_to.")


def _validate_movement_type(tipo: str) -> str:
    value = tipo.upper()
    if value not in _ALLOWED_MOVEMENT_TYPE:
        raise ValidationException("tipo inválido. Use ENTRADA ou SAIDA.")
    return value


@router.get("/stock/summary", response_model=SuccessResponse[StockSummaryOut])
def stock_summary(
    location_id: int | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockSummaryOut]:
    return ok(StockSummaryOut(**movement_service.get_stock_summary(scope=location_id)))


@router.get("/stock/distribution", response_model=SuccessResponse[StockDistributionOut])
def stock_distribution(
    location_id: int | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockDistributionOut]:
    return ok(StockDistributionOut(**movement_service.get_stock_distribution(scope=location_id)))


@router.get("/movements/top-saidas", response_model=SuccessResponse[list[TopSaidaItem]])
def top_saidas_v2(
    date_from: date = Query(...),
    date_to: date = Query(...),
    location_id: int | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSaidaItem]]:
    _validate_dates(date_from, date_to)
    items = movement_service.get_top_saidas(date_from, date_to, location_id, limit=limit)
    return ok([TopSaidaItem(**item) for item in items])


@router.get("/movements/timeseries", response_model=SuccessResponse[list[SaidasPoint]])
def saidas_timeseries(
    date_from: date = Query(...),
    date_to: date = Query(...),
    location_id: int | None = Query(None),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[SaidasPoint]]:
    _validate_dates(date_from, date_to)
    bucket = _validate_bucket(bucket)
    series = movement_service.get_saidas_timeseries(date_from, date_to, bucket=bucket, scope=location_id)
    return ok([SaidasPoint(**item) for item in series])


@router.get("/movements/flow", response_model=SuccessResponse[list[FlowPoint]])
def movements_flow(
    date_from: date = Query(...),
    date_to: date = Query(...),
    location_id: int | None = Query(None),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[FlowPoint]]:
    _validate_dates(date_from, date_to)
    bucket = _validate_bucket(bucket)
    series = movement_service.get_flow_timeseries(date_from, date_to, bucket=bucket, scope=location_id)
    return ok([FlowPoint(**item) for item in series])


@router.get("/movements/external-transfers", response_model=SuccessResponse[list[ExternalTransferItem]])
def external_transfers(
    date_from: date = Query(...),
    date_to: date = Query(...),
    tipo: str = Query("SAIDA"),
    location_id: int | None = Query(None),
    limit: int = Query(15, ge=1, le=50),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[ExternalTransferItem]]:
    _validate_dates(date_from, date_to)
    tipo = _validate_movement_type(tipo)
    items = movement_service.get_external_transfer_totals(
        date_from=date_from,
        date_to=date_to,
        tipo=tipo,
        scope=location_id,
        limit=limit,
    )
    return ok([ExternalTransferItem(**item) for item in items])


@router.get("/stock/evolution", response_model=SuccessResponse[list[StockEvolutionPoint]])
def stock_evolution(
    date_from: date = Query(...),
    date_to: date = Query(...),
    location_id: int | None = Query(None),
    bucket: str = Query("day"),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[StockEvolutionPoint]]:
    _validate_dates(date_from, date_to)
    bucket = _validate_bucket(bucket)
    series = movement_service.get_stock_evolution_series(date_from, date_to, bucket=bucket, scope=location_id)
    return ok([StockEvolutionPoint(**item) for item in series])


@router.get("/products/inactive", response_model=SuccessResponse[list[TopSemMovItem]])
def products_inactive(
    days: int = Query(30, ge=1, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSemMovItem]]:
    date_to = date_to or date.today()
    items = movement_service.get_top_sem_mov(days, date_to, limit=limit, scope=location_id)
    return ok([TopSemMovItem(**item) for item in items])


@router.get("/products/recent-stockouts", response_model=SuccessResponse[list[RecentStockoutItem]])
def products_recent_stockouts(
    days: int = Query(30, ge=1, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[RecentStockoutItem]]:
    date_to = date_to or date.today()
    items = movement_service.get_recent_stockouts(days, date_to, limit=limit, scope=location_id)
    return ok([RecentStockoutItem(**item) for item in items])


@router.get("/products/stockout-risk", response_model=SuccessResponse[list[StockoutRiskItem]])
def products_stockout_risk(
    days: int = Query(30, ge=1, le=365),
    max_dias: int = Query(15, ge=1, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[StockoutRiskItem]]:
    date_to = date_to or date.today()
    items = movement_service.get_stockout_risk(days, date_to, max_dias=max_dias, limit=limit, scope=location_id)
    return ok([StockoutRiskItem(**item) for item in items])


@router.get("/stock/items", response_model=SuccessResponse[list[StockItemOverview]])
def stock_items_overview(
    days: int = Query(90, ge=1, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[StockItemOverview]]:
    """Produtos com saldo, com a ultima saida (para a saude do estoque e a divisao por marca)."""
    date_to = date_to or date.today()
    items = movement_service.get_stock_items_overview(date_to, days=days, scope=location_id)
    return ok([StockItemOverview(**item) for item in items])


@router.get("/stock/health", response_model=SuccessResponse[StockHealthOut])
def stock_health(
    days: int = Query(90, ge=1, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    parados_limit: int = Query(20, ge=0, le=200),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockHealthOut]:
    """Saude do estoque ja contada e os parados com mais pecas (o Painel nao precisa da lista toda)."""
    date_to = date_to or date.today()
    health = movement_service.get_stock_health(date_to, days=days, scope=location_id, parados_limit=parados_limit)
    return ok(StockHealthOut(**health))


@router.get("/stock/count-history", response_model=SuccessResponse[list[StockCountPoint]])
def stock_count_history(
    days: int = Query(30, ge=2, le=365),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[StockCountPoint]]:
    """Produtos com saldo e zerados no fim de cada dia (linhas de tendencia do Painel)."""
    date_to = date_to or date.today()
    points = movement_service.get_stock_count_history(date_to, days=days, scope=location_id)
    return ok([StockCountPoint(**point) for point in points])


@router.get("/movements/by-nature", response_model=SuccessResponse[list[MovementNatureTotal]])
def movements_by_nature(
    date_from: date = Query(...),
    date_to: date = Query(...),
    tipo: str = Query("SAIDA"),
    location_id: int | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[MovementNatureTotal]]:
    _validate_dates(date_from, date_to)
    tipo = _validate_movement_type(tipo)
    items = movement_service.get_movement_nature_totals(date_from, date_to, tipo, scope=location_id)
    return ok([MovementNatureTotal(**item) for item in items])


@router.get(
    "/products/{product_id}/stock-history",
    response_model=SuccessResponse[list[ProductStockHistoryPoint]],
)
def product_stock_history(
    product_id: int,
    days: int = Query(180, ge=7, le=730),
    date_to: date | None = Query(None),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[ProductStockHistoryPoint]]:
    date_to = date_to or date.today()
    points = movement_service.get_product_stock_history(product_id, date_to, days=days)
    return ok([ProductStockHistoryPoint(**point) for point in points])


# -----------------------------------------------------------------------------
# Compatibilidade com endpoints antigos
# -----------------------------------------------------------------------------
@router.get("/top-saidas", response_model=SuccessResponse[list[TopSaidaItem]])
def top_saidas_legacy(
    date_from: date = Query(...),
    date_to: date = Query(...),
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[list[TopSaidaItem]]:
    return top_saidas_v2(date_from, date_to, None, 5, movement_service)


@router.get("/estoque-distribuicao", response_model=SuccessResponse[StockDistributionOut])
def estoque_distribuicao_legacy(
    movement_service: MovementService = Depends(get_movement_service),
) -> SuccessResponse[StockDistributionOut]:
    return stock_distribution(None, movement_service)


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
