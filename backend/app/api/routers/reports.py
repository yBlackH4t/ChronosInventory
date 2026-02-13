from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.services.report_api_service import ReportApiService
from backend.app.api.deps import get_report_api_service


router = APIRouter(prefix="/relatorios", tags=["relatorios"])


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
