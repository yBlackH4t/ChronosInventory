"""
Servico de relatorios para a API (sem UI).
Responsabilidade: montar datasets e delegar a geracao de PDF.
"""

from __future__ import annotations

from datetime import date

from app.services.movement_service import MovementService
from app.services.report_service import ReportService
from app.services.stock_service import StockService


class ReportApiService:
    def __init__(self) -> None:
        self.report_service = ReportService()
        self.stock_service = StockService()
        self.movement_service = MovementService()

    def generate_stock_report_pdf(self) -> bytes:
        products_df = self.stock_service.get_products_as_dataframe()
        return self.report_service.generate_stock_report_bytes(products_df)

    def generate_real_sales_report_pdf(
        self,
        date_from: date,
        date_to: date,
        scope: str = "AMBOS",
    ) -> bytes:
        rows = self.movement_service.list_real_sales(date_from, date_to, scope=scope)
        return self.report_service.generate_real_sales_report_bytes(
            rows=rows,
            date_from=date_from,
            date_to=date_to,
            scope=scope,
        )

    def generate_inactive_stock_report_pdf(
        self,
        days: int,
        date_to: date,
        scope: str = "AMBOS",
    ) -> bytes:
        rows = self.movement_service.list_inactive_products_report(days=days, date_to=date_to, scope=scope)
        return self.report_service.generate_inactive_stock_report_bytes(
            rows=rows,
            days=days,
            date_to=date_to,
            scope=scope,
        )
