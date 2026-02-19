from __future__ import annotations

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

Location = Literal["CANOAS", "PF"]
MovementType = Literal["ENTRADA", "SAIDA", "TRANSFERENCIA"]
MovementNature = Literal["OPERACAO_NORMAL", "TRANSFERENCIA_EXTERNA", "DEVOLUCAO", "AJUSTE"]
AdjustmentReason = Literal[
    "AVARIA",
    "PERDA",
    "CORRECAO_INVENTARIO",
    "ERRO_OPERACIONAL",
    "TRANSFERENCIA",
]


class MovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: MovementType
    produto_id: int = Field(ge=1)
    quantidade: int = Field(ge=1)
    origem: Optional[Location] = None
    destino: Optional[Location] = None
    observacao: Optional[str] = Field(default=None, max_length=200)
    natureza: Optional[MovementNature] = None
    motivo_ajuste: Optional[AdjustmentReason] = None
    local_externo: Optional[str] = Field(default=None, max_length=120)
    documento: Optional[str] = Field(default=None, max_length=120)
    movimento_ref_id: Optional[int] = Field(default=None, ge=1)
    data: Optional[datetime] = None


class MovementOut(BaseModel):
    id: int
    produto_id: int
    produto_nome: Optional[str] = None
    tipo: MovementType
    quantidade: int
    origem: Optional[Location] = None
    destino: Optional[Location] = None
    observacao: Optional[str] = None
    natureza: MovementNature = "OPERACAO_NORMAL"
    motivo_ajuste: Optional[AdjustmentReason] = None
    local_externo: Optional[str] = None
    documento: Optional[str] = None
    movimento_ref_id: Optional[int] = None
    data: datetime
