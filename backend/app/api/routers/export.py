from __future__ import annotations

import os
from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse

from app.services.export_service import ExportService
from backend.app.api.deps import get_export_service


router = APIRouter(prefix="/export", tags=["export"]) 


@router.post("/produtos")
def export_products(
    background_tasks: BackgroundTasks,
    export_service: ExportService = Depends(get_export_service),
):
    path, total = export_service.export_products_excel()
    filename = os.path.basename(path)

    response = FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )
    response.headers["X-Export-Count"] = str(total)
    response.headers["X-Filename"] = filename
    background_tasks.add_task(os.remove, path)
    return response
