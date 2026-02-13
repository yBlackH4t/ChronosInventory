from fastapi import APIRouter, Depends

from app.services.stock_service import StockService
from backend.app.api.deps import get_stock_service
from backend.app.api.responses import ok
from backend.app.schemas.common import SuccessResponse
from backend.app.schemas.dashboard import DashboardSummaryOut


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumo", response_model=SuccessResponse[DashboardSummaryOut])
def get_dashboard_summary(
    stock_service: StockService = Depends(get_stock_service),
) -> SuccessResponse[DashboardSummaryOut]:
    summary = stock_service.get_dashboard_summary()
    return ok(DashboardSummaryOut(**summary))
