"""
Catalogo: "Atualizar catálogo" (importar o arquivo da Master Power nesta maquina) e as
fichas proprias (turbinas que o catalogo nao tem).
"""

from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from pydantic import BaseModel, Field

from app.services.company_register_service import CompanyRegisterService
from app.services.own_ficha_service import READ_ONLY_REASON, OwnFichaReadOnlyError, OwnFichaService
from backend.app.api.responses import fail, ok
from core.catalog.bundle import catalog_status, import_catalog_file
from core.database.connection import DatabaseConnection

router = APIRouter(prefix="/catalogo", tags=["catalogo"])

MAX_CATALOG_FILE = 200 * 1024 * 1024  # o arquivo da Master Power tem uns 8 MB
MAX_REGISTER_FILE = 30 * 1024 * 1024  # o cadastro de produtos da loja tem 1 MB


def get_own_ficha_service() -> OwnFichaService:
    return OwnFichaService()


def get_company_register_service() -> CompanyRegisterService:
    return CompanyRegisterService()


class OwnApplicationIn(BaseModel):
    montadora: Optional[str] = None
    veiculo: Optional[str] = None
    motor: Optional[str] = None
    complemento: Optional[str] = None


class OwnCodeIn(BaseModel):
    fabricante: str = "OEM"
    numero: Optional[str] = None


class OwnFichaIn(BaseModel):
    codigo: str
    marca: str
    tipo: str = "TURBO"
    modelo: Optional[str] = None
    observacao: Optional[str] = None
    aplicacoes: List[OwnApplicationIn] = Field(default_factory=list)
    codigos: List[OwnCodeIn] = Field(default_factory=list)


def _request_id(request: Request) -> Optional[str]:
    return getattr(request.state, "request_id", None)


@router.get("/status")
def get_catalog_status() -> Any:
    return ok(catalog_status(DatabaseConnection()))


@router.post("/importar")
async def import_catalog(request: Request, file: UploadFile = File(...)) -> Any:
    """Recebe o CatalogoMasterPower_Aberto.db e atualiza o catalogo desta maquina."""
    data = await file.read()
    if not data:
        return fail(400, "arquivo_vazio", "O arquivo está vazio.", None, _request_id(request))
    if len(data) > MAX_CATALOG_FILE:
        return fail(400, "arquivo_grande", "O arquivo é grande demais para ser o catálogo.", None, _request_id(request))
    tmp = tempfile.NamedTemporaryFile(prefix="catalogo_", suffix=".db", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        result = import_catalog_file(DatabaseConnection(), tmp.name, os.path.basename(file.filename or ""))
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    return ok({**result, "status": catalog_status(DatabaseConnection())})


@router.get("/fichas-proprias")
def list_own_fichas(
    codigo: Optional[str] = Query(default=None, max_length=60),
    service: OwnFichaService = Depends(get_own_ficha_service),
) -> Any:
    return ok({"fichas": service.list(codigo), **service.can_edit()})


@router.post("/fichas-proprias", status_code=201)
def create_own_ficha(
    payload: OwnFichaIn, request: Request, service: OwnFichaService = Depends(get_own_ficha_service)
) -> Any:
    return _save(service, payload.model_dump(), None, request, 201)


@router.put("/fichas-proprias/{ficha_id}")
def update_own_ficha(
    ficha_id: int, payload: OwnFichaIn, request: Request, service: OwnFichaService = Depends(get_own_ficha_service)
) -> Any:
    return _save(service, payload.model_dump(), ficha_id, request, 200)


@router.delete("/fichas-proprias/{ficha_id}")
def delete_own_ficha(
    ficha_id: int, request: Request, service: OwnFichaService = Depends(get_own_ficha_service)
) -> Any:
    try:
        service.delete(ficha_id)
    except OwnFichaReadOnlyError as exc:
        return fail(403, "somente_leitura", str(exc), None, _request_id(request))
    return ok({"removido": True})


class HiddenApplicationIn(BaseModel):
    ficha: str
    montadora: Optional[str] = None
    veiculo: str
    motor: Optional[str] = None
    complemento: Optional[str] = None


@router.post("/aplicacoes-ocultas")
def hide_application(
    payload: HiddenApplicationIn, request: Request, service: OwnFichaService = Depends(get_own_ficha_service)
) -> Any:
    """"Não se aplica": esconde uma aplicacao errada do catalogo (vale tambem depois de atualizar)."""
    return _toggle_application(payload, request, service, hide=True)


@router.post("/aplicacoes-ocultas/desfazer")
def unhide_application(
    payload: HiddenApplicationIn, request: Request, service: OwnFichaService = Depends(get_own_ficha_service)
) -> Any:
    return _toggle_application(payload, request, service, hide=False)


def _toggle_application(payload: HiddenApplicationIn, request: Request, service: OwnFichaService, hide: bool) -> Any:
    from core.catalog import hidden_applications

    if not service.can_edit()["pode_editar"]:
        return fail(403, "somente_leitura", READ_ONLY_REASON, None, _request_id(request))
    conn = DatabaseConnection().get_connection()
    try:
        if hide:
            hidden_applications.hide(conn, payload.model_dump())
        else:
            hidden_applications.unhide(conn, payload.model_dump())
        conn.commit()
    finally:
        conn.close()
    service.after_change()  # publica para as outras maquinas
    return ok({"oculta": hide})


def _save(service: OwnFichaService, data: Dict[str, Any], ficha_id: Optional[int], request: Request, status: int) -> Any:
    try:
        ficha = service.save(data, ficha_id)
    except OwnFichaReadOnlyError as exc:
        return fail(403, "somente_leitura", str(exc), None, _request_id(request))
    return ok(ficha, status_code=status)


# ---------------------------------------------------------------------------
# Cadastro da empresa (arquivo de produtos da loja, .csv)
# ---------------------------------------------------------------------------


async def _register_file(request: Request, file: UploadFile) -> Any:
    data = await file.read()
    if not data:
        return fail(400, "arquivo_vazio", "O arquivo está vazio.", None, _request_id(request))
    if len(data) > MAX_REGISTER_FILE:
        return fail(400, "arquivo_grande", "O arquivo é grande demais para ser o cadastro.", None, _request_id(request))
    return data


@router.get("/cadastro")
def get_company_register(service: CompanyRegisterService = Depends(get_company_register_service)) -> Any:
    return ok(service.status())


@router.post("/cadastro/previa")
async def preview_company_register(
    request: Request,
    file: UploadFile = File(...),
    service: CompanyRegisterService = Depends(get_company_register_service),
) -> Any:
    """Le o arquivo e diz o que a importacao faria, sem gravar nada."""
    data = await _register_file(request, file)
    if not isinstance(data, bytes):
        return data
    return ok(service.preview(data))


@router.post("/cadastro/importar")
async def import_company_register(
    request: Request,
    file: UploadFile = File(...),
    criar_produtos: bool = Query(default=True),
    service: CompanyRegisterService = Depends(get_company_register_service),
) -> Any:
    data = await _register_file(request, file)
    if not isinstance(data, bytes):
        return data
    try:
        result = service.apply(data, criar_produtos=criar_produtos)
    except OwnFichaReadOnlyError as exc:
        return fail(403, "somente_leitura", str(exc), None, _request_id(request))
    return ok({**result, "status": catalog_status(DatabaseConnection())})


@router.delete("/cadastro")
def remove_company_register(
    request: Request, service: CompanyRegisterService = Depends(get_company_register_service)
) -> Any:
    try:
        return ok(service.remove())
    except OwnFichaReadOnlyError as exc:
        return fail(403, "somente_leitura", str(exc), None, _request_id(request))
