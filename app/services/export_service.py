"""
Serviço de exportação (Excel) para API.
Responsabilidade: gerar arquivo de produtos para download.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Tuple

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

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

    def export_stock_overview_excel(self) -> Tuple[str, int]:
        products_df = self.stock_service.get_products_as_dataframe()
        temp_dir = FileUtils.get_temp_directory()
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        filename = f"estoque_resumo_{timestamp}.xlsx"
        path = os.path.join(temp_dir, filename)

        wb = Workbook()
        ws_summary = wb.active
        ws_summary.title = "Resumo"
        ws_stock = wb.create_sheet("Estoque")

        total_items = int(len(products_df.index))
        total_canoas = int(products_df["Canoas"].sum()) if not products_df.empty else 0
        total_pf = int(products_df["PF"].sum()) if not products_df.empty else 0
        total_global = total_canoas + total_pf
        items_with_stock = int(((products_df["Canoas"] + products_df["PF"]) > 0).sum()) if not products_df.empty else 0

        title_fill = PatternFill("solid", fgColor="1D4ED8")
        subtitle_fill = PatternFill("solid", fgColor="DBEAFE")
        header_fill = PatternFill("solid", fgColor="E0E7FF")
        accent_fill = PatternFill("solid", fgColor="EEF2FF")
        border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )

        ws_summary.merge_cells("A1:D1")
        ws_summary["A1"] = "Chronos Inventory - Resumo de Estoque"
        ws_summary["A1"].font = Font(color="FFFFFF", bold=True, size=15)
        ws_summary["A1"].fill = title_fill
        ws_summary["A1"].alignment = Alignment(horizontal="center", vertical="center")

        ws_summary.merge_cells("A2:D2")
        ws_summary["A2"] = f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        ws_summary["A2"].font = Font(color="1E293B", italic=True, size=11)
        ws_summary["A2"].fill = subtitle_fill
        ws_summary["A2"].alignment = Alignment(horizontal="center", vertical="center")

        summary_rows = [
            ("Total de produtos ativos", total_items),
            ("Itens com estoque", items_with_stock),
            ("Total de pecas em Canoas", total_canoas),
            ("Total de pecas em Passo Fundo", total_pf),
            ("Total global de pecas", total_global),
        ]

        start_row = 4
        for index, (label, value) in enumerate(summary_rows, start=start_row):
            ws_summary[f"A{index}"] = label
            ws_summary[f"A{index}"].font = Font(bold=True, color="334155")
            ws_summary[f"A{index}"].fill = accent_fill
            ws_summary[f"A{index}"].border = border
            ws_summary[f"B{index}"] = value
            ws_summary[f"B{index}"].font = Font(bold=True, color="0F172A")
            ws_summary[f"B{index}"].border = border

        ws_summary["A11"] = "Leitura rapida"
        ws_summary["A11"].font = Font(bold=True, color="1E3A8A")
        ws_summary["A11"].fill = header_fill
        ws_summary["A11"].border = border
        ws_summary["A12"] = "Use a aba Estoque para ver item por item, com Canoas, PF, total e onde existe saldo."
        ws_summary["A12"].alignment = Alignment(wrap_text=True)
        ws_summary["A12"].border = border
        ws_summary.merge_cells("A12:D12")

        ws_summary.column_dimensions["A"].width = 30
        ws_summary.column_dimensions["B"].width = 18
        ws_summary.column_dimensions["C"].width = 18
        ws_summary.column_dimensions["D"].width = 18

        stock_headers = ["ID", "Produto", "Estoque Canoas", "Estoque PF", "Total", "Onde tem"]
        for col_index, header in enumerate(stock_headers, start=1):
            cell = ws_stock.cell(row=1, column=col_index)
            cell.value = header
            cell.font = Font(bold=True, color="1E293B")
            cell.fill = header_fill
            cell.border = border
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for row_index, product in enumerate(products_df.itertuples(index=False), start=2):
            total = int(product.Canoas) + int(product.PF)
            where = self._location_summary(int(product.Canoas), int(product.PF))
            values = [int(product.ID), str(product.Produto), int(product.Canoas), int(product.PF), total, where]
            for col_index, value in enumerate(values, start=1):
                cell = ws_stock.cell(row=row_index, column=col_index)
                cell.value = value
                cell.border = border
                cell.alignment = Alignment(vertical="center")
                if col_index in {3, 4, 5}:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
            if row_index % 2 == 0:
                for col_index in range(1, len(stock_headers) + 1):
                    ws_stock.cell(row=row_index, column=col_index).fill = PatternFill("solid", fgColor="F8FAFC")

        ws_stock.freeze_panes = "A2"
        ws_stock.auto_filter.ref = f"A1:F{max(len(products_df.index) + 1, 2)}"

        widths = {
            1: 10,
            2: 42,
            3: 16,
            4: 14,
            5: 10,
            6: 18,
        }
        for col_index, width in widths.items():
            ws_stock.column_dimensions[get_column_letter(col_index)].width = width

        wb.save(path)
        return path, total_items

    @staticmethod
    def _location_summary(qtd_canoas: int, qtd_pf: int) -> str:
        if qtd_canoas > 0 and qtd_pf > 0:
            return "Canoas / PF"
        if qtd_canoas > 0:
            return "Canoas"
        if qtd_pf > 0:
            return "Passo Fundo"
        return "Sem saldo"
