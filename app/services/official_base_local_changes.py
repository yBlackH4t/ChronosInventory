"""
O que existe so neste computador e sumiria ao baixar a base oficial.

"Baixar a base" troca o banco inteiro pelo da maquina principal. Antes disso comparamos o banco
desta maquina com o que chegou: movimentacoes e produtos que so existem aqui seriam perdidos.
A comparacao e pelo conteudo (data, tipo, produto, quantidade, locais), e nao pelo id: a principal
continua lancando e os ids das duas maquinas se repetem.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Set, Tuple

from core.exceptions import ValidationException

MAX_EXAMPLES = 8

_MOVEMENT_KEY_SQL = """
    SELECT m.id, m.data_hora, m.tipo, m.produto_id, m.quantidade,
           m.origem_local_id, m.destino_local_id, COALESCE(p.nome, '')
    FROM movimentacoes m
    LEFT JOIN produtos p ON p.id = m.produto_id
"""


class LocalChangesWouldBeLostException(ValidationException):
    """Baixar a base apagaria lancamentos feitos so neste computador."""

    def __init__(self, summary: Dict[str, Any]):
        movements = int(summary.get("movimentacoes") or 0)
        products = int(summary.get("produtos") or 0)
        parts = []
        if movements:
            parts.append(f"{movements} movimentação(ões)")
        if products:
            parts.append(f"{products} produto(s) cadastrado(s)")
        super().__init__(
            "Este computador tem "
            + " e ".join(parts)
            + " que a máquina principal não tem. Baixar a base agora apaga esses lançamentos daqui."
        )
        self.summary = summary


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return row is not None


def _movement_keys(conn: sqlite3.Connection) -> Tuple[Set[tuple], List[tuple]]:
    if not _table_exists(conn, "movimentacoes"):
        return set(), []
    rows = conn.execute(_MOVEMENT_KEY_SQL).fetchall()
    return {tuple(row[1:7]) for row in rows}, rows


def _product_ids(conn: sqlite3.Connection) -> Dict[int, str]:
    if not _table_exists(conn, "produtos"):
        return {}
    return {int(row[0]): str(row[1] or "") for row in conn.execute("SELECT id, nome FROM produtos")}


def find_local_only_changes(local_db: str, incoming_db: str) -> Dict[str, Any]:
    """Movimentacoes e produtos do banco local que nao existem no banco que vai entrar."""
    local = sqlite3.connect(f"file:{local_db}?mode=ro", uri=True, timeout=10)
    incoming = sqlite3.connect(f"file:{incoming_db}?mode=ro", uri=True, timeout=10)
    try:
        incoming_keys, _ = _movement_keys(incoming)
        _, local_rows = _movement_keys(local)
        only_here = [row for row in local_rows if tuple(row[1:7]) not in incoming_keys]

        incoming_products = _product_ids(incoming)
        local_products = _product_ids(local)
        new_products = [(pid, nome) for pid, nome in local_products.items() if pid not in incoming_products]
    finally:
        local.close()
        incoming.close()

    only_here.sort(key=lambda row: str(row[1] or ""), reverse=True)
    examples = [
        {
            "data_hora": str(row[1] or ""),
            "tipo": str(row[2] or ""),
            "produto_id": int(row[3]),
            "produto_nome": str(row[7] or ""),
            "quantidade": int(row[4] or 0),
        }
        for row in only_here[:MAX_EXAMPLES]
    ]
    return {
        "movimentacoes": len(only_here),
        "produtos": len(new_products),
        "exemplos": examples,
        "produtos_exemplos": [{"id": pid, "nome": nome} for pid, nome in sorted(new_products)[:MAX_EXAMPLES]],
    }


def guard_local_changes(local_db: str, incoming_db: str, allow_loss: bool) -> Dict[str, Any]:
    """Para a troca do banco quando ha lancamentos so daqui, a menos que o usuario confirme."""
    summary = find_local_only_changes(local_db, incoming_db)
    if (summary["movimentacoes"] or summary["produtos"]) and not allow_loss:
        raise LocalChangesWouldBeLostException(summary)
    return summary
