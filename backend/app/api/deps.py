from typing import Iterator

from app.services.stock_service import StockService
from app.services.image_service import ImageService
from app.services.movement_service import MovementService
from app.services.backup_service import BackupService
from app.services.export_service import ExportService
from app.services.migration_service import MigrationService
from app.services.official_base_service import OfficialBaseService
from app.services.report_api_service import ReportApiService
from app.services.import_service import ImportService
from app.services.inventory_service import InventoryService
from app.services.stock_compare_service import StockCompareService
from app.services.stock_profile_service import StockProfileService
from app.services.inventory_location_service import InventoryLocationService
from core.database.connection import DatabaseConnection


def get_assistant_chat_service():
    # Imports tardios: o assistente so e carregado quando usado.
    from app.services.assistant_chat_service import AssistantChatService

    return AssistantChatService()


def get_assistant_admin_service():
    from app.services.assistant_admin_service import AssistantAdminService

    return AssistantAdminService()


def get_assistant_knowledge_service():
    from app.services.assistant_knowledge_service import AssistantKnowledgeService

    return AssistantKnowledgeService()


def get_assistant_daily_summary_service():
    from app.services.assistant_daily_summary_service import AssistantDailySummaryService

    return AssistantDailySummaryService()


def get_assistant_vision_service():
    from app.services.assistant_vision_service import AssistantVisionService

    return AssistantVisionService()


def get_assistant_knowledge_sync_service():
    from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService

    return AssistantKnowledgeSyncService()


def get_assistant_history_service():
    from app.services.assistant_history_service import AssistantHistoryService

    return AssistantHistoryService()


def get_whatsapp_service():
    from app.services.whatsapp_service import WhatsAppService

    return WhatsAppService.instance()


def get_stock_service() -> StockService:
    return StockService()


def get_image_service() -> ImageService:
    return ImageService()


def get_movement_service() -> MovementService:
    return MovementService()


def get_backup_service() -> BackupService:
    return BackupService()


def get_official_base_service() -> OfficialBaseService:
    return OfficialBaseService()


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


def get_stock_compare_service() -> StockCompareService:
    return StockCompareService()


def get_stock_profile_service() -> StockProfileService:
    return StockProfileService()


def get_db_connection():
    """Returns a new SQLite connection from the singleton DatabaseConnection."""
    return DatabaseConnection().get_connection()


def get_inventory_location_service() -> Iterator[InventoryLocationService]:
    # Request-scoped connection, closed when the request ends (it used to leak).
    conn = get_db_connection()
    try:
        yield InventoryLocationService(conn)
    finally:
        conn.close()

