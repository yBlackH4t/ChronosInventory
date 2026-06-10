"""
Validadores de regras de negocio para Models.
Centraliza validacoes especificas de dominio.
"""

from typing import Dict

from core.utils.validators import Validators
from core.exceptions import ValidationException, InsufficientStockException
from core.constants import MESSAGES


class ProductValidator:
    """Validador para entidade Product."""
    
    @staticmethod
    def validate_product_data(nome: str, inventories: Dict[int, int]) -> None:
        """
        Valida dados de um produto.
        
        Args:
            nome: Nome do produto
            inventories: Dict {location_id: quantidade} com estoques por local
            
        Raises:
            ValidationException: Se dados invalidos
        """
        # Valida nome
        Validators.validate_required(nome, "Nome do produto")
        
        # Valida cada quantidade no dict de inventories
        total = 0
        for location_id, qty in inventories.items():
            validated_qty = Validators.validate_non_negative_integer(
                qty, f"Quantidade no local {location_id}"
            )
            total += validated_qty
        
        # Permitir que produtos sejam criados com estoque zerado
        # Especialmente útil para importação de planilhas.
    
    @staticmethod
    def validate_product_name(nome: str) -> None:
        """
        Valida apenas o nome do produto.
        
        Args:
            nome: Nome do produto
            
        Raises:
            ValidationException: Se nome invalido
        """
        Validators.validate_required(nome, "Nome do produto")
        Validators.validate_string_length(nome, 255, "Nome do produto")
    
    @staticmethod
    def validate_stock_quantity(quantity: int) -> None:
        """
        Valida quantidade de estoque.
        
        Args:
            quantity: Quantidade
            
        Raises:
            ValidationException: Se quantidade invÃ¡lida
        """
        Validators.validate_non_negative_integer(quantity, "Quantidade")


class StockMovementValidator:
    """Validador de regras para movimentacoes de estoque."""
    
    @staticmethod
    def validate_movement_data(
        operation_type: str,
        quantity: int,
        location: str = None,
        transfer_direction: str = None
    ) -> None:
        """
        Valida dados de uma movimentacao.
        
        Args:
            operation_type: Tipo de operacao
            quantity: Quantidade
            location: Local (para entrada/saida)
            transfer_direction: Direcao (para transferencia)
            
        Raises:
            ValidationException: Se dados invalidos
        """
        # Valida tipo de operacao
        Validators.validate_required(operation_type, "Tipo de operacao")
        
        valid_operations = ["ENTRADA", "SAIDA", "TRANSF", "TRANSFERENCIA"]
        if operation_type.upper() not in valid_operations:
            raise ValidationException(
                f"Tipo de operacao invalido. Use: {', '.join(valid_operations)}"
            )
        
        # Valida quantidade
        qty = Validators.validate_positive_integer(quantity, "Quantidade")
        Validators.validate_min_value(qty, 1, "Quantidade")
        
        # Valida local para operacoes nao-transferencia
        if operation_type.upper() in ["ENTRADA", "SAIDA"]:
            Validators.validate_required(location, "Local")
        
        # Valida direÃ§Ã£o para transferencias
        if operation_type.upper() in ["TRANSF", "TRANSFERENCIA"]:
            Validators.validate_required(transfer_direction, "Direcao da transferencia")
    
    @staticmethod
    def validate_sufficient_stock(
        current_stock: int,
        quantity: int,
        location: str
    ) -> None:
        """
        Valida se hÃ¡ estoque suficiente para operacao.
        
        Args:
            current_stock: Estoque atual
            quantity: Quantidade desejada
            location: Local do estoque
            
        Raises:
            InsufficientStockException: Se estoque insuficiente
        """
        if current_stock < quantity:
            raise InsufficientStockException(
                MESSAGES["INSUFFICIENT_STOCK"].format(location=location)
            )
    
    @staticmethod
    def validate_quantity(quantity: int) -> None:
        """
        Valida quantidade de movimentacao.
        
        Args:
            quantity: Quantidade
            
        Raises:
            ValidationException: Se quantidade invÃ¡lida
        """
        qty = Validators.validate_positive_integer(quantity, "Quantidade")
        Validators.validate_min_value(qty, 1, "Quantidade")

