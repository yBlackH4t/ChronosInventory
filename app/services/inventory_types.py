"""
Tipos e constantes do modulo de inventario.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


INVENTORY_STATUS_ABERTO = "ABERTO"
INVENTORY_STATUS_FECHADO = "FECHADO"
INVENTORY_STATUS_APLICADO = "APLICADO"
INVENTORY_LOCAL_VALIDOS = {"CANOAS", "PF"}
INVENTORY_STATUS_FILTERS = {
    "ALL",
    "DIVERGENT",
    "MATCHED",
    "MISSING",
    "SURPLUS",
    "NOT_COUNTED",
    "PENDING",
    "APPLIED",
}


@dataclass
class InventorySessionRecord:
    id: int
    nome: str
    local: str
    status: str
    observacao: Optional[str]
    created_at: datetime
    updated_at: datetime
    applied_at: Optional[datetime]
    total_items: int
    counted_items: int
    divergent_items: int


@dataclass
class InventoryCountRecord:
    produto_id: int
    produto_nome: str
    qtd_sistema: int
    qtd_fisico: Optional[int]
    divergencia: Optional[int]
    motivo_ajuste: Optional[str]
    observacao: Optional[str]
    applied_movement_id: Optional[int]
    updated_at: Optional[datetime]
