"""
Configuracao da base oficial compartilhada.
Responsabilidade: carregar, normalizar e salvar o estado local da feature.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, Set

from core.exceptions import ValidationException
from core.utils.validators import Validators


class OfficialBaseConfigStore:
    def __init__(
        self,
        *,
        config_path: str,
        local_share_service: Any,
        config_version: int,
        allowed_roles: Set[str],
        server_default_port: int,
    ) -> None:
        self.config_path = config_path
        self.local_share_service = local_share_service
        self.config_version = config_version
        self.allowed_roles = allowed_roles
        self.server_default_port = server_default_port

    def load(self) -> Dict[str, Any]:
        default = {
            "version": self.config_version,
            "role": "consumer",
            "official_base_dir": "",
            "machine_label": self.default_machine_label(),
            "publisher_name": "",
            "server_port": self.server_default_port,
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
            "version": int(data.get("version") or self.config_version),
            "role": self.normalize_role(str(data.get("role") or default["role"])),
            "official_base_dir": self.normalize_optional_text(data.get("official_base_dir"), 1024) or "",
            "machine_label": self.normalize_machine_label(data.get("machine_label")),
            "publisher_name": self.normalize_optional_text(data.get("publisher_name"), 120) or "",
            "server_port": self.local_share_service.normalize_port(data.get("server_port") or default["server_port"]),
            "remote_server_url": self.normalize_remote_server_url(data.get("remote_server_url")) or "",
            "server_enabled": bool(data.get("server_enabled", default["server_enabled"])),
        }

    def save(
        self,
        *,
        role: str,
        official_base_dir: Optional[str],
        machine_label: Optional[str],
        publisher_name: Optional[str],
        server_port: Optional[int],
        remote_server_url: Optional[str],
        server_enabled: Optional[bool],
    ) -> Dict[str, Any]:
        current = self.load()
        payload = {
            "version": self.config_version,
            "role": self.normalize_role(role),
            "official_base_dir": self.normalize_optional_text(official_base_dir, 1024) or "",
            "machine_label": self.normalize_machine_label(machine_label),
            "publisher_name": self.normalize_optional_text(publisher_name, 120) or "",
            "server_port": self.local_share_service.normalize_port(server_port or current["server_port"]),
            "remote_server_url": self.normalize_remote_server_url(remote_server_url) or "",
            "server_enabled": current["server_enabled"] if server_enabled is None else bool(server_enabled),
        }

        Path(self.config_path).parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return payload

    def default_machine_label(self) -> str:
        candidate = os.getenv("COMPUTERNAME") or os.getenv("HOSTNAME") or "maquina-local"
        return str(candidate).strip()[:120]

    def normalize_role(self, role: str) -> str:
        value = str(role or "").strip().lower()
        if value not in self.allowed_roles:
            raise ValidationException("Papel invalido. Use 'publisher' ou 'consumer'.")
        return value

    def normalize_machine_label(self, machine_label: Optional[str]) -> str:
        return self.normalize_optional_text(machine_label, 120) or self.default_machine_label()

    def normalize_optional_text(self, value: Optional[str], max_length: int) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        Validators.validate_string_length(text, max_length, "Valor")
        return text

    def normalize_remote_server_url(self, value: Optional[str]) -> Optional[str]:
        text = self.normalize_optional_text(value, 500)
        if not text:
            return None
        return self.local_share_service.normalize_server_url(text)

    def latest_paths(self, base_dir: Optional[str], latest_dirname: str, zip_filename: str, manifest_filename: str) -> Dict[str, str]:
        normalized = str(base_dir or "").strip()
        if not normalized:
            return {"zip": "", "manifest": ""}

        latest_dir = os.path.join(normalized, latest_dirname)
        latest_zip = os.path.join(latest_dir, zip_filename)
        latest_manifest = os.path.join(latest_dir, manifest_filename)
        root_zip = os.path.join(normalized, zip_filename)
        root_manifest = os.path.join(normalized, manifest_filename)

        if os.path.isfile(root_zip) and os.path.isfile(root_manifest) and not os.path.isfile(latest_manifest):
            return {"zip": root_zip, "manifest": root_manifest}

        return {"zip": latest_zip, "manifest": latest_manifest}
