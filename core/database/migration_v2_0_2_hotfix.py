"""
Migração v2.0.2: Hotfix de Remapeamento Dinâmico de Locais
Objetivo: Corrigir a migração v2.0.1 que assumiu rigidamente que Canoas=1 e PF=2.
Se o usuário recriou os locais manualmente na v2.0.0, os IDs podem ser diferentes (ex: TESTE=1, Canoas=2, PF=3).
Isso causou a troca de estoques (PF foi para Canoas, Canoas foi para Teste).
"""

import logging
import sqlite3

logger = logging.getLogger(__name__)


def migrate_to_v2_0_2_hotfix(conn: sqlite3.Connection) -> None:
    logger.info("[Hotfix v2.0.2] Iniciando remapeamento dinâmico de locais...")

    cursor = conn.cursor()

    # 1. Encontrar os IDs reais de Canoas e PF na tabela 'locais'
    cursor.execute("SELECT id FROM locais WHERE UPPER(nome) = 'CANOAS' OR UPPER(label) LIKE '%CANOAS%' LIMIT 1")
    row = cursor.fetchone()
    canoas_real_id = row[0] if row else None

    cursor.execute("SELECT id FROM locais WHERE UPPER(nome) = 'PF' OR UPPER(label) LIKE '%PASSO FUNDO%' LIMIT 1")
    row = cursor.fetchone()
    pf_real_id = row[0] if row else None

    logger.info(f"  → IDs reais detectados: Canoas={canoas_real_id}, PF={pf_real_id}")

    # Se por acaso os locais não existirem, cria eles com IDs novos para garantir
    if not canoas_real_id:
        cursor.execute("INSERT INTO locais (nome, label, color, ordem) VALUES ('CANOAS', 'Canoas', '#1f538d', 1)")
        canoas_real_id = cursor.lastrowid
        logger.info(f"  → Criado Canoas com ID {canoas_real_id}")
        
    if not pf_real_id:
        cursor.execute("INSERT INTO locais (nome, label, color, ordem) VALUES ('PF', 'Passo Fundo', '#e74c3c', 2)")
        pf_real_id = cursor.lastrowid
        logger.info(f"  → Criado PF com ID {pf_real_id}")

    # Se os IDs já forem 1 e 2, não precisa remapear, pois a v2.0.1 acertou
    if canoas_real_id == 1 and pf_real_id == 2:
        logger.info("[Hotfix v2.0.2] Mapeamento já está correto (Canoas=1, PF=2). Nenhuma ação necessária.")
        return

    # Caso os IDs estejam trocados (ex: Canoas=2, PF=3) e a v2.0.1 jogou os dados no ID 1 e 2
    # Precisamos mover os dados. Para evitar conflitos de UNIQUE constraint, moveremos para IDs temporários primeiro.
    TEMP_CANOAS = -9991
    TEMP_PF = -9992

    logger.info("  → Movendo dados para IDs temporários...")
    
    # PRODUTO_ESTOQUE
    # Remove as linhas com zeros preenchidas pela v2.0.1 nos IDs reais (para não dar UNIQUE conflict ao mover)
    cursor.execute("DELETE FROM produto_estoque WHERE local_id IN (?, ?)", (canoas_real_id, pf_real_id))
    
    cursor.execute("UPDATE produto_estoque SET local_id = ? WHERE local_id = 1", (TEMP_CANOAS,))
    cursor.execute("UPDATE produto_estoque SET local_id = ? WHERE local_id = 2", (TEMP_PF,))
    
    # Agora move dos temporários para os reais
    cursor.execute("UPDATE produto_estoque SET local_id = ? WHERE local_id = ?", (canoas_real_id, TEMP_CANOAS))
    cursor.execute("UPDATE produto_estoque SET local_id = ? WHERE local_id = ?", (pf_real_id, TEMP_PF))

    # MOVIMENTACOES
    logger.info("  → Remapeando rastreabilidade de movimentacoes...")
    # Origem
    cursor.execute("UPDATE movimentacoes SET origem_local_id = ? WHERE origem_local_id = 1", (TEMP_CANOAS,))
    cursor.execute("UPDATE movimentacoes SET origem_local_id = ? WHERE origem_local_id = 2", (TEMP_PF,))
    cursor.execute("UPDATE movimentacoes SET origem_local_id = ? WHERE origem_local_id = ?", (canoas_real_id, TEMP_CANOAS))
    cursor.execute("UPDATE movimentacoes SET origem_local_id = ? WHERE origem_local_id = ?", (pf_real_id, TEMP_PF))

    # Destino
    cursor.execute("UPDATE movimentacoes SET destino_local_id = ? WHERE destino_local_id = 1", (TEMP_CANOAS,))
    cursor.execute("UPDATE movimentacoes SET destino_local_id = ? WHERE destino_local_id = 2", (TEMP_PF,))
    cursor.execute("UPDATE movimentacoes SET destino_local_id = ? WHERE destino_local_id = ?", (canoas_real_id, TEMP_CANOAS))
    cursor.execute("UPDATE movimentacoes SET destino_local_id = ? WHERE destino_local_id = ?", (pf_real_id, TEMP_PF))

    # Limpar qualquer produto_estoque zerado residual que possa ter ficado no ID 1 e 2 (ex: TESTE) se eles existirem
    # Na verdade, se o ID 1 era TESTE, a v2.0.1 jogou os dados do CANOAS nele. Já movemos para canoas_real_id.
    # Precisamos garantir que TESTE volte a existir na produto_estoque com zero, caso não exista.
    # O próprio código do backend cuida de inserir zerados quando não existe, ou podemos rodar o fill_zeroes.
    cursor.execute("""
        INSERT OR IGNORE INTO produto_estoque (produto_id, local_id, quantidade)
        SELECT p.id, l.id, 0
        FROM produtos p
        CROSS JOIN locais l
        WHERE NOT EXISTS (
            SELECT 1 FROM produto_estoque pe 
            WHERE pe.produto_id = p.id AND pe.local_id = l.id
        )
    """)

    logger.info("[Hotfix v2.0.2] ✅ Remapeamento concluído!")
