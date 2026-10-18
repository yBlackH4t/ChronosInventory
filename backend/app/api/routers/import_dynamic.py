from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from app.services.dynamic_import_service import DynamicImportService
from core.constants import SUPPORTED_EXCEL_EXTENSIONS
from core.utils.file_utils import FileUtils
from core.utils.validators import Validators
from core.exceptions import ValidationException
from backend.app.api.deps import get_movement_service, get_stock_service, get_inventory_location_service
from backend.app.api.responses import ok
from backend.app.schemas.common import SuccessResponse


router = APIRouter(prefix="/import-dynamic", tags=["import-dynamic"])

MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024

class ImportExecutePayload(BaseModel):
    file_id: str
    match_by: str
    name_col: str
    id_col: Optional[str] = None
    location_mappings: Dict[str, str]
    update_stock: bool = True
    motivo: Optional[str] = "Ajuste via Importação de Planilha"


def _safe_upload_name(filename: str | None) -> str:
    """Basename only, without path separators: the client controls this value."""
    name = Validators.sanitize_filename(os.path.basename(str(filename or "").replace("\\", "/")))
    return name or "planilha.xlsx"


_FILE_ID_RE = re.compile(r"^import_\d{8}_\d{6}_[^\\/]+$")


def _resolve_temp_import(file_id: str) -> str:
    """Maps a file_id returned by /analyze back to its temp file, never outside it."""
    if not _FILE_ID_RE.match(file_id or "") or os.path.basename(file_id) != file_id:
        raise ValidationException("Arquivo de importacao invalido. Faca o upload novamente.")
    temp_dir = os.path.realpath(FileUtils.get_temp_directory())
    temp_path = os.path.realpath(os.path.join(temp_dir, file_id))
    if os.path.dirname(temp_path) != temp_dir:
        raise ValidationException("Arquivo de importacao invalido. Faca o upload novamente.")
    return temp_path

def _validate_extension(filename: str) -> None:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXCEL_EXTENSIONS and ext != ".csv":
        raise ValidationException("Extensao invalida. Use .xlsx, .xls ou .csv.")

def get_dynamic_import_service(
    movement_service = Depends(get_movement_service),
    stock_service = Depends(get_stock_service),
    location_service = Depends(get_inventory_location_service)
) -> DynamicImportService:
    return DynamicImportService(
        movement_service=movement_service,
        stock_service=stock_service,
        location_service=location_service
    )

@router.post("/analyze", response_model=SuccessResponse[dict])
def analyze_excel(
    file: UploadFile = File(...),
    import_service: DynamicImportService = Depends(get_dynamic_import_service),
) -> SuccessResponse[dict]:
    _validate_extension(file.filename)
    
    temp_dir = FileUtils.get_temp_directory()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_id = f"import_{timestamp}_{_safe_upload_name(file.filename)}"
    temp_path = os.path.join(temp_dir, file_id)
    
    FileUtils.save_stream_limited(file.file, temp_path, MAX_IMPORT_SIZE_BYTES, "Arquivo muito grande (max 50MB).")

    try:
        result = import_service.analyze_file(temp_path)
        result["file_id"] = file_id
        return ok(result)
    except Exception as e:
        FileUtils.delete_file(temp_path)
        raise e

@router.post("/execute", response_model=SuccessResponse[dict])
def execute_import(
    payload: ImportExecutePayload,
    import_service: DynamicImportService = Depends(get_dynamic_import_service),
) -> SuccessResponse[dict]:
    temp_path = _resolve_temp_import(payload.file_id)

    if not FileUtils.file_exists(temp_path):
        raise ValidationException("Arquivo expirou ou não foi encontrado. Faça o upload novamente.")

    try:
        summary = import_service.execute_import(
            filepath=temp_path,
            match_by=payload.match_by,
            name_col=payload.name_col,
            id_col=payload.id_col,
            location_mappings=payload.location_mappings,
            update_stock=payload.update_stock,
            motivo=payload.motivo
        )
        return ok(summary)
    finally:
        try:
            FileUtils.delete_file(temp_path)
        except Exception:
            pass
