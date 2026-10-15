"""
"Não se aplica": aplicacao do catalogo Master Power que o especialista sabe que esta errada
(ex.: a ficha da HX55W citando um veiculo em que ela nao vai).

A marca fica pelo conteudo da linha (ficha + montadora + veiculo + motor + complemento,
normalizados), nao pelo id: continua valendo depois de "Atualizar catalogo" ou de uma versao
nova do app. A busca por veiculo do assistente nao usa a linha escondida, e a aba Catalogo do
produto mostra a linha riscada, com "Desfazer". Viaja para as outras maquinas junto com o
conhecimento do assistente.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Set

from core.catalog.normalization import canonical_code, search_words
from core.exceptions import ValidationException

FIELDS = ("montadora", "veiculo", "motor", "complemento")
MAX_FIELD = 200
MAX_ITEMS = 20000


def _norm(value: Any) -> str:
    return " ".join(search_words(str(value or "")))


def application_key(ficha: Any, app: Dict[str, Any]) -> str:
    return "|".join([canonical_code(str(ficha or ""))] + [_norm(app.get(f)) for f in FIELDS])


def normalize(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValidationException("Aplicação inválida.")
    ficha = " ".join(str(data.get("ficha") or "").split())[:60]
    if not canonical_code(ficha):
        raise ValidationException("Informe a ficha do catálogo.")
    item = {"ficha": ficha}
    for field in FIELDS:
        item[field] = " ".join(str(data.get(field) or "").split())[:MAX_FIELD] or None
    if not item["veiculo"]:
        raise ValidationException("Informe o veículo da aplicação.")
    item["chave"] = application_key(ficha, item)
    return item


def hidden_keys(conn: sqlite3.Connection) -> Set[str]:
    try:
        return {row[0] for row in conn.execute("SELECT chave FROM aplicacoes_ocultas")}
    except sqlite3.OperationalError:  # tabela ainda nao criada
        return set()


def hide(conn: sqlite3.Connection, data: Any) -> Dict[str, Any]:
    item = normalize(data)
    conn.execute(
        """
        INSERT OR IGNORE INTO aplicacoes_ocultas (chave, ficha, montadora, veiculo, motor, complemento)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (item["chave"], item["ficha"], item["montadora"], item["veiculo"], item["motor"], item["complemento"]),
    )
    return item


def unhide(conn: sqlite3.Connection, data: Any) -> bool:
    item = normalize(data)
    return conn.execute("DELETE FROM aplicacoes_ocultas WHERE chave = ?", (item["chave"],)).rowcount > 0


def export(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    try:
        rows = conn.execute(
            "SELECT ficha, montadora, veiculo, motor, complemento FROM aplicacoes_ocultas ORDER BY chave"
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [dict(zip(("ficha", *FIELDS), row)) for row in rows]


def items_hash(items: Iterable[Dict[str, Any]]) -> str:
    keys = sorted(application_key(i.get("ficha"), i) for i in items)
    return hashlib.sha256(json.dumps(keys, ensure_ascii=False).encode("utf-8")).hexdigest()


def replace_all(conn: sqlite3.Connection, items: List[Dict[str, Any]]) -> None:
    """Troca as marcas desta maquina pelas publicadas. Nao faz commit."""
    if len(items) > MAX_ITEMS:
        raise ValidationException("Aplicações escondidas demais no arquivo publicado.")
    conn.execute("DELETE FROM aplicacoes_ocultas")
    for item in items:
        hide(conn, item)


def filter_rows(rows: List[Dict[str, Any]], keys: Set[str], ficha_field: str = "ficha_norm") -> List[Dict[str, Any]]:
    """Tira as linhas escondidas de uma lista de aplicacoes (cada uma com a ficha em `ficha_field`)."""
    if not keys:
        return rows
    return [r for r in rows if application_key(r.get(ficha_field), r) not in keys]


def is_hidden(keys: Set[str], ficha: Optional[str], app: Dict[str, Any]) -> bool:
    return bool(keys) and application_key(ficha, app) in keys
