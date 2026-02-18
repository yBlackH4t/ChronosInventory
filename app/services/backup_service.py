"""
Servico de backup e recuperacao.
Responsabilidade: criar snapshots consistentes do SQLite, validar integridade,
restaurar backups com fallback e exportar pacote de diagnostico.
"""

from __future__ import annotations

import io
import json
import os
import platform
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

from core.constants import DATE_FORMAT_FILE, APP_VERSION
from core.database.connection import DatabaseConnection
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils
from core.utils.validators import Validators


class BackupService:
    """
    Servico de backup.
    Responsabilidade unica: operacoes de backup, validacao e restauracao.
    """

    def __init__(self):
        self.product_repo = ProductRepository()
        self.db_connection = DatabaseConnection()
        self.backups_dir = FileUtils.get_backups_directory()

    def export_backup(self, excel_path: str) -> Tuple[bool, str]:
        """
        Exporta backup completo (Excel + DB).
        """
        try:
            products = self.product_repo.get_all()
            if not products:
                return False, "Sem dados para exportar."

            df = pd.DataFrame(products)
            df.to_excel(excel_path, index=False)

            db_backup_path = os.path.splitext(excel_path)[0] + ".db"
            self._create_sqlite_snapshot(self.db_connection.get_database_path(), db_backup_path)
            return True, "Backup (Excel + DB) exportado com sucesso."
        except Exception as exc:
            return False, f"Erro ao exportar backup: {exc}"

    def create_automatic_backup(self, prefix: str = "backup_auto") -> Tuple[bool, str]:
        """
        Cria backup automatico consistente do banco via API de backup do SQLite.
        """
        try:
            timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
            backup_name = f"{prefix}_{timestamp}.db"
            backup_path = os.path.join(self.backups_dir, backup_name)
            self._create_sqlite_snapshot(self.db_connection.get_database_path(), backup_path)
            return True, backup_path
        except Exception as exc:
            raise FileOperationException(f"Erro ao criar backup automatico: {exc}") from exc

    def create_pre_update_backup(self) -> str:
        """
        Cria backup antes de atualizacao do sistema.
        """
        success, path = self.create_automatic_backup(prefix="backup_pre_update")
        if not success:
            raise FileOperationException("Falha ao criar backup pre-update.")
        return path

    def list_backups(self) -> List[str]:
        """
        Lista caminhos de backups disponiveis.
        """
        return FileUtils.list_files_in_directory(self.backups_dir, ".db")

    def list_backups_metadata(self) -> List[Dict[str, object]]:
        """
        Lista backups com metadados para exibicao na UI.
        """
        items: List[Dict[str, object]] = []
        for path in self.list_backups():
            try:
                stat = os.stat(path)
                items.append(
                    {
                        "name": os.path.basename(path),
                        "path": path,
                        "size": int(stat.st_size),
                        "created_at": datetime.fromtimestamp(stat.st_mtime),
                    }
                )
            except FileNotFoundError:
                continue

        items.sort(key=lambda item: item["created_at"], reverse=True)
        return items

    def get_backup_count(self) -> int:
        return len(self.list_backups())

    def delete_old_backups(self, keep_last: int = 10) -> int:
        backups = self.list_backups()
        if len(backups) <= keep_last:
            return 0

        backups.sort(key=lambda x: os.path.getmtime(x), reverse=True)
        backups_to_delete = backups[keep_last:]
        deleted_count = 0

        for backup_path in backups_to_delete:
            try:
                FileUtils.delete_file(backup_path)
                deleted_count += 1
            except Exception:
                pass

        return deleted_count

    def validate_backup(self, backup_name: Optional[str] = None) -> Dict[str, object]:
        """
        Valida integridade do banco atual (default) ou de um backup especifico.
        """
        if backup_name:
            target_path = self._resolve_backup_path(backup_name)
        else:
            target_path = self.db_connection.get_database_path()

        result = self._run_integrity_check(target_path)
        ok = result.lower() == "ok"
        return {
            "path": target_path,
            "ok": ok,
            "result": result,
        }

    def restore_backup(self, backup_name: str) -> Dict[str, object]:
        """
        Restaura o banco principal a partir de um backup validado.
        Cria snapshot de seguranca antes da restauracao e reverte em caso de falha.
        """
        source_path = self._resolve_backup_path(backup_name)
        validation = self.validate_backup(backup_name)
        if not validation["ok"]:
            raise ValidationException(
                f"Backup '{backup_name}' invalido para restauracao: {validation['result']}"
            )

        ok, pre_restore_path = self.create_automatic_backup(prefix="backup_pre_restore")
        if not ok:
            raise FileOperationException("Falha ao criar backup de seguranca antes da restauracao.")

        db_path = self.db_connection.get_database_path()
        try:
            self._restore_sqlite_snapshot(source_path, db_path)
            final_validation = self.validate_backup()
            if not final_validation["ok"]:
                raise FileOperationException(
                    "Integridade do banco restaurado falhou apos restauracao."
                )

            return {
                "restored_from": source_path,
                "active_database": db_path,
                "pre_restore_backup": pre_restore_path,
                "validation_result": final_validation["result"],
            }
        except Exception as exc:
            self._restore_sqlite_snapshot(pre_restore_path, db_path)
            raise FileOperationException(
                f"Falha na restauracao. Banco anterior foi recuperado do backup de seguranca. Erro: {exc}"
            ) from exc

    def export_diagnostics_archive(self) -> Tuple[str, bytes]:
        """
        Gera pacote de diagnostico (zip) para suporte.
        """
        db_path = self.db_connection.get_database_path()
        db_validation = self.validate_backup()
        backups = self.list_backups_metadata()[:30]

        backend_log = self._read_log_tail(Path("backend") / "logs" / "backend.log")
        tauri_log = self._read_log_tail(self._tauri_log_path())

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
                    "created_at": item["created_at"].isoformat(),
                }
                for item in backups
            ],
        }

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
            zf.writestr("logs/backend.log.tail.txt", backend_log or "Sem log backend.")
            zf.writestr("logs/tauri.log.tail.txt", tauri_log or "Sem log tauri.")

        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        filename = f"diagnostico_{timestamp}.zip"
        return filename, buf.getvalue()

    def _resolve_backup_path(self, backup_name: str) -> str:
        sanitized = Validators.sanitize_filename(backup_name)
        if not sanitized.endswith(".db"):
            raise ValidationException("Nome de backup invalido. Informe um arquivo .db.")
        path = os.path.join(self.backups_dir, sanitized)
        if not os.path.isfile(path):
            raise ValidationException(f"Backup '{sanitized}' nao encontrado.")
        return path

    def _run_integrity_check(self, db_path: str) -> str:
        if not os.path.exists(db_path):
            return "database file not found"

        conn = None
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            row = conn.execute("PRAGMA integrity_check;").fetchone()
            return str(row[0] if row else "unknown")
        except Exception as exc:
            return f"integrity_check_error: {exc}"
        finally:
            if conn is not None:
                conn.close()

    def _create_sqlite_snapshot(self, source_path: str, destination_path: str) -> None:
        src_conn = None
        dst_conn = None
        try:
            Path(destination_path).parent.mkdir(parents=True, exist_ok=True)
            if os.path.exists(destination_path):
                os.remove(destination_path)

            src_conn = sqlite3.connect(source_path)
            src_conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            dst_conn = sqlite3.connect(destination_path)
            with dst_conn:
                src_conn.backup(dst_conn)
        except Exception as exc:
            raise FileOperationException(
                f"Erro ao criar snapshot do banco para '{destination_path}': {exc}"
            ) from exc
        finally:
            if dst_conn is not None:
                dst_conn.close()
            if src_conn is not None:
                src_conn.close()

    def _restore_sqlite_snapshot(self, source_snapshot: str, destination_db: str) -> None:
        src_conn = None
        dst_conn = None
        try:
            src_conn = sqlite3.connect(source_snapshot)
            dst_conn = sqlite3.connect(destination_db)
            with dst_conn:
                src_conn.backup(dst_conn)
            try:
                dst_conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            except Exception:
                pass
        except Exception as exc:
            raise FileOperationException(
                f"Erro ao restaurar snapshot '{source_snapshot}' para '{destination_db}': {exc}"
            ) from exc
        finally:
            if dst_conn is not None:
                dst_conn.close()
            if src_conn is not None:
                src_conn.close()

    def _read_log_tail(self, path: Path, max_lines: int = 300) -> str:
        if not path.exists():
            return ""
        try:
            with path.open("r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            return "".join(lines[-max_lines:])
        except Exception:
            return ""

    def _tauri_log_path(self) -> Path:
        local_app_data = os.getenv("LOCALAPPDATA")
        if not local_app_data:
            return Path(os.getenv("TEMP", ".")) / "chronos_inventory_tauri.log"
        return Path(local_app_data) / "ChronosInventory" / "logs" / "tauri.log"
