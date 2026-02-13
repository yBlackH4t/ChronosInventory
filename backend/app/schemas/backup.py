from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class BackupOut(BaseModel):
    path: str
    size: int
    created_at: datetime
