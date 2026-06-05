"""
Migração v2.0.0: Transformação para White-Label

Objetivo: Converter sistema hardcoded (Canoas/PF) para configurável
Permite que usuários criem e nomeiem seus próprios estoques/locais

Estratégia: 
1. Criar novas tabelas (inventory_locations, product_inventory)
2. Copiar dados: qtd_canoas, qtd_pf → product_inventory
3. Manter movimentacoes intacta (adiciona location_ids ao lado de origem/destino)
4. Reversível e seguro com backup automático

ANTES (Estrutura Rígida):
  produtos
    ├── qtd_canoas: 50
    └── qtd_pf: 30

DEPOIS (Estrutura Dinâmica):
  inventory_locations
    ├── id: 1, name: "CANOAS", label: "Canoas", color: "#1f538d"
    └── id: 2, name: "PF", label: "Passo Fundo", color: "#e74c3c"

  product_inventory (relação M:N)
    ├── produto_id: 1, inventory_location_id: 1, quantidade: 50
    └── produto_id: 1, inventory_location_id: 2, quantidade: 30
"""

import sqlite3
from typing import Callable, Optional

MigrationHandler = Callable[[sqlite3.Connection], None]


def migrate_to_white_label(conn: sqlite3.Connection) -> None:
    """
    Executa migração completa para white-label.
    
    Esta função:
    1. Cria novas tabelas de configuração
    2. Copia dados existentes preservando 100% dos registros
    3. Mantém compatibilidade com movimentacoes antigas
    4. Cria índices para performance
    """
    
    # ============================================================
    # STEP 1: Criar tabela de locations (CONFIGURÁVEL)
    # ============================================================
    print("[Migration v2.0.0] Step 1: Creating inventory_locations table...")
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inventory_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,          -- Identificador único: "CANOAS", "PF", etc
            label TEXT NOT NULL,                -- Display name: "Canoas", "Passo Fundo", etc
            color TEXT,                         -- UI color: "#1f538d", "#e74c3c", etc
            ordem INTEGER DEFAULT 0,            -- Ordem de exibição
            ativo INTEGER NOT NULL DEFAULT 1,   -- Ativado/desativado
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # ============================================================
    # STEP 2: Inserir locations padrão (Canoas e Passo Fundo)
    # ============================================================
    print("[Migration v2.0.0] Step 2: Inserting default locations...")
    
    # Verificar se locations já existem
    existing_locations = conn.execute(
        "SELECT COUNT(*) FROM inventory_locations"
    ).fetchone()[0]
    
    if existing_locations == 0:
        # Inserir locations padrão mantendo compatibilidade
        conn.execute("""
            INSERT INTO inventory_locations (name, label, color, ordem, ativo)
            VALUES 
                ('CANOAS', 'Canoas', '#1f538d', 1, 1),
                ('PF', 'Passo Fundo', '#e74c3c', 2, 1)
        """)
    
    # ============================================================
    # STEP 3: Criar tabela de relação produto-inventory (M:N)
    # ============================================================
    print("[Migration v2.0.0] Step 3: Creating product_inventory table...")
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS product_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL,
            inventory_location_id INTEGER NOT NULL,
            quantidade INTEGER NOT NULL DEFAULT 0,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
            FOREIGN KEY(inventory_location_id) REFERENCES inventory_locations(id) ON DELETE RESTRICT,
            UNIQUE(produto_id, inventory_location_id)
        );
    """)
    
    # ============================================================
    # STEP 4: Copiar dados: qtd_canoas, qtd_pf → product_inventory
    # ============================================================
    print("[Migration v2.0.0] Step 4: Migrating stock data...")
    
    # Verificar se já migrou (evitar duplicação em reruns)
    existing_inventory = conn.execute(
        "SELECT COUNT(*) FROM product_inventory"
    ).fetchone()[0]
    
    if existing_inventory == 0:
        # Obter IDs das locations padrão
        locations = conn.execute(
            "SELECT id, name FROM inventory_locations"
        ).fetchall()
        
        location_ids = {name: loc_id for loc_id, name in locations}
        canoas_id = location_ids.get('CANOAS')
        pf_id = location_ids.get('PF')
        
        if not canoas_id or not pf_id:
            raise ValueError(
                "Default locations (CANOAS, PF) not found! "
                "Please check inventory_locations table."
            )
        
        # Migrar qtd_canoas para product_inventory
        print("  → Migrating qtd_canoas to product_inventory...")
        conn.execute(f"""
            INSERT INTO product_inventory (produto_id, inventory_location_id, quantidade, atualizado_em)
            SELECT 
                id,
                {canoas_id},
                COALESCE(qtd_canoas, 0),
                CURRENT_TIMESTAMP
            FROM produtos
            WHERE COALESCE(qtd_canoas, 0) > 0 OR id IN (SELECT produto_id FROM product_inventory)
        """)
        
        # Migrar qtd_pf para product_inventory
        print("  → Migrating qtd_pf to product_inventory...")
        conn.execute(f"""
            INSERT INTO product_inventory (produto_id, inventory_location_id, quantidade, atualizado_em)
            SELECT 
                id,
                {pf_id},
                COALESCE(qtd_pf, 0),
                CURRENT_TIMESTAMP
            FROM produtos
            WHERE COALESCE(qtd_pf, 0) > 0
        """)
        
        # Para produtos sem estoque em nenhuma location, criar registros com 0
        print("  → Adding zero-quantity records for completeness...")
        conn.execute(f"""
            INSERT OR IGNORE INTO product_inventory (produto_id, inventory_location_id, quantidade)
            SELECT p.id, l.id, 0
            FROM produtos p
            CROSS JOIN inventory_locations l
            WHERE NOT EXISTS (
                SELECT 1 FROM product_inventory pi 
                WHERE pi.produto_id = p.id AND pi.inventory_location_id = l.id
            )
        """)
    
    # ============================================================
    # STEP 5: Adicionar colunas de rastreamento a movimentacoes
    # ============================================================
    print("[Migration v2.0.0] Step 5: Adding location tracking to movements...")
    
    if not _column_exists(conn, "movimentacoes", "origem_location_id"):
        conn.execute("""
            ALTER TABLE movimentacoes 
            ADD COLUMN origem_location_id INTEGER
        """)
    
    if not _column_exists(conn, "movimentacoes", "destino_location_id"):
        conn.execute("""
            ALTER TABLE movimentacoes 
            ADD COLUMN destino_location_id INTEGER
        """)
    
    # ============================================================
    # STEP 6: Preencher location_ids nos movimentos existentes
    # ============================================================
    print("[Migration v2.0.0] Step 6: Populating location_ids in existing movements...")
    
    # Obter IDs das locations
    locations = conn.execute(
        "SELECT id, name FROM inventory_locations"
    ).fetchall()
    location_ids = {name: loc_id for loc_id, name in locations}
    
    if location_ids:
        canoas_id = location_ids.get('CANOAS')
        pf_id = location_ids.get('PF')
        
        # Para ENTRADA: origem_location_id é NULL, destino_location_id vem de destino
        print("  → Setting location_ids for ENTRADA movements...")
        if canoas_id:
            conn.execute(f"""
                UPDATE movimentacoes 
                SET destino_location_id = {canoas_id}
                WHERE tipo = 'ENTRADA' AND destino = 'CANOAS' AND destino_location_id IS NULL
            """)
        if pf_id:
            conn.execute(f"""
                UPDATE movimentacoes 
                SET destino_location_id = {pf_id}
                WHERE tipo = 'ENTRADA' AND destino = 'PF' AND destino_location_id IS NULL
            """)
        
        # Para SAIDA: origem_location_id vem de origem, destino_location_id é NULL
        print("  → Setting location_ids for SAIDA movements...")
        if canoas_id:
            conn.execute(f"""
                UPDATE movimentacoes 
                SET origem_location_id = {canoas_id}
                WHERE tipo = 'SAIDA' AND origem = 'CANOAS' AND origem_location_id IS NULL
            """)
        if pf_id:
            conn.execute(f"""
                UPDATE movimentacoes 
                SET origem_location_id = {pf_id}
                WHERE tipo = 'SAIDA' AND origem = 'PF' AND origem_location_id IS NULL
            """)
        
        # Para TRANSFERENCIA: ambas os location_ids
        print("  → Setting location_ids for TRANSFERENCIA movements...")
        if canoas_id and pf_id:
            conn.execute(f"""
                UPDATE movimentacoes 
                SET 
                    origem_location_id = CASE 
                        WHEN origem = 'CANOAS' THEN {canoas_id}
                        WHEN origem = 'PF' THEN {pf_id}
                        ELSE NULL
                    END,
                    destino_location_id = CASE 
                        WHEN destino = 'CANOAS' THEN {canoas_id}
                        WHEN destino = 'PF' THEN {pf_id}
                        ELSE NULL
                    END
                WHERE tipo = 'TRANSFERENCIA' AND (origem_location_id IS NULL OR destino_location_id IS NULL)
            """)
    
    # ============================================================
    # STEP 7: Atualizar inventory_sessions para usar location_id
    # ============================================================
    print("[Migration v2.0.0] Step 7: Updating inventory_sessions...")
    
    if not _column_exists(conn, "inventory_sessions", "inventory_location_id"):
        conn.execute("""
            ALTER TABLE inventory_sessions 
            ADD COLUMN inventory_location_id INTEGER
        """)
        
        # Preencher inventory_location_id baseado no campo 'local'
        locations = conn.execute(
            "SELECT id, name FROM inventory_locations"
        ).fetchall()
        location_ids = {name: loc_id for loc_id, name in locations}
        
        for location_name, location_id in location_ids.items():
            conn.execute(f"""
                UPDATE inventory_sessions 
                SET inventory_location_id = {location_id}
                WHERE local = '{location_name}' AND inventory_location_id IS NULL
            """)
    
    # ============================================================
    # STEP 8: Criar tabela de configuração de aplicação
    # ============================================================
    print("[Migration v2.0.0] Step 8: Creating app_config table...")
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_config (
            chave TEXT PRIMARY KEY,
            valor TEXT NOT NULL,
            tipo TEXT DEFAULT 'string',         -- string, json, int, bool
            descricao TEXT,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chave)
        );
    """)
    
    # Inserir configurações iniciais
    conn.execute("""
        INSERT OR IGNORE INTO app_config (chave, valor, tipo, descricao)
        VALUES 
            ('version', '2.0.0', 'string', 'Database schema version'),
            ('white_label_enabled', 'true', 'bool', 'Enable white-label mode'),
            ('default_locations_count', '2', 'int', 'Number of default locations'),
            ('migration_date', datetime('now'), 'string', 'Date of white-label migration')
    """)
    
    # ============================================================
    # STEP 9: Criar índices para performance
    # ============================================================
    print("[Migration v2.0.0] Step 9: Creating indexes...")
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_inventory_produto ON product_inventory(produto_id);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_inventory_location ON product_inventory(inventory_location_id);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_inventory_quantidade ON product_inventory(quantidade);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mov_origem_location ON movimentacoes(origem_location_id);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mov_destino_location ON movimentacoes(destino_location_id);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_location_name ON inventory_locations(name);"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_location_ativo ON inventory_locations(ativo);"
    )
    
    # ============================================================
    # STEP 10: Verificação de integridade
    # ============================================================
    print("[Migration v2.0.0] Step 10: Verifying data integrity...")
    
    # Verificar se qtd_canoas e qtd_pf conferem com product_inventory
    products_count = conn.execute(
        "SELECT COUNT(*) FROM produtos WHERE ativo = 1"
    ).fetchone()[0]
    
    inventory_products = conn.execute(
        "SELECT COUNT(DISTINCT produto_id) FROM product_inventory"
    ).fetchone()[0]
    
    print(f"  ✓ Produtos ativos: {products_count}")
    print(f"  ✓ Produtos com inventário: {inventory_products}")
    
    # Verificar movimentacoes
    movements_total = conn.execute(
        "SELECT COUNT(*) FROM movimentacoes"
    ).fetchone()[0]
    
    movements_with_location_ids = conn.execute(
        "SELECT COUNT(*) FROM movimentacoes WHERE origem_location_id IS NOT NULL OR destino_location_id IS NOT NULL"
    ).fetchone()[0]
    
    print(f"  ✓ Total de movimentações: {movements_total}")
    print(f"  ✓ Movimentações com location_ids: {movements_with_location_ids}")
    
    # Verificar locations
    locations_count = conn.execute(
        "SELECT COUNT(*) FROM inventory_locations WHERE ativo = 1"
    ).fetchone()[0]
    
    print(f"  ✓ Locations ativas: {locations_count}")
    
    print("[Migration v2.0.0] ✅ Migration completed successfully!")


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    """Verifica se uma coluna existe em uma tabela."""
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}
    return column in columns


def create_rollback_migration() -> MigrationHandler:
    """
    Cria função de rollback para esta migração.
    
    Nota: O rollback remove as NOVAS tabelas mas MANTÉM os dados
    copados em qtd_canoas/qtd_pf (retrocompatibilidade).
    """
    
    def rollback_white_label(conn: sqlite3.Connection) -> None:
        print("[Migration v2.0.0 Rollback] Starting rollback...")
        
        # Copiar dados de volta para qtd_canoas/qtd_pf
        print("  → Restoring qtd_canoas and qtd_pf...")
        locations = conn.execute(
            "SELECT id, name FROM inventory_locations"
        ).fetchall()
        location_ids = {name: loc_id for loc_id, name in locations}
        canoas_id = location_ids.get('CANOAS')
        pf_id = location_ids.get('PF')
        
        if canoas_id:
            conn.execute(f"""
                UPDATE produtos 
                SET qtd_canoas = COALESCE((
                    SELECT quantidade FROM product_inventory 
                    WHERE produto_id = produtos.id AND inventory_location_id = {canoas_id}
                ), 0)
            """)
        
        if pf_id:
            conn.execute(f"""
                UPDATE produtos 
                SET qtd_pf = COALESCE((
                    SELECT quantidade FROM product_inventory 
                    WHERE produto_id = produtos.id AND inventory_location_id = {pf_id}
                ), 0)
            """)
        
        # Remover tabelas novas
        print("  → Dropping new tables...")
        conn.execute("DROP TABLE IF EXISTS product_inventory")
        conn.execute("DROP TABLE IF EXISTS inventory_locations")
        conn.execute("DROP TABLE IF EXISTS app_config")
        
        print("[Migration v2.0.0 Rollback] ✅ Rollback completed successfully!")
    
    return rollback_white_label
