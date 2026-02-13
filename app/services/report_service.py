"""
Serviço de geração de relatórios.
Responsabilidade: Gerar relatórios em PDF.
"""

import os
import pandas as pd
from typing import Dict, List, Any, Optional
from tkinter import filedialog
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from core.constants import (
    REPORT_COLUMN_WIDTHS_ABC,
    REPORT_COLUMN_WIDTHS_STOCK,
    ABC_CLASSIFICATION,
    APP_VERSION
)


class ReportService:
    """
    Serviço de Relatórios.
    Responsabilidade única: Gerar relatórios em PDF.
    """
    
    def generate_stock_report(self, products_df: pd.DataFrame) -> bool:
        """
        Gera relatório de estoque atual em PDF.
        
        Args:
            products_df: DataFrame com produtos
            
        Returns:
            True se gerado com sucesso, False se cancelado
        """
        save_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            initialfile="Relatorio_Estoque.pdf",
            filetypes=[("PDF", "*.pdf")]
        )
        
        if not save_path:
            return False
        
        doc = SimpleDocTemplate(save_path, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        style_body = styles["Normal"]
        
        # Título
        elements.append(
            Paragraph(f"Relatório de Estoque - Estoque RS v{APP_VERSION}", styles['Title'])
        )
        elements.append(Spacer(1, 12))
        
        # Dados da tabela
        data = [["ID", "Produto", "Canoas", "PF"]]
        
        for _, row in products_df.iterrows():
            # Só inclui produtos com estoque
            if int(row.iloc[2]) + int(row.iloc[3]) > 0:
                product_name = Paragraph(str(row.iloc[1]), style_body)
                data.append([
                    str(int(row.iloc[0])),
                    product_name,
                    str(int(row.iloc[2])),
                    str(int(row.iloc[3]))
                ])
        
        # Cria tabela
        table = Table(data, colWidths=REPORT_COLUMN_WIDTHS_STOCK)
        table.setStyle(self._get_table_style(1))  # Coluna 1 (Produto) alinhada à esquerda
        
        elements.append(table)
        doc.build(elements)
        
        # Abre PDF
        os.startfile(save_path)
        return True

    def generate_stock_report_bytes(self, products_df: pd.DataFrame) -> bytes:
        """
        Gera relatório de estoque atual em PDF e retorna bytes (sem UI).
        
        Args:
            products_df: DataFrame com produtos
            
        Returns:
            Bytes do PDF gerado
        """
        from io import BytesIO
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        style_body = styles["Normal"]
        
        # Título
        elements.append(
            Paragraph(f"Relatório de Estoque - Estoque RS v{APP_VERSION}", styles['Title'])
        )
        elements.append(Spacer(1, 12))
        
        # Dados da tabela
        data = [["ID", "Produto", "Canoas", "PF"]]
        
        for _, row in products_df.iterrows():
            # Só inclui produtos com estoque
            if int(row.iloc[2]) + int(row.iloc[3]) > 0:
                product_name = Paragraph(str(row.iloc[1]), style_body)
                data.append([
                    str(int(row.iloc[0])),
                    product_name,
                    str(int(row.iloc[2])),
                    str(int(row.iloc[3]))
                ])
        
        # Cria tabela
        table = Table(data, colWidths=REPORT_COLUMN_WIDTHS_STOCK)
        table.setStyle(self._get_table_style(1))  # Coluna 1 (Produto) alinhada à esquerda
        
        elements.append(table)
        doc.build(elements)
        
        return buffer.getvalue()
    
    def generate_abc_report(
        self,
        products_df: pd.DataFrame,
        exit_counts: Dict[str, int]
    ) -> bool:
        """
        Gera relatório de Curva ABC em PDF.
        
        Args:
            products_df: DataFrame com produtos
            exit_counts: Dicionário com contagem de saídas por produto
            
        Returns:
            True se gerado com sucesso, False se cancelado
        """
        save_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            initialfile="Relatorio_ABC.pdf",
            filetypes=[("PDF", "*.pdf")]
        )
        
        if not save_path:
            return False
        
        doc = SimpleDocTemplate(save_path, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        style_body = styles["Normal"]
        
        # Título
        elements.append(
            Paragraph(f"Relatório de Giro (Curva ABC) - Estoque RS v{APP_VERSION}", styles['Title'])
        )
        elements.append(Spacer(1, 12))
        
        # Dados da tabela
        data = [["Produto", "Saídas", "Classe"]]
        
        for product_name in products_df.iloc[:, 1]:
            exits = exit_counts.get(str(product_name), 0)
            classification = self._classify_abc(exits)
            
            product_paragraph = Paragraph(str(product_name), style_body)
            data.append([product_paragraph, str(exits), classification])
        
        # Cria tabela
        table = Table(data, colWidths=REPORT_COLUMN_WIDTHS_ABC)
        table.setStyle(self._get_table_style(0))  # Coluna 0 (Produto) alinhada à esquerda
        
        elements.append(table)
        doc.build(elements)
        
        # Abre PDF
        os.startfile(save_path)
        return True
    
    def _classify_abc(self, exits: int) -> str:
        """
        Classifica produto na curva ABC baseado em saídas.
        
        Args:
            exits: Número de saídas
            
        Returns:
            Classificação (A, B ou C)
        """
        if exits >= ABC_CLASSIFICATION["A"]["min"]:
            return "A"
        elif exits >= ABC_CLASSIFICATION["B"]["min"]:
            return "B"
        else:
            return "C"
    
    def _get_table_style(self, left_align_column: int) -> TableStyle:
        """
        Retorna estilo padrão para tabelas de relatório.
        
        Args:
            left_align_column: Índice da coluna a alinhar à esquerda
            
        Returns:
            TableStyle configurado
        """
        style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')
        ])
        
        # Alinha coluna específica à esquerda
        style.add('ALIGN', (left_align_column, 1), (left_align_column, -1), 'LEFT')
        
        return style
