"""
Servico para distribuir uma base oficial entre instalacoes locais do app.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.backup_service import BackupService
from app.services.official_base_config_store import OfficialBaseConfigStore
from app.services.official_base_publication_helper import OfficialBasePublicationHelper
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
        self.config_store = OfficialBaseConfigStore(
            config_path=self.config_path,
            local_share_service=self.local_share_service,
            config_version=self._config_version,
            allowed_roles=self._allowed_roles,
            server_default_port=self._server_default_port,
        )
        self.publication_helper = OfficialBasePublicationHelper(
            db_connection=self.db_connection,
            backup_service=self.backup_service,
            format_version=self._format_version,
        )

    def get_status(self) -> Dict[str, Any]:
        config = self.config_store.load()
        latest_paths = self.config_store.latest_paths(
            config["official_base_dir"], self._latest_dirname, self._zip_filename, self._manifest_filename
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
            base_dir, self._latest_dirname, self._zip_filename, self._manifest_filename
        )
        result["latest_manifest_found"] = bool(self.publication_helper.read_manifest(latest_paths["manifest"]))

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
        config = self.config_store.load()
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
            manifest = self.publication_helper.read_manifest(str(manifest_path))
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
        self.config_store.save(
            role=role,
            official_base_dir=official_base_dir,
            machine_label=machine_label,
            publisher_name=publisher_name,
            server_port=server_port,
            remote_server_url=remote_server_url,
            server_enabled=server_enabled,
        )
        return self.get_status()

    def publish_official_base(self, notes: Optional[str] = None) -> Dict[str, Any]:
        config = self.config_store.load()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para publicar base oficial.")
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de publicar.")

        latest_paths = self.config_store.latest_paths(
            base_dir, self._latest_dirname, self._zip_filename, self._manifest_filename
        )
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = os.path.join(base_dir, self._history_dirname, f"{timestamp}_{self._zip_filename}")
        history_manifest = os.path.join(base_dir, self._history_dirname, f"{timestamp}_{self._manifest_filename}")
        manifest = self.publication_helper.create_publication(
            latest_zip_path=latest_paths["zip"],
            latest_manifest_path=latest_paths["manifest"],
            history_zip_path=history_zip,
            history_manifest_path=history_manifest,
            machine_label=config["machine_label"],
            publisher_name=config["publisher_name"],
            notes=notes,
        )

        return {
            "published_at": manifest["published_at"],
            "zip_path": latest_paths["zip"],
            "manifest_path": latest_paths["manifest"],
            "history_zip_path": history_zip,
            "history_manifest_path": history_manifest,
            "app_version": APP_VERSION,
            "db_version": manifest["db_version"],
            "machine_label": config["machine_label"],
            "publisher_name": config["publisher_name"],
            "notes": manifest["notes"],
        }

    def delete_official_base_publication(
        self,
        manifest_path: Optional[str] = None,
        delete_latest: bool = False,
    ) -> Dict[str, Any]:
        config = self.config_store.load()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para excluir bases publicadas.")

        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de excluir publicacoes.")

        if delete_latest:
            latest_paths = self.config_store.latest_paths(
                base_dir, self._latest_dirname, self._zip_filename, self._manifest_filename
            )
            self.publication_helper.delete_publication_files(
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

        manifest_value = self.config_store.normalize_optional_text(manifest_path, 2048)
        if not manifest_value:
            raise ValidationException("Informe a publicacao que deve ser removida.")

        safe_manifest = self.publication_helper.validate_managed_publication_path(
            manifest_value, base_dir, self._history_dirname
        )
        if safe_manifest.name.endswith(f"_{self._manifest_filename}"):
            zip_candidate = safe_manifest.with_name(
                safe_manifest.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
            )
        else:
            zip_candidate = safe_manifest.with_name(self._zip_filename)

        self.publication_helper.delete_publication_files(
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
        config = self.config_store.load()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException("Configure a pasta da base oficial antes de atualizar a base local.")

        latest_paths = self.config_store.latest_paths(
            base_dir, self._latest_dirname, self._zip_filename, self._manifest_filename
        )
        manifest = self.publication_helper.read_manifest(latest_paths["manifest"])
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
        current_hash = self.publication_helper.sha256_file(latest_paths["zip"])
        if current_hash.lower() != expected_hash.lower():
            raise ValidationException("Checksum da base oficial nao confere. A importacao foi cancelada.")

        ok, pre_restore_path = self.backup_service.create_automatic_backup(prefix="backup_pre_base_oficial")
        if not ok:
            raise FileOperationException("Falha ao criar backup de seguranca antes da importacao da base oficial.")

        db_path = self.db_connection.get_database_path()
        with tempfile.TemporaryDirectory(prefix="chronos_official_base_apply_") as tmp_dir:
            extracted_db = self.publication_helper.extract_database(latest_paths["zip"], tmp_dir)

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
        config = self.config_store.load()
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
        config = self.config_store.load()
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
            "message": "Servidor remoto encontrado e pronto para distribuicao." if payload.get("official_available") else "Servidor remoto conectado, mas sem base oficial publicada.",
        }

    def publish_server_official_base(self, notes: Optional[str] = None) -> Dict[str, Any]:
        config = self.config_store.load()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para publicar base oficial.")

        paths = self.local_share_service.get_official_paths()
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = os.path.join(paths["history_dir"], f"{timestamp}_{self._zip_filename}")
        history_manifest = os.path.join(paths["history_dir"], f"{timestamp}_{self._manifest_filename}")

        manifest = self.publication_helper.create_publication(
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
            manifest = self.publication_helper.read_manifest(str(manifest_path))
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
        config = self.config_store.load()
        if config["role"] != "publisher":
            raise ValidationException("Esta maquina nao esta configurada para excluir bases publicadas.")

        paths = self.local_share_service.get_official_paths()
        allowed_root = paths["root"]

        if delete_latest:
            self.publication_helper.delete_publication_files(
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

        manifest_value = self.config_store.normalize_optional_text(manifest_path, 2048)
        if not manifest_value:
            raise ValidationException("Informe a publicacao que deve ser removida.")

        safe_manifest = self.publication_helper.validate_managed_publication_path(
            manifest_value, allowed_root, self._history_dirname
        )
        zip_candidate = safe_manifest.with_name(
            safe_manifest.name.replace(f"_{self._manifest_filename}", f"_{self._zip_filename}")
        )
        self.publication_helper.delete_publication_files(
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
        config = self.config_store.load()
        normalized_url = self.local_share_service.normalize_server_url(server_url or config["remote_server_url"])
        manifest = self.publication_helper.parse_remote_manifest(
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
            current_hash = self.publication_helper.sha256_file(zip_path)
            if not expected_hash or current_hash.lower() != expected_hash.lower():
                raise ValidationException("Checksum da base oficial remota nao confere. A importacao foi cancelada.")

            extracted_db = self.publication_helper.extract_database(zip_path, tmp_dir)
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
