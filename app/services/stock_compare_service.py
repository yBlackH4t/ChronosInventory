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
from core.constants import APP_VERSION, DATE_FORMAT_FILE, DB_NAME
from core.database.connection import DatabaseConnection
from core.database.migration_manager import MigrationManager
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils


REQUIRED_PRODUCT_COLUMNS = {"id", "nome", "qtd_canoas", "qtd_pf"}


class StockCompareService:
    _compare_dirname = "compare"
    _latest_dirname = "latest"
    _history_dirname = "historico"
    _zip_filename = "compare_base.zip"
    _manifest_filename = "compare_base.json"

    def __init__(self) -> None:
        self.db_connection = DatabaseConnection()
        self.backup_service = BackupService()
        self.local_share_service = LocalShareService()
        self.config_path = FileUtils.get_official_base_config_path()

    def compare_databases(
        self,
        left_path: str,
        right_path: str,
        left_label: Optional[str] = None,
        right_label: Optional[str] = None,
    ) -> Dict[str, object]:
        left_info = self._read_database(left_path, left_label or "Base A")
        right_info = self._read_database(right_path, right_label or "Base B")

        if os.path.abspath(left_info["path"]) == os.path.abspath(right_info["path"]):
            raise ValidationException("Escolha duas bases diferentes para comparar.")

        return self._build_compare_result(left_info, right_info)

    def get_published_compare_status(self) -> Dict[str, Any]:
        config = self._load_shared_config()
        available_bases = self.list_published_bases(include_current_machine=True)
        local_snapshot = next(
            (item for item in available_bases if item["machine_label"] == config["machine_label"]),
            None,
        )

        return {
            "compare_root_dir": self._compare_root_dir(config["official_base_dir"]) if config["official_base_dir"] else None,
            "official_base_dir": config["official_base_dir"] or None,
            "machine_label": config["machine_label"],
            "configured": bool(config["official_base_dir"]),
            "local_snapshot_available": local_snapshot is not None,
            "local_snapshot": local_snapshot,
            "available_bases": available_bases,
        }

    def list_published_bases(self, include_current_machine: bool = False) -> List[Dict[str, Any]]:
        config = self._load_shared_config()
        compare_root = self._compare_root_dir(config["official_base_dir"])
        if not compare_root or not os.path.isdir(compare_root):
            return []

        items: List[Dict[str, Any]] = []
        for machine_dir in sorted(Path(compare_root).iterdir(), key=lambda entry: entry.name.lower()):
            if not machine_dir.is_dir():
                continue

            latest_dir = machine_dir / self._latest_dirname
            manifest_path = latest_dir / self._manifest_filename
            zip_path = latest_dir / self._zip_filename
            if not manifest_path.exists() or not zip_path.exists():
                continue

            manifest = self._read_manifest(str(manifest_path))
            if not manifest:
                continue

            machine_label = str(manifest.get("machine_label") or machine_dir.name)
            is_current_machine = machine_label == config["machine_label"]
            if not include_current_machine and is_current_machine:
                continue

            items.append(
                {
                    "machine_label": machine_label,
                    "zip_path": str(zip_path),
                    "manifest_path": str(manifest_path),
                    "manifest": manifest,
                    "is_current_machine": is_current_machine,
                }
            )

        items.sort(key=lambda item: item["manifest"]["published_at"], reverse=True)
        return items

    def publish_current_compare_base(self) -> Dict[str, Any]:
        config = self._load_shared_config()
        base_dir = str(config["official_base_dir"] or "").strip()
        if not base_dir:
            raise ValidationException(
                "Configure a pasta compartilhada em Backup > Base oficial compartilhada antes de publicar a base para comparacao."
            )

        machine_label = config["machine_label"]
        latest_dir = Path(self._compare_machine_dir(base_dir, machine_label)) / self._latest_dirname
        history_dir = Path(self._compare_machine_dir(base_dir, machine_label)) / self._history_dirname
        latest_zip = latest_dir / self._zip_filename
        latest_manifest = latest_dir / self._manifest_filename
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = history_dir / f"{timestamp}_{self._zip_filename}"
        history_manifest = history_dir / f"{timestamp}_{self._manifest_filename}"
        published_at = self._iso_now()

        try:
            latest_dir.mkdir(parents=True, exist_ok=True)
            history_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel preparar a pasta de comparacao: {exc}") from exc

        with tempfile.TemporaryDirectory(prefix="chronos_compare_publish_") as tmp_dir:
            snapshot_path = os.path.join(tmp_dir, DB_NAME)
            self.backup_service._create_sqlite_snapshot(self.db_connection.get_database_path(), snapshot_path)
            db_info = self._read_database(snapshot_path, machine_label)

            with zipfile.ZipFile(latest_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(snapshot_path, arcname=DB_NAME)

            checksum = self._sha256_file(str(latest_zip))
            manifest = {
                "machine_label": machine_label,
                "published_at": published_at,
                "app_version": APP_VERSION,
                "db_version": MigrationManager(self.db_connection).get_current_database_version(),
                "database_filename": DB_NAME,
                "database_sha256": checksum,
                "total_items": int(db_info["total_items"]),
                "active_items": int(db_info["active_items"]),
                "with_stock_items": int(db_info["with_stock_items"]),
                "file_size": int(db_info["file_size"]),
            }

            self._write_manifest(str(latest_manifest), manifest)
            FileUtils.copy_file(str(latest_zip), str(history_zip))
            self._write_manifest(str(history_manifest), manifest)

        return {
            "machine_label": machine_label,
            "published_at": published_at,
            "zip_path": str(latest_zip),
            "manifest_path": str(latest_manifest),
            "history_zip_path": str(history_zip),
            "history_manifest_path": str(history_manifest),
        }

    def compare_with_published_base(self, machine_label: str) -> Dict[str, Any]:
        config = self._load_shared_config()
        target = next(
            (
                item
                for item in self.list_published_bases(include_current_machine=True)
                if item["machine_label"] == str(machine_label or "").strip()
            ),
            None,
        )
        if not target:
            raise ValidationException("Base publicada nao encontrada para a maquina informada.")

        if target["machine_label"] == config["machine_label"]:
            raise ValidationException("Escolha uma base publicada de outra maquina para comparar.")

        zip_path = str(target["zip_path"])
        manifest = target["manifest"]
        expected_hash = str(manifest.get("database_sha256") or "").strip()
        if not expected_hash:
            raise ValidationException("A base publicada selecionada esta sem checksum.")
        current_hash = self._sha256_file(zip_path)
        if current_hash.lower() != expected_hash.lower():
            raise ValidationException("Checksum da base publicada nao confere. Publique novamente antes de comparar.")

        with tempfile.TemporaryDirectory(prefix="chronos_compare_remote_") as tmp_dir:
            extracted_db = self._extract_snapshot_database(zip_path, tmp_dir)
            current_db_path = self.db_connection.get_database_path()
            result = self.compare_databases(
                left_path=current_db_path,
                right_path=extracted_db,
                left_label="Minha base atual",
                right_label=f"Base publicada - {target['machine_label']}",
            )

        result["right"] = {
            "label": f"Base publicada - {target['machine_label']}",
            "path": zip_path,
            "file_size": int(manifest.get("file_size") or result["right"]["file_size"]),
            "total_items": int(manifest.get("total_items") or result["right"]["total_items"]),
            "active_items": int(manifest.get("active_items") or result["right"]["active_items"]),
            "with_stock_items": int(manifest.get("with_stock_items") or result["right"]["with_stock_items"]),
        }
        return result

    def get_server_compare_status(self) -> Dict[str, Any]:
        config = self._load_shared_config()
        paths = self.local_share_service.get_compare_paths()
        manifest = self._read_manifest(paths["latest_manifest"])
        server = self.local_share_service.get_server_status(
            machine_label=config["machine_label"],
            publisher_name="",
            port=config["server_port"],
            enabled=config["server_enabled"],
        )
        return {
            "machine_label": config["machine_label"],
            "current_database_path": self.db_connection.get_database_path(),
            "server_running": bool(server["running"]),
            "server_port": int(server["port"]),
            "server_urls": [str(item) for item in server["urls"]],
            "remote_server_url": config["remote_server_url"] or None,
            "local_snapshot_available": manifest is not None and os.path.isfile(paths["latest_zip"]),
            "local_snapshot": (
                {
                    "machine_label": config["machine_label"],
                    "zip_path": paths["latest_zip"],
                    "manifest_path": paths["latest_manifest"],
                    "manifest": manifest,
                    "is_current_machine": True,
                }
                if manifest
                else None
            ),
        }

    def publish_server_compare_snapshot(self) -> Dict[str, Any]:
        config = self._load_shared_config()
        paths = self.local_share_service.get_compare_paths()
        latest_zip = paths["latest_zip"]
        latest_manifest = paths["latest_manifest"]
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        history_zip = os.path.join(paths["history_dir"], f"{timestamp}_{self._zip_filename}")
        history_manifest = os.path.join(paths["history_dir"], f"{timestamp}_{self._manifest_filename}")
        published_at = self._iso_now()

        Path(paths["latest_dir"]).mkdir(parents=True, exist_ok=True)
        Path(paths["history_dir"]).mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="chronos_compare_publish_") as tmp_dir:
            snapshot_path = os.path.join(tmp_dir, DB_NAME)
            self.backup_service._create_sqlite_snapshot(self.db_connection.get_database_path(), snapshot_path)
            db_info = self._read_database(snapshot_path, config["machine_label"])

            with zipfile.ZipFile(latest_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(snapshot_path, arcname=DB_NAME)

            checksum = self._sha256_file(str(latest_zip))
            manifest = {
                "machine_label": config["machine_label"],
                "published_at": published_at,
                "app_version": APP_VERSION,
                "db_version": MigrationManager(self.db_connection).get_current_database_version(),
                "database_filename": DB_NAME,
                "database_sha256": checksum,
                "total_items": int(db_info["total_items"]),
                "active_items": int(db_info["active_items"]),
                "with_stock_items": int(db_info["with_stock_items"]),
                "file_size": int(db_info["file_size"]),
            }

            self._write_manifest(str(latest_manifest), manifest)
            FileUtils.copy_file(str(latest_zip), str(history_zip))
            self._write_manifest(str(history_manifest), manifest)

        return {
            "machine_label": config["machine_label"],
            "published_at": published_at,
            "zip_path": str(latest_zip),
            "manifest_path": str(latest_manifest),
            "history_zip_path": str(history_zip),
            "history_manifest_path": str(history_manifest),
        }

    def inspect_remote_compare_server(self, server_url: str) -> Dict[str, Any]:
        normalized_url = self.local_share_service.normalize_server_url(server_url)
        payload = self.local_share_service.fetch_remote_status(normalized_url)
        compare_manifest = None
        if payload.get("compare_available"):
            compare_manifest = self._read_remote_compare_manifest(
                self.local_share_service.fetch_remote_manifest(normalized_url, "compare")
            )
        return {
            "server_url": normalized_url,
            "reachable": True,
            "machine_label": str(payload.get("machine_label") or ""),
            "app_version": str(payload.get("app_version") or ""),
            "compare_available": bool(payload.get("compare_available")),
            "compare_manifest": compare_manifest,
            "message": "Servidor remoto pronto para comparacao." if compare_manifest else "Servidor remoto conectado, mas sem snapshot de comparacao publicado.",
        }

    def compare_with_remote_server(self, server_url: str) -> Dict[str, Any]:
        normalized_url = self.local_share_service.normalize_server_url(server_url)
        manifest = self._read_remote_compare_manifest(
            self.local_share_service.fetch_remote_manifest(normalized_url, "compare")
        )

        with tempfile.TemporaryDirectory(prefix="chronos_compare_remote_") as tmp_dir:
            zip_path = os.path.join(tmp_dir, self._zip_filename)
            self.local_share_service.download_remote_snapshot(normalized_url, "compare", zip_path)

            expected_hash = str(manifest.get("database_sha256") or "").strip()
            current_hash = self._sha256_file(zip_path)
            if not expected_hash or current_hash.lower() != expected_hash.lower():
                raise ValidationException("Checksum do snapshot remoto nao confere. Publique novamente antes de comparar.")

            extracted_db = self._extract_snapshot_database(zip_path, tmp_dir)
            current_db_path = self.db_connection.get_database_path()
            result = self.compare_databases(
                left_path=current_db_path,
                right_path=extracted_db,
                left_label="Minha base atual",
                right_label=f"Servidor remoto - {manifest['machine_label']}",
            )

        result["right"] = {
            "label": f"Servidor remoto - {manifest['machine_label']}",
            "path": normalized_url,
            "file_size": int(manifest.get("file_size") or result["right"]["file_size"]),
            "total_items": int(manifest.get("total_items") or result["right"]["total_items"]),
            "active_items": int(manifest.get("active_items") or result["right"]["active_items"]),
            "with_stock_items": int(manifest.get("with_stock_items") or result["right"]["with_stock_items"]),
        }
        return result

    def _build_compare_result(self, left_info: Dict[str, object], right_info: Dict[str, object]) -> Dict[str, object]:
        left_products: Dict[int, dict] = left_info["products"]
        right_products: Dict[int, dict] = right_info["products"]

        rows: List[dict] = []
        summary = {
            "total_compared_items": 0,
            "identical_items": 0,
            "divergent_items": 0,
            "only_left_items": 0,
            "only_right_items": 0,
            "canoas_mismatch_items": 0,
            "pf_mismatch_items": 0,
            "name_mismatch_items": 0,
            "active_mismatch_items": 0,
        }

        for product_id in sorted(set(left_products.keys()) | set(right_products.keys())):
            left = left_products.get(product_id)
            right = right_products.get(product_id)
            statuses: List[str] = []

            if left is None:
                statuses.append("ONLY_RIGHT")
                summary["only_right_items"] += 1
            if right is None:
                statuses.append("ONLY_LEFT")
                summary["only_left_items"] += 1

            if left is not None and right is not None:
                if self._normalize_name(left["nome"]) != self._normalize_name(right["nome"]):
                    statuses.append("NAME")
                    summary["name_mismatch_items"] += 1
                if int(left["qtd_canoas"]) != int(right["qtd_canoas"]):
                    statuses.append("CANOAS")
                    summary["canoas_mismatch_items"] += 1
                if int(left["qtd_pf"]) != int(right["qtd_pf"]):
                    statuses.append("PF")
                    summary["pf_mismatch_items"] += 1
                if bool(left["ativo"]) != bool(right["ativo"]):
                    statuses.append("ACTIVE")
                    summary["active_mismatch_items"] += 1

            has_difference = len(statuses) > 0
            if has_difference:
                summary["divergent_items"] += 1
            else:
                summary["identical_items"] += 1
                statuses.append("IDENTICAL")
            summary["total_compared_items"] += 1

            left_canoas = int(left["qtd_canoas"]) if left is not None else None
            right_canoas = int(right["qtd_canoas"]) if right is not None else None
            left_pf = int(left["qtd_pf"]) if left is not None else None
            right_pf = int(right["qtd_pf"]) if right is not None else None

            rows.append(
                {
                    "product_id": product_id,
                    "display_name": (left or right)["nome"],
                    "left_name": left["nome"] if left is not None else None,
                    "right_name": right["nome"] if right is not None else None,
                    "left_qtd_canoas": left_canoas,
                    "right_qtd_canoas": right_canoas,
                    "diff_canoas": (right_canoas or 0) - (left_canoas or 0),
                    "left_qtd_pf": left_pf,
                    "right_qtd_pf": right_pf,
                    "diff_pf": (right_pf or 0) - (left_pf or 0),
                    "left_ativo": bool(left["ativo"]) if left is not None else None,
                    "right_ativo": bool(right["ativo"]) if right is not None else None,
                    "statuses": statuses,
                    "has_difference": has_difference,
                }
            )

        return {
            "left": self._to_file_info_out(left_info),
            "right": self._to_file_info_out(right_info),
            "summary": summary,
            "rows": rows,
        }

    def _read_database(self, raw_path: str, label: str) -> Dict[str, object]:
        path = os.path.abspath((raw_path or "").strip())
        if not path:
            raise ValidationException(f"Informe o caminho da base para {label}.")
        if not os.path.isfile(path):
            raise ValidationException(f"Arquivo de base nao encontrado para {label}: {path}")

        try:
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
        except Exception as exc:
            raise ValidationException(f"Nao foi possivel abrir a base {label}: {exc}") from exc

        try:
            table = conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'produtos'"
            ).fetchone()
            if not table:
                raise ValidationException(f"A base {label} nao possui a tabela 'produtos'.")

            columns = {
                str(row["name"]).lower()
                for row in conn.execute("PRAGMA table_info(produtos)").fetchall()
            }
            if not REQUIRED_PRODUCT_COLUMNS.issubset(columns):
                raise ValidationException(
                    f"A base {label} nao possui as colunas minimas esperadas em 'produtos'."
                )

            has_ativo = "ativo" in columns
            select_ativo = "COALESCE(ativo, 1) AS ativo" if has_ativo else "1 AS ativo"
            rows = conn.execute(
                f"""
                SELECT id,
                       nome,
                       COALESCE(qtd_canoas, 0) AS qtd_canoas,
                       COALESCE(qtd_pf, 0) AS qtd_pf,
                       {select_ativo}
                FROM produtos
                """
            ).fetchall()

            products = {
                int(row["id"]): {
                    "nome": str(row["nome"] or "").strip(),
                    "qtd_canoas": int(row["qtd_canoas"] or 0),
                    "qtd_pf": int(row["qtd_pf"] or 0),
                    "ativo": bool(row["ativo"]),
                }
                for row in rows
            }
            total_items = len(products)
            active_items = sum(1 for item in products.values() if item["ativo"])
            with_stock_items = sum(
                1 for item in products.values() if (item["qtd_canoas"] + item["qtd_pf"]) > 0
            )
            return {
                "label": label,
                "path": path,
                "file_size": os.path.getsize(path),
                "total_items": total_items,
                "active_items": active_items,
                "with_stock_items": with_stock_items,
                "products": products,
            }
        finally:
            conn.close()

    def _to_file_info_out(self, info: Dict[str, object]) -> Dict[str, object]:
        return {
            "label": str(info["label"]),
            "path": str(info["path"]),
            "file_size": int(info["file_size"]),
            "total_items": int(info["total_items"]),
            "active_items": int(info["active_items"]),
            "with_stock_items": int(info["with_stock_items"]),
        }

    def _normalize_name(self, value: str) -> str:
        return str(value or "").strip().upper()

    def _load_shared_config(self) -> Dict[str, str]:
        default = {
            "official_base_dir": "",
            "machine_label": self._default_machine_label(),
            "server_port": LocalShareService._default_port,
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

        official_base_dir = str(data.get("official_base_dir") or "").strip()
        machine_label = str(data.get("machine_label") or self._default_machine_label()).strip()
        return {
            "official_base_dir": official_base_dir,
            "machine_label": machine_label or self._default_machine_label(),
            "server_port": self.local_share_service.normalize_port(data.get("server_port") or default["server_port"]),
            "remote_server_url": self.local_share_service.normalize_server_url(data.get("remote_server_url"))
            if str(data.get("remote_server_url") or "").strip()
            else "",
            "server_enabled": bool(data.get("server_enabled", default["server_enabled"])),
        }

    def _default_machine_label(self) -> str:
        candidate = os.getenv("COMPUTERNAME") or os.getenv("HOSTNAME") or "maquina-local"
        return str(candidate).strip()[:120]

    def _compare_root_dir(self, official_base_dir: str) -> str:
        normalized = str(official_base_dir or "").strip()
        if not normalized:
            return ""
        return os.path.join(normalized, self._compare_dirname)

    def _compare_machine_dir(self, official_base_dir: str, machine_label: str) -> str:
        safe_machine = self._safe_machine_label(machine_label)
        return os.path.join(self._compare_root_dir(official_base_dir), safe_machine)

    def _safe_machine_label(self, machine_label: str) -> str:
        value = str(machine_label or "").strip()
        if not value:
            return self._default_machine_label()
        safe = "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_"})
        return safe[:120] or self._default_machine_label()

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
            raise ValidationException(f"Manifesto da base publicada para comparacao invalido: {exc}") from exc

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

    def _read_remote_compare_manifest(self, data: Dict[str, Any]) -> Dict[str, Any]:
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

    def _extract_snapshot_database(self, zip_path: str, target_dir: str) -> str:
        extracted_path = os.path.join(target_dir, DB_NAME)
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                if DB_NAME not in zf.namelist():
                    raise ValidationException(f"A base publicada nao contem '{DB_NAME}'.")
                with zf.open(DB_NAME) as src, open(extracted_path, "wb") as dst:
                    dst.write(src.read())
        except ValidationException:
            raise
        except Exception as exc:
            raise FileOperationException(f"Falha ao extrair a base publicada para comparacao: {exc}") from exc
        return extracted_path

    def _sha256_file(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _iso_now(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
