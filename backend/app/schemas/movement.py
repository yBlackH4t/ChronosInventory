from __future__ import annotations

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

Location = Literal["CANOAS", "PF"]
MovementType = Literal["ENTRADA", "SAIDA", "TRANSFERENCIA"]


class MovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: MovementType
    produto_id: int = Field(ge=1)
    quantidade: int = Field(ge=1)
    origem: Optional[Location] = None
    destino: Optional[Location] = None
    observacao: Optional[str] = Field(default=None, max_length=200)
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
    data: datetime
