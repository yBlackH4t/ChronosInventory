"""
Configuracao do assistente de IA (docs/PLANO_IA.md, Fase 2).

Fica num arquivo JSON na pasta raiz do app, fora do banco: assim a chave da API
nao vai para backups, diagnosticos nem para a base oficial publicada na rede.
A chave nunca e devolvida pela API nem escrita no log.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "medium"
VALID_EFFORTS = ("low", "medium", "high", "xhigh", "max")


class AssistantConfigStore:
    def __init__(self, config_path: Optional[str] = None) -> None:
        self.config_path = config_path or FileUtils.get_assistant_config_path()

    def load(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {}
        if os.path.isfile(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    data = loaded
            except (OSError, ValueError):
                data = {}
        effort = str(data.get("esforco") or DEFAULT_EFFORT).strip()
        return {
            "api_key": str(data.get("api_key") or "").strip(),
            "modelo": str(data.get("modelo") or DEFAULT_MODEL).strip() or DEFAULT_MODEL,
            "esforco": effort if effort in VALID_EFFORTS else DEFAULT_EFFORT,
        }

    def update(
        self,
        *,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None,
        esforco: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Atualiza so os campos enviados. api_key '' remove a chave salva."""
        current = self.load()
        if api_key is not None:
            current["api_key"] = api_key.strip()
        if modelo is not None:
            current["modelo"] = modelo.strip() or DEFAULT_MODEL
        if esforco is not None:
            if esforco not in VALID_EFFORTS:
                raise ValidationException(f"Esforço inválido. Use: {', '.join(VALID_EFFORTS)}.")
            current["esforco"] = esforco

        directory = os.path.dirname(self.config_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp_path = f"{self.config_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self.config_path)
        return current

    @staticmethod
    def masked_key(api_key: str) -> Optional[str]:
        """'sk-ant-api03-...wxyz' para mostrar na tela sem expor a chave."""
        if not api_key:
            return None
        return f"{api_key[:7]}...{api_key[-4:]}" if len(api_key) > 12 else "****"
