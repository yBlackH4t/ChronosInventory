"""
Utilitário para formatação de datas.
Centraliza toda lógica de conversão e formatação de datas do sistema.
"""

from datetime import datetime
from typing import Optional
from core.constants import DATE_FORMAT_DISPLAY, DATE_FORMAT_DB, DATE_FORMAT_FILE


class DateFormatter:
    """Classe utilitária para formatação de datas."""
    
    @staticmethod
    def format_for_display(date_str: str) -> str:
        """
        Converte data do formato do banco para formato de exibição.
        
        Args:
            date_str: Data no formato ISO (YYYY-MM-DD HH:MM:SS)
            
        Returns:
            Data formatada (DD/MM/YYYY HH:MM:SS)
        """
        try:
            dt = datetime.strptime(date_str, DATE_FORMAT_DB)
            return dt.strftime(DATE_FORMAT_DISPLAY)
        except (ValueError, TypeError):
            return str(date_str)
    
    @staticmethod
    def format_for_database(date_str: str) -> str:
        """
        Converte data do formato de exibição para formato do banco.
        
        Args:
            date_str: Data no formato DD/MM/YYYY HH:MM:SS
            
        Returns:
            Data formatada (YYYY-MM-DD HH:MM:SS)
        """
        try:
            dt = datetime.strptime(date_str, DATE_FORMAT_DISPLAY)
            return dt.strftime(DATE_FORMAT_DB)
        except (ValueError, TypeError):
            return str(date_str)
    
    @staticmethod
    def format_for_filename() -> str:
        """
        Gera timestamp para nome de arquivo.
        
        Returns:
            Timestamp formatado (YYYYMMDD_HHMMSS)
        """
        return datetime.now().strftime(DATE_FORMAT_FILE)
    
    @staticmethod
    def get_current_datetime() -> str:
        """
        Retorna data/hora atual no formato do banco.
        
        Returns:
            Data/hora atual (YYYY-MM-DD HH:MM:SS)
        """
        return datetime.now().strftime(DATE_FORMAT_DB)
    
    @staticmethod
    def parse_to_datetime(date_str: str, format_str: str = DATE_FORMAT_DB) -> Optional[datetime]:
        """
        Converte string para objeto datetime.
        
        Args:
            date_str: String de data
            format_str: Formato da string
            
        Returns:
            Objeto datetime ou None se falhar
        """
        try:
            return datetime.strptime(date_str, format_str)
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def is_valid_date(date_str: str, format_str: str = DATE_FORMAT_DB) -> bool:
        """
        Verifica se uma string é uma data válida.
        
        Args:
            date_str: String de data
            format_str: Formato esperado
            
        Returns:
            True se válida, False caso contrário
        """
        return DateFormatter.parse_to_datetime(date_str, format_str) is not None
