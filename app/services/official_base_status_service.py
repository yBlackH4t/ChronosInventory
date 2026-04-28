from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

from app.services.local_share_service import LocalShareService
from app.services.official_base_config_store import OfficialBaseConfigStore
from app.services.official_base_publication_helper import OfficialBasePublicationHelper
from core.constants import APP_VERSION
from core.database.connection import DatabaseConnection
from core.database.migration_manager import MigrationManager
from core.exceptions import ValidationException
from core.utils.validators import Validators


class OfficialBaseStatusService:
    def __init__(
        self,
        *,
        db_connection: DatabaseConnection,
        config_store: OfficialBaseConfigStore,
        publication_helper: OfficialBasePublicationHelper,
        local_share_service: LocalShareService,
        latest_dirname: str,
        history_dirname: str,
        zip_filename: str,
        manifest_filename: str,
        config_path: str,
    ) -> None:
        self.db_connection = db_connection
        self.config_store = config_store
        self.publication_helper = publication_helper
        self.local_share_service = local_share_service
        self.latest_dirname = latest_dirname
        self.history_dirname = history_dirname
        self.zip_filename = zip_filename
        self.manifest_filename = manifest_filename
        self.config_path = config_path

    def get_status(self) -> Dict[str, Any]:
        config = self.config_store.load()
        latest_paths = self.config_store.latest_paths(
            config["official_base_dir"], self.latest_dirname, self.zip_filename, self.manifest_filename
        )
        manifest = self.publication_helper.read_manifest(latest_paths["manifest"])
        server_latest_paths = self.local_share_service.get_official_paths()
        server_manifest = self.publication_helper.read_manifest(server_latest_paths["latest_manifest"])
        current_db_version = MigrationManager(self.db_connection).get_current_database_version()
        current_db_path = self.db_connection.get_database_path()
        app_compatible = None
        if manifest:
            app_compatible = Validators.parse_version(APP_VERSION) >= Validators.parse_version(
                str(manifest.get("min_app_version") or "0.0.0")
            )
        server_app_compatible = None
        if server_manifest:
            server_app_compatible = Validators.parse_version(APP_VERSION) >= Validators.parse_version(
                str(server_manifest.get("min_app_version") or "0.0.0")
            )

        base_dir = str(config["official_base_dir"] or "")
        local_server = self.local_share_service.get_server_status(
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            port=config["server_port"],
            enabled=config["server_enabled"],
        )
        return {
            "config_path": self.config_path,
            "role": config["role"],
            "official_base_dir": base_dir or None,
            "machine_label": config["machine_label"],
            "publisher_name": config["publisher_name"],
            "server_enabled": bool(config["server_enabled"]),
            "server_port": int(config["server_port"]),
            "server_running": bool(local_server["running"]),
            "server_urls": [str(item) for item in local_server["urls"]],
            "remote_server_url": config["remote_server_url"] or None,
            "can_publish": config["role"] == "publisher" and bool(base_dir),
            "can_publish_server": config["role"] == "publisher",
            "directory_configured": bool(base_dir),
            "directory_accessible": bool(base_dir) and os.path.isdir(base_dir),
            "current_app_version": APP_VERSION,
            "current_db_version": current_db_version,
            "current_database_path": current_db_path,
            "current_database_size": os.path.getsize(current_db_path) if os.path.isfile(current_db_path) else 0,
            **self.publication_helper.read_database_summary(current_db_path),
            "latest_available": manifest is not None and os.path.isfile(latest_paths["zip"]),
            "latest_zip_path": latest_paths["zip"] if os.path.isfile(latest_paths["zip"]) else None,
            "latest_manifest_path": latest_paths["manifest"] if manifest else None,
            "latest_manifest": manifest,
            "app_compatible_with_latest": app_compatible,
            "server_latest_available": server_manifest is not None and os.path.isfile(server_latest_paths["latest_zip"]),
            "server_latest_zip_path": server_latest_paths["latest_zip"] if os.path.isfile(server_latest_paths["latest_zip"]) else None,
            "server_latest_manifest_path": server_latest_paths["latest_manifest"] if server_manifest else None,
            "server_latest_manifest": server_manifest,
            "app_compatible_with_server_latest": server_app_compatible,
        }

    def test_directory_access(self) -> Dict[str, Any]:
        config = self.config_store.load()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de testar.")

        result = {
            "directory_exists": False,
            "directory_accessible": False,
            "read_ok": False,
            "write_ok": False,
            "latest_manifest_found": False,
            "message": "",
        }

        if not os.path.exists(base_dir):
            result["message"] = "A pasta configurada nao existe."
            return result

        result["directory_exists"] = True

        if not os.path.isdir(base_dir):
            result["message"] = "O caminho configurado nao e uma pasta."
            return result

        try:
            list(Path(base_dir).iterdir())
            result["directory_accessible"] = True
            result["read_ok"] = True
        except Exception as exc:
            result["message"] = f"Falha ao ler a pasta compartilhada: {exc}"
            return result

        latest_paths = self.config_store.latest_paths(
            base_dir, self.latest_dirname, self.zip_filename, self.manifest_filename
        )
        result["latest_manifest_found"] = bool(self.publication_helper.read_manifest(latest_paths["manifest"]))

        try:
            probe_dir = Path(base_dir) / self.latest_dirname
            probe_dir.mkdir(parents=True, exist_ok=True)
            probe_file = probe_dir / ".chronos_probe.tmp"
            probe_file.write_text("ok", encoding="utf-8")
            probe_file.unlink(missing_ok=True)
            result["write_ok"] = True
        except Exception:
            result["write_ok"] = False

        if config["role"] == "publisher" and not result["write_ok"]:
            result["message"] = (
                "Leitura OK, mas sem escrita. Publisher precisa permissao de gravacao nesta pasta."
            )
        elif result["latest_manifest_found"]:
            result["message"] = "Pasta acessivel e base oficial localizada."
        else:
            result["message"] = "Pasta acessivel, mas nenhuma base oficial foi publicada ainda."

        return result

    def list_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        config = self.config_store.load()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            return []

        history_dir = Path(base_dir) / self.history_dirname
        return self._list_history_entries(history_dir, limit)

    def list_server_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        paths = self.local_share_service.get_official_paths()
        return self._list_history_entries(Path(paths["history_dir"]), limit)

    def test_remote_server(self, server_url: str | None = None) -> Dict[str, Any]:
        config = self.config_store.load()
        normalized_url = self.local_share_service.normalize_server_url(server_url or config["remote_server_url"])
        payload = self.local_share_service.fetch_remote_status(normalized_url)

        official_manifest = None
        if payload.get("official_available"):
            try:
                official_manifest = self.publication_helper.parse_remote_manifest(
                    self.local_share_service.fetch_remote_manifest(normalized_url, "official")
                )
            except ValidationException:
                official_manifest = None

        return {
            "server_url": normalized_url,
            "reachable": True,
            "machine_label": str(payload.get("machine_label") or ""),
            "app_version": str(payload.get("app_version") or ""),
            "official_available": bool(payload.get("official_available")),
            "compare_available": bool(payload.get("compare_available")),
            "official_manifest": official_manifest,
            "message": "Servidor remoto encontrado e pronto para distribuicao."
            if payload.get("official_available")
            else "Servidor remoto conectado, mas sem base oficial publicada.",
        }

    def _list_history_entries(self, history_dir: Path, limit: int) -> List[Dict[str, Any]]:
        if not history_dir.exists() or not history_dir.is_dir():
            return []

        items: List[Dict[str, Any]] = []
        manifest_paths = sorted(
            history_dir.glob(f"*_{self.manifest_filename}"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for manifest_path in manifest_paths[: max(limit, 1)]:
            manifest = self.publication_helper.read_manifest(str(manifest_path))
            if not manifest:
                continue
            zip_name = manifest_path.name.replace(f"_{self.manifest_filename}", f"_{self.zip_filename}")
            zip_path = manifest_path.with_name(zip_name)
            items.append(
                {
                    "manifest_path": str(manifest_path),
                    "zip_path": str(zip_path) if zip_path.exists() else None,
                    "manifest": manifest,
                }
            )
        return items
