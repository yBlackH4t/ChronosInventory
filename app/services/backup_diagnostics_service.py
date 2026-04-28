from __future__ import annotations

import io
import json
import os
import platform
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Tuple

from core.constants import APP_VERSION
from core.database.connection import DatabaseConnection
from core.utils.file_utils import FileUtils


class BackupDiagnosticsService:
    def __init__(
        self,
        *,
        db_connection: DatabaseConnection,
        list_backups_metadata: Callable[[], List[Dict[str, object]]],
        validate_backup: Callable[[], Dict[str, object]],
        get_auto_backup_config: Callable[[], Dict[str, object]],
    ) -> None:
        self.db_connection = db_connection
        self.list_backups_metadata = list_backups_metadata
        self.validate_backup = validate_backup
        self.get_auto_backup_config = get_auto_backup_config

    def export_archive(self) -> Tuple[str, bytes]:
        db_path = self.db_connection.get_database_path()
        db_validation = self.validate_backup()
        backups = self.list_backups_metadata()[:30]

        backend_log = self.read_log_tail(Path("backend") / "logs" / "backend.log")
        tauri_log = self.read_log_tail(self.tauri_log_path())

        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "app_version": APP_VERSION,
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "database": {
                "path": db_path,
                "exists": os.path.exists(db_path),
                "integrity_ok": bool(db_validation["ok"]),
                "integrity_result": db_validation["result"],
            },
            "backups": [
                {
                    "name": item["name"],
                    "path": item["path"],
                    "size": item["size"],
                    "created_at": item["created_at"].isoformat() if item.get("created_at") else None,
                }
                for item in backups
            ],
            "auto_backup_config": self.get_auto_backup_config(),
        }

        filename = f"chronos_diagnostico_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
            zf.writestr("logs/backend.log.tail.txt", backend_log)
            zf.writestr("logs/tauri.log.tail.txt", tauri_log)

            if os.path.exists(db_path):
                try:
                    zf.write(db_path, arcname=f"database/{Path(db_path).name}")
                except Exception:
                    pass

        return filename, buffer.getvalue()

    def read_log_tail(self, path: Path, max_lines: int = 300) -> str:
        try:
            if not path.exists():
                return ""
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            return "\n".join(lines[-max_lines:])
        except Exception:
            return ""

    def tauri_log_path(self) -> Path:
        app_dir = FileUtils.get_app_directory()
        return Path(app_dir) / "logs" / "tauri.log"
