"""
Exceções customizadas do sistema.
Centraliza todos os tipos de erros para melhor tratamento e rastreabilidade.
"""


class EstoqueBaseException(Exception):
    """Exceção base para todas as exceções do sistema."""
    pass


class DatabaseException(EstoqueBaseException):
    """Exceções relacionadas ao banco de dados."""
    pass


class ValidationException(EstoqueBaseException):
    """Exceções de validação de dados."""
    pass


class InsufficientStockException(EstoqueBaseException):
    """Exceção quando não há estoque suficiente para operação."""
    pass


class ProductNotFoundException(EstoqueBaseException):
    """Exceção quando produto não é encontrado."""
    pass


class MigrationException(EstoqueBaseException):
    """Exceções relacionadas à migração de dados."""
    pass


class UpdateException(EstoqueBaseException):
    """Exceções relacionadas ao sistema de atualização."""
    pass


class InvalidTransferException(EstoqueBaseException):
    """Exceção para transferências inválidas."""
    pass


class FileOperationException(EstoqueBaseException):
    """Exceções relacionadas a operações de arquivo."""
    pass
