"""
Scheduler simples para backup automatico local.
Executa em background e dispara backup diario/semanal conforme configuracao persistida.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Optional

from app.services.backup_service import BackupService


LOG = logging.getLogger("backend.backup_scheduler")


class BackupSchedulerService:
    def __init__(self, interval_seconds: int = 60) -> None:
        self.interval_seconds = max(int(interval_seconds), 15)
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._service = BackupService()

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._loop,
                name="backup-scheduler",
                daemon=True,
            )
            self._thread.start()
            LOG.info("Backup scheduler iniciado.")

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            thread = self._thread
            self._thread = None
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        LOG.info("Backup scheduler finalizado.")

    def trigger_once(self) -> dict:
        return self._service.run_due_scheduled_backup(datetime.now())

    def _loop(self) -> None:
        while not self._stop_event.wait(self.interval_seconds):
            try:
                result = self._service.run_due_scheduled_backup(datetime.now())
                if result.get("executed"):
                    LOG.info(
                        "Backup automatico executado. arquivo=%s removidos=%s",
                        result.get("backup_path"),
                        result.get("deleted_old_backups"),
                    )
                elif result.get("reason") == "error":
                    LOG.error("Falha no backup automatico: %s", result.get("error"))
            except Exception as exc:
                LOG.exception("Erro no loop de backup automatico: %s", exc)
