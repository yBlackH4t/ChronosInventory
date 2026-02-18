from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.services.backup_service import BackupService
from backend.app.api.deps import get_backup_service
from backend.app.api.responses import ok
from backend.app.schemas.backup import (
    BackupListItemOut,
    BackupOut,
    BackupRestoreIn,
    BackupRestoreOut,
    BackupValidateOut,
)
from backend.app.schemas.common import SuccessResponse
from core.exceptions import FileOperationException


router = APIRouter(prefix="/backup", tags=["backup"])


@router.post("/criar", response_model=SuccessResponse[BackupOut])
def create_backup(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupOut]:
    success, path = backup_service.create_automatic_backup()
    if not success:
        raise FileOperationException("Falha ao criar backup.")

    size = os.path.getsize(path)
    created_at = datetime.fromtimestamp(os.path.getmtime(path))
    return ok(BackupOut(path=path, size=size, created_at=created_at))


@router.get("/listar", response_model=SuccessResponse[list[BackupListItemOut]])
def list_backups(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[list[BackupListItemOut]]:
    items = [
        BackupListItemOut(
            name=item["name"],
            path=item["path"],
            size=item["size"],
            created_at=item["created_at"],
        )
        for item in backup_service.list_backups_metadata()
    ]
    return ok(items)


@router.get("/validar", response_model=SuccessResponse[BackupValidateOut])
def validate_backup(
    backup_name: Optional[str] = Query(default=None),
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupValidateOut]:
    result = backup_service.validate_backup(backup_name)
    return ok(
        BackupValidateOut(
            path=result["path"],
            ok=bool(result["ok"]),
            result=str(result["result"]),
        )
    )


@router.post("/restaurar", response_model=SuccessResponse[BackupRestoreOut])
def restore_backup(
    payload: BackupRestoreIn,
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupRestoreOut]:
    restored = backup_service.restore_backup(payload.backup_name)
    return ok(
        BackupRestoreOut(
            restored_from=restored["restored_from"],
            active_database=restored["active_database"],
            pre_restore_backup=restored["pre_restore_backup"],
            validation_result=restored["validation_result"],
        )
    )


@router.get("/diagnostico")
def export_diagnostics(
    backup_service: BackupService = Depends(get_backup_service),
) -> Response:
    filename, content = backup_service.export_diagnostics_archive()
    headers = {
        "x-filename": filename,
        "content-disposition": f'attachment; filename="{filename}"',
    }
    return Response(content=content, media_type="application/zip", headers=headers)
