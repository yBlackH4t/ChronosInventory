"""
Servico de inventario ciclico.
Responsabilidade: orquestrar sessao, contagem e aplicacao de ajustes.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from app.services.inventory_adjustment_service import InventoryAdjustmentService
from app.services.inventory_session_service import InventorySessionService
from app.services.inventory_types import (
    InventoryCountRecord,
    InventorySessionRecord,
)
from core.database.connection import DatabaseConnection
from core.database.repositories.movement_repository import MovementRepository


class InventoryService:
    def __init__(self) -> None:
        self.db = DatabaseConnection()
        self.movement_repo = MovementRepository()
        self.sessions = InventorySessionService(db=self.db)
        self.adjustments = InventoryAdjustmentService(
            db=self.db,
            movement_repo=self.movement_repo,
            session_service=self.sessions,
        )

    def create_session(self, nome: str, local: str, observacao: Optional[str]) -> InventorySessionRecord:
        return self.sessions.create_session(nome, local, observacao)

    def list_sessions(self, limit: int = 20, offset: int = 0) -> List[InventorySessionRecord]:
        return self.sessions.list_sessions(limit, offset)

    def count_sessions(self) -> int:
        return self.sessions.count_sessions()

    def get_session(self, session_id: int) -> InventorySessionRecord:
        return self.sessions.get_session(session_id)

    def get_session_summary(self, session_id: int) -> dict:
        return self.sessions.get_session_summary(session_id)

    def list_session_counts(
        self,
        session_id: int,
        limit: int = 50,
        offset: int = 0,
        only_divergent: bool = False,
        query: str = "",
        status_filter: str = "ALL",
    ) -> Tuple[List[InventoryCountRecord], int]:
        return self.sessions.list_session_counts(session_id, limit, offset, only_divergent, query, status_filter)

    def update_counts(
        self,
        session_id: int,
        items: List[dict],
    ) -> InventorySessionRecord:
        return self.adjustments.update_counts(session_id, items)

    def close_session(self, session_id: int) -> InventorySessionRecord:
        return self.adjustments.close_session(session_id)

    def delete_session(self, session_id: int) -> dict:
        return self.adjustments.delete_session(session_id)

    def apply_session_adjustments(self, session_id: int) -> dict:
        return self.adjustments.apply_session_adjustments(session_id)
