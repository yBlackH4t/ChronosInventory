from __future__ import annotations

import logging
import os
import time
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from core.constants import APP_VERSION
from core.database.connection import DatabaseConnection
from core.exceptions import (
    DatabaseException,
    FileOperationException,
    InsufficientStockException,
    MigrationException,
    ProductNotFoundException,
    UpdateException,
    ValidationException,
    InvalidTransferException,
)
from core.utils.file_utils import FileUtils

from backend.app.api.routers import products, backup, reports, movements, export, imports, dashboard, analytics
from backend.app.api.responses import fail, ok
from backend.app.schemas.common import SuccessResponse
from backend.app.schemas.system import HealthOut, VersionOut


LOG = logging.getLogger("backend")


def setup_logging() -> None:
    log_dir = Path(__file__).resolve().parents[1] / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "backend.log"

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

app = FastAPI(title="Estoque API", version=APP_VERSION)

# Allow only local hosts (libera testserver apenas em testes)
allowed_hosts = ["127.0.0.1", "localhost"]
if os.getenv("APP_ENV", "").lower() == "test":
    allowed_hosts.append("testserver")

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)

# CORS para frontend local (Vite + Tauri WebView)
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(backup.router)
app.include_router(reports.router)
app.include_router(movements.router)
app.include_router(export.router)
app.include_router(imports.router)
app.include_router(dashboard.router)
app.include_router(analytics.router)


@app.on_event("startup")
def startup_log_runtime_paths() -> None:
    db = DatabaseConnection()
    LOG.info(
        "startup app_dir=%s db_path=%s",
        FileUtils.get_app_directory(),
        db.get_database_path(),
    )

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


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
    return fail(422, "validation_error", "Invalid request", exc.errors(), _request_id(request))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, str):
        return fail(exc.status_code, "http_error", exc.detail, None, _request_id(request))
    return fail(exc.status_code, "http_error", "HTTP error", exc.detail, _request_id(request))


@app.exception_handler(ValidationException)
async def validation_exception_handler(request: Request, exc: ValidationException) -> JSONResponse:
    return fail(400, "validation_error", str(exc), None, _request_id(request))


@app.exception_handler(ProductNotFoundException)
async def product_not_found_handler(request: Request, exc: ProductNotFoundException) -> JSONResponse:
    return fail(404, "not_found", str(exc), None, _request_id(request))


@app.exception_handler(InsufficientStockException)
async def insufficient_stock_handler(request: Request, exc: InsufficientStockException) -> JSONResponse:
    return fail(409, "insufficient_stock", str(exc), None, _request_id(request))


@app.exception_handler(InvalidTransferException)
async def invalid_transfer_handler(request: Request, exc: InvalidTransferException) -> JSONResponse:
    return fail(400, "invalid_transfer", str(exc), None, _request_id(request))


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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    LOG.exception("Unhandled error request_id=%s", _request_id(request))
    return fail(500, "internal_error", "Internal server error", None, _request_id(request))


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    # Evita configuracao de logging do uvicorn (quebra em exe sem console)
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        log_config=None,
        access_log=False,
    )
