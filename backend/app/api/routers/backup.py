from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.services.backup_service import BackupService
from backend.app.api.deps import get_backup_service
from backend.app.api.responses import ok
from backend.app.schemas.backup import BackupOut
from backend.app.schemas.common import SuccessResponse


router = APIRouter(prefix="/backup", tags=["backup"])


@router.post("/criar", response_model=SuccessResponse[BackupOut])
def create_backup(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupOut]:
    success, path = backup_service.create_automatic_backup()
    if not success:
        raise HTTPException(status_code=500, detail="Falha ao criar backup.")

    size = os.path.getsize(path)
    created_at = datetime.fromtimestamp(os.path.getmtime(path))

    return ok(BackupOut(path=path, size=size, created_at=created_at))


@router.post("/restaurar")
def restore_backup():
    raise HTTPException(
        status_code=501,
        detail="Restauracao de backup nao implementada nesta versao da API.",
    )
