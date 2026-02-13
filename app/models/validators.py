"""
Validadores de regras de negócio para Models.
Centraliza validações específicas de domínio.
"""

from core.utils.validators import Validators
from core.exceptions import ValidationException, InsufficientStockException
from core.constants import MESSAGES


class ProductValidator:
    """Validador para entidade Product."""
    
    @staticmethod
    def validate_product_data(nome: str, qtd_canoas: int, qtd_pf: int) -> None:
        """
        Valida dados de um produto.
        
        Args:
            nome: Nome do produto
            qtd_canoas: Quantidade em Canoas
            qtd_pf: Quantidade em Passo Fundo
            
        Raises:
            ValidationException: Se dados inválidos
        """
        # Valida nome
        Validators.validate_required(nome, "Nome do produto")
        
        # Valida quantidades
        qtd_c = Validators.validate_non_negative_integer(qtd_canoas, "Quantidade em Canoas")
        qtd_p = Validators.validate_non_negative_integer(qtd_pf, "Quantidade em Passo Fundo")
        
        # Valida que ao menos uma quantidade seja maior que zero
        if qtd_c + qtd_p <= 0:
            raise ValidationException(MESSAGES["MIN_STOCK_REQUIRED"])
    
    @staticmethod
    def validate_product_name(nome: str) -> None:
        """
        Valida apenas o nome do produto.
        
        Args:
            nome: Nome do produto
            
        Raises:
            ValidationException: Se nome inválido
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
            ValidationException: Se quantidade inválida
        """
        Validators.validate_non_negative_integer(quantity, "Quantidade")


class StockMovementValidator:
    """Validador para entidade StockMovement."""
    
    @staticmethod
    def validate_movement_data(
        operation_type: str,
        quantity: int,
        location: str = None,
        transfer_direction: str = None
    ) -> None:
        """
        Valida dados de uma movimentação.
        
        Args:
            operation_type: Tipo de operação
            quantity: Quantidade
            location: Local (para entrada/saída)
            transfer_direction: Direção (para transferência)
            
        Raises:
            ValidationException: Se dados inválidos
        """
        # Valida tipo de operação
        Validators.validate_required(operation_type, "Tipo de operação")
        
        valid_operations = ["ENTRADA", "SAIDA", "TRANSF", "TRANSFERENCIA"]
        if operation_type.upper() not in valid_operations:
            raise ValidationException(
                f"Tipo de operação inválido. Use: {', '.join(valid_operations)}"
            )
        
        # Valida quantidade
        qty = Validators.validate_positive_integer(quantity, "Quantidade")
        Validators.validate_min_value(qty, 1, "Quantidade")
        
        # Valida local para operações não-transferência
        if operation_type.upper() in ["ENTRADA", "SAIDA"]:
            Validators.validate_required(location, "Local")
        
        # Valida direção para transferências
        if operation_type.upper() in ["TRANSF", "TRANSFERENCIA"]:
            Validators.validate_required(transfer_direction, "Direção da transferência")
    
    @staticmethod
    def validate_sufficient_stock(
        current_stock: int,
        quantity: int,
        location: str
    ) -> None:
        """
        Valida se há estoque suficiente para operação.
        
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
        Valida quantidade de movimentação.
        
        Args:
            quantity: Quantidade
            
        Raises:
            ValidationException: Se quantidade inválida
        """
        qty = Validators.validate_positive_integer(quantity, "Quantidade")
        Validators.validate_min_value(qty, 1, "Quantidade")
