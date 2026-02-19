from __future__ import annotations

from datetime import datetime
from typing import Literal

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


class BackupAutoConfigOut(BaseModel):
    enabled: bool
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    retention_days: int = Field(ge=1)
    schedule_mode: Literal["DAILY", "WEEKLY"] = "DAILY"
    weekday: int = Field(default=0, ge=0, le=6)
    last_run_date: str | None = None
    last_result: str | None = None
    last_backup_name: str | None = None


class BackupAutoConfigIn(BaseModel):
    enabled: bool
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    retention_days: int = Field(ge=1)
    schedule_mode: Literal["DAILY", "WEEKLY"] = "DAILY"
    weekday: int = Field(default=0, ge=0, le=6)


class BackupRestoreTestIn(BaseModel):
    backup_name: str | None = Field(default=None, max_length=260)


class BackupRestoreTestOut(BaseModel):
    backup_name: str
    backup_path: str
    ok: bool
    integrity_result: str
    required_tables: list[str]
    missing_tables: list[str]
