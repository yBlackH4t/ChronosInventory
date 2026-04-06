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
from typing import Any, Dict, Optional

from app.services.backup_service import BackupService
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

    def __init__(self) -> None:
        self.db_connection = DatabaseConnection()
        self.backup_service = BackupService()
        self.config_path = FileUtils.get_official_base_config_path()

    def get_status(self) -> Dict[str, Any]:
        config = self._load_config()
        latest_paths = self._latest_paths(config["official_base_dir"])
        manifest = self._read_manifest(latest_paths["manifest"])
        current_db_version = MigrationManager(self.db_connection).get_current_database_version()
        current_db_path = self.db_connection.get_database_path()
        app_compatible = None
        if manifest:
            app_compatible = Validators.parse_version(APP_VERSION) >= Validators.parse_version(
                str(manifest.get("min_app_version") or "0.0.0")
            )

        base_dir = str(config["official_base_dir"] or "")
        return {
            "config_path": self.config_path,
            "role": config["role"],
            "official_base_dir": base_dir or None,
            "machine_label": config["machine_label"],
            "publisher_name": config["publisher_name"],
            "can_publish": config["role"] == "publisher" and bool(base_dir),
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
        }

    def update_config(
        self,
        role: str,
        official_base_dir: Optional[str],
        machine_label: Optional[str],
        publisher_name: Optional[str],
    ) -> Dict[str, Any]:
        role_value = self._normalize_role(role)
        base_dir = self._normalize_optional_text(official_base_dir, 1024)
        machine_value = self._normalize_machine_label(machine_label)
        publisher_value = self._normalize_optional_text(publisher_name, 120)

        payload = {
            "version": self._config_version,
            "role": role_value,
            "official_base_dir": base_dir,
            "machine_label": machine_value,
            "publisher_name": publisher_value,
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

    def _load_config(self) -> Dict[str, Any]:
        default = {
            "version": self._config_version,
            "role": "consumer",
            "official_base_dir": "",
            "machine_label": self._default_machine_label(),
            "publisher_name": "",
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
