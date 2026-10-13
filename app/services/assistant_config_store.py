"""
Configuracao do assistente de IA (docs/PLANO_IA.md).

Fica num arquivo JSON na pasta raiz do app, fora do banco: assim as chaves de API
nao vao para backups, diagnosticos nem para a base oficial publicada na rede.
As chaves nunca sao devolvidas pela API nem escritas no log.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

# Provedores de IA. "openai" = API no formato do OpenAI (Groq, Gemini e Ollama usam).
# compacto: respostas das ferramentas menores, para caber em limites gratuitos apertados.
PROVIDERS: Dict[str, Dict[str, Any]] = {
    "groq": {
        "nome": "Groq (gratuito)",
        "tipo": "openai",
        "gratuito": True,
        "base_url": "https://api.groq.com/openai/v1",
        "modelo": "openai/gpt-oss-120b",
        "env": "GROQ_API_KEY",
        "precisa_chave": True,
        "compacto": True,
        "reasoning_effort": True,
    },
    "gemini": {
        "nome": "Google Gemini",
        "tipo": "openai",
        "gratuito": False,
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "modelo": "gemini-flash-latest",
        "env": "GEMINI_API_KEY",
        "precisa_chave": True,
        "compacto": False,
        "reasoning_effort": False,
    },
    "ollama": {
        "nome": "IA local (Ollama)",
        "tipo": "openai",
        "gratuito": True,
        "base_url": "http://localhost:11434/v1",
        "modelo": "qwen3:8b",
        "env": None,
        "precisa_chave": False,
        "compacto": True,
        "reasoning_effort": False,
    },
    "anthropic": {
        "nome": "Claude (pago)",
        "tipo": "anthropic",
        "gratuito": False,
        "base_url": None,
        "modelo": "claude-opus-5-5",
        "env": "ANTHROPIC_API_KEY",
        "precisa_chave": True,
        "compacto": False,
        "reasoning_effort": False,
    },
    "nenhum": {
        "nome": "Sem IA (só busca direta)",
        "tipo": "nenhum",
        "gratuito": True,
        "base_url": None,
        "modelo": None,
        "env": None,
        "precisa_chave": False,
        "compacto": False,
        "reasoning_effort": False,
    },
}

DEFAULT_PROVIDER = "groq"
DEFAULT_EFFORT = "low"
VALID_EFFORTS = ("low", "medium", "high", "xhigh", "max")


class AssistantConfigStore:
    def __init__(self, config_path: Optional[str] = None) -> None:
        self.config_path = config_path or FileUtils.get_assistant_config_path()

    def _read_raw(self) -> Dict[str, Any]:
        if not os.path.isfile(self.config_path):
            return {}
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
        except (OSError, ValueError):
            return {}
        return loaded if isinstance(loaded, dict) else {}

    def _write_raw(self, data: Dict[str, Any]) -> None:
        directory = os.path.dirname(self.config_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp_path = f"{self.config_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self.config_path)

    def load(self) -> Dict[str, Any]:
        data = self._read_raw()
        provider = str(data.get("provedor") or DEFAULT_PROVIDER)
        effort = str(data.get("esforco") or DEFAULT_EFFORT)
        keys = data.get("chaves") if isinstance(data.get("chaves"), dict) else {}
        models = data.get("modelos") if isinstance(data.get("modelos"), dict) else {}
        return {
            "provedor": provider if provider in PROVIDERS else DEFAULT_PROVIDER,
            "esforco": effort if effort in VALID_EFFORTS else DEFAULT_EFFORT,
            "chaves": {p: str(keys.get(p) or "").strip() for p in PROVIDERS if keys.get(p)},
            "modelos": {p: str(models.get(p) or "").strip() for p in PROVIDERS if models.get(p)},
        }

    def update(
        self,
        *,
        provedor: Optional[str] = None,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None,
        esforco: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Atualiza so os campos enviados. `api_key` e `modelo` valem para o provedor
        enviado (ou o atual). api_key '' remove a chave; modelo '' volta ao padrao.
        """
        current = self.load()
        if provedor is not None:
            if provedor not in PROVIDERS:
                raise ValidationException(f"Provedor inválido. Use: {', '.join(PROVIDERS)}.")
            current["provedor"] = provedor
        target = current["provedor"]
        if api_key is not None:
            current["chaves"][target] = api_key.strip()
        if modelo is not None:
            current["modelos"][target] = modelo.strip()
        if esforco is not None:
            if esforco not in VALID_EFFORTS:
                raise ValidationException(f"Esforço inválido. Use: {', '.join(VALID_EFFORTS)}.")
            current["esforco"] = esforco
        current["chaves"] = {p: k for p, k in current["chaves"].items() if k}
        current["modelos"] = {p: m for p, m in current["modelos"].items() if m}

        raw = self._read_raw()  # preserva o resto do arquivo (ex.: senha de admin)
        raw.update(current)
        self._write_raw(raw)
        return current

    def load_section(self, name: str) -> Dict[str, Any]:
        """Outra parte do arquivo (ex.: "admin", "whatsapp"), sem mexer no resto."""
        section = self._read_raw().get(name)
        return section if isinstance(section, dict) else {}

    def save_section(self, name: str, data: Dict[str, Any]) -> None:
        raw = self._read_raw()
        raw[name] = data
        self._write_raw(raw)

    def load_admin(self) -> Dict[str, Any]:
        """Hash da senha de admin (nunca a senha)."""
        return self.load_section("admin")

    def save_admin(self, admin: Dict[str, Any]) -> None:
        self.save_section("admin", admin)

    @staticmethod
    def model_for(config: Dict[str, Any], provider: str) -> Optional[str]:
        return config["modelos"].get(provider) or PROVIDERS[provider]["modelo"]

    @staticmethod
    def key_for(config: Dict[str, Any], provider: str) -> tuple[str, Optional[str]]:
        """(chave, origem): a salva nas Configuracoes; sem ela, a variavel de ambiente do provedor."""
        saved = config["chaves"].get(provider, "")
        if saved:
            return saved, "configuracoes"
        env_name = PROVIDERS[provider]["env"]
        from_env = os.getenv(env_name, "").strip() if env_name else ""
        return (from_env, "ambiente") if from_env else ("", None)

    @staticmethod
    def masked_key(api_key: str) -> Optional[str]:
        """'gsk_abc...wxyz' para mostrar na tela sem expor a chave."""
        if not api_key:
            return None
        return f"{api_key[:7]}...{api_key[-4:]}" if len(api_key) > 12 else "****"
