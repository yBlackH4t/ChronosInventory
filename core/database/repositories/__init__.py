"""
Repositories package - Camada de acesso a dados.
"""

from core.database.repositories.base_repository import BaseRepository
from core.database.repositories.product_repository import ProductRepository
from core.database.repositories.history_repository import HistoryRepository
from core.database.repositories.movement_repository import MovementRepository

__all__ = [
    'BaseRepository',
    'ProductRepository',
    'HistoryRepository',
    'MovementRepository'
]
