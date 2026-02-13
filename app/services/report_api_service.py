"""
Serviço de relatórios para API (sem UI).
Responsabilidade: gerar PDF em bytes.
"""

from __future__ import annotations

from app.services.report_service import ReportService
from app.services.stock_service import StockService


class ReportApiService:
    def __init__(self) -> None:
        self.report_service = ReportService()
        self.stock_service = StockService()

    def generate_stock_report_pdf(self) -> bytes:
        products_df = self.stock_service.get_products_as_dataframe()
        return self.report_service.generate_stock_report_bytes(products_df)
