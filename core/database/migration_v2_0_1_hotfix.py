"""
Migração v2.0.1: Hotfix de Recuperação de Dados
Objetivo: Corrigir a migração v2.0.0 que extraiu dados para as tabelas em inglês 
('inventory_locations' e 'product_inventory') em vez de ('locais' e 'produto_estoque').
"""

import logging
import sqlite3
from typing import Callable

logger = logging.getLogger(__name__)


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    """Verifica se uma coluna existe em uma tabela."""
    try:
        cursor = conn.execute(f"PRAGMA table_info({table})")
        columns = {row[1] for row in cursor.fetchall()}
        return column in columns
    except Exception:
        return False

def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None


def migrate_to_v2_0_1_hotfix(conn: sqlite3.Connection) -> None:
    logger.info("[Hotfix v2.0.1] Iniciando resgate de dados...")

    # Garante que as tabelas de destino existam (caso não tenham sido criadas)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS locais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            ativo INTEGER NOT NULL DEFAULT 1,
            label TEXT,
            color TEXT DEFAULT '#808080',
            ordem INTEGER DEFAULT 0
        );
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS produto_estoque (
            produto_id INTEGER NOT NULL,
            local_id INTEGER NOT NULL,
            quantidade INTEGER NOT NULL DEFAULT 0,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (produto_id, local_id),
            FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
            FOREIGN KEY(local_id) REFERENCES locais(id) ON DELETE RESTRICT
        );
    """)

    # PASSO 1: Resgatar Locais
    if _table_exists(conn, "inventory_locations"):
        logger.info("  → Resgatando locais de inventory_locations...")
        conn.execute("""
            INSERT OR IGNORE INTO locais (id, nome, ativo, label, color, ordem)
            SELECT id, name, ativo, label, color, ordem
            FROM inventory_locations
        """)
    
    # Garantir que os locais essenciais existam
    conn.execute("INSERT OR IGNORE INTO locais (id, nome, label, color, ordem) VALUES (1, 'CANOAS', 'Canoas', '#1f538d', 1)")
    conn.execute("INSERT OR IGNORE INTO locais (id, nome, label, color, ordem) VALUES (2, 'PF', 'Passo Fundo', '#e74c3c', 2)")

    # PASSO 2: Resgatar Estoque (da tabela product_inventory v2.0.0)
    if _table_exists(conn, "product_inventory"):
        logger.info("  → Resgatando estoque de product_inventory...")
        conn.execute("""
            INSERT OR IGNORE INTO produto_estoque (produto_id, local_id, quantidade, atualizado_em)
            SELECT produto_id, inventory_location_id, quantidade, atualizado_em
            FROM product_inventory
        """)

    # PASSO 3: Resgatar Estoque Diretamente (Fallback) da tabela produtos v1.6.4
    if _column_exists(conn, "produtos", "qtd_canoas"):
        logger.info("  → Resgatando estoque diretamente de produtos.qtd_canoas...")
        conn.execute("""
            INSERT OR IGNORE INTO produto_estoque (produto_id, local_id, quantidade)
            SELECT id, 1, COALESCE(qtd_canoas, 0)
            FROM produtos
            WHERE COALESCE(qtd_canoas, 0) > 0 OR id IN (SELECT produto_id FROM produto_estoque)
        """)
    
    if _column_exists(conn, "produtos", "qtd_pf"):
        logger.info("  → Resgatando estoque diretamente de produtos.qtd_pf...")
        conn.execute("""
            INSERT OR IGNORE INTO produto_estoque (produto_id, local_id, quantidade)
            SELECT id, 2, COALESCE(qtd_pf, 0)
            FROM produtos
            WHERE COALESCE(qtd_pf, 0) > 0 OR id IN (SELECT produto_id FROM produto_estoque)
        """)

    # Preencher com zeros para manter a matriz
    conn.execute("""
        INSERT OR IGNORE INTO produto_estoque (produto_id, local_id, quantidade)
        SELECT p.id, l.id, 0
        FROM produtos p
        CROSS JOIN locais l
        WHERE NOT EXISTS (
            SELECT 1 FROM produto_estoque pe 
            WHERE pe.produto_id = p.id AND pe.local_id = l.id
        )
    """)

    # PASSO 4: Resgatar Tracking de Movimentações
    logger.info("  → Resgatando rastreabilidade de movimentacoes...")
    
    # Garantir colunas em movimentacoes
    if not _column_exists(conn, "movimentacoes", "origem_local_id"):
        conn.execute("ALTER TABLE movimentacoes ADD COLUMN origem_local_id INTEGER")
    if not _column_exists(conn, "movimentacoes", "destino_local_id"):
        conn.execute("ALTER TABLE movimentacoes ADD COLUMN destino_local_id INTEGER")

    # Migrar IDs que ficaram na coluna errada
    if _column_exists(conn, "movimentacoes", "origem_location_id"):
        conn.execute("""
            UPDATE movimentacoes 
            SET origem_local_id = origem_location_id 
            WHERE origem_local_id IS NULL AND origem_location_id IS NOT NULL
        """)
    if _column_exists(conn, "movimentacoes", "destino_location_id"):
        conn.execute("""
            UPDATE movimentacoes 
            SET destino_local_id = destino_location_id 
            WHERE destino_local_id IS NULL AND destino_location_id IS NOT NULL
        """)

    # Fallback: Migrar diretamente do texto antigo (origem/destino string)
    conn.execute("""
        UPDATE movimentacoes SET destino_local_id = 1 WHERE tipo = 'ENTRADA' AND destino = 'CANOAS' AND destino_local_id IS NULL
    """)
    conn.execute("""
        UPDATE movimentacoes SET destino_local_id = 2 WHERE tipo = 'ENTRADA' AND destino = 'PF' AND destino_local_id IS NULL
    """)

    conn.execute("""
        UPDATE movimentacoes SET origem_local_id = 1 WHERE tipo = 'SAIDA' AND origem = 'CANOAS' AND origem_local_id IS NULL
    """)
    conn.execute("""
        UPDATE movimentacoes SET origem_local_id = 2 WHERE tipo = 'SAIDA' AND origem = 'PF' AND origem_local_id IS NULL
    """)

    conn.execute("""
        UPDATE movimentacoes 
        SET 
            origem_local_id = CASE WHEN origem = 'CANOAS' THEN 1 WHEN origem = 'PF' THEN 2 ELSE NULL END,
            destino_local_id = CASE WHEN destino = 'CANOAS' THEN 1 WHEN destino = 'PF' THEN 2 ELSE NULL END
        WHERE tipo = 'TRANSFERENCIA' AND (origem_local_id IS NULL OR destino_local_id IS NULL)
    """)

    # PASSO 5: Limpar as tabelas redundantes
    logger.info("  → Limpando tabelas fantasmas de migração v2.0.0...")
    conn.execute("DROP TABLE IF EXISTS product_inventory")
    conn.execute("DROP TABLE IF EXISTS inventory_locations")

    logger.info("[Hotfix v2.0.1] ✅ Resgate concluído!")

