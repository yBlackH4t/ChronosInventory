"""
Transcricao de audio (mensagens de voz do WhatsApp) para o assistente.

Usa o Whisper do Groq, no mesmo plano gratuito e com a mesma chave do assistente
(docs/PLANO_IA.md, Fase 3). O audio do WhatsApp (.ogg) vai direto, sem converter.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

import requests

from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import AssistantConfigStore

LOG = logging.getLogger(__name__)

TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"
TIMEOUT_SECONDS = 60
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # limite do plano gratuito


class AssistantTranscriptionService:
    def __init__(
        self,
        config_store: Optional[AssistantConfigStore] = None,
        http_post: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.config_store = config_store or AssistantConfigStore()
        self.http_post = http_post or requests.post

    def transcribe(self, audio: bytes, filename: str = "audio.ogg", mime: str = "audio/ogg") -> str:
        if not audio:
            raise AssistantUnavailableError("Áudio vazio.")
        if len(audio) > MAX_AUDIO_BYTES:
            raise AssistantUnavailableError("Áudio grande demais para transcrever (limite de 25 MB).")
        api_key, _ = AssistantConfigStore.key_for(self.config_store.load(), "groq")
        if not api_key:
            raise AssistantUnavailableError("Sem chave do Groq para transcrever o áudio.")
        try:
            response = self.http_post(
                TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (filename, audio, mime)},
                data={"model": TRANSCRIPTION_MODEL, "language": "pt", "response_format": "json"},
                timeout=TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise AssistantUnavailableError("Sem conexão para transcrever o áudio.") from exc
        if response.status_code != 200:
            LOG.warning("transcricao: status=%s", response.status_code)
            raise AssistantUnavailableError(f"A transcrição do áudio falhou (erro {response.status_code}).")
        try:
            text = str(response.json().get("text") or "").strip()
        except ValueError as exc:
            raise AssistantUnavailableError("Resposta inválida da transcrição.") from exc
        if not text:
            raise AssistantUnavailableError("Não entendi nada no áudio.")
        return text
