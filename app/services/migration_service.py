"""
Serviço de migração de dados legados.
Responsabilidade: Migrar dados de Excel para SQLite.
"""

import os
import pandas as pd
from typing import Tuple
from datetime import datetime
from core.database.repositories.product_repository import ProductRepository
from core.utils.file_utils import FileUtils
from core.exceptions import MigrationException
from core.constants import DATE_FORMAT_FILE


class MigrationService:
    """
    Serviço de Migração.
    Responsabilidade única: Migrar dados legados para o banco.
    """
    
    def __init__(self):
        self.product_repo = ProductRepository()
        self.app_dir = FileUtils.get_app_directory()
        self.backups_dir = FileUtils.get_backups_directory()
    
    def run_migration_if_needed(self, excel_path: str) -> Tuple[bool, str]:
        """
        Executa migração de Excel para SQLite se necessário.
        
        Args:
            excel_path: Caminho do arquivo Excel
            
        Returns:
            Tupla (sucesso: bool, mensagem: str)
        """
        # Verifica se arquivo existe
        if not FileUtils.file_exists(excel_path):
            return False, "Arquivo Excel não encontrado."
        
        # Verifica se banco já tem dados
        product_count = self.product_repo.count_products()
        
        if product_count > 0:
            return True, "Banco de dados já populado. Migração ignorada."
        
        # Executa migração
        try:
            return self._migrate_from_excel(excel_path)
        except Exception as e:
            raise MigrationException(f"Erro na migração: {e}")
    
    def _migrate_from_excel(self, excel_path: str) -> Tuple[bool, str]:
        """
        Migra dados do Excel para o banco.
        
        Args:
            excel_path: Caminho do arquivo Excel
            
        Returns:
            Tupla (sucesso: bool, mensagem: str)
        """
        print("Iniciando migração de dados...")
        
        # Lê Excel
        df = pd.read_excel(excel_path, header=0)
        
        # Valida estrutura
        if len(df.columns) < 4:
            return False, "Arquivo ignorado: Formato inválido (esperado min. 4 colunas)."
        
        # Sanitiza dados
        df.iloc[:, 0] = pd.to_numeric(df.iloc[:, 0], errors='coerce').fillna(0).astype(int)  # ID
        df.iloc[:, 2] = pd.to_numeric(df.iloc[:, 2], errors='coerce').fillna(0).astype(int)  # Canoas
        df.iloc[:, 3] = pd.to_numeric(df.iloc[:, 3], errors='coerce').fillna(0).astype(int)  # PF
        
        # Prepara dados para inserção em lote
        products_to_insert = []
        
        for _, row in df.iterrows():
            products_to_insert.append((
                int(row.iloc[0]),  # ID
                str(row.iloc[1]).strip().upper(),  # Nome
                int(row.iloc[2]),  # Canoas
                int(row.iloc[3])   # PF
            ))
        
        # Insere em lote
        self.product_repo.bulk_insert(products_to_insert)
        
        # Move Excel para backups
        backup_filename = self._backup_legacy_excel(excel_path)
        
        return True, f"Migração concluída! Excel movido para backups/{backup_filename}"
    
    def _backup_legacy_excel(self, excel_path: str) -> str:
        """
        Move Excel legado para pasta de backups.
        
        Args:
            excel_path: Caminho do Excel
            
        Returns:
            Nome do arquivo de backup
        """
        timestamp = datetime.now().strftime(DATE_FORMAT_FILE)
        backup_filename = f"backup_legacy_v1_{timestamp}.xlsx"
        backup_path = os.path.join(self.backups_dir, backup_filename)
        
        FileUtils.move_file(excel_path, backup_path)
        
        return backup_filename
    
    def check_for_legacy_excel(self) -> str:
        """
        Procura por arquivos Excel legados no diretório da aplicação.
        
        Returns:
            Caminho do Excel encontrado ou None
        """
        if not FileUtils.directory_exists(self.app_dir):
            return None
        
        for filename in os.listdir(self.app_dir):
            if filename.endswith(('.xlsx', '.xls')) and not filename.startswith('backup_'):
                return os.path.join(self.app_dir, filename)
        
        return None
