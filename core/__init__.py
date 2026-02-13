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
    WINDOW_TITLE,
    WINDOW_SIZE,
    UI_COLORS,
    MESSAGES,
    OPERATION_TYPES,
    STOCK_LOCATIONS
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
    'WINDOW_TITLE',
    'WINDOW_SIZE',
    'UI_COLORS',
    'MESSAGES',
    'OPERATION_TYPES',
    'STOCK_LOCATIONS'
]
