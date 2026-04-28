from __future__ import annotations

import json
import os
from typing import Any, Dict

from app.services.local_share_service import LocalShareService


class StockCompareConfigStore:
    _compare_dirname = "compare"

    def __init__(self, *, config_path: str, local_share_service: LocalShareService) -> None:
        self.config_path = config_path
        self.local_share_service = local_share_service

    def load(self) -> Dict[str, Any]:
        default = {
            "official_base_dir": "",
            "machine_label": self.default_machine_label(),
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
        machine_label = str(data.get("machine_label") or self.default_machine_label()).strip()
        return {
            "official_base_dir": official_base_dir,
            "machine_label": machine_label or self.default_machine_label(),
            "server_port": self.local_share_service.normalize_port(data.get("server_port") or default["server_port"]),
            "remote_server_url": self.local_share_service.normalize_server_url(data.get("remote_server_url"))
            if str(data.get("remote_server_url") or "").strip()
            else "",
            "server_enabled": bool(data.get("server_enabled", default["server_enabled"])),
        }

    def default_machine_label(self) -> str:
        candidate = os.getenv("COMPUTERNAME") or os.getenv("HOSTNAME") or "maquina-local"
        return str(candidate).strip()[:120]

    def compare_root_dir(self, official_base_dir: str) -> str:
        normalized = str(official_base_dir or "").strip()
        if not normalized:
            return ""
        return os.path.join(normalized, self._compare_dirname)

    def compare_machine_dir(self, official_base_dir: str, machine_label: str) -> str:
        safe_machine = self.safe_machine_label(machine_label)
        return os.path.join(self.compare_root_dir(official_base_dir), safe_machine)

    def safe_machine_label(self, machine_label: str) -> str:
        value = str(machine_label or "").strip()
        if not value:
            return self.default_machine_label()
        safe = "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_"})
        return safe[:120] or self.default_machine_label()
