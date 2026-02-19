from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


InventoryLocal = Literal["CANOAS", "PF"]
InventoryStatus = Literal["ABERTO", "APLICADO"]
AdjustmentReason = Literal[
    "AVARIA",
    "PERDA",
    "CORRECAO_INVENTARIO",
    "ERRO_OPERACIONAL",
    "TRANSFERENCIA",
]


class InventorySessionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=120)
    local: InventoryLocal
    observacao: Optional[str] = Field(default=None, max_length=200)


class InventorySessionOut(BaseModel):
    id: int
    nome: str
    local: InventoryLocal
    status: InventoryStatus
    observacao: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    applied_at: Optional[datetime] = None
    total_items: int
    counted_items: int
    divergent_items: int


class InventoryCountItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    produto_id: int = Field(ge=1)
    qtd_fisico: int = Field(ge=0)
    motivo_ajuste: Optional[AdjustmentReason] = None
    observacao: Optional[str] = Field(default=None, max_length=200)


class InventoryCountsUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[InventoryCountItemIn] = Field(min_length=1)


class InventoryCountOut(BaseModel):
    produto_id: int
    produto_nome: str
    qtd_sistema: int
    qtd_fisico: Optional[int] = None
    divergencia: Optional[int] = None
    motivo_ajuste: Optional[AdjustmentReason] = None
    observacao: Optional[str] = None
    applied_movement_id: Optional[int] = None
    updated_at: Optional[datetime] = None


class InventoryApplyOut(BaseModel):
    session_id: int
    applied_items: int
    movement_ids: list[int]
    status: InventoryStatus
