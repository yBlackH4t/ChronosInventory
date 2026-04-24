"""
Publicacao, leitura e aplicacao de bases oficiais.
Responsabilidade: manipular manifests, snapshots zipados e validacoes de arquivos.
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

from core.constants import APP_VERSION, DB_NAME
from core.database.migration_manager import MigrationManager
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils


class OfficialBasePublicationHelper:
    def __init__(
        self,
        *,
        db_connection: Any,
        backup_service: Any,
        format_version: int,
    ) -> None:
        self.db_connection = db_connection
        self.backup_service = backup_service
        self.format_version = format_version

    def create_publication(
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
        published_at = self.iso_now()
        notes_value = self.normalize_optional_text(notes, 500)

        try:
            Path(latest_zip_path).parent.mkdir(parents=True, exist_ok=True)
            Path(history_zip_path).parent.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel preparar o destino da base oficial: {exc}") from exc

        with tempfile.TemporaryDirectory(prefix="chronos_official_base_publish_") as tmp_dir:
            snapshot_path = os.path.join(tmp_dir, DB_NAME)
            self.backup_service._create_sqlite_snapshot(self.db_connection.get_database_path(), snapshot_path)
            snapshot_summary = self.read_database_summary(snapshot_path)
            snapshot_size = os.path.getsize(snapshot_path) if os.path.isfile(snapshot_path) else 0

            with zipfile.ZipFile(latest_zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(snapshot_path, arcname=DB_NAME)

            checksum = self.sha256_file(latest_zip_path)
            manifest = {
                "format_version": self.format_version,
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

            self.write_manifest(latest_manifest_path, manifest)
            FileUtils.copy_file(latest_zip_path, history_zip_path)
            self.write_manifest(history_manifest_path, manifest)

        return manifest

    def write_manifest(self, path: str, payload: Dict[str, Any]) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def read_manifest(self, path: str) -> Optional[Dict[str, Any]]:
        if not path or not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            raise ValidationException(f"Manifesto da base oficial invalido: {exc}") from exc

        return self.parse_manifest_payload(data)

    def parse_remote_manifest(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.parse_manifest_payload(data)

    def parse_manifest_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "format_version": int(data.get("format_version") or self.format_version),
            "published_at": str(data.get("published_at") or ""),
            "publisher_machine": str(data.get("publisher_machine") or ""),
            "publisher_name": str(data.get("publisher_name") or ""),
            "app_version": str(data.get("app_version") or ""),
            "min_app_version": str(data.get("min_app_version") or ""),
            "db_version": str(data.get("db_version") or ""),
            "database_filename": str(data.get("database_filename") or DB_NAME),
            "database_sha256": str(data.get("database_sha256") or ""),
            "notes": str(data.get("notes") or ""),
            "products_count": self.safe_int(data.get("products_count")),
            "products_with_stock_count": self.safe_int(data.get("products_with_stock_count")),
            "movements_count": self.safe_int(data.get("movements_count")),
            "database_size": self.safe_int(data.get("database_size")),
        }

    def extract_database(self, zip_path: str, target_dir: str) -> str:
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

    def delete_publication_files(
        self,
        *,
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
            self.ensure_path_under_root(target_str, allowed_root)

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

    def validate_managed_publication_path(self, manifest_path: str, base_dir: str, history_dirname: str) -> Path:
        target = Path(manifest_path).resolve(strict=False)
        self.ensure_path_under_root(str(target), base_dir)
        history_dir = (Path(base_dir) / history_dirname).resolve(strict=False)
        try:
            target.relative_to(history_dir)
        except ValueError as exc:
            raise ValidationException("Apenas publicacoes do historico podem ser excluidas por item.") from exc
        return target

    def ensure_path_under_root(self, target_path: str, base_dir: str) -> None:
        target = Path(target_path).resolve(strict=False)
        root = Path(base_dir).resolve(strict=False)
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise ValidationException("Caminho de publicacao invalido para exclusao.") from exc

    def read_database_summary(self, db_path: str) -> Dict[str, int]:
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

    def sha256_file(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def iso_now(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def safe_int(self, value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def normalize_optional_text(value: Optional[str], max_length: int) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if len(text) > max_length:
            raise ValidationException("Valor excede o tamanho maximo permitido.")
        return text
