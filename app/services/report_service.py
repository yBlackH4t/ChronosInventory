"""
Servico de geracao de relatorios em PDF.
Responsabilidade: transformar datasets em documentos prontos para download ou salvar localmente.
"""

from __future__ import annotations

import os
from io import BytesIO
from typing import Any, Dict, Iterable, List
from tkinter import filedialog

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.constants import (
    ABC_CLASSIFICATION,
    APP_VERSION,
    REPORT_COLUMN_WIDTHS_ABC,
    REPORT_COLUMN_WIDTHS_STOCK,
)


class ReportService:
    """Responsabilidade unica: gerar PDFs de relatorio."""

    def __init__(self) -> None:
        styles = getSampleStyleSheet()
        self.title_style = styles["Title"]
        self.subtitle_style = ParagraphStyle(
            "ChronosSubtitle",
            parent=styles["Normal"],
            textColor=colors.HexColor("#5f6b7a"),
            fontSize=9,
            leading=12,
        )
        self.body_style = ParagraphStyle(
            "ChronosBody",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
        )

    def generate_stock_report(self, products_df: pd.DataFrame) -> bool:
        save_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            initialfile="Relatorio_Estoque.pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if not save_path:
            return False

        pdf_bytes = self.generate_stock_report_bytes(products_df)
        with open(save_path, "wb") as output:
            output.write(pdf_bytes)
        os.startfile(save_path)
        return True

    def generate_stock_report_bytes(self, products_df: pd.DataFrame) -> bytes:
        data: List[List[Any]] = [["ID", "Produto", "Canoas", "PF"]]
        for _, row in products_df.iterrows():
            canoas = int(row.iloc[2] or 0)
            pf = int(row.iloc[3] or 0)
            if canoas + pf <= 0:
                continue
            data.append(
                [
                    str(int(row.iloc[0])),
                    self._paragraph(str(row.iloc[1])),
                    str(canoas),
                    str(pf),
                ]
            )

        return self._build_pdf_bytes(
            title=f"Relatorio de Estoque - Chronos Inventory v{APP_VERSION}",
            subtitles=["Itens ativos com saldo atual por local."],
            data=data,
            col_widths=REPORT_COLUMN_WIDTHS_STOCK,
            left_align_column=1,
            empty_message="Nenhum item com estoque disponivel para este relatorio.",
        )

    def generate_real_sales_report_bytes(
        self,
        rows: List[Dict[str, Any]],
        date_from,
        date_to,
        scope: str,
    ) -> bytes:
        data: List[List[Any]] = [["Data", "Mov", "ID", "Produto", "Local", "Qtd", "Documento"]]
        for row in rows:
            data.append(
                [
                    str(row.get("date") or "")[:16].replace("T", " "),
                    str(row.get("movement_id") or "-"),
                    str(row.get("produto_id") or "-"),
                    self._paragraph(str(row.get("produto_nome") or "-")),
                    str(row.get("origem") or "-"),
                    str(row.get("quantidade") or 0),
                    self._paragraph(str(row.get("documento") or "-")),
                ]
            )

        return self._build_pdf_bytes(
            title="Relatorio de vendas reais",
            subtitles=[
                f"Periodo: {date_from.strftime('%d/%m/%Y')} ate {date_to.strftime('%d/%m/%Y')}",
                f"Escopo: {scope}",
                "Considera somente movimentacoes do tipo SAIDA com natureza OPERACAO_NORMAL.",
            ],
            data=data,
            col_widths=[75, 38, 42, 180, 52, 40, 98],
            left_align_column=3,
            empty_message="Nenhuma venda real encontrada para o periodo informado.",
        )

    def generate_inactive_stock_report_bytes(
        self,
        rows: List[Dict[str, Any]],
        days: int,
        date_to,
        scope: str,
    ) -> bytes:
        data: List[List[Any]] = [["ID", "Produto", "Local", "Estoque", "Ult. mov.", "Dias sem mov."]]
        for row in rows:
            data.append(
                [
                    str(row.get("produto_id") or "-"),
                    self._paragraph(str(row.get("nome") or "-")),
                    str(row.get("local") or "-"),
                    str(row.get("estoque_atual") or 0),
                    str(row.get("last_movement") or "-")[:16].replace("T", " "),
                    str(row.get("dias_sem_mov") or days),
                ]
            )

        return self._build_pdf_bytes(
            title="Relatorio de estoque parado",
            subtitles=[
                f"Referencia: {date_to.strftime('%d/%m/%Y')}",
                f"Escopo: {scope} | Corte: {days} dias sem movimentacao",
                "Mostra apenas itens ativos com estoque atual e sem giro no periodo.",
            ],
            data=data,
            col_widths=[45, 235, 60, 55, 80, 50],
            left_align_column=1,
            empty_message="Nenhum item parado encontrado para os filtros informados.",
        )

    def generate_abc_report(
        self,
        products_df: pd.DataFrame,
        exit_counts: Dict[str, int],
    ) -> bool:
        save_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            initialfile="Relatorio_ABC.pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if not save_path:
            return False

        data: List[List[Any]] = [["Produto", "Saidas", "Classe"]]
        for product_name in products_df.iloc[:, 1]:
            exits = exit_counts.get(str(product_name), 0)
            classification = self._classify_abc(exits)
            data.append([self._paragraph(str(product_name)), str(exits), classification])

        pdf_bytes = self._build_pdf_bytes(
            title=f"Relatorio de Giro (Curva ABC) - Chronos Inventory v{APP_VERSION}",
            subtitles=["Classificacao baseada em saidas acumuladas por produto."],
            data=data,
            col_widths=REPORT_COLUMN_WIDTHS_ABC,
            left_align_column=0,
            empty_message="Nenhum dado disponivel para o relatorio ABC.",
        )
        with open(save_path, "wb") as output:
            output.write(pdf_bytes)
        os.startfile(save_path)
        return True

    def _classify_abc(self, exits: int) -> str:
        if exits >= ABC_CLASSIFICATION["A"]["min"]:
            return "A"
        if exits >= ABC_CLASSIFICATION["B"]["min"]:
            return "B"
        return "C"

    def _paragraph(self, value: str) -> Paragraph:
        return Paragraph(str(value or "-"), self.body_style)

    def _build_pdf_bytes(
        self,
        title: str,
        subtitles: Iterable[str],
        data: List[List[Any]],
        col_widths: List[int],
        left_align_column: int,
        empty_message: str,
    ) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=32, rightMargin=32, topMargin=30, bottomMargin=30)
        elements: List[Any] = [Paragraph(title, self.title_style), Spacer(1, 8)]

        for subtitle in subtitles:
            elements.append(Paragraph(str(subtitle), self.subtitle_style))
        elements.append(Spacer(1, 12))

        if len(data) <= 1:
            data.append([empty_message] + [""] * (len(data[0]) - 1))

        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(self._get_table_style(left_align_column))
        elements.append(table)
        doc.build(elements)
        return buffer.getvalue()

    def _get_table_style(self, left_align_column: int) -> TableStyle:
        style = TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
        style.add("ALIGN", (left_align_column, 1), (left_align_column, -1), "LEFT")
        return style
