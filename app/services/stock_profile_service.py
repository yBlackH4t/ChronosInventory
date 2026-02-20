"""
Service for managing multiple stock profiles (multiple local databases).
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.constants import DB_NAME
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils


class StockProfileService:
    _default_profile_id = "default"
    _default_profile_name = "Principal"
    _registry_version = 1

    def __init__(self) -> None:
        self.app_root = FileUtils.get_app_root_directory()
        self.registry_path = FileUtils.get_profiles_registry_path()
        self.profiles_dir = FileUtils.get_profiles_directory()

    def list_profiles_state(self) -> Dict[str, object]:
        registry = self._load_registry()
        profiles_out = [self._to_profile_out(item, registry["active_profile_id"]) for item in registry["profiles"]]
        active_id = str(registry["active_profile_id"])
        active = next((item for item in profiles_out if item["id"] == active_id), None)
        active_name = str(active["name"]) if active else self._default_profile_name
        runtime_db_path = DatabaseConnection().get_database_path()
        active_profile_db_path = os.path.join(self._profile_dir(active_id), DB_NAME)
        return {
            "active_profile_id": active_id,
            "active_profile_name": active_name,
            "current_database_path": runtime_db_path,
            "restart_required": os.path.abspath(runtime_db_path) != os.path.abspath(active_profile_db_path),
            "root_directory": self.app_root,
            "profiles": profiles_out,
        }

    def create_profile(self, name: str, profile_id: Optional[str] = None) -> Dict[str, object]:
        normalized_name = str(name or "").strip()
        if len(normalized_name) < 2:
            raise ValidationException("Nome do estoque invalido. Use ao menos 2 caracteres.")

        registry = self._load_registry()
        final_id = self._normalize_profile_id(profile_id or normalized_name)
        if final_id == self._default_profile_id:
            raise ValidationException("ID reservado. Escolha outro identificador para o estoque.")
        if any(str(item.get("id")) == final_id for item in registry["profiles"]):
            raise ValidationException("Ja existe um estoque com esse identificador.")

        now = self._iso_now()
        profile_entry = {
            "id": final_id,
            "name": normalized_name,
            "created_at": now,
            "updated_at": now,
        }
        registry["profiles"].append(profile_entry)
        self._save_registry(registry)

        os.makedirs(self._profile_dir(final_id), exist_ok=True)
        return self._to_profile_out(profile_entry, str(registry["active_profile_id"]))

    def activate_profile(self, profile_id: str) -> Dict[str, object]:
        pid = self._normalize_profile_id(profile_id)
        registry = self._load_registry()
        exists = any(str(item.get("id")) == pid for item in registry["profiles"])
        if not exists:
            raise ValidationException("Estoque nao encontrado para ativacao.")

        current = str(registry["active_profile_id"])
        if current == pid:
            active = next((item for item in registry["profiles"] if str(item.get("id")) == pid), None)
            active_name = str(active.get("name")) if active else self._default_profile_name
            return {
                "active_profile_id": pid,
                "active_profile_name": active_name,
                "requires_restart": False,
                "message": "Este estoque ja esta ativo.",
            }

        registry["active_profile_id"] = pid
        now = self._iso_now()
        for item in registry["profiles"]:
            if str(item.get("id")) == pid:
                item["updated_at"] = now
        self._save_registry(registry)
        os.makedirs(self._profile_dir(pid), exist_ok=True)

        active = next((item for item in registry["profiles"] if str(item.get("id")) == pid), None)
        active_name = str(active.get("name")) if active else self._default_profile_name
        return {
            "active_profile_id": pid,
            "active_profile_name": active_name,
            "requires_restart": True,
            "message": "Estoque ativo alterado. Reinicie o app para aplicar a troca da base.",
        }

    def _load_registry(self) -> Dict[str, Any]:
        default_registry = {
            "version": self._registry_version,
            "active_profile_id": self._default_profile_id,
            "profiles": [
                {
                    "id": self._default_profile_id,
                    "name": self._default_profile_name,
                    "created_at": self._iso_now(),
                    "updated_at": self._iso_now(),
                }
            ],
        }

        if not os.path.isfile(self.registry_path):
            self._save_registry(default_registry)
            return default_registry

        try:
            with open(self.registry_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
        except Exception:
            self._save_registry(default_registry)
            return default_registry

        profiles = registry.get("profiles")
        if not isinstance(profiles, list):
            profiles = []

        normalized_profiles: List[Dict[str, Any]] = []
        for item in profiles:
            if not isinstance(item, dict):
                continue
            try:
                pid = self._normalize_profile_id(item.get("id"), allow_default=True)
            except ValidationException:
                continue
            if not pid:
                continue
            if any(existing["id"] == pid for existing in normalized_profiles):
                continue
            name = str(item.get("name") or "").strip() or ("Principal" if pid == self._default_profile_id else pid)
            normalized_profiles.append(
                {
                    "id": pid,
                    "name": name,
                    "created_at": str(item.get("created_at") or self._iso_now()),
                    "updated_at": str(item.get("updated_at") or self._iso_now()),
                }
            )

        if not any(item["id"] == self._default_profile_id for item in normalized_profiles):
            normalized_profiles.insert(
                0,
                {
                    "id": self._default_profile_id,
                    "name": self._default_profile_name,
                    "created_at": self._iso_now(),
                    "updated_at": self._iso_now(),
                },
            )

        try:
            active_id = self._normalize_profile_id(
                registry.get("active_profile_id") or self._default_profile_id,
                allow_default=True,
            )
        except ValidationException:
            active_id = self._default_profile_id
        if not any(item["id"] == active_id for item in normalized_profiles):
            active_id = self._default_profile_id

        normalized = {
            "version": int(registry.get("version") or self._registry_version),
            "active_profile_id": active_id,
            "profiles": normalized_profiles,
        }
        self._save_registry(normalized)
        return normalized

    def _save_registry(self, registry: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.registry_path), exist_ok=True)
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)

    def _to_profile_out(self, profile: Dict[str, Any], active_profile_id: str) -> Dict[str, object]:
        pid = str(profile.get("id"))
        profile_dir = self._profile_dir(pid)
        db_path = os.path.join(profile_dir, DB_NAME)
        return {
            "id": pid,
            "name": str(profile.get("name") or pid),
            "path": profile_dir,
            "db_exists": os.path.isfile(db_path),
            "created_at": str(profile.get("created_at") or ""),
            "updated_at": str(profile.get("updated_at") or ""),
            "is_active": pid == active_profile_id,
        }

    def _profile_dir(self, profile_id: str) -> str:
        if profile_id == self._default_profile_id:
            return self.app_root
        return os.path.join(self.profiles_dir, profile_id)

    def _normalize_profile_id(self, raw_value: object, allow_default: bool = False) -> str:
        value = str(raw_value or "").strip().lower()
        value = re.sub(r"[^a-z0-9_-]+", "-", value)
        value = re.sub(r"-{2,}", "-", value).strip("-_")
        if not value:
            raise ValidationException("ID do estoque invalido.")
        if len(value) > 40:
            value = value[:40]
        if value == self._default_profile_id and not allow_default:
            raise ValidationException("ID reservado.")
        return value

    def _iso_now(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
