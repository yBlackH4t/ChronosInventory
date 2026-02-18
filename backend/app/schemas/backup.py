from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BackupOut(BaseModel):
    path: str
    size: int
    created_at: datetime


class BackupListItemOut(BaseModel):
    name: str
    path: str
    size: int
    created_at: datetime


class BackupValidateOut(BaseModel):
    path: str
    ok: bool
    result: str


class BackupRestoreIn(BaseModel):
    backup_name: str = Field(min_length=1, max_length=260)


class BackupRestoreOut(BaseModel):
    restored_from: str
    active_database: str
    pre_restore_backup: str
    validation_result: str
