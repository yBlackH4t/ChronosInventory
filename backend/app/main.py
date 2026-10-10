from __future__ import annotations

from contextlib import asynccontextmanager
import ipaddress
import logging
import os
import sqlite3
import sys
import tempfile
import time
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Autodiagnostico do pacote: banco numa pasta temporaria, decidida antes de qualquer import
# abrir o banco de verdade desta maquina.
if "--diagnostico-assistente" in sys.argv:
    os.environ["CHRONOS_APP_DIR"] = tempfile.mkdtemp(prefix="chronos_diag_")

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.services.assistant_admin_service import AdminRequiredError
from app.services.backup_scheduler_service import BackupSchedulerService
from app.services.local_share_service import LocalShareService
from app.services.official_base_service import OfficialBaseService
from core.catalog.bundle import run_catalog_startup
from core.constants import APP_VERSION
from core.database.connection import DatabaseConnection
from core.database.migration_manager import MigrationManager
from core.exceptions import (
    DatabaseException,
    DuplicateException,
    FileOperationException,
    InsufficientStockException,
    LocationHasStockException,
    LocationLimitException,
    MigrationException,
    NotFoundException,
    ProductNotFoundException,
    UpdateException,
    ValidationException,
    InvalidTransferException,
)
from core.utils.file_utils import FileUtils

from backend.app.api.routers import (
    products,
    backup,
    reports,
    movements,
    export,
    imports,
    import_dynamic,
    dashboard,
    analytics,
    inventory,
    inventory_locations,
    system,
    scanner,
    assistant,
)
from backend.app.api.responses import fail, ok
from backend.app.schemas.common import SuccessResponse
from backend.app.schemas.system import HealthOut, VersionOut


LOG = logging.getLogger("backend")
BACKUP_SCHEDULER = BackupSchedulerService()
LOCAL_SHARE_SERVER = LocalShareService()


def setup_logging() -> None:
    log_file = Path(FileUtils.get_backend_log_path())
    log_file.parent.mkdir(parents=True, exist_ok=True)

    handlers = [
        logging.StreamHandler(),
        RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=3, encoding="utf-8"),
    ]

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
        handlers=handlers,
    )


setup_logging()

def startup_runtime_services() -> None:
    db = DatabaseConnection()
    updated, version = MigrationManager(db).check_and_run_migrations()
    # Catalog shipped with the installer + links to this machine's products.
    # Off in the test suite (slow); CHRONOS_CATALOG_ON_STARTUP=1 turns it on.
    if os.getenv("APP_ENV", "").lower() != "test" or os.getenv("CHRONOS_CATALOG_ON_STARTUP") == "1":
        run_catalog_startup(db)
    official_base_cfg = OfficialBaseService().config_store.load()
    LOG.info(
        "startup app_dir=%s db_path=%s db_version=%s migrated=%s",
        FileUtils.get_app_directory(),
        db.get_database_path(),
        version,
        updated,
    )
    if os.getenv("APP_ENV", "").lower() != "test":
        BACKUP_SCHEDULER.start()
        LOCAL_SHARE_SERVER.ensure_started_if_enabled(
            enabled=bool(official_base_cfg["server_enabled"]),
            machine_label=str(official_base_cfg["machine_label"]),
            publisher_name=str(official_base_cfg["publisher_name"]),
            port=int(official_base_cfg["server_port"]),
        )
        # Ponte WhatsApp do assistente: religa se estava ligada (nunca impede o app de abrir).
        try:
            from app.services.whatsapp_service import WhatsAppService

            WhatsAppService.instance().start_if_enabled()
        except Exception:
            LOG.exception("whatsapp: falha ao religar a ponte do assistente")
        # Conhecimento do assistente: a publicadora publica e as outras recebem, agora e a cada 10 min.
        try:
            from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService

            AssistantKnowledgeSyncService.start_periodic()
        except Exception:
            LOG.exception("assistente: falha ao iniciar a sincronizacao do conhecimento")


def shutdown_runtime_services() -> None:
    if os.getenv("APP_ENV", "").lower() != "test":
        BACKUP_SCHEDULER.stop()
        LOCAL_SHARE_SERVER.stop_server()
        try:
            from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService

            AssistantKnowledgeSyncService.stop_periodic()
        except Exception:
            LOG.exception("assistente: falha ao parar a sincronizacao do conhecimento")
        try:
            from app.services.whatsapp_service import WhatsAppService

            WhatsAppService.instance().stop(remember=False)
        except Exception:
            LOG.exception("whatsapp: falha ao parar a ponte do assistente")


@asynccontextmanager
async def lifespan(_: FastAPI):
    startup_runtime_services()
    try:
        yield
    finally:
        shutdown_runtime_services()


app = FastAPI(title="Estoque API", version=APP_VERSION, lifespan=lifespan)

# Host header is not restricted: phones reach the scanner through the machine's LAN IP.
allowed_hosts = ["*"]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)

# CORS: only the desktop WebView (and Vite in dev). The phone scanner page is served
# by this backend itself (same origin), so it needs no CORS entry. A wildcard here
# would let any website open on this computer drive the API.
cors_origins = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
]
if os.getenv("APP_ENV", "dev").lower() == "dev":
    cors_origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The backend listens on 0.0.0.0 so phones on the same network can use the scanner.
# Everything else (stock, backups, imports, restores) is only for this computer.
LAN_ALLOWED_PREFIXES = ("/api/scanner/",)


def _is_local_client(host: str | None) -> bool:
    if not host:
        return False
    if host == "testclient" and os.getenv("APP_ENV", "").lower() == "test":
        return True
    if host == "localhost":
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    mapped = getattr(address, "ipv4_mapped", None)
    return bool(address.is_loopback or (mapped is not None and mapped.is_loopback))


def _lan_api_enabled() -> bool:
    return os.getenv("CHRONOS_ALLOW_LAN_API", "").strip().lower() in {"1", "true", "yes"}


@app.middleware("http")
async def local_only_middleware(request: Request, call_next):
    client_host = request.client.host if request.client else None
    if (
        not _is_local_client(client_host)
        and not request.url.path.startswith(LAN_ALLOWED_PREFIXES)
        and not _lan_api_enabled()
    ):
        LOG.warning("Blocked remote request host=%s path=%s", client_host, request.url.path)
        return fail(
            403,
            "forbidden",
            "Acesso permitido apenas neste computador.",
            None,
            "",
        )
    return await call_next(request)

app.include_router(products.router)
app.include_router(backup.router)
app.include_router(reports.router)
app.include_router(movements.router)
app.include_router(export.router)
app.include_router(imports.router)
app.include_router(import_dynamic.router)
app.include_router(dashboard.router)
app.include_router(analytics.router)
app.include_router(inventory.router)
app.include_router(inventory_locations.router)
app.include_router(system.router)
app.include_router(scanner.router)
app.include_router(assistant.router)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def _friendly_validation_message(errors: list[dict]) -> str:
    if not errors:
        return "Requisicao invalida. Confira os campos e tente novamente."

    first = errors[0]
    loc = first.get("loc") or []
    field = str(loc[-1]) if loc else "campo"
    err_type = str(first.get("type") or "")
    msg = str(first.get("msg") or "").strip()

    field_labels = {
        "nome": "Nome",
        "inventories": "Estoques",
        "produto_id": "Produto",
        "quantidade": "Quantidade",
        "origem": "Origem",
        "destino": "Destino",
        "origem_location_id": "Local de origem",
        "destino_location_id": "Local de destino",
        "natureza": "Natureza",
        "motivo_ajuste": "Motivo de ajuste",
        "movimento_ref_id": "Movimento de referencia",
    }
    label = field_labels.get(field, field)

    if err_type == "missing":
        return f"Campo obrigatorio ausente: {label}."
    if err_type == "extra_forbidden":
        return (
            f"Campo '{label}' nao e aceito nesta versao do backend. "
            "Atualize o aplicativo para continuar."
        )
    if err_type in {"string_too_long", "too_long"}:
        return f"O campo {label} excede o tamanho maximo permitido."
    if err_type in {"greater_than_equal", "greater_than"}:
        return f"O valor informado em {label} e invalido."
    if err_type == "literal_error":
        return f"Valor invalido para {label}."
    if msg:
        if msg == "Field required":
            return f"Campo obrigatorio ausente: {label}."
        return msg
    return "Requisicao invalida. Confira os campos e tente novamente."


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    start = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        LOG.exception(
            "request_id=%s method=%s path=%s status=500 duration_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    LOG.info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/health", response_model=SuccessResponse[HealthOut])
def health():
    try:
        conn = DatabaseConnection().get_connection()
        conn.execute("SELECT 1")
        conn.close()
    except Exception as exc:
        LOG.exception("Health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return ok({"status": "ok", "version": APP_VERSION})


@app.get("/version", response_model=SuccessResponse[VersionOut])
def version():
    return ok({"version": APP_VERSION})


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    return fail(422, "validation_error", _friendly_validation_message(errors), errors, _request_id(request))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, str):
        return fail(exc.status_code, "http_error", exc.detail, None, _request_id(request))
    return fail(exc.status_code, "http_error", "HTTP error", exc.detail, _request_id(request))


@app.exception_handler(ValidationException)
async def validation_exception_handler(request: Request, exc: ValidationException) -> JSONResponse:
    return fail(400, "validation_error", str(exc), None, _request_id(request))


@app.exception_handler(AdminRequiredError)
async def admin_required_handler(request: Request, exc: AdminRequiredError) -> JSONResponse:
    return fail(403, "admin_necessario", str(exc), None, _request_id(request))


@app.exception_handler(ProductNotFoundException)
async def product_not_found_handler(request: Request, exc: ProductNotFoundException) -> JSONResponse:
    return fail(404, "not_found", str(exc), None, _request_id(request))


@app.exception_handler(InsufficientStockException)
async def insufficient_stock_handler(request: Request, exc: InsufficientStockException) -> JSONResponse:
    return fail(409, "insufficient_stock", str(exc), None, _request_id(request))


@app.exception_handler(InvalidTransferException)
async def invalid_transfer_handler(request: Request, exc: InvalidTransferException) -> JSONResponse:
    return fail(400, "invalid_transfer", str(exc), None, _request_id(request))


@app.exception_handler(sqlite3.OperationalError)
async def sqlite_operational_error_handler(request: Request, exc: sqlite3.OperationalError) -> JSONResponse:
    message = str(exc).lower()
    if "locked" in message or "busy" in message:
        LOG.warning("Database busy request_id=%s path=%s", _request_id(request), request.url.path)
        return fail(
            503,
            "database_busy",
            "O banco esta ocupado com outra operacao. Tente novamente em instantes.",
            None,
            _request_id(request),
        )
    LOG.exception("SQLite error request_id=%s", _request_id(request))
    return fail(500, "database_error", "Database error", str(exc), _request_id(request))


@app.exception_handler(DatabaseException)
async def database_exception_handler(request: Request, exc: DatabaseException) -> JSONResponse:
    LOG.exception("Database error request_id=%s", _request_id(request))
    return fail(500, "database_error", "Database error", str(exc), _request_id(request))


@app.exception_handler(FileOperationException)
async def file_exception_handler(request: Request, exc: FileOperationException) -> JSONResponse:
    LOG.exception("File operation error request_id=%s", _request_id(request))
    return fail(500, "file_error", "File operation error", str(exc), _request_id(request))


@app.exception_handler(MigrationException)
async def migration_exception_handler(request: Request, exc: MigrationException) -> JSONResponse:
    LOG.exception("Migration error request_id=%s", _request_id(request))
    return fail(500, "migration_error", "Migration error", str(exc), _request_id(request))


@app.exception_handler(UpdateException)
async def update_exception_handler(request: Request, exc: UpdateException) -> JSONResponse:
    LOG.exception("Update error request_id=%s", _request_id(request))
    return fail(500, "update_error", "Update error", str(exc), _request_id(request))


@app.exception_handler(DuplicateException)
async def duplicate_exception_handler(request: Request, exc: DuplicateException) -> JSONResponse:
    return fail(409, "duplicate", str(exc), None, _request_id(request))


@app.exception_handler(NotFoundException)
async def not_found_exception_handler(request: Request, exc: NotFoundException) -> JSONResponse:
    return fail(404, "not_found", str(exc), None, _request_id(request))


@app.exception_handler(LocationLimitException)
async def location_limit_handler(request: Request, exc: LocationLimitException) -> JSONResponse:
    return fail(409, "location_limit", str(exc), None, _request_id(request))


@app.exception_handler(LocationHasStockException)
async def location_has_stock_handler(request: Request, exc: LocationHasStockException) -> JSONResponse:
    return fail(
        409,
        "location_has_stock",
        str(exc),
        exc.stock_summary,
        _request_id(request),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    LOG.exception("Unhandled error request_id=%s", _request_id(request))
    return fail(500, "internal_error", "Internal server error", None, _request_id(request))


if __name__ == "__main__":
    import sys
    import uvicorn

    if "--version" in sys.argv:
        version_file = os.getenv("SIDECAR_VERSION_FILE")
        if version_file:
            Path(version_file).write_text(APP_VERSION, encoding="utf-8")
        else:
            print(APP_VERSION)
        raise SystemExit(0)

    if "--diagnostico-assistente" in sys.argv:
        # Confere se o pacote (PyInstaller) trouxe o que o assistente usa; resultado em JSON.
        from app.services.assistant_packaging_check import run_check

        position = sys.argv.index("--diagnostico-assistente")
        report = sys.argv[position + 1] if len(sys.argv) > position + 1 else "diagnostico_assistente.json"
        passed = run_check(report, app=app)
        import shutil

        shutil.rmtree(os.environ["CHRONOS_APP_DIR"], ignore_errors=True)
        raise SystemExit(0 if passed else 1)

    port = int(os.getenv("PORT", "8000"))
    # host=0.0.0.0 permite que celulares na mesma rede acessem o backend
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        log_config=None,
        access_log=False,
    )
