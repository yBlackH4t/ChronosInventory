from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.services.import_service import ImportService
from core.constants import SUPPORTED_EXCEL_EXTENSIONS
from core.utils.file_utils import FileUtils
from core.utils.validators import Validators
from core.exceptions import ValidationException
from backend.app.api.deps import get_import_service
from backend.app.api.responses import ok
from backend.app.schemas.common import SuccessResponse


router = APIRouter(prefix="/import", tags=["import"]) 

MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024



def _safe_upload_name(filename: str | None) -> str:
    """Basename only, without path separators: the client controls this value."""
    name = Validators.sanitize_filename(os.path.basename(str(filename or "").replace("\\", "/")))
    return name or "planilha.xlsx"

def _validate_extension(filename: str) -> None:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXCEL_EXTENSIONS:
        raise ValidationException("Extensão inválida. Use .xlsx ou .xls.")


@router.post("/excel", response_model=SuccessResponse[dict])
def import_excel(
    file: Optional[UploadFile] = File(default=None),
    path: Optional[str] = Form(default=None),
    import_service: ImportService = Depends(get_import_service),
) -> SuccessResponse[dict]:
    if not file and not path:
        raise ValidationException("Envie um arquivo ou informe o caminho.")

    temp_path = None

    if file:
        _validate_extension(file.filename)
        temp_dir = FileUtils.get_temp_directory()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_path = os.path.join(temp_dir, f"import_{timestamp}_{_safe_upload_name(file.filename)}")
        FileUtils.save_stream_limited(file.file, temp_path, MAX_IMPORT_SIZE_BYTES, "Arquivo muito grande (max 50MB).")
        excel_path = temp_path
    else:
        _validate_extension(path)
        if not FileUtils.file_exists(path):
            raise ValidationException("Arquivo não encontrado.")
        excel_path = path

    size = os.path.getsize(excel_path)
    if size > MAX_IMPORT_SIZE_BYTES:
        raise ValidationException("Arquivo muito grande.")

    try:
        summary = import_service.import_excel(excel_path)
        return ok(summary)
    finally:
        if temp_path and FileUtils.file_exists(temp_path):
            try:
                FileUtils.delete_file(temp_path)
            except Exception:
                pass
