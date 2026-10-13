"""
Migration v2.4.0: base de conhecimento do especialista (assistente de IA).

O admin ensina relacoes entre codigos de peca que o catalogo nao conhece
(ex.: BorgWarner 5327-988-7101 e similar a 5327-988-7210). A busca do assistente
usa essas relacoes. Cada par fica guardado uma vez, com codigo_a_norm < codigo_b_norm.

Tipos:
- IGUAL: mesma peca, troca direta (transitivo: A = B e B = C -> A = C).
- SIMILAR: serve com ressalva, descrita na observacao.
- DIFERENTE: o especialista disse que nao serve (sugestao recusada; tambem esconde
  um equivalente que o catalogo apontaria).

Instrucoes idempotentes (IF NOT EXISTS): chamadas na inicializacao do banco.
"""

from __future__ import annotations

import sqlite3

KNOWLEDGE_SCHEMA_SQL = (
    """
    CREATE TABLE IF NOT EXISTS conhecimento_equivalencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_a TEXT NOT NULL,
        codigo_a_norm TEXT NOT NULL,
        codigo_b TEXT NOT NULL,
        codigo_b_norm TEXT NOT NULL,
        tipo TEXT NOT NULL,
        observacao TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (codigo_a_norm, codigo_b_norm)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_conhecimento_a ON conhecimento_equivalencias(codigo_a_norm)",
    "CREATE INDEX IF NOT EXISTS idx_conhecimento_b ON conhecimento_equivalencias(codigo_b_norm)",
)


def ensure_knowledge_schema(conn: sqlite3.Connection) -> None:
    for statement in KNOWLEDGE_SCHEMA_SQL:
        conn.execute(statement)
