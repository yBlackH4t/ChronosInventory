from __future__ import annotations

import os
import shutil
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from app.services.dynamic_import_service import DynamicImportService
from core.constants import SUPPORTED_EXCEL_EXTENSIONS
from core.utils.file_utils import FileUtils
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
    file_id = f"import_{timestamp}_{file.filename}"
    temp_path = os.path.join(temp_dir, file_id)
    
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = os.path.getsize(temp_path)
    if size > MAX_IMPORT_SIZE_BYTES:
        FileUtils.delete_file(temp_path)
        raise ValidationException("Arquivo muito grande (max 50MB).")

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
    temp_dir = FileUtils.get_temp_directory()
    temp_path = os.path.join(temp_dir, payload.file_id)
    
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
