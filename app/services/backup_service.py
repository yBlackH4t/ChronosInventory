"""
Serviço de backup e exportação.
Responsabilidade: Gerenciar backups do sistema.
"""

import os
import pandas as pd
from typing import Tuple
from datetime import datetime
from core.utils.file_utils import FileUtils
from core.database.connection import DatabaseConnection
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import FileOperationException
from core.constants import DATE_FORMAT_FILE


class BackupService:
    """
    Serviço de Backup.
    Responsabilidade única: Criar e gerenciar backups.
    """
    
    def __init__(self):
        self.product_repo = ProductRepository()
        self.db_connection = DatabaseConnection()
        self.backups_dir = FileUtils.get_backups_directory()
    
    def export_backup(self, excel_path: str) -> Tuple[bool, str]:
        """
        Exporta backup completo (Excel + DB).
        
        Args:
            excel_path: Caminho para salvar o Excel
            
        Returns:
            Tupla (sucesso: bool, mensagem: str)
        """
        try:
            # 1. Exporta Excel
            products = self.product_repo.get_all()
            
            if not products:
                return False, "Sem dados para exportar."
            
            df = pd.DataFrame(products)
            df.to_excel(excel_path, index=False)
            
            # 2. Backup do banco de dados (.db)
            db_backup_path = os.path.splitext(excel_path)[0] + ".db"
            db_path = self.db_connection.get_database_path()
            
            FileUtils.copy_file(db_path, db_backup_path)
            
            return True, "Backup (Excel + DB) exportado com sucesso!"
            
        except Exception as e:
            return False, f"Erro ao exportar backup: {e}"
    
    def create_automatic_backup(self) -> Tuple[bool, str]:
        """
        Cria backup automático no diretório de backups.
        
        Returns:
            Tupla (sucesso: bool, caminho_backup: str)
        """
        try:
            timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
            backup_name = f"backup_auto_{timestamp}.db"
            backup_path = os.path.join(self.backups_dir, backup_name)
            
            db_path = self.db_connection.get_database_path()
            FileUtils.copy_file(db_path, backup_path)
            
            return True, backup_path
            
        except Exception as e:
            raise FileOperationException(f"Erro ao criar backup automático: {e}")
    
    def create_pre_update_backup(self) -> str:
        """
        Cria backup antes de atualização do sistema.
        
        Returns:
            Caminho do backup criado
            
        Raises:
            FileOperationException: Se falhar ao criar backup
        """
        try:
            timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
            backup_name = f"backup_pre_update_{timestamp}.db"
            backup_path = os.path.join(self.backups_dir, backup_name)
            
            db_path = self.db_connection.get_database_path()
            FileUtils.copy_file(db_path, backup_path)
            
            return backup_path
            
        except Exception as e:
            raise FileOperationException(f"Erro ao criar backup pré-atualização: {e}")
    
    def list_backups(self) -> list:
        """
        Lista todos os backups disponíveis.
        
        Returns:
            Lista de caminhos de backups
        """
        return FileUtils.list_files_in_directory(self.backups_dir, ".db")
    
    def get_backup_count(self) -> int:
        """
        Retorna número de backups armazenados.
        
        Returns:
            Quantidade de backups
        """
        return len(self.list_backups())
    
    def delete_old_backups(self, keep_last: int = 10) -> int:
        """
        Remove backups antigos, mantendo apenas os mais recentes.
        
        Args:
            keep_last: Número de backups a manter
            
        Returns:
            Número de backups removidos
        """
        backups = self.list_backups()
        
        if len(backups) <= keep_last:
            return 0
        
        # Ordena por data de modificação (mais recentes primeiro)
        backups.sort(key=lambda x: os.path.getmtime(x), reverse=True)
        
        # Remove backups antigos
        backups_to_delete = backups[keep_last:]
        deleted_count = 0
        
        for backup_path in backups_to_delete:
            try:
                FileUtils.delete_file(backup_path)
                deleted_count += 1
            except:
                pass  # Ignora erros ao deletar backups individuais
        
        return deleted_count
