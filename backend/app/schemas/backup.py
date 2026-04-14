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


class OfficialBaseManifestOut(BaseModel):
    format_version: int
    published_at: str
    publisher_machine: str
    publisher_name: str | None = None
    app_version: str
    min_app_version: str
    db_version: str
    database_filename: str
    database_sha256: str
    notes: str | None = None
    products_count: int | None = None
    products_with_stock_count: int | None = None
    movements_count: int | None = None
    database_size: int | None = None


class OfficialBaseHistoryItemOut(BaseModel):
    manifest_path: str
    zip_path: str | None = None
    manifest: OfficialBaseManifestOut


class OfficialBaseDirectoryTestOut(BaseModel):
    directory_exists: bool
    directory_accessible: bool
    read_ok: bool
    write_ok: bool
    latest_manifest_found: bool
    message: str


class LocalShareServerOut(BaseModel):
    enabled: bool
    running: bool
    port: int
    urls: list[str]
    machine_label: str
    publisher_name: str | None = None


class RemoteShareStatusOut(BaseModel):
    server_url: str
    reachable: bool
    machine_label: str | None = None
    app_version: str | None = None
    official_available: bool = False
    compare_available: bool = False
    official_manifest: "OfficialBaseManifestOut | None" = None
    message: str


class OfficialBaseStatusOut(BaseModel):
    config_path: str
    role: Literal["publisher", "consumer"]
    official_base_dir: str | None = None
    machine_label: str
    publisher_name: str | None = None
    server_enabled: bool = False
    server_port: int = 8765
    server_running: bool = False
    server_urls: list[str] = []
    remote_server_url: str | None = None
    can_publish: bool
    can_publish_server: bool = False
    directory_configured: bool
    directory_accessible: bool
    current_app_version: str
    current_db_version: str
    current_database_path: str
    current_database_size: int
    current_products_count: int
    current_products_with_stock_count: int
    current_movements_count: int
    latest_available: bool
    latest_zip_path: str | None = None
    latest_manifest_path: str | None = None
    latest_manifest: OfficialBaseManifestOut | None = None
    app_compatible_with_latest: bool | None = None
    server_latest_available: bool = False
    server_latest_zip_path: str | None = None
    server_latest_manifest_path: str | None = None
    server_latest_manifest: OfficialBaseManifestOut | None = None
    app_compatible_with_server_latest: bool | None = None


class OfficialBaseConfigIn(BaseModel):
    role: Literal["publisher", "consumer"] = "consumer"
    official_base_dir: str | None = Field(default=None, max_length=1024)
    machine_label: str | None = Field(default=None, max_length=120)
    publisher_name: str | None = Field(default=None, max_length=120)
    server_port: int | None = Field(default=None, ge=1024, le=65535)
    remote_server_url: str | None = Field(default=None, max_length=500)
    server_enabled: bool | None = None


class OfficialBasePublishIn(BaseModel):
    notes: str | None = Field(default=None, max_length=500)


class OfficialBaseDeleteIn(BaseModel):
    manifest_path: str | None = Field(default=None, max_length=2048)
    delete_latest: bool = False


class OfficialBasePublishOut(BaseModel):
    published_at: str
    zip_path: str
    manifest_path: str
    history_zip_path: str
    history_manifest_path: str
    app_version: str
    db_version: str
    machine_label: str
    publisher_name: str | None = None
    notes: str | None = None


class OfficialBaseDeleteOut(BaseModel):
    deleted_manifest_path: str
    deleted_zip_path: str | None = None
    deleted_latest: bool
    message: str


class OfficialBaseApplyOut(BaseModel):
    restored_from: str
    active_database: str
    pre_restore_backup: str
    validation_result: str
    published_at: str
    publisher_machine: str
    publisher_name: str | None = None
    app_version: str
    db_version: str
    notes: str | None = None
    restart_required: bool
