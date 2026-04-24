from __future__ import annotations

import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.constants import APP_VERSION, DATE_FORMAT_FILE, DB_NAME
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils


class CompareSnapshotService:
    def __init__(
        self,
        *,
        zip_filename: str = "compare_base.zip",
        manifest_filename: str = "compare_base.json",
        history_retention_limit: int = 10,
    ) -> None:
        self.zip_filename = zip_filename
        self.manifest_filename = manifest_filename
        self.history_retention_limit = max(1, int(history_retention_limit))

    def publish_snapshot(
        self,
        *,
        snapshot_db_path: str,
        latest_zip_path: str,
        latest_manifest_path: str,
        history_dir: str,
        machine_label: str,
        db_version: str,
        db_info: Dict[str, Any],
    ) -> Dict[str, Any]:
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip_path, history_manifest_path = self._build_unique_history_paths(history_dir, timestamp)
        published_at = self._iso_now()

        Path(latest_zip_path).parent.mkdir(parents=True, exist_ok=True)
        Path(history_dir).mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(latest_zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(snapshot_db_path, arcname=DB_NAME)

        checksum = self.sha256_file(latest_zip_path)
        manifest = {
            "machine_label": str(machine_label or "").strip(),
            "published_at": published_at,
            "app_version": APP_VERSION,
            "db_version": str(db_version or "").strip(),
            "database_filename": DB_NAME,
            "database_sha256": checksum,
            "total_items": int(db_info.get("total_items") or 0),
            "active_items": int(db_info.get("active_items") or 0),
            "with_stock_items": int(db_info.get("with_stock_items") or 0),
            "file_size": int(db_info.get("file_size") or 0),
        }

        self.write_manifest(latest_manifest_path, manifest)
        FileUtils.copy_file(latest_zip_path, history_zip_path)
        self.write_manifest(history_manifest_path, manifest)
        self.prune_history(history_dir)

        return {
            "machine_label": manifest["machine_label"],
            "published_at": published_at,
            "zip_path": str(latest_zip_path),
            "manifest_path": str(latest_manifest_path),
            "history_zip_path": str(history_zip_path),
            "history_manifest_path": str(history_manifest_path),
            "manifest": manifest,
        }

    def list_history(self, history_dir: str, limit: int = 10) -> List[Dict[str, Any]]:
        history_root = Path(history_dir)
        if not history_root.is_dir():
            return []

        manifest_paths = sorted(
            history_root.glob(f"*_{self.manifest_filename}"),
            key=lambda item: item.stat().st_mtime if item.exists() else 0,
            reverse=True,
        )

        items: List[Dict[str, Any]] = []
        for manifest_path in manifest_paths[: max(limit, 1)]:
            manifest = self.read_manifest(str(manifest_path))
            if not manifest:
                continue
            zip_path = self.resolve_history_zip_path(manifest_path)
            items.append(
                {
                    "machine_label": str(manifest.get("machine_label") or ""),
                    "zip_path": str(zip_path),
                    "manifest_path": str(manifest_path),
                    "manifest": manifest,
                    "is_current_machine": True,
                }
            )
        return items

    def count_history_items(self, history_dir: str) -> int:
        history_root = Path(history_dir)
        if not history_root.is_dir():
            return 0
        return sum(1 for _ in history_root.glob(f"*_{self.manifest_filename}"))

    def delete_publication(
        self,
        *,
        allowed_root: str,
        latest_manifest_path: str,
        latest_zip_path: str,
        manifest_path: Optional[str] = None,
        delete_latest: bool = False,
        not_found_message: str = "O snapshot selecionado nao foi encontrado.",
        latest_message: str = "Snapshot atual excluido com sucesso.",
        history_message: str = "Snapshot historico excluido com sucesso.",
    ) -> Dict[str, Any]:
        if delete_latest:
            self._delete_files(
                manifest_path=latest_manifest_path,
                zip_path=latest_zip_path,
                allowed_root=allowed_root,
                allow_missing=True,
                not_found_message=not_found_message,
            )
            return {
                "deleted_manifest_path": latest_manifest_path,
                "deleted_zip_path": latest_zip_path,
                "deleted_latest": True,
                "message": latest_message,
            }

        manifest_value = str(manifest_path or "").strip()
        if not manifest_value:
            raise ValidationException("Informe o snapshot que deve ser removido.")

        safe_manifest = self._validate_history_manifest_path(manifest_value, allowed_root)
        zip_candidate = self.resolve_history_zip_path(safe_manifest)
        self._delete_files(
            manifest_path=str(safe_manifest),
            zip_path=str(zip_candidate),
            allowed_root=allowed_root,
            allow_missing=False,
            not_found_message=not_found_message,
        )
        return {
            "deleted_manifest_path": str(safe_manifest),
            "deleted_zip_path": str(zip_candidate),
            "deleted_latest": False,
            "message": history_message,
        }

    def prune_history(self, history_dir: str) -> None:
        history_root = Path(history_dir)
        if not history_root.is_dir():
            return

        manifest_paths = sorted(
            history_root.glob(f"*_{self.manifest_filename}"),
            key=lambda item: item.stat().st_mtime if item.exists() else 0,
            reverse=True,
        )
        for manifest_path in manifest_paths[self.history_retention_limit :]:
            zip_path = self.resolve_history_zip_path(manifest_path)
            try:
                if manifest_path.exists():
                    manifest_path.unlink()
                if zip_path.exists():
                    zip_path.unlink()
            except Exception as exc:
                raise FileOperationException(
                    f"Nao foi possivel aplicar a retencao do historico de snapshots: {exc}"
                ) from exc

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
            raise ValidationException(f"Manifesto do snapshot de comparacao invalido: {exc}") from exc

        return self.parse_manifest_payload(data)

    def parse_manifest_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "machine_label": str(data.get("machine_label") or ""),
            "published_at": str(data.get("published_at") or ""),
            "app_version": str(data.get("app_version") or ""),
            "db_version": str(data.get("db_version") or ""),
            "database_filename": str(data.get("database_filename") or DB_NAME),
            "database_sha256": str(data.get("database_sha256") or ""),
            "total_items": int(data.get("total_items") or 0),
            "active_items": int(data.get("active_items") or 0),
            "with_stock_items": int(data.get("with_stock_items") or 0),
            "file_size": int(data.get("file_size") or 0),
        }

    def resolve_history_zip_path(self, manifest_path: str | Path) -> Path:
        manifest_obj = Path(manifest_path)
        if manifest_obj.name.endswith(f"_{self.manifest_filename}"):
            zip_name = manifest_obj.name.replace(f"_{self.manifest_filename}", f"_{self.zip_filename}")
            return manifest_obj.with_name(zip_name)
        return manifest_obj.with_name(self.zip_filename)

    def sha256_file(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _delete_files(
        self,
        *,
        manifest_path: str,
        zip_path: str,
        allowed_root: str,
        allow_missing: bool,
        not_found_message: str,
    ) -> None:
        manifest_obj = Path(manifest_path)
        zip_obj = Path(zip_path)

        for target in (manifest_obj, zip_obj):
            self._ensure_path_under_root(str(target), allowed_root)

        if not allow_missing and not manifest_obj.exists():
            raise ValidationException(not_found_message)

        try:
            if manifest_obj.exists():
                manifest_obj.unlink()
            if zip_obj.exists():
                zip_obj.unlink()
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel excluir o snapshot publicado: {exc}") from exc

    def _validate_history_manifest_path(self, manifest_path: str, allowed_root: str) -> Path:
        target = Path(manifest_path).resolve(strict=False)
        self._ensure_path_under_root(str(target), allowed_root)
        history_dir = Path(allowed_root).resolve(strict=False) / "historico"
        try:
            target.relative_to(history_dir)
        except ValueError as exc:
            raise ValidationException("Apenas snapshots do historico podem ser excluidos por item.") from exc
        return target

    def _ensure_path_under_root(self, target_path: str, allowed_root: str) -> None:
        target = Path(target_path).resolve(strict=False)
        root = Path(allowed_root).resolve(strict=False)
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise ValidationException("Caminho de snapshot invalido para exclusao.") from exc

    def _build_unique_history_paths(self, history_dir: str, timestamp: str) -> tuple[str, str]:
        history_root = Path(history_dir)
        zip_path = history_root / f"{timestamp}_{self.zip_filename}"
        manifest_path = history_root / f"{timestamp}_{self.manifest_filename}"
        if not zip_path.exists() and not manifest_path.exists():
            return str(zip_path), str(manifest_path)

        suffix = 2
        while True:
            zip_candidate = history_root / f"{timestamp}_{suffix}_{self.zip_filename}"
            manifest_candidate = history_root / f"{timestamp}_{suffix}_{self.manifest_filename}"
            if not zip_candidate.exists() and not manifest_candidate.exists():
                return str(zip_candidate), str(manifest_candidate)
            suffix += 1

    def _iso_now(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
