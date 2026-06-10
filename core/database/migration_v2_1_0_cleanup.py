"""
Migração v2.1.0: Limpeza e Consolidação de Locais
Objetivo: Usar as tabelas originais do usuário ('locais' e 'produto_estoque')
e remover as redundantes ('inventory_locations', 'product_inventory').
"""

import logging
import sqlite3
from typing import Callable

logger = logging.getLogger(__name__)

def migrate_to_v2_1_0(conn: sqlite3.Connection) -> None:
    logger.info("[Migration v2.1.0] Step 1: Adicionando colunas de UI em locais...")
    
    # Adicionar colunas extras em locais, se não existirem
    columns = [row[1] for row in conn.execute("PRAGMA table_info(locais)").fetchall()]
    
    if "color" not in columns:
        conn.execute("ALTER TABLE locais ADD COLUMN color TEXT DEFAULT '#808080'")
    if "ordem" not in columns:
        conn.execute("ALTER TABLE locais ADD COLUMN ordem INTEGER DEFAULT 0")
    if "label" not in columns:
        conn.execute("ALTER TABLE locais ADD COLUMN label TEXT")
        conn.execute("UPDATE locais SET label = nome WHERE label IS NULL")
    
    # Atualizar Canoas e Passo Fundo com cores bonitas se existirem
    conn.execute("UPDATE locais SET color = '#1f538d', label = 'Canoas', ordem = 1 WHERE nome = 'Canoas'")
    conn.execute("UPDATE locais SET color = '#e74c3c', label = 'Passo Fundo', ordem = 2 WHERE nome = 'Passo Fundo'")
    
    logger.info("[Migration v2.1.0] Step 2: Ajustando tabela produto_estoque...")
    pe_columns = [row[1] for row in conn.execute("PRAGMA table_info(produto_estoque)").fetchall()]
    if "atualizado_em" not in pe_columns:
        conn.execute("ALTER TABLE produto_estoque ADD COLUMN atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP")

    logger.info("[Migration v2.1.0] Step 3: Renomeando colunas nas movimentacoes...")
    mov_columns = [row[1] for row in conn.execute("PRAGMA table_info(movimentacoes)").fetchall()]
    
    # No SQLite não tem RENAME COLUMN fácil para versões antigas, mas nas versões novas tem.
    # Vamos usar ALTER TABLE RENAME COLUMN
    try:
        if "origem_location_id" in mov_columns and "origem_local_id" not in mov_columns:
            conn.execute("ALTER TABLE movimentacoes RENAME COLUMN origem_location_id TO origem_local_id")
        if "destino_location_id" in mov_columns and "destino_local_id" not in mov_columns:
            conn.execute("ALTER TABLE movimentacoes RENAME COLUMN destino_location_id TO destino_local_id")
    except Exception as e:
        logger.warning(f"Aviso ao renomear colunas de movimentacoes: {e}")

    logger.info("[Migration v2.1.0] Step 4: Dropando tabelas antigas v2.0...")
    conn.execute("DROP TABLE IF EXISTS inventory_locations")
    conn.execute("DROP TABLE IF EXISTS product_inventory")
    
    logger.info("[Migration v2.1.0] ✅ Concluída.")

def create_rollback_migration() -> Callable[[sqlite3.Connection], None]:
    def rollback(conn: sqlite3.Connection) -> None:
        pass
    return rollback
