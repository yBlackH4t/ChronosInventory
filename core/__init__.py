"""
Core package - Infraestrutura do sistema.
"""

from core.exceptions import (
    EstoqueBaseException,
    DatabaseException,
    ValidationException,
    InsufficientStockException,
    ProductNotFoundException,
    MigrationException,
    UpdateException,
    FileOperationException
)

from core.constants import (
    APP_VERSION,
    MESSAGES
)

__all__ = [
    # Exceptions
    'EstoqueBaseException',
    'DatabaseException',
    'ValidationException',
    'InsufficientStockException',
    'ProductNotFoundException',
    'MigrationException',
    'UpdateException',
    'FileOperationException',
    
    # Constants
    'APP_VERSION',
    'MESSAGES'
]
