"""
Servico para distribuir uma base oficial entre instalacoes locais do app.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.backup_service import BackupService
from app.services.local_share_service import LocalShareService
from core.constants import APP_VERSION, DB_NAME, DATE_FORMAT_FILE
from core.database.connection import DatabaseConnection
from core.database.migration_manager import MigrationManager
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils
from core.utils.validators import Validators


class OfficialBaseService:
    _config_version = 1
    _format_version = 1
    _latest_dirname = "latest"
    _history_dirname = "historico"
    _zip_filename = "base_oficial.zip"
    _manifest_filename = "base_oficial.json"
    _allowed_roles = {"publisher", "consumer"}
    _server_default_port = 8765

    def __init__(self) -> None:
        self.db_connection = DatabaseConnection()
        self.backup_service = BackupService()
        self.local_share_service = LocalShareService()
        self.config_path = FileUtils.get_official_base_config_path()

    def get_status(self) -> Dict[str, Any]:
        config = self._load_config()
        latest_paths = self._latest_paths(config["official_base_dir"])
        manifest = self._read_manifest(latest_paths["manifest"])
        server_latest_paths = self.local_share_service.get_official_paths()
        server_manifest = self._read_manifest(server_latest_paths["latest_manifest"])
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
            **self._read_database_summary(current_db_path),
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
        config = self._load_config()
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

        latest_paths = self._latest_paths(base_dir)
        result["latest_manifest_found"] = bool(self._read_manifest(latest_paths["manifest"]))

        try:
            probe_dir = Path(base_dir) / self._latest_dirname
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
        config = self._load_config()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            return []

        history_dir = Path(base_dir) / self._history_dirname
        if not history_dir.exists() or not history_dir.is_dir():
            return []

        items: List[Dict[str, Any]] = []
        manifest_paths = sorted(
            history_dir.glob(f"*_{self._manifest_filename}"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for manifest_path in manifest_paths[: max(limit, 1)]:
            manifest = self._read_manifest(str(manifest_path))
            if not manifest:
                continue
            zip_name = manifest_path.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
            zip_path = manifest_path.with_name(zip_name)
            items.append(
                {
                    "manifest_path": str(manifest_path),
                    "zip_path": str(zip_path) if zip_path.exists() else None,
                    "manifest": manifest,
                }
            )

        return items

    def update_config(
        self,
        role: str,
        official_base_dir: Optional[str],
        machine_label: Optional[str],
        publisher_name: Optional[str],
        server_port: Optional[int] = None,
        remote_server_url: Optional[str] = None,
        server_enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        role_value = self._normalize_role(role)
        base_dir = self._normalize_optional_text(official_base_dir, 1024)
        machine_value = self._normalize_machine_label(machine_label)
        publisher_value = self._normalize_optional_text(publisher_name, 120)
        remote_value = self._normalize_remote_server_url(remote_server_url)

        current = self._load_config()
        port_value = self.local_share_service.normalize_port(server_port or current["server_port"])
        enabled_value = current["server_enabled"] if server_enabled is None else bool(server_enabled)

        payload = {
            "version": self._config_version,
            "role": role_value,
            "official_base_dir": base_dir,
            "machine_label": machine_value,
            "publisher_name": publisher_value,
            "server_port": port_value,
            "remote_server_url": remote_value,
            "server_enabled": enabled_value,
        }

        Path(self.config_path).parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return self.get_status()

    def publish_official_base(self, notes: Optional[str] = None) -> Dict[str, Any]:
        config = self._load_config()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para publicar base oficial.")
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de publicar.")

        latest_paths = self._latest_paths(base_dir)
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = os.path.join(base_dir, self._history_dirname, f"{timestamp}_{self._zip_filename}")
        history_manifest = os.path.join(base_dir, self._history_dirname, f"{timestamp}_{self._manifest_filename}")
        published_at = self._iso_now()
        notes_value = self._normalize_optional_text(notes, 500)

        try:
            Path(latest_paths["zip"]).parent.mkdir(parents=True, exist_ok=True)
            Path(history_zip).parent.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel preparar a pasta da base oficial: {exc}") from exc

        with tempfile.TemporaryDirectory(prefix="chronos_official_base_publish_") as tmp_dir:
            snapshot_path = os.path.join(tmp_dir, DB_NAME)
            self.backup_service._create_sqlite_snapshot(self.db_connection.get_database_path(), snapshot_path)
            snapshot_summary = self._read_database_summary(snapshot_path)
            snapshot_size = os.path.getsize(snapshot_path) if os.path.isfile(snapshot_path) else 0

            with zipfile.ZipFile(latest_paths["zip"], mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(snapshot_path, arcname=DB_NAME)

            checksum = self._sha256_file(latest_paths["zip"])
            manifest = {
                "format_version": self._format_version,
                "published_at": published_at,
                "publisher_machine": config["machine_label"],
                "publisher_name": config["publisher_name"],
                "app_version": APP_VERSION,
                "min_app_version": APP_VERSION,
                "db_version": MigrationManager(self.db_connection).get_current_database_version(),
                "database_filename": DB_NAME,
                "database_sha256": checksum,
                "notes": notes_value,
                "products_count": snapshot_summary["current_products_count"],
                "products_with_stock_count": snapshot_summary["current_products_with_stock_count"],
                "movements_count": snapshot_summary["current_movements_count"],
                "database_size": snapshot_size,
            }

            self._write_manifest(latest_paths["manifest"], manifest)
            FileUtils.copy_file(latest_paths["zip"], history_zip)
            self._write_manifest(history_manifest, manifest)

        return {
            "published_at": published_at,
            "zip_path": latest_paths["zip"],
            "manifest_path": latest_paths["manifest"],
            "history_zip_path": history_zip,
            "history_manifest_path": history_manifest,
            "app_version": APP_VERSION,
            "db_version": manifest["db_version"],
            "machine_label": config["machine_label"],
            "publisher_name": config["publisher_name"],
            "notes": notes_value,
        }

    def delete_official_base_publication(
        self,
        manifest_path: Optional[str] = None,
        delete_latest: bool = False,
    ) -> Dict[str, Any]:
        config = self._load_config()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para excluir bases publicadas.")

        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de excluir publicacoes.")

        if delete_latest:
            latest_paths = self._latest_paths(base_dir)
            deleted = self._delete_publication_files(
                manifest_path=latest_paths["manifest"],
                zip_path=latest_paths["zip"],
                allowed_root=base_dir,
                allow_missing=True,
            )
            return {
                "deleted_manifest_path": latest_paths["manifest"],
                "deleted_zip_path": latest_paths["zip"],
                "deleted_latest": True,
                "message": "Base oficial atual excluida com sucesso.",
            }

        manifest_value = self._normalize_optional_text(manifest_path, 2048)
        if not manifest_value:
            raise ValidationException("Informe a publicacao que deve ser removida.")

        safe_manifest = self._validate_managed_publication_path(manifest_value, base_dir)
        if safe_manifest.name.endswith(f"_{self._manifest_filename}"):
            zip_candidate = safe_manifest.with_name(
                safe_manifest.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
            )
        else:
            zip_candidate = safe_manifest.with_name(self._zip_filename)

        self._delete_publication_files(
            manifest_path=str(safe_manifest),
            zip_path=str(zip_candidate),
            allowed_root=base_dir,
            allow_missing=False,
        )
        return {
            "deleted_manifest_path": str(safe_manifest),
            "deleted_zip_path": str(zip_candidate) if zip_candidate.exists() else str(zip_candidate),
            "deleted_latest": False,
            "message": "Publicacao historica excluida com sucesso.",
        }

    def apply_official_base(self) -> Dict[str, Any]:
        config = self._load_config()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de atualizar a base local.")

        latest_paths = self._latest_paths(base_dir)
        manifest = self._read_manifest(latest_paths["manifest"])
        if not manifest:
            raise ValidationException("Manifesto da base oficial nao encontrado.")
        if not os.path.isfile(latest_paths["zip"]):
            raise ValidationException("Arquivo zip da base oficial nao encontrado.")

        min_app_version = str(manifest.get("min_app_version") or "0.0.0")
        if Validators.parse_version(APP_VERSION) < Validators.parse_version(min_app_version):
            raise ValidationException(
                f"Atualize o aplicativo para {min_app_version} ou superior antes de importar esta base oficial."
            )

        expected_hash = str(manifest.get("database_sha256") or "").strip()
        if not expected_hash:
            raise ValidationException("Manifesto da base oficial esta sem checksum.")
        current_hash = self._sha256_file(latest_paths["zip"])
        if current_hash.lower() != expected_hash.lower():
            raise ValidationException("Checksum da base oficial nao confere. A importacao foi cancelada.")

        ok, pre_restore_path = self.backup_service.create_automatic_backup(prefix="backup_pre_base_oficial")
        if not ok:
            raise FileOperationException("Falha ao criar backup de seguranca antes da importacao da base oficial.")

        db_path = self.db_connection.get_database_path()
        with tempfile.TemporaryDirectory(prefix="chronos_official_base_apply_") as tmp_dir:
            extracted_db = self._extract_official_database(latest_paths["zip"], tmp_dir)

            integrity = self.backup_service._run_integrity_check(extracted_db)
            if integrity.lower() != "ok":
                raise ValidationException(f"Base oficial invalida para restauracao: {integrity}")

            table_check = self.backup_service._validate_required_tables(extracted_db)
            if not table_check["ok"]:
                missing = ", ".join(str(item) for item in table_check["missing_tables"])
                raise ValidationException(f"Base oficial incompleta. Tabelas ausentes: {missing}")

            try:
                self.backup_service._restore_sqlite_snapshot(extracted_db, db_path)
                final_validation = self.backup_service.validate_backup()
                if not final_validation["ok"]:
                    raise FileOperationException("Integridade do banco restaurado falhou apos aplicar a base oficial.")
            except Exception as exc:
                self.backup_service._restore_sqlite_snapshot(pre_restore_path, db_path)
                raise FileOperationException(
                    f"Falha ao aplicar a base oficial. O backup local foi restaurado. Erro: {exc}"
                ) from exc

        return {
            "restored_from": latest_paths["zip"],
            "active_database": db_path,
            "pre_restore_backup": pre_restore_path,
            "validation_result": "ok",
            "published_at": str(manifest.get("published_at") or ""),
            "publisher_machine": str(manifest.get("publisher_machine") or ""),
            "publisher_name": str(manifest.get("publisher_name") or ""),
            "app_version": str(manifest.get("app_version") or ""),
            "db_version": str(manifest.get("db_version") or ""),
            "notes": str(manifest.get("notes") or ""),
            "restart_required": True,
        }

    def start_local_server(self) -> Dict[str, Any]:
        config = self._load_config()
        self.update_config(
            role=config["role"],
            official_base_dir=config["official_base_dir"],
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            server_port=config["server_port"],
            remote_server_url=config["remote_server_url"],
            server_enabled=True,
        )
        return self.local_share_service.start_server(
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            port=config["server_port"],
        )

    def stop_local_server(self) -> Dict[str, Any]:
        config = self._load_config()
        self.update_config(
            role=config["role"],
            official_base_dir=config["official_base_dir"],
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            server_port=config["server_port"],
            remote_server_url=config["remote_server_url"],
            server_enabled=False,
        )
        self.local_share_service.stop_server()
        return self.local_share_service.get_server_status(
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            port=config["server_port"],
            enabled=False,
        )

    def test_remote_server(self, server_url: Optional[str] = None) -> Dict[str, Any]:
        config = self._load_config()
        normalized_url = self.local_share_service.normalize_server_url(server_url or config["remote_server_url"])
        payload = self.local_share_service.fetch_remote_status(normalized_url)

        official_manifest = None
        if payload.get("official_available"):
            try:
                official_manifest = self._parse_remote_official_manifest(
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
            "message": "Servidor remoto encontrado e pronto para distribuicao." if payload.get("official_available") else "Servidor remoto conectado, mas sem base oficial publicada.",
        }

    def publish_server_official_base(self, notes: Optional[str] = None) -> Dict[str, Any]:
        config = self._load_config()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para publicar base oficial.")

        paths = self.local_share_service.get_official_paths()
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = os.path.join(paths["history_dir"], f"{timestamp}_{self._zip_filename}")
        history_manifest = os.path.join(paths["history_dir"], f"{timestamp}_{self._manifest_filename}")

        manifest = self._create_official_publication(
            latest_zip_path=paths["latest_zip"],
            latest_manifest_path=paths["latest_manifest"],
            history_zip_path=history_zip,
            history_manifest_path=history_manifest,
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            notes=notes,
        )

        return {
            "published_at": manifest["published_at"],
            "zip_path": paths["latest_zip"],
            "manifest_path": paths["latest_manifest"],
            "history_zip_path": history_zip,
            "history_manifest_path": history_manifest,
            "app_version": APP_VERSION,
            "db_version": manifest["db_version"],
            "machine_label": config["machine_label"],
            "publisher_name": config["publisher_name"],
            "notes": manifest["notes"],
        }

    def list_server_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        paths = self.local_share_service.get_official_paths()
        history_dir = Path(paths["history_dir"])
        if not history_dir.exists():
            return []

        items: List[Dict[str, Any]] = []
        manifest_paths = sorted(
            history_dir.glob(f"*_{self._manifest_filename}"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for manifest_path in manifest_paths[: max(limit, 1)]:
            manifest = self._read_manifest(str(manifest_path))
            if not manifest:
                continue
            zip_name = manifest_path.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
            zip_path = manifest_path.with_name(zip_name)
            items.append(
                {
                    "manifest_path": str(manifest_path),
                    "zip_path": str(zip_path) if zip_path.exists() else None,
                    "manifest": manifest,
                }
            )
        return items

    def delete_server_publication(
        self,
        manifest_path: Optional[str] = None,
        delete_latest: bool = False,
    ) -> Dict[str, Any]:
        config = self._load_config()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para excluir bases publicadas.")

        paths = self.local_share_service.get_official_paths()
        allowed_root = paths["root"]

        if delete_latest:
            self._delete_publication_files(
                manifest_path=paths["latest_manifest"],
                zip_path=paths["latest_zip"],
                allowed_root=allowed_root,
                allow_missing=True,
            )
            return {
                "deleted_manifest_path": paths["latest_manifest"],
                "deleted_zip_path": paths["latest_zip"],
                "deleted_latest": True,
                "message": "Base oficial atual do servidor local excluida com sucesso.",
            }

        manifest_value = self._normalize_optional_text(manifest_path, 2048)
        if not manifest_value:
            raise ValidationException("Informe a publicacao que deve ser removida.")

        safe_manifest = self._validate_managed_publication_path(manifest_value, allowed_root)
        zip_candidate = safe_manifest.with_name(
            safe_manifest.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
        )
        self._delete_publication_files(
            manifest_path=str(safe_manifest),
            zip_path=str(zip_candidate),
            allowed_root=allowed_root,
            allow_missing=False,
        )
        return {
            "deleted_manifest_path": str(safe_manifest),
            "deleted_zip_path": str(zip_candidate),
            "deleted_latest": False,
            "message": "Publicacao historica do servidor local excluida com sucesso.",
        }

    def apply_server_official_base(self, server_url: Optional[str] = None) -> Dict[str, Any]:
        config = self._load_config()
        normalized_url = self.local_share_service.normalize_server_url(server_url or config["remote_server_url"])
        manifest = self._parse_remote_official_manifest(
            self.local_share_service.fetch_remote_manifest(normalized_url, "official")
        )

        min_app_version = str(manifest.get("min_app_version") or "0.0.0")
        if Validators.parse_version(APP_VERSION) < Validators.parse_version(min_app_version):
            raise ValidationException(
                f"Atualize o aplicativo para {min_app_version} ou superior antes de importar esta base oficial."
            )

        ok, pre_restore_path = self.backup_service.create_automatic_backup(prefix="backup_pre_base_oficial")
        if not ok:
            raise FileOperationException("Falha ao criar backup de seguranca antes da importacao da base oficial.")

        db_path = self.db_connection.get_database_path()
        with tempfile.TemporaryDirectory(prefix="chronos_official_base_remote_apply_") as tmp_dir:
            zip_path = os.path.join(tmp_dir, self._zip_filename)
            self.local_share_service.download_remote_snapshot(normalized_url, "official", zip_path)

            expected_hash = str(manifest.get("database_sha256") or "").strip()
            current_hash = self._sha256_file(zip_path)
            if not expected_hash or current_hash.lower() != expected_hash.lower():
                raise ValidationException("Checksum da base oficial remota nao confere. A importacao foi cancelada.")

            extracted_db = self._extract_official_database(zip_path, tmp_dir)
            integrity = self.backup_service._run_integrity_check(extracted_db)
            if integrity.lower() != "ok":
                raise ValidationException(f"Base oficial remota invalida para restauracao: {integrity}")

            table_check = self.backup_service._validate_required_tables(extracted_db)
            if not table_check["ok"]:
                missing = ", ".join(str(item) for item in table_check["missing_tables"])
                raise ValidationException(f"Base oficial remota incompleta. Tabelas ausentes: {missing}")

            try:
                self.backup_service._restore_sqlite_snapshot(extracted_db, db_path)
                final_validation = self.backup_service.validate_backup()
                if not final_validation["ok"]:
                    raise FileOperationException("Integridade do banco restaurado falhou apos aplicar a base oficial.")
            except Exception as exc:
                self.backup_service._restore_sqlite_snapshot(pre_restore_path, db_path)
                raise FileOperationException(
                    f"Falha ao aplicar a base oficial remota. O backup local foi restaurado. Erro: {exc}"
                ) from exc

        return {
            "restored_from": normalized_url,
            "active_database": db_path,
            "pre_restore_backup": pre_restore_path,
            "validation_result": "ok",
            "published_at": str(manifest.get("published_at") or ""),
            "publisher_machine": str(manifest.get("publisher_machine") or ""),
            "publisher_name": str(manifest.get("publisher_name") or ""),
            "app_version": str(manifest.get("app_version") or ""),
            "db_version": str(manifest.get("db_version") or ""),
            "notes": str(manifest.get("notes") or ""),
            "restart_required": True,
        }

    def _load_config(self) -> Dict[str, Any]:
        default = {
            "version": self._config_version,
            "role": "consumer",
            "official_base_dir": "",
            "machine_label": self._default_machine_label(),
            "publisher_name": "",
            "server_port": self._server_default_port,
            "remote_server_url": "",
            "server_enabled": False,
        }
        if not os.path.isfile(self.config_path):
            return default

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return default

        return {
            "version": int(data.get("version") or self._config_version),
            "role": self._normalize_role(str(data.get("role") or default["role"])),
            "official_base_dir": self._normalize_optional_text(data.get("official_base_dir"), 1024) or "",
            "machine_label": self._normalize_machine_label(data.get("machine_label")),
            "publisher_name": self._normalize_optional_text(data.get("publisher_name"), 120) or "",
            "server_port": self.local_share_service.normalize_port(data.get("server_port") or default["server_port"]),
            "remote_server_url": self._normalize_remote_server_url(data.get("remote_server_url")) or "",
            "server_enabled": bool(data.get("server_enabled", default["server_enabled"])),
        }

    def _default_machine_label(self) -> str:
        candidate = os.getenv("COMPUTERNAME") or os.getenv("HOSTNAME") or "maquina-local"
        return str(candidate).strip()[:120]

    def _normalize_role(self, role: str) -> str:
        value = str(role or "").strip().lower()
        if value not in self._allowed_roles:
            raise ValidationException("Papel invalido. Use 'publisher' ou 'consumer'.")
        return value

    def _normalize_machine_label(self, machine_label: Optional[str]) -> str:
        value = self._normalize_optional_text(machine_label, 120) or self._default_machine_label()
        return value

    def _normalize_optional_text(self, value: Optional[str], max_length: int) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        Validators.validate_string_length(text, max_length, "Valor")
        return text

    def _normalize_remote_server_url(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        Validators.validate_string_length(text, 500, "Endereco do servidor")
        return self.local_share_service.normalize_server_url(text)

    def _latest_paths(self, base_dir: Optional[str]) -> Dict[str, str]:
        normalized = str(base_dir or "").strip()
        if not normalized:
            return {
                "zip": "",
                "manifest": "",
            }

        latest_dir = os.path.join(normalized, self._latest_dirname)
        latest_zip = os.path.join(latest_dir, self._zip_filename)
        latest_manifest = os.path.join(latest_dir, self._manifest_filename)
        root_zip = os.path.join(normalized, self._zip_filename)
        root_manifest = os.path.join(normalized, self._manifest_filename)

        if os.path.isfile(root_zip) and os.path.isfile(root_manifest) and not os.path.isfile(latest_manifest):
            return {
                "zip": root_zip,
                "manifest": root_manifest,
            }

        return {
            "zip": latest_zip,
            "manifest": latest_manifest,
        }

    def _write_manifest(self, path: str, payload: Dict[str, Any]) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _create_official_publication(
        self,
        *,
        latest_zip_path: str,
        latest_manifest_path: str,
        history_zip_path: str,
        history_manifest_path: str,
        machine_label: str,
        publisher_name: str,
        notes: Optional[str],
    ) -> Dict[str, Any]:
        published_at = self._iso_now()
        notes_value = self._normalize_optional_text(notes, 500)

        try:
            Path(latest_zip_path).parent.mkdir(parents=True, exist_ok=True)
            Path(history_zip_path).parent.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel preparar o destino da base oficial: {exc}") from exc

        with tempfile.TemporaryDirectory(prefix="chronos_official_base_publish_") as tmp_dir:
            snapshot_path = os.path.join(tmp_dir, DB_NAME)
            self.backup_service._create_sqlite_snapshot(self.db_connection.get_database_path(), snapshot_path)
            snapshot_summary = self._read_database_summary(snapshot_path)
            snapshot_size = os.path.getsize(snapshot_path) if os.path.isfile(snapshot_path) else 0

            with zipfile.ZipFile(latest_zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(snapshot_path, arcname=DB_NAME)

            checksum = self._sha256_file(latest_zip_path)
            manifest = {
                "format_version": self._format_version,
                "published_at": published_at,
                "publisher_machine": machine_label,
                "publisher_name": publisher_name,
                "app_version": APP_VERSION,
                "min_app_version": APP_VERSION,
                "db_version": MigrationManager(self.db_connection).get_current_database_version(),
                "database_filename": DB_NAME,
                "database_sha256": checksum,
                "notes": notes_value,
                "products_count": snapshot_summary["current_products_count"],
                "products_with_stock_count": snapshot_summary["current_products_with_stock_count"],
                "movements_count": snapshot_summary["current_movements_count"],
                "database_size": snapshot_size,
            }

            self._write_manifest(latest_manifest_path, manifest)
            FileUtils.copy_file(latest_zip_path, history_zip_path)
            self._write_manifest(history_manifest_path, manifest)

        return manifest

    def _read_manifest(self, path: str) -> Optional[Dict[str, Any]]:
        if not path or not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            raise ValidationException(f"Manifesto da base oficial invalido: {exc}") from exc

        return {
            "format_version": int(data.get("format_version") or self._format_version),
            "published_at": str(data.get("published_at") or ""),
            "publisher_machine": str(data.get("publisher_machine") or ""),
            "publisher_name": str(data.get("publisher_name") or ""),
            "app_version": str(data.get("app_version") or ""),
            "min_app_version": str(data.get("min_app_version") or ""),
            "db_version": str(data.get("db_version") or ""),
            "database_filename": str(data.get("database_filename") or DB_NAME),
            "database_sha256": str(data.get("database_sha256") or ""),
            "notes": str(data.get("notes") or ""),
            "products_count": self._safe_int(data.get("products_count")),
            "products_with_stock_count": self._safe_int(data.get("products_with_stock_count")),
            "movements_count": self._safe_int(data.get("movements_count")),
            "database_size": self._safe_int(data.get("database_size")),
        }

    def _parse_remote_official_manifest(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "format_version": int(data.get("format_version") or self._format_version),
            "published_at": str(data.get("published_at") or ""),
            "publisher_machine": str(data.get("publisher_machine") or ""),
            "publisher_name": str(data.get("publisher_name") or ""),
            "app_version": str(data.get("app_version") or ""),
            "min_app_version": str(data.get("min_app_version") or ""),
            "db_version": str(data.get("db_version") or ""),
            "database_filename": str(data.get("database_filename") or DB_NAME),
            "database_sha256": str(data.get("database_sha256") or ""),
            "notes": str(data.get("notes") or ""),
            "products_count": self._safe_int(data.get("products_count")),
            "products_with_stock_count": self._safe_int(data.get("products_with_stock_count")),
            "movements_count": self._safe_int(data.get("movements_count")),
            "database_size": self._safe_int(data.get("database_size")),
        }

    def _extract_official_database(self, zip_path: str, target_dir: str) -> str:
        extracted_path = os.path.join(target_dir, DB_NAME)
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                if DB_NAME not in zf.namelist():
                    raise ValidationException(f"A base oficial nao contem '{DB_NAME}'.")
                with zf.open(DB_NAME) as src, open(extracted_path, "wb") as dst:
                    dst.write(src.read())
        except ValidationException:
            raise
        except Exception as exc:
            raise FileOperationException(f"Falha ao extrair a base oficial: {exc}") from exc
        return extracted_path

    def _delete_publication_files(
        self,
        manifest_path: str,
        zip_path: str,
        allowed_root: str,
        allow_missing: bool,
    ) -> Dict[str, Any]:
        manifest_obj = Path(manifest_path)
        zip_obj = Path(zip_path)

        for target in (manifest_obj, zip_obj):
            target_str = str(target)
            if not target_str:
                continue
            self._ensure_path_under_root(target_str, allowed_root)

        if not allow_missing and not manifest_obj.exists():
            raise ValidationException("A publicacao selecionada nao foi encontrada.")

        try:
            if manifest_obj.exists():
                manifest_obj.unlink()
            if zip_obj.exists():
                zip_obj.unlink()
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel excluir a base publicada: {exc}") from exc

        return {
            "manifest_deleted": not manifest_obj.exists(),
            "zip_deleted": not zip_obj.exists(),
        }

    def _validate_managed_publication_path(self, manifest_path: str, base_dir: str) -> Path:
        target = Path(manifest_path).resolve(strict=False)
        self._ensure_path_under_root(str(target), base_dir)
        history_dir = (Path(base_dir) / self._history_dirname).resolve(strict=False)
        try:
            target.relative_to(history_dir)
        except ValueError as exc:
            raise ValidationException("Apenas publicacoes do historico podem ser excluidas por item.") from exc
        return target

    def _ensure_path_under_root(self, target_path: str, base_dir: str) -> None:
        target = Path(target_path).resolve(strict=False)
        root = Path(base_dir).resolve(strict=False)
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise ValidationException("Caminho de publicacao invalido para exclusao.") from exc

    def _read_database_summary(self, db_path: str) -> Dict[str, int]:
        summary = {
            "current_products_count": 0,
            "current_products_with_stock_count": 0,
            "current_movements_count": 0,
        }
        if not db_path or not os.path.isfile(db_path):
            return summary

        conn = None
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            summary["current_products_count"] = int(conn.execute("SELECT COUNT(*) FROM produtos").fetchone()[0])
            summary["current_products_with_stock_count"] = int(
                conn.execute(
                    """
                    SELECT COUNT(*)
                    FROM produtos
                    WHERE COALESCE(qtd_canoas, 0) + COALESCE(qtd_pf, 0) > 0
                    """
                ).fetchone()[0]
            )
            summary["current_movements_count"] = int(conn.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0])
        except Exception:
            return summary
        finally:
            if conn is not None:
                conn.close()

        return summary

    def _sha256_file(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _iso_now(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def _safe_int(self, value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except Exception:
            return None
