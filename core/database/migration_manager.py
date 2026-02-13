"""
Gerenciador de migrações de banco de dados.
Responsável por aplicar atualizações de schema entre versões.
"""

import shutil
from typing import Tuple
from core.database.connection import DatabaseConnection
from core.utils.validators import Validators
from core.exceptions import DatabaseException
from core.constants import APP_VERSION


class MigrationManager:
    """
    Gerencia migrações de schema do banco de dados.
    Responsabilidade única: Atualizar estrutura do banco entre versões.
    """
    
    def __init__(self):
        self.db_connection = DatabaseConnection()
    
    def check_and_run_migrations(self) -> Tuple[bool, str]:
        """
        Verifica versão do banco e aplica migrações se necessário.
        
        Returns:
            Tupla (atualizado: bool, versão_nova: str)
            
        Raises:
            DatabaseException: Se falhar ao migrar
        """
        conn = self.db_connection.get_connection()
        cursor = conn.cursor()
        
        try:
            # Obtém versão atual do banco
            cursor.execute("SELECT value FROM system_info WHERE key='db_version'")
            row = cursor.fetchone()
            db_version_str = row['value'] if row else "0.0.0"
            
            # Compara versões
            app_version = Validators.parse_version(APP_VERSION)
            db_version = Validators.parse_version(db_version_str)
            
            # Se banco está atualizado, retorna
            if db_version >= app_version:
                conn.close()
                return False, db_version_str
            
            print(f"Iniciando migração de banco: {db_version_str} -> {APP_VERSION}")
            
            # Cria snapshot de segurança
            backup_path = self._create_backup(db_version_str)
            print(f"Snapshot de segurança criado: {backup_path}")
            
            # Aplica migrações
            self._apply_migrations(cursor, db_version)
            
            # Atualiza versão no banco
            cursor.execute(
                "UPDATE system_info SET value = ? WHERE key = 'db_version'",
                (APP_VERSION,)
            )
            
            conn.commit()
            conn.close()
            
            return True, APP_VERSION
            
        except Exception as e:
            conn.rollback()
            conn.close()
            
            # Restaura backup se houver erro
            if 'backup_path' in locals():
                self._restore_backup(backup_path)
                print("Backup restaurado devido a erro na migração.")
            
            raise DatabaseException(f"Erro na migração: {e}")
    
    def _create_backup(self, version: str) -> str:
        """
        Cria backup do banco antes da migração.
        
        Args:
            version: Versão atual do banco
            
        Returns:
            Caminho do arquivo de backup
        """
        db_path = self.db_connection.get_database_path()
        backup_path = f"{db_path}.pre_migration_v{version}.bak"
        
        shutil.copy2(db_path, backup_path)
        return backup_path
    
    def _restore_backup(self, backup_path: str) -> None:
        """
        Restaura backup do banco.
        
        Args:
            backup_path: Caminho do arquivo de backup
        """
        db_path = self.db_connection.get_database_path()
        shutil.copy2(backup_path, db_path)
    
    def _apply_migrations(self, cursor, current_version: tuple) -> None:
        """
        Aplica migrações sequencialmente.
        
        Args:
            cursor: Cursor do banco de dados
            current_version: Versão atual como tupla
        """
        # Dicionário de migrações: versão -> lista de comandos SQL
        migrations = {
            "1.2.2": [
                # Adiciona coluna de imagem BLOB para armazenar fotos no banco
                "ALTER TABLE produtos ADD COLUMN imagem BLOB;",
            ],
            # Exemplo para versões futuras:
            # "1.3.0": [
            #     "ALTER TABLE produtos ADD COLUMN categoria TEXT DEFAULT 'Geral';",
            #     "CREATE INDEX idx_prod_nome ON produtos(nome);"
            # ],
        }
        
        # Ordena versões cronologicamente
        sorted_versions = sorted(migrations.keys(), key=Validators.parse_version)
        
        # Aplica apenas migrações mais recentes que a versão atual
        for version_key in sorted_versions:
            migration_version = Validators.parse_version(version_key)
            
            if migration_version > current_version:
                print(f"Aplicando patch {version_key}...")
                
                for sql_command in migrations[version_key]:
                    cursor.execute(sql_command)
                
                print(f"Patch {version_key} aplicado com sucesso.")
    
    def get_current_database_version(self) -> str:
        """
        Retorna versão atual do banco de dados.
        
        Returns:
            String de versão (ex: "1.2.1")
        """
        conn = self.db_connection.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT value FROM system_info WHERE key='db_version'")
            row = cursor.fetchone()
            return row['value'] if row else "0.0.0"
        finally:
            conn.close()
