# Project Map

## Overview
Desktop inventory app with a Tkinter/CustomTkinter UI, SQLite storage, and a layered structure:
- Core domain: `app/models`, `app/services`, `core/database`, `core/utils`
- UI adapters: `app/controllers`, `app/views`

The migration target is a local-only FastAPI backend that reuses the existing services/repositories and exposes JSON for a future React + Tauri frontend.

## Key Modules
- `app/services/stock_service.py`: main inventory orchestration (CRUD + stock movements + history + totals).
- `app/services/backup_service.py`: Excel + DB backup export, auto/pre-update backups.
- `app/services/migration_service.py`: legacy Excel -> SQLite import.
- `app/services/report_service.py`: PDF reports (stock + ABC curve) using reportlab.
- `app/services/update_service.py`: update check/download/run installer.
- `app/services/image_service.py`: image storage/retrieval (BLOB) for products.

- `app/models/product.py`: Product entity (id, nome, qtd_canoas, qtd_pf).
- `app/models/stock_movement.py`: stock movement entity with delta calculation.
- `app/models/validators.py`: domain validation rules.

- `core/database/connection.py`: SQLite connection manager, DB bootstrap, WAL, and legacy DB migration.
- `core/database/repositories/product_repository.py`: product queries and updates.
- `core/database/repositories/history_repository.py`: movement logs.
- `core/database/repositories/base_repository.py`: shared query helpers.

## SQLite Access
- Access path is built by `core/utils/file_utils.py`.
- In production: `%APPDATA%/Chronos Inventory/estoque.db`.
- In development: project root `estoque.db`.
- `DatabaseConnection` opens a new connection per operation (row_factory to dict), sets WAL and foreign keys.

## Backup / Import / Export / Reports / Update
- Backups: `app/services/backup_service.py` (Excel + .db copy), files stored under `backups/` (AppData in prod).
- Legacy import: `app/services/migration_service.py` reads Excel, bulk inserts, and moves the file to backups.
- Reports: `app/services/report_service.py` (PDF via reportlab). Uses `tkinter.filedialog` and `os.startfile` (UI coupling).
- Updates: `app/services/update_service.py` fetches JSON manifest, downloads installer, runs it.

## Tkinter Coupling Points
- UI controllers in `app/controllers/*` are tightly bound to UI inputs and dataframes.
- Views in `app/views/*` implement the full GUI and call controllers directly.
- `ReportService` depends on `tkinter.filedialog` and opens PDFs via OS.

## Candidate Use Cases -> First API Endpoints
1. Product list/search with pagination.
2. Get product by id.
3. Create product.
4. Update product (stock/name) with adapters if needed.
5. Delete product.
6. Health check and version endpoint.

Secondary (later) endpoints:
- Stock movement (entry/exit/transfer).
- History logs list.
- Backups (export/list).
- Reports (stock/ABC) once UI coupling is removed.
- Product image read/upload (base64 or dedicated endpoint).
