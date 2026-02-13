"""
Validadores genéricos do sistema.
Centraliza lógica de validação reutilizável.
"""

import re
from typing import Any, Optional
from core.exceptions import ValidationException


class Validators:
    """Classe utilitária para validações."""
    
    @staticmethod
    def validate_required(value: Any, field_name: str = "Campo") -> None:
        """
        Valida se um valor é obrigatório (não vazio).
        
        Args:
            value: Valor a validar
            field_name: Nome do campo para mensagem de erro
            
        Raises:
            ValidationException: Se valor for vazio
        """
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValidationException(f"{field_name} é obrigatório.")
    
    @staticmethod
    def validate_positive_integer(value: Any, field_name: str = "Valor") -> int:
        """
        Valida e converte para inteiro positivo.
        
        Args:
            value: Valor a validar
            field_name: Nome do campo para mensagem de erro
            
        Returns:
            Valor convertido para inteiro
            
        Raises:
            ValidationException: Se não for inteiro ou for negativo
        """
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise ValidationException(f"{field_name} deve ser um número inteiro.")
        
        if int_value < 0:
            raise ValidationException(f"{field_name} não pode ser negativo.")
        
        return int_value
    
    @staticmethod
    def validate_non_negative_integer(value: Any, field_name: str = "Valor") -> int:
        """
        Valida e converte para inteiro não-negativo (permite zero).
        
        Args:
            value: Valor a validar
            field_name: Nome do campo para mensagem de erro
            
        Returns:
            Valor convertido para inteiro
            
        Raises:
            ValidationException: Se não for inteiro ou for negativo
        """
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise ValidationException(f"{field_name} deve ser um número inteiro.")
        
        if int_value < 0:
            raise ValidationException(f"{field_name} não pode ser negativo.")
        
        return int_value
    
    @staticmethod
    def validate_min_value(value: int, min_value: int, field_name: str = "Valor") -> None:
        """
        Valida se valor é maior ou igual ao mínimo.
        
        Args:
            value: Valor a validar
            min_value: Valor mínimo permitido
            field_name: Nome do campo para mensagem de erro
            
        Raises:
            ValidationException: Se valor for menor que o mínimo
        """
        if value < min_value:
            raise ValidationException(f"{field_name} deve ser no mínimo {min_value}.")
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Remove caracteres perigosos de nomes de arquivo.
        Previne Path Traversal e outros ataques.
        
        Args:
            filename: Nome do arquivo a sanitizar
            
        Returns:
            Nome de arquivo sanitizado
        """
        # Remove caracteres perigosos
        sanitized = re.sub(r'[\\/*?:"<>|]', "", str(filename))
        # Remove espaços extras
        sanitized = sanitized.strip()
        return sanitized
    
    @staticmethod
    def validate_file_extension(filename: str, allowed_extensions: list) -> bool:
        """
        Valida se extensão do arquivo é permitida.
        
        Args:
            filename: Nome do arquivo
            allowed_extensions: Lista de extensões permitidas (ex: ['.jpg', '.png'])
            
        Returns:
            True se extensão é válida, False caso contrário
        """
        import os
        ext = os.path.splitext(filename)[1].lower()
        return ext in [e.lower() for e in allowed_extensions]
    
    @staticmethod
    def validate_string_length(value: str, max_length: int, field_name: str = "Campo") -> None:
        """
        Valida comprimento máximo de string.
        
        Args:
            value: String a validar
            max_length: Comprimento máximo permitido
            field_name: Nome do campo para mensagem de erro
            
        Raises:
            ValidationException: Se string exceder comprimento máximo
        """
        if len(value) > max_length:
            raise ValidationException(
                f"{field_name} não pode ter mais de {max_length} caracteres."
            )
    
    @staticmethod
    def validate_version_format(version: str) -> bool:
        """
        Valida formato de versão (ex: 1.2.3).
        
        Args:
            version: String de versão
            
        Returns:
            True se formato é válido, False caso contrário
        """
        pattern = r'^\d+\.\d+\.\d+$'
        return bool(re.match(pattern, version))
    
    @staticmethod
    def parse_version(version_str: str) -> tuple:
        """
        Converte string de versão para tupla para comparação.
        
        Args:
            version_str: String de versão (ex: "1.2.3")
            
        Returns:
            Tupla de inteiros (ex: (1, 2, 3))
        """
        try:
            return tuple(map(int, version_str.split(".")))
        except (ValueError, AttributeError):
            return (0, 0, 0)
