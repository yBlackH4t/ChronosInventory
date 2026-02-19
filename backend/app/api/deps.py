from app.services.stock_service import StockService
from app.services.image_service import ImageService
from app.services.movement_service import MovementService
from app.services.backup_service import BackupService
from app.services.export_service import ExportService
from app.services.migration_service import MigrationService
from app.services.report_api_service import ReportApiService
from app.services.import_service import ImportService
from app.services.inventory_service import InventoryService


def get_stock_service() -> StockService:
    return StockService()


def get_image_service() -> ImageService:
    return ImageService()


def get_movement_service() -> MovementService:
    return MovementService()


def get_backup_service() -> BackupService:
    return BackupService()


def get_export_service() -> ExportService:
    return ExportService()


def get_migration_service() -> MigrationService:
    return MigrationService()


def get_report_api_service() -> ReportApiService:
    return ReportApiService()


def get_import_service() -> ImportService:
    return ImportService()


def get_inventory_service() -> InventoryService:
    return InventoryService()
