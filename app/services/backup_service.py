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
import tempfile
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
        self._default_auto_hour = 18
        self._default_auto_minute = 0
        self._default_retention_days = 15
        self._default_schedule_mode = "DAILY"
        self._default_weekday = 0  # 0=segunda-feira (datetime.weekday)

    def export_backup(self, excel_path: str) -> Tuple[bool, str]:
        """
        Exporta backup completo (Excel + DB).
        """
        try:
            products = self.product_repo.get_all(status="TODOS")
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

    def get_latest_pre_update_backup_name(self) -> Optional[str]:
        items = [
            item
            for item in self.list_backups_metadata()
            if str(item.get("name", "")).startswith("backup_pre_update_")
        ]
        if not items:
            return None
        return str(items[0]["name"])

    def restore_latest_pre_update_backup(self) -> Dict[str, object]:
        name = self.get_latest_pre_update_backup_name()
        if not name:
            raise ValidationException("Nenhum backup pre-update disponivel para restauracao.")
        return self.restore_backup(name)

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

    def test_restore_backup(self, backup_name: Optional[str] = None) -> Dict[str, object]:
        """
        Executa um teste real de restauracao em banco temporario sem alterar o banco ativo.
        """
        if backup_name:
            source_path = self._resolve_backup_path(backup_name)
        else:
            metadata = self.list_backups_metadata()
            if not metadata:
                raise ValidationException("Nenhum backup disponivel para teste.")
            source_path = str(metadata[0]["path"])
            backup_name = str(metadata[0]["name"])

        with tempfile.TemporaryDirectory(prefix="chronos_restore_test_") as tmp_dir:
            target_path = os.path.join(tmp_dir, "restore_test.db")
            self._restore_sqlite_snapshot(source_path, target_path)
            integrity = self._run_integrity_check(target_path)
            ok = integrity.lower() == "ok"
            table_check = self._validate_required_tables(target_path)

            return {
                "backup_name": backup_name,
                "backup_path": source_path,
                "test_database": target_path,
                "ok": bool(ok and table_check["ok"]),
                "integrity_result": integrity,
                "required_tables": table_check["required_tables"],
                "missing_tables": table_check["missing_tables"],
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
            "auto_backup_config": self.get_auto_backup_config(),
        }

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
            zf.writestr("logs/backend.log.tail.txt", backend_log or "Sem log backend.")
            zf.writestr("logs/tauri.log.tail.txt", tauri_log or "Sem log tauri.")

        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        filename = f"diagnostico_{timestamp}.zip"
        return filename, buf.getvalue()

    def get_auto_backup_config(self) -> Dict[str, object]:
        schedule_mode = self._normalize_schedule_mode(
            self._read_system_text("backup_auto_schedule_mode"),
            self._default_schedule_mode,
        )
        weekday = self._normalize_weekday(
            self._read_system_int("backup_auto_weekday", self._default_weekday),
            self._default_weekday,
        )
        return {
            "enabled": self._read_system_bool("backup_auto_enabled", True),
            "hour": self._read_system_int("backup_auto_hour", self._default_auto_hour),
            "minute": self._read_system_int("backup_auto_minute", self._default_auto_minute),
            "retention_days": self._read_system_int("backup_retention_days", self._default_retention_days),
            "schedule_mode": schedule_mode,
            "weekday": weekday,
            "last_run_date": self._read_system_text("backup_auto_last_run_date"),
            "last_result": self._read_system_text("backup_auto_last_result"),
            "last_backup_name": self._read_system_text("backup_auto_last_backup"),
        }

    def update_auto_backup_config(
        self,
        enabled: bool,
        hour: int,
        minute: int,
        retention_days: int,
        schedule_mode: str = "DAILY",
        weekday: int = 0,
    ) -> Dict[str, object]:
        if hour < 0 or hour > 23:
            raise ValidationException("Hora invalida para backup automatico. Use 0-23.")
        if minute < 0 or minute > 59:
            raise ValidationException("Minuto invalido para backup automatico. Use 0-59.")
        if retention_days not in {7, 15, 30}:
            raise ValidationException("Retencao invalida. Use 7, 15 ou 30 dias.")
        schedule_mode_value = self._normalize_schedule_mode(schedule_mode, "")
        if schedule_mode_value not in {"DAILY", "WEEKLY"}:
            raise ValidationException("Frequencia invalida. Use DAILY ou WEEKLY.")
        weekday_value = self._normalize_weekday(weekday, -1)
        if weekday_value < 0:
            raise ValidationException("Dia da semana invalido. Use 0 (segunda) ate 6 (domingo).")

        self._set_system_value("backup_auto_enabled", "1" if enabled else "0")
        self._set_system_value("backup_auto_hour", str(hour))
        self._set_system_value("backup_auto_minute", str(minute))
        self._set_system_value("backup_retention_days", str(retention_days))
        self._set_system_value("backup_auto_schedule_mode", schedule_mode_value)
        self._set_system_value("backup_auto_weekday", str(weekday_value))
        return self.get_auto_backup_config()

    def run_due_scheduled_backup(self, now: Optional[datetime] = None) -> Dict[str, object]:
        now_dt = now or datetime.now()
        cfg = self.get_auto_backup_config()
        enabled = bool(cfg.get("enabled"))
        if not enabled:
            return {"executed": False, "reason": "disabled", "config": cfg}

        scheduled_hour = int(cfg.get("hour") or self._default_auto_hour)
        scheduled_minute = int(cfg.get("minute") or self._default_auto_minute)
        schedule_mode = self._normalize_schedule_mode(
            str(cfg.get("schedule_mode") or self._default_schedule_mode),
            self._default_schedule_mode,
        )
        scheduled_weekday = self._normalize_weekday(
            int(cfg.get("weekday") or self._default_weekday),
            self._default_weekday,
        )

        if schedule_mode == "WEEKLY" and now_dt.weekday() != scheduled_weekday:
            return {
                "executed": False,
                "reason": "wrong_weekday",
                "config": cfg,
            }

        scheduled_minutes = scheduled_hour * 60 + scheduled_minute
        current_minutes = now_dt.hour * 60 + now_dt.minute
        if current_minutes < scheduled_minutes:
            return {"executed": False, "reason": "before_schedule", "config": cfg}

        run_date = now_dt.strftime("%Y-%m-%d")
        if str(cfg.get("last_run_date") or "") == run_date:
            return {"executed": False, "reason": "already_ran_today", "config": cfg}

        try:
            ok, path = self.create_automatic_backup(prefix="backup_auto")
            if not ok:
                raise FileOperationException("Falha ao gerar backup automatico.")
            deleted = self.cleanup_auto_backups_by_retention(int(cfg.get("retention_days") or self._default_retention_days))
            self._set_system_value("backup_auto_last_run_date", run_date)
            self._set_system_value("backup_auto_last_result", "ok")
            self._set_system_value("backup_auto_last_backup", os.path.basename(path))
            return {
                "executed": True,
                "backup_path": path,
                "deleted_old_backups": deleted,
                "config": self.get_auto_backup_config(),
            }
        except Exception as exc:
            self._set_system_value("backup_auto_last_run_date", run_date)
            self._set_system_value("backup_auto_last_result", f"erro: {exc}")
            return {
                "executed": False,
                "reason": "error",
                "error": str(exc),
                "config": self.get_auto_backup_config(),
            }

    def cleanup_auto_backups_by_retention(self, retention_days: int) -> int:
        if retention_days <= 0:
            return 0

        now_ts = datetime.now().timestamp()
        threshold_seconds = retention_days * 24 * 60 * 60
        deleted = 0
        for item in self.list_backups_metadata():
            name = str(item.get("name", ""))
            if not name.startswith("backup_auto_"):
                continue
            created_at = item.get("created_at")
            if not isinstance(created_at, datetime):
                continue
            age_seconds = now_ts - created_at.timestamp()
            if age_seconds <= threshold_seconds:
                continue
            try:
                FileUtils.delete_file(str(item["path"]))
                deleted += 1
            except Exception:
                continue
        return deleted

    def _resolve_backup_path(self, backup_name: str) -> str:
        sanitized = Validators.sanitize_filename(backup_name)
        if not sanitized.endswith(".db"):
            raise ValidationException("Nome de backup invalido. Informe um arquivo .db.")
        path = os.path.join(self.backups_dir, sanitized)
        if not os.path.isfile(path):
            raise ValidationException(f"Backup '{sanitized}' nao encontrado.")
        return path

    def _read_system_text(self, key: str, default: Optional[str] = None) -> Optional[str]:
        conn = self.db_connection.get_connection()
        try:
            row = conn.execute("SELECT value FROM system_info WHERE key = ?", (key,)).fetchone()
            if row and row[0] is not None:
                return str(row[0])
            return default
        finally:
            conn.close()

    def _read_system_int(self, key: str, default: int) -> int:
        value = self._read_system_text(key)
        if value is None:
            return default
        try:
            return int(value)
        except Exception:
            return default

    def _read_system_bool(self, key: str, default: bool) -> bool:
        value = self._read_system_text(key)
        if value is None:
            return default
        return str(value).strip() in {"1", "true", "True", "TRUE", "yes", "on"}

    def _normalize_schedule_mode(self, value: Optional[str], default: str) -> str:
        if value is None:
            return default
        normalized = str(value).strip().upper()
        if normalized in {"DAILY", "WEEKLY"}:
            return normalized
        return default

    def _normalize_weekday(self, value: int, default: int) -> int:
        try:
            normalized = int(value)
        except Exception:
            return default
        if 0 <= normalized <= 6:
            return normalized
        return default

    def _set_system_value(self, key: str, value: str) -> None:
        conn = self.db_connection.get_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)",
                (key, value),
            )
            conn.commit()
        finally:
            conn.close()

    def _validate_required_tables(self, db_path: str) -> Dict[str, object]:
        required_tables = [
            "produtos",
            "movimentacoes",
            "historico",
            "system_info",
        ]
        conn = None
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            table_names = {str(row[0]) for row in rows}
            missing_tables = [name for name in required_tables if name not in table_names]
            return {
                "ok": len(missing_tables) == 0,
                "required_tables": required_tables,
                "missing_tables": missing_tables,
            }
        except Exception:
            return {
                "ok": False,
                "required_tables": required_tables,
                "missing_tables": required_tables,
            }
        finally:
            if conn is not None:
                conn.close()

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
