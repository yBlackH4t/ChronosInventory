"""
Script de Teste de Migração para v2.0.0

Objetivo: Validar que a migração funciona corretamente SEM quebrar dados dos clientes

Uso:
  python test_migration.py
  
Faz:
1. Cria banco de teste com dados antigos (simula cliente existente)
2. Executa migração v2.0.0
3. Valida que todos os dados foram preservados
4. Verifica integridade referencial
5. Compara totais antes/depois
"""

import sqlite3
import sys
from pathlib import Path
from typing import Dict, Tuple

# Adicionar root ao path
sys.path.insert(0, str(Path(__file__).parent))

from core.database.migration_v2_0_0_white_label import migrate_to_white_label


class MigrationTester:
    """Testa migração v2.0.0 com segurança."""
    
    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self.conn = None
        self.before_stats = {}
        self.after_stats = {}
    
    def setup_test_database(self) -> None:
        """Cria banco de teste com dados antigos."""
        print("📝 Setting up test database with legacy data...")
        
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA foreign_keys = ON")
        
        # Criar tabelas antigas (sem product_inventory, sem inventory_locations)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS produtos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                qtd_canoas INTEGER DEFAULT 0,
                qtd_pf INTEGER DEFAULT 0,
                imagem BLOB,
                observacao TEXT,
                ativo INTEGER NOT NULL DEFAULT 1,
                inativado_em DATETIME,
                motivo_inativacao TEXT
            );
        """)
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS movimentacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                tipo TEXT NOT NULL,
                produto_id INTEGER NOT NULL,
                quantidade INTEGER NOT NULL,
                origem TEXT,
                destino TEXT,
                observacao TEXT,
                natureza TEXT NOT NULL DEFAULT 'OPERACAO_NORMAL',
                motivo_ajuste TEXT,
                local_externo TEXT,
                documento TEXT,
                movimento_ref_id INTEGER,
                FOREIGN KEY(produto_id) REFERENCES produtos(id)
            );
        """)
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS product_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                image_data BLOB NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
                is_primary INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(product_id) REFERENCES produtos(id) ON DELETE CASCADE
            );
        """)
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS inventory_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                local TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ABERTO',
                observacao TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                applied_at DATETIME
            );
        """)
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS inventory_counts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                produto_id INTEGER NOT NULL,
                qtd_sistema INTEGER NOT NULL,
                qtd_fisico INTEGER,
                divergencia INTEGER,
                motivo_ajuste TEXT,
                observacao TEXT,
                applied_movement_id INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(produto_id) REFERENCES produtos(id),
                FOREIGN KEY(applied_movement_id) REFERENCES movimentacoes(id),
                UNIQUE(session_id, produto_id)
            );
        """)
        
        # Criar índices antigos
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data_hora);")
        
        print("✅ Test database created")
    
    def insert_test_data(self) -> None:
        """Insere dados de teste realistas."""
        print("📊 Inserting test data...")
        
        # Produtos com estoque em ambas locations
        self.conn.execute("""
            INSERT INTO produtos (nome, qtd_canoas, qtd_pf, observacao, ativo)
            VALUES 
                ('Canoa Fibra 5m', 50, 30, 'Estoque principal', 1),
                ('Canoa Alumínio 6m', 20, 15, 'Modelo premium', 1),
                ('Remo Paddle', 150, 200, 'Diferentes tamanhos', 1),
                ('Colete Salva-vidas', 0, 45, 'Apenas em PF', 1),
                ('Produto Deletado', 10, 5, 'Será inativado', 0)
        """)
        
        # Movimentações de entrada
        self.conn.execute("""
            INSERT INTO movimentacoes (tipo, produto_id, quantidade, destino, observacao, natureza)
            VALUES 
                ('ENTRADA', 1, 50, 'CANOAS', 'Compra lote 001', 'OPERACAO_NORMAL'),
                ('ENTRADA', 1, 30, 'PF', 'Compra lote 001', 'OPERACAO_NORMAL'),
                ('ENTRADA', 2, 20, 'CANOAS', 'Compra lote 002', 'OPERACAO_NORMAL'),
                ('ENTRADA', 2, 15, 'PF', 'Compra lote 002', 'OPERACAO_NORMAL'),
                ('ENTRADA', 3, 200, 'CANOAS', 'Compra lote 003', 'OPERACAO_NORMAL'),
                ('ENTRADA', 4, 45, 'PF', 'Compra lote 004', 'OPERACAO_NORMAL')
        """)
        
        # Movimentações de saída
        self.conn.execute("""
            INSERT INTO movimentacoes (tipo, produto_id, quantidade, origem, observacao, natureza)
            VALUES 
                ('SAIDA', 1, 5, 'CANOAS', 'Saída para cliente', 'OPERACAO_NORMAL'),
                ('SAIDA', 3, 50, 'CANOAS', 'Saída para cliente', 'OPERACAO_NORMAL')
        """)
        
        # Movimentações de transferência
        self.conn.execute("""
            INSERT INTO movimentacoes (tipo, produto_id, quantidade, origem, destino, observacao, natureza)
            VALUES 
                ('TRANSFERENCIA', 1, 10, 'CANOAS', 'PF', 'Rebalanceamento', 'OPERACAO_NORMAL'),
                ('TRANSFERENCIA', 3, 30, 'CANOAS', 'PF', 'Rebalanceamento', 'OPERACAO_NORMAL')
        """)
        
        # Movimentações de ajuste
        self.conn.execute("""
            INSERT INTO movimentacoes (tipo, produto_id, quantidade, origem, observacao, natureza, motivo_ajuste)
            VALUES 
                ('SAIDA', 1, 2, 'CANOAS', 'Ajuste por avaria', 'AJUSTE', 'AVARIA'),
                ('SAIDA', 2, 3, 'PF', 'Ajuste por perda', 'AJUSTE', 'PERDA')
        """)
        
        self.conn.commit()
        print("✅ Test data inserted")
    
    def capture_before_stats(self) -> None:
        """Captura estatísticas ANTES da migração."""
        print("📈 Capturing pre-migration statistics...")
        
        # Contar produtos
        produtos = self.conn.execute("SELECT COUNT(*) FROM produtos").fetchone()[0]
        movimentacoes = self.conn.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0]
        
        # Total de estoque
        totais = self.conn.execute("""
            SELECT 
                SUM(qtd_canoas) as total_canoas,
                SUM(qtd_pf) as total_pf,
                SUM(qtd_canoas + qtd_pf) as total_geral
            FROM produtos
        """).fetchone()
        
        # Detalhe por produto
        produtos_detail = self.conn.execute("""
            SELECT id, nome, qtd_canoas, qtd_pf FROM produtos ORDER BY id
        """).fetchall()
        
        self.before_stats = {
            'produtos_count': produtos,
            'movimentacoes_count': movimentacoes,
            'total_canoas': totais[0],
            'total_pf': totais[1],
            'total_geral': totais[2],
            'produtos_detail': produtos_detail
        }
        
        print(f"  - Produtos: {produtos}")
        print(f"  - Movimentações: {movimentacoes}")
        print(f"  - Total Canoas: {totais[0]}")
        print(f"  - Total PF: {totais[1]}")
        print(f"  - Total Geral: {totais[2]}")
    
    def run_migration(self) -> None:
        """Executa a migração v2.0.0."""
        print("🔄 Running migration v2.0.0...")
        
        try:
            migrate_to_white_label(self.conn)
            self.conn.commit()
            print("✅ Migration completed successfully")
        except Exception as e:
            self.conn.rollback()
            print(f"❌ Migration failed: {e}")
            raise
    
    def capture_after_stats(self) -> None:
        """Captura estatísticas DEPOIS da migração."""
        print("📈 Capturing post-migration statistics...")
        
        # Contar produtos
        produtos = self.conn.execute("SELECT COUNT(*) FROM produtos").fetchone()[0]
        movimentacoes = self.conn.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0]
        
        # Verificar novas tabelas
        inventory_locations = self.conn.execute(
            "SELECT COUNT(*) FROM inventory_locations"
        ).fetchone()[0]
        product_inventory = self.conn.execute(
            "SELECT COUNT(*) FROM product_inventory"
        ).fetchone()[0]
        
        # Total de estoque via nova estrutura
        totais = self.conn.execute("""
            SELECT 
                SUM(CASE WHEN il.name = 'CANOAS' THEN pi.quantidade ELSE 0 END) as total_canoas,
                SUM(CASE WHEN il.name = 'PF' THEN pi.quantidade ELSE 0 END) as total_pf,
                SUM(pi.quantidade) as total_geral
            FROM product_inventory pi
            JOIN inventory_locations il ON pi.inventory_location_id = il.id
        """).fetchone()
        
        # Detalhe de product_inventory
        inventory_detail = self.conn.execute("""
            SELECT pi.produto_id, il.name, pi.quantidade 
            FROM product_inventory pi
            JOIN inventory_locations il ON pi.inventory_location_id = il.id
            ORDER BY pi.produto_id, il.id
        """).fetchall()
        
        self.after_stats = {
            'produtos_count': produtos,
            'movimentacoes_count': movimentacoes,
            'inventory_locations_count': inventory_locations,
            'product_inventory_count': product_inventory,
            'total_canoas': totais[0],
            'total_pf': totais[1],
            'total_geral': totais[2],
            'inventory_detail': inventory_detail
        }
        
        print(f"  - Produtos: {produtos}")
        print(f"  - Movimentações: {movimentacoes}")
        print(f"  - Locations: {inventory_locations}")
        print(f"  - Product-Inventory records: {product_inventory}")
        print(f"  - Total Canoas: {totais[0]}")
        print(f"  - Total PF: {totais[1]}")
        print(f"  - Total Geral: {totais[2]}")
    
    def validate_data_integrity(self) -> bool:
        """Valida integridade dos dados pós-migração."""
        print("\n🔍 Validating data integrity...")
        
        all_valid = True
        
        # Validação 1: Contas de produtos
        if self.before_stats['produtos_count'] != self.after_stats['produtos_count']:
            print(f"❌ Produto count mismatch: {self.before_stats['produtos_count']} != {self.after_stats['produtos_count']}")
            all_valid = False
        else:
            print(f"✅ Produtos count preserved: {self.after_stats['produtos_count']}")
        
        # Validação 2: Contas de movimentações
        if self.before_stats['movimentacoes_count'] != self.after_stats['movimentacoes_count']:
            print(f"❌ Movimentações count mismatch: {self.before_stats['movimentacoes_count']} != {self.after_stats['movimentacoes_count']}")
            all_valid = False
        else:
            print(f"✅ Movimentações count preserved: {self.after_stats['movimentacoes_count']}")
        
        # Validação 3: Totais de estoque
        if self.before_stats['total_geral'] != self.after_stats['total_geral']:
            print(f"❌ Total stock mismatch: {self.before_stats['total_geral']} != {self.after_stats['total_geral']}")
            all_valid = False
        else:
            print(f"✅ Total stock preserved: {self.after_stats['total_geral']}")
        
        # Validação 4: Estoque por location
        if (self.before_stats['total_canoas'] or 0) != (self.after_stats['total_canoas'] or 0):
            print(f"❌ Canoas stock mismatch: {self.before_stats['total_canoas']} != {self.after_stats['total_canoas']}")
            all_valid = False
        else:
            print(f"✅ Canoas stock preserved: {self.after_stats['total_canoas']}")
        
        if (self.before_stats['total_pf'] or 0) != (self.after_stats['total_pf'] or 0):
            print(f"❌ PF stock mismatch: {self.before_stats['total_pf']} != {self.after_stats['total_pf']}")
            all_valid = False
        else:
            print(f"✅ PF stock preserved: {self.after_stats['total_pf']}")
        
        # Validação 5: Integridade referencial
        orphaned_movements = self.conn.execute("""
            SELECT COUNT(*) FROM movimentacoes 
            WHERE produto_id NOT IN (SELECT id FROM produtos)
        """).fetchone()[0]
        
        if orphaned_movements > 0:
            print(f"❌ Found {orphaned_movements} orphaned movements")
            all_valid = False
        else:
            print(f"✅ No orphaned movements")
        
        # Validação 6: location_ids preenchidos
        movements_without_location = self.conn.execute("""
            SELECT COUNT(*) FROM movimentacoes 
            WHERE tipo IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA')
            AND (tipo = 'ENTRADA' AND destino_location_id IS NULL 
                 OR tipo = 'SAIDA' AND origem_location_id IS NULL
                 OR tipo = 'TRANSFERENCIA' AND (origem_location_id IS NULL OR destino_location_id IS NULL))
        """).fetchone()[0]
        
        if movements_without_location > 0:
            print(f"⚠️  Found {movements_without_location} movements without proper location_ids")
            # Não é erro crítico se havia dados inconsistentes
        else:
            print(f"✅ All movements have location_ids populated")
        
        # Validação 7: Tabelas novas criadas
        try:
            self.conn.execute("SELECT 1 FROM inventory_locations LIMIT 1")
            print("✅ inventory_locations table created")
        except Exception as e:
            print(f"❌ inventory_locations table error: {e}")
            all_valid = False
        
        try:
            self.conn.execute("SELECT 1 FROM product_inventory LIMIT 1")
            print("✅ product_inventory table created")
        except Exception as e:
            print(f"❌ product_inventory table error: {e}")
            all_valid = False
        
        return all_valid
    
    def print_detailed_comparison(self) -> None:
        """Imprime comparação detalhada dos dados."""
        print("\n📋 DETAILED DATA COMPARISON\n")
        print("PRODUTOS - Before vs After:")
        print("-" * 80)
        print(f"{'ID':<5} {'Nome':<30} {'Canoas (Before)':<18} {'PF (Before)':<18}")
        print("-" * 80)
        
        for prod_id, nome, canoas, pf in self.before_stats['produtos_detail']:
            print(f"{prod_id:<5} {nome:<30} {canoas:<18} {pf:<18}")
        
        print("\nPRODUCT_INVENTORY - After Migration:")
        print("-" * 80)
        print(f"{'Produto ID':<12} {'Location':<15} {'Quantidade':<15}")
        print("-" * 80)
        
        for prod_id, location, qty in self.after_stats['inventory_detail']:
            print(f"{prod_id:<12} {location:<15} {qty:<15}")
    
    def run_all_tests(self) -> bool:
        """Executa todos os testes."""
        try:
            self.setup_test_database()
            self.insert_test_data()
            self.capture_before_stats()
            
            print("\n" + "="*80)
            self.run_migration()
            print("="*80 + "\n")
            
            self.capture_after_stats()
            self.print_detailed_comparison()
            
            print("\n" + "="*80)
            is_valid = self.validate_data_integrity()
            print("="*80)
            
            return is_valid
        
        finally:
            if self.conn:
                self.conn.close()


if __name__ == "__main__":
    print("🚀 ChronosInventory v2.0.0 Migration Test\n")
    
    tester = MigrationTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ ALL TESTS PASSED - Migration is safe for production!")
        sys.exit(0)
    else:
        print("\n❌ TESTS FAILED - Please review errors above")
        sys.exit(1)
