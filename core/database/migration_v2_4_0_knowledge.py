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
    # Ficha propria (2.4.1): aplicacoes e codigos que a empresa cadastra para uma turbina que o
    # catalogo Master Power nao tem. Fica fora das tabelas catalogo_* (que o pacote do catalogo
    # substitui) e e copiada para elas por core/catalog/own_fichas.py.
    """
    CREATE TABLE IF NOT EXISTS fichas_proprias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        codigo_norm TEXT NOT NULL UNIQUE,
        marca TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'TURBO',
        modelo TEXT,
        observacao TEXT,
        aplicacoes_json TEXT NOT NULL DEFAULT '[]',
        codigos_json TEXT NOT NULL DEFAULT '[]',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # "Não se aplica" (2.4.6): aplicacao do catalogo que o especialista marcou como errada. Fica
    # pelo conteudo (ficha + veiculo + motor + complemento), nao pelo id: vale depois de atualizar
    # o catalogo. Ver core/catalog/hidden_applications.py.
    """
    CREATE TABLE IF NOT EXISTS aplicacoes_ocultas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL UNIQUE,
        ficha TEXT NOT NULL,
        montadora TEXT,
        veiculo TEXT NOT NULL,
        motor TEXT,
        complemento TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Cadastro da empresa (2.7.0): turbos e conjuntos do arquivo de produtos da loja que o
    # catalogo Master Power nao tem, com as aplicacoes. Copiado para catalogo_* por
    # core/catalog/company_register.py.
    """
    CREATE TABLE IF NOT EXISTS cadastro_fichas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        codigo_norm TEXT NOT NULL UNIQUE,
        marca TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'TURBO',
        modelo TEXT,
        descricao TEXT,
        observacao TEXT,
        aplicacoes_json TEXT NOT NULL DEFAULT '[]',
        codigos_json TEXT NOT NULL DEFAULT '[]',
        materiais TEXT,
        importado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Relacoes escritas nas observacoes do cadastro da empresa (2.7.18): faz par (biturbo),
    # conjunto central do turbo, turbo do conjunto, substitui, igual e similar. Origem = o codigo
    # do item do arquivo; numero = o outro codigo. Ver core/catalog/company_register.py.
    """
    CREATE TABLE IF NOT EXISTS cadastro_relacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origem TEXT NOT NULL,
        origem_norm TEXT NOT NULL,
        tipo TEXT NOT NULL,
        numero TEXT NOT NULL,
        numero_norm TEXT NOT NULL,
        observacao TEXT,
        material INTEGER
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cadastro_relacoes_origem ON cadastro_relacoes(origem_norm)",
    "CREATE INDEX IF NOT EXISTS idx_cadastro_relacoes_numero ON cadastro_relacoes(numero_norm)",
)


def ensure_knowledge_schema(conn: sqlite3.Connection) -> None:
    for statement in KNOWLEDGE_SCHEMA_SQL:
        conn.execute(statement)
