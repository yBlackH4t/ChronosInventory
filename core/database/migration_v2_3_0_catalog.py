"""
Migration v2.3.0: catalogo de referencias externas (Master Power e futuros).

Cria tabelas separadas de `produtos` para que itens de catalogo (sem estoque)
nao contaminem estoque, relatorios e inventarios. A ligacao com nossos
produtos e feita por `produto_catalogo_vinculo`.

Todas as instrucoes sao idempotentes (IF NOT EXISTS), entao a funcao pode ser
chamada tanto pelo MigrationManager quanto na inicializacao do banco.
"""

from __future__ import annotations

import sqlite3

CATALOG_SCHEMA_SQL = (
    """
    CREATE TABLE IF NOT EXISTS catalogo_fontes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        versao TEXT,
        data_emissao TEXT,
        arquivo_origem TEXT,
        importado_em DATETIME
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS catalogo_produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fonte_id INTEGER NOT NULL REFERENCES catalogo_fontes(id) ON DELETE CASCADE,
        codigo TEXT NOT NULL,
        codigo_norm TEXT NOT NULL,
        codigo_origem INTEGER,
        descricao TEXT NOT NULL,
        grupo TEXT,
        modelo TEXT,
        especificacoes TEXT,
        observacao TEXT,
        foto_arquivo TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fonte_id, codigo)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS catalogo_referencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_produto_id INTEGER NOT NULL REFERENCES catalogo_produtos(id) ON DELETE CASCADE,
        fabricante TEXT NOT NULL,
        numero TEXT NOT NULL,
        numero_norm TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS catalogo_aplicacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_produto_id INTEGER NOT NULL REFERENCES catalogo_produtos(id) ON DELETE CASCADE,
        montadora TEXT,
        veiculo TEXT NOT NULL,
        motor TEXT,
        tipo TEXT,
        complemento TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS catalogo_relacionados (
        catalogo_produto_id INTEGER NOT NULL REFERENCES catalogo_produtos(id) ON DELETE CASCADE,
        relacionado_id INTEGER NOT NULL REFERENCES catalogo_produtos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        PRIMARY KEY (catalogo_produto_id, relacionado_id, tipo)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS produto_codigos (
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        numero_norm TEXT NOT NULL,
        origem TEXT NOT NULL DEFAULT 'NOME',
        PRIMARY KEY (produto_id, numero_norm)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS produto_catalogo_vinculo (
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        catalogo_produto_id INTEGER NOT NULL REFERENCES catalogo_produtos(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'AUTO',
        codigos_em_comum TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (produto_id, catalogo_produto_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_codigo_norm ON catalogo_produtos(codigo_norm)",
    "CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_fonte ON catalogo_produtos(fonte_id)",
    "CREATE INDEX IF NOT EXISTS idx_catalogo_ref_norm ON catalogo_referencias(numero_norm)",
    "CREATE INDEX IF NOT EXISTS idx_catalogo_ref_produto ON catalogo_referencias(catalogo_produto_id)",
    "CREATE INDEX IF NOT EXISTS idx_catalogo_apl_produto ON catalogo_aplicacoes(catalogo_produto_id)",
    "CREATE INDEX IF NOT EXISTS idx_produto_codigos_norm ON produto_codigos(numero_norm)",
    "CREATE INDEX IF NOT EXISTS idx_vinculo_catalogo ON produto_catalogo_vinculo(catalogo_produto_id)",
    "CREATE INDEX IF NOT EXISTS idx_vinculo_status ON produto_catalogo_vinculo(status)",
)


def ensure_catalog_schema(conn: sqlite3.Connection) -> None:
    """Cria (se necessario) todas as tabelas/indices do catalogo."""
    for statement in CATALOG_SCHEMA_SQL:
        conn.execute(statement)


def rebuild_product_codes(conn: sqlite3.Connection) -> int:
    """Recalcula `produto_codigos` a partir do nome de todos os produtos."""
    from core.catalog.normalization import extract_codes_from_name

    conn.execute("DELETE FROM produto_codigos WHERE origem = 'NOME'")
    rows = conn.execute("SELECT id, nome FROM produtos").fetchall()
    payload = []
    for row in rows:
        for code in extract_codes_from_name(row[1]):
            payload.append((row[0], code))
    conn.executemany(
        "INSERT OR IGNORE INTO produto_codigos (produto_id, numero_norm, origem) VALUES (?, ?, 'NOME')",
        payload,
    )
    return len(payload)


def migrate_to_v2_3_0(conn: sqlite3.Connection) -> None:
    ensure_catalog_schema(conn)
    rebuild_product_codes(conn)
