from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.services.report_api_service import ReportApiService
from backend.app.api.deps import get_report_api_service
from backend.app.schemas.report import SelectedStockReportIn
from core.exceptions import ValidationException


router = APIRouter(prefix="/relatorios", tags=["relatorios"])


def _validate_scope(scope: str) -> str:
    value = (scope or "AMBOS").upper()
    if value not in {"CANOAS", "PF", "AMBOS"}:
        raise ValidationException("Scope invalido. Use CANOAS, PF ou AMBOS.")
    return value


@router.post("/estoque.pdf")
def report_stock_pdf(
    report_service: ReportApiService = Depends(get_report_api_service),
):
    try:
        pdf_bytes = report_service.generate_stock_report_pdf()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Falha ao gerar relatorio.") from exc

    filename = "Relatorio_Estoque.pdf"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "X-Filename": filename,
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.post("/estoque-selecionado.pdf")
def report_selected_stock_pdf(
    payload: SelectedStockReportIn,
    report_service: ReportApiService = Depends(get_report_api_service),
):
    try:
        pdf_bytes = report_service.generate_selected_stock_report_pdf(payload.product_ids)
    except ValidationException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Falha ao gerar relatorio de itens selecionados.") from exc

    filename = "Relatorio_Estoque_Selecionado.pdf"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "X-Filename": filename,
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/vendas-reais.pdf")
def report_real_sales_pdf(
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: str = Query("AMBOS"),
    report_service: ReportApiService = Depends(get_report_api_service),
):
    if date_from > date_to:
        raise ValidationException("date_from deve ser menor ou igual a date_to.")
    scope = _validate_scope(scope)
    try:
        pdf_bytes = report_service.generate_real_sales_report_pdf(
            date_from=date_from,
            date_to=date_to,
            scope=scope,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Falha ao gerar relatorio de vendas reais.") from exc

    filename = f"Relatorio_Vendas_Reais_{date_from.isoformat()}_{date_to.isoformat()}.pdf"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "X-Filename": filename,
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/estoque-parado.pdf")
def report_inactive_stock_pdf(
    days: int = Query(30, ge=1, le=365),
    date_to: date | None = Query(None),
    scope: str = Query("AMBOS"),
    report_service: ReportApiService = Depends(get_report_api_service),
):
    scope = _validate_scope(scope)
    date_to = date_to or date.today()
    try:
        pdf_bytes = report_service.generate_inactive_stock_report_pdf(
            days=days,
            date_to=date_to,
            scope=scope,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Falha ao gerar relatorio de estoque parado.") from exc

    filename = f"Relatorio_Estoque_Parado_{date_to.isoformat()}_{days}d.pdf"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "X-Filename": filename,
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
