"""
Leitura da foto da plaqueta da turbina para o assistente (docs/PLANO_IA.md, Fase 4).

O chefe manda a foto da plaqueta; um modelo que le imagem transcreve os codigos de peca e a
pergunta segue como se ele tivesse digitado o codigo ("a IA entende, o sistema responde").
Usa o Groq, no mesmo plano gratuito e com a mesma chave do assistente (como o audio).
"""

from __future__ import annotations

import base64
import io
import logging
import re
from typing import Any, Callable, List, Optional

import requests

from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import AssistantConfigStore
from core.catalog.normalization import extract_codes_from_name

LOG = logging.getLogger(__name__)

VISION_URL = "https://api.groq.com/openai/v1/chat/completions"
# Modelo do Groq que le imagem (2026-10: os Llama 4 com visao sairam da lista; o Qwen le bem).
VISION_MODEL = "qwen/qwen3.8-27b"
TIMEOUT_SECONDS = 60
MAX_IMAGE_BYTES = 15 * 1024 * 1024
# Foto grande e reduzida antes de enviar (menos tokens e dentro do limite de 4 MB em base64).
MAX_SIDE = 1600
SHRINK_ABOVE_BYTES = 1_500_000

PROMPT = (
    "Esta é a foto da plaqueta (etiqueta) de uma turbina ou de um conjunto central "
    "(Garrett, Holset, BorgWarner/KKK). Transcreva exatamente como estão escritos os códigos "
    "de peça: part number, P/N, Assembly No., Turbo No., Ref., código OEM. Não transcreva "
    "número de série (S/N, Serial), datas nem textos. Responda só os códigos, um por linha. "
    "Se não conseguir ler nenhum código, responda NADA."
)
_THINK = re.compile(r"<think>.*?</think>", re.S | re.I)


def _shrink(image: bytes) -> tuple[bytes, str]:
    """Reduz a foto (lado maior ate 1600 px, JPEG) quando ela e grande; sem Pillow, manda como veio."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(image)) as img:
            if len(image) <= SHRINK_ABOVE_BYTES and max(img.size) <= MAX_SIDE:
                return image, Image.MIME.get(img.format or "", "image/jpeg")
            img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=85)
            return out.getvalue(), "image/jpeg"
    except Exception:
        return image, "image/jpeg"


def parse_codes(content: str) -> List[str]:
    """Linhas da resposta que tem codigo de peca (o modelo as vezes conversa ou pensa em voz alta)."""
    text = _THINK.sub("", content or "")
    lines = []
    for raw in text.splitlines():
        line = raw.strip(" -•*\t`'\"")
        if line and extract_codes_from_name(line, expand_family=False):
            lines.append(line)
    return list(dict.fromkeys(lines))


class AssistantVisionService:
    def __init__(
        self,
        config_store: Optional[AssistantConfigStore] = None,
        http_post: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.config_store = config_store or AssistantConfigStore()
        self.http_post = http_post or requests.post

    def read_codes(self, image: bytes) -> List[str]:
        """Codigos de peca lidos na foto (como estao escritos). Erro com explicacao se nao ler."""
        if not image:
            raise AssistantUnavailableError("Foto vazia.")
        if len(image) > MAX_IMAGE_BYTES:
            raise AssistantUnavailableError("Foto grande demais (limite de 15 MB).")
        api_key, _ = AssistantConfigStore.key_for(self.config_store.load(), "groq")
        if not api_key:
            raise AssistantUnavailableError("Sem chave do Groq para ler a foto.")
        data, mime = _shrink(image)
        body = {
            "model": VISION_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}},
                    ],
                }
            ],
            "temperature": 0,
            "max_tokens": 300,
        }
        try:
            response = self.http_post(
                VISION_URL, headers={"Authorization": f"Bearer {api_key}"}, json=body, timeout=TIMEOUT_SECONDS
            )
        except requests.RequestException as exc:
            raise AssistantUnavailableError("Sem conexão para ler a foto.") from exc
        if response.status_code == 429:
            raise AssistantUnavailableError("Limite gratuito do Groq atingido; tente a foto de novo daqui a pouco.")
        if response.status_code != 200:
            LOG.warning("foto: status=%s", response.status_code)
            raise AssistantUnavailableError(f"A leitura da foto falhou (erro {response.status_code}).")
        try:
            content = str(response.json()["choices"][0]["message"].get("content") or "")
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AssistantUnavailableError("Resposta inválida da leitura da foto.") from exc
        codes = parse_codes(content)
        if not codes:
            raise AssistantUnavailableError(
                "Não consegui ler o código na foto. Tente outra foto, mais perto e sem reflexo, ou mande o código."
            )
        return codes

    def read_as_question(self, image: bytes) -> str:
        """Texto que entra na pergunta, como se a pessoa tivesse digitado os codigos."""
        return "Foto da plaqueta: " + ", ".join(self.read_codes(image))
