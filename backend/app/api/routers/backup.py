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
    BackupAutoConfigIn,
    BackupAutoConfigOut,
    OfficialBaseDeleteIn,
    OfficialBaseDeleteOut,
    BackupListItemOut,
    OfficialBaseApplyOut,
    OfficialBaseConfigIn,
    OfficialBaseDirectoryTestOut,
    OfficialBaseHistoryItemOut,
    OfficialBasePublishIn,
    OfficialBasePublishOut,
    LocalShareServerOut,
    RemoteShareStatusOut,
    OfficialBaseStatusOut,
    BackupOut,
    BackupRestoreIn,
    BackupRestoreOut,
    BackupRestoreTestIn,
    BackupRestoreTestOut,
    BackupValidateOut,
)
from backend.app.schemas.common import SuccessResponse
from core.exceptions import FileOperationException
from app.services.official_base_service import OfficialBaseService
from backend.app.api.deps import get_official_base_service


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


@router.post("/pre-update", response_model=SuccessResponse[BackupOut])
def create_pre_update_backup(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupOut]:
    path = backup_service.create_pre_update_backup()
    size = os.path.getsize(path)
    created_at = datetime.fromtimestamp(os.path.getmtime(path))
    return ok(BackupOut(path=path, size=size, created_at=created_at))


@router.post("/restaurar-pre-update", response_model=SuccessResponse[BackupRestoreOut])
def restore_pre_update_backup(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupRestoreOut]:
    restored = backup_service.restore_latest_pre_update_backup()
    return ok(
        BackupRestoreOut(
            restored_from=restored["restored_from"],
            active_database=restored["active_database"],
            pre_restore_backup=restored["pre_restore_backup"],
            validation_result=restored["validation_result"],
        )
    )


@router.post("/testar-restauracao", response_model=SuccessResponse[BackupRestoreTestOut])
def test_restore_backup(
    payload: BackupRestoreTestIn,
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupRestoreTestOut]:
    result = backup_service.test_restore_backup(payload.backup_name)
    return ok(
        BackupRestoreTestOut(
            backup_name=str(result["backup_name"]),
            backup_path=str(result["backup_path"]),
            ok=bool(result["ok"]),
            integrity_result=str(result["integrity_result"]),
            required_tables=[str(item) for item in result["required_tables"]],
            missing_tables=[str(item) for item in result["missing_tables"]],
        )
    )


@router.get("/auto-config", response_model=SuccessResponse[BackupAutoConfigOut])
def get_auto_backup_config(
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupAutoConfigOut]:
    cfg = backup_service.get_auto_backup_config()
    return ok(
        BackupAutoConfigOut(
            enabled=bool(cfg["enabled"]),
            hour=int(cfg["hour"]),
            minute=int(cfg["minute"]),
            retention_days=int(cfg["retention_days"]),
            schedule_mode=str(cfg["schedule_mode"]),
            weekday=int(cfg["weekday"]),
            last_run_date=str(cfg["last_run_date"]) if cfg.get("last_run_date") else None,
            last_result=str(cfg["last_result"]) if cfg.get("last_result") else None,
            last_backup_name=str(cfg["last_backup_name"]) if cfg.get("last_backup_name") else None,
        )
    )


@router.put("/auto-config", response_model=SuccessResponse[BackupAutoConfigOut])
def update_auto_backup_config(
    payload: BackupAutoConfigIn,
    backup_service: BackupService = Depends(get_backup_service),
) -> SuccessResponse[BackupAutoConfigOut]:
    cfg = backup_service.update_auto_backup_config(
        enabled=payload.enabled,
        hour=payload.hour,
        minute=payload.minute,
        retention_days=payload.retention_days,
        schedule_mode=payload.schedule_mode,
        weekday=payload.weekday,
    )
    return ok(
        BackupAutoConfigOut(
            enabled=bool(cfg["enabled"]),
            hour=int(cfg["hour"]),
            minute=int(cfg["minute"]),
            retention_days=int(cfg["retention_days"]),
            schedule_mode=str(cfg["schedule_mode"]),
            weekday=int(cfg["weekday"]),
            last_run_date=str(cfg["last_run_date"]) if cfg.get("last_run_date") else None,
            last_result=str(cfg["last_result"]) if cfg.get("last_result") else None,
            last_backup_name=str(cfg["last_backup_name"]) if cfg.get("last_backup_name") else None,
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


@router.get("/base-oficial/status", response_model=SuccessResponse[OfficialBaseStatusOut])
def official_base_status(
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseStatusOut]:
    status = official_base_service.get_status()
    return ok(OfficialBaseStatusOut(**status))


@router.put("/base-oficial/config", response_model=SuccessResponse[OfficialBaseStatusOut])
def official_base_update_config(
    payload: OfficialBaseConfigIn,
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseStatusOut]:
    status = official_base_service.update_config(
        role=payload.role,
        official_base_dir=payload.official_base_dir,
        machine_label=payload.machine_label,
        publisher_name=payload.publisher_name,
        server_port=payload.server_port,
        remote_server_url=payload.remote_server_url,
        server_enabled=payload.server_enabled,
    )
    return ok(OfficialBaseStatusOut(**status))


@router.post("/base-oficial/testar-pasta", response_model=SuccessResponse[OfficialBaseDirectoryTestOut])
def official_base_test_directory(
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseDirectoryTestOut]:
    result = official_base_service.test_directory_access()
    return ok(OfficialBaseDirectoryTestOut(**result))


@router.get("/base-oficial/historico", response_model=SuccessResponse[list[OfficialBaseHistoryItemOut]])
def official_base_history(
    limit: int = Query(10, ge=1, le=30),
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[list[OfficialBaseHistoryItemOut]]:
    items = official_base_service.list_history(limit=limit)
    return ok([OfficialBaseHistoryItemOut(**item) for item in items])


@router.post("/base-oficial/publicar", response_model=SuccessResponse[OfficialBasePublishOut])
def official_base_publish(
    payload: OfficialBasePublishIn,
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBasePublishOut]:
    result = official_base_service.publish_official_base(notes=payload.notes)
    return ok(OfficialBasePublishOut(**result))


@router.delete("/base-oficial/publicacoes", response_model=SuccessResponse[OfficialBaseDeleteOut])
def official_base_delete_publication(
    payload: OfficialBaseDeleteIn,
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseDeleteOut]:
    result = official_base_service.delete_official_base_publication(
        manifest_path=payload.manifest_path,
        delete_latest=payload.delete_latest,
    )
    return ok(OfficialBaseDeleteOut(**result))


@router.post("/base-oficial/aplicar", response_model=SuccessResponse[OfficialBaseApplyOut])
def official_base_apply(
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseApplyOut]:
    result = official_base_service.apply_official_base()
    return ok(OfficialBaseApplyOut(**result))


@router.post("/base-oficial-servidor/iniciar", response_model=SuccessResponse[LocalShareServerOut])
def official_base_server_start(
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[LocalShareServerOut]:
    result = official_base_service.start_local_server()
    return ok(LocalShareServerOut(**result))


@router.post("/base-oficial-servidor/parar", response_model=SuccessResponse[LocalShareServerOut])
def official_base_server_stop(
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[LocalShareServerOut]:
    result = official_base_service.stop_local_server()
    return ok(LocalShareServerOut(**result))


@router.get("/base-oficial-servidor/remoto", response_model=SuccessResponse[RemoteShareStatusOut])
def official_base_server_remote_status(
    server_url: Optional[str] = Query(default=None, min_length=1, max_length=500),
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[RemoteShareStatusOut]:
    result = official_base_service.test_remote_server(server_url=server_url)
    return ok(RemoteShareStatusOut(**result))


@router.get("/base-oficial-servidor/historico", response_model=SuccessResponse[list[OfficialBaseHistoryItemOut]])
def official_base_server_history(
    limit: int = Query(10, ge=1, le=30),
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[list[OfficialBaseHistoryItemOut]]:
    items = official_base_service.list_server_history(limit=limit)
    return ok([OfficialBaseHistoryItemOut(**item) for item in items])


@router.post("/base-oficial-servidor/publicar", response_model=SuccessResponse[OfficialBasePublishOut])
def official_base_server_publish(
    payload: OfficialBasePublishIn,
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBasePublishOut]:
    result = official_base_service.publish_server_official_base(notes=payload.notes)
    return ok(OfficialBasePublishOut(**result))


@router.delete("/base-oficial-servidor/publicacoes", response_model=SuccessResponse[OfficialBaseDeleteOut])
def official_base_server_delete_publication(
    payload: OfficialBaseDeleteIn,
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseDeleteOut]:
    result = official_base_service.delete_server_publication(
        manifest_path=payload.manifest_path,
        delete_latest=payload.delete_latest,
    )
    return ok(OfficialBaseDeleteOut(**result))


@router.post("/base-oficial-servidor/aplicar", response_model=SuccessResponse[OfficialBaseApplyOut])
def official_base_server_apply(
    server_url: Optional[str] = Query(default=None, min_length=1, max_length=500),
    official_base_service: OfficialBaseService = Depends(get_official_base_service),
) -> SuccessResponse[OfficialBaseApplyOut]:
    result = official_base_service.apply_server_official_base(server_url=server_url)
    return ok(OfficialBaseApplyOut(**result))
