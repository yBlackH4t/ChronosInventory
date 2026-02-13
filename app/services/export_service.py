"""
Serviço de exportação (Excel) para API.
Responsabilidade: gerar arquivo de produtos para download.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Tuple

import pandas as pd

from app.services.stock_service import StockService
from core.constants import DATE_FORMAT_FILE
from core.utils.file_utils import FileUtils


class ExportService:
    def __init__(self) -> None:
        self.stock_service = StockService()

    def export_products_excel(self) -> Tuple[str, int]:
        products_df = self.stock_service.get_products_as_dataframe()
        temp_dir = FileUtils.get_temp_directory()
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        filename = f"export_produtos_{timestamp}.xlsx"
        path = os.path.join(temp_dir, filename)

        products_df.to_excel(path, index=False)
        return path, len(products_df)
