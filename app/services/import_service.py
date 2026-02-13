"""
Serviço de importação de Excel para API.
Responsabilidade: importar planilha usando MigrationService.
"""

from __future__ import annotations

from typing import Dict, Any

from app.services.migration_service import MigrationService
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import ValidationException


class ImportService:
    def __init__(self) -> None:
        self.migration_service = MigrationService()
        self.product_repo = ProductRepository()

    def import_excel(self, excel_path: str) -> Dict[str, Any]:
        before = self.product_repo.count_products()
        success, message = self.migration_service.run_migration_if_needed(excel_path)
        after = self.product_repo.count_products()

        if not success:
            raise ValidationException(message)

        imported = max(after - before, 0)
        updated = 0
        skipped = 0

        if "já populado" in message.lower():
            skipped = after

        return {
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "errors": [],
            "message": message,
        }
