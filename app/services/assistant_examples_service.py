from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from typing import Any

from core.catalog.normalization import search_words
from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

MAX_EXAMPLES = 500


def examples_hash(items: list[dict[str, str]]) -> str:
    return hashlib.sha256(json.dumps(items, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def validate_examples(items: Any) -> list[dict[str, str]]:
    if not isinstance(items, list) or len(items) > MAX_EXAMPLES:
        raise ValidationException("Lista de exemplos inválida (máximo 500).")
    result = []
    seen = set()
    for item in items:
        if not isinstance(item, dict) or set(item) != {"pergunta", "consulta"}:
            raise ValidationException("Cada exemplo precisa de pergunta e consulta, nunca saldo/resposta.")
        if any(not isinstance(item[key], str) or not item[key].strip() or len(item[key]) > 1000 for key in item):
            raise ValidationException("Exemplo vazio ou muito grande (máximo 1000 caracteres por campo).")
        key = " ".join(search_words(item["pergunta"]))
        if not key or key in seen:
            raise ValidationException("Pergunta repetida nos exemplos.")
        seen.add(key)
        result.append({field: item[field].strip() for field in ("pergunta", "consulta")})
    return result


class AssistantExamplesService:
    _lock = threading.RLock()

    def __init__(self, path: str | None = None) -> None:
        self.path = path or os.path.join(FileUtils.get_app_directory(), "assistente_exemplos.json")

    def list(self) -> list[dict[str, str]]:
        with self._lock:
            try:
                with open(self.path, encoding="utf-8") as source:
                    return validate_examples(json.load(source)["exemplos"])
            except FileNotFoundError:
                return []

    def replace(self, items: Any) -> list[dict[str, str]]:
        values = validate_examples(items)
        with self._lock:
            folder = os.path.dirname(os.path.abspath(self.path))
            os.makedirs(folder, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(dir=folder, suffix=".tmp")
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
                    json.dump({"formato": 1, "exemplos": values}, destination, ensure_ascii=False, indent=2)
                os.replace(temporary, self.path)
            finally:
                if os.path.exists(temporary):
                    os.remove(temporary)
        return values

    def resolve(self, question: str) -> str | None:
        key = " ".join(search_words(question))
        return next((item["consulta"] for item in self.list() if " ".join(search_words(item["pergunta"])) == key), None)

    def relevant(self, question: str) -> list[dict[str, str]]:
        words = set(search_words(question))
        scored = [(len(words & set(search_words(item["pergunta"]))), item) for item in self.list()]
        return [item for score, item in sorted(scored, key=lambda pair: pair[0], reverse=True)[:4] if score]
