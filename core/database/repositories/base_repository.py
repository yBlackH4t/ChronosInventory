"""
Repository base com operações comuns.
Implementa padrão Repository para acesso a dados.
"""

from typing import List, Dict, Any, Optional
from core.database.connection import DatabaseConnection
from core.exceptions import DatabaseException


class BaseRepository:
    """
    Classe base para repositories.
    Fornece métodos comuns de acesso ao banco de dados.
    """
    
    def __init__(self):
        self.db = DatabaseConnection()
    
    def _execute_query(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """
        Executa query SELECT e retorna resultados.
        
        Args:
            query: Query SQL
            params: Parâmetros da query
            
        Returns:
            Lista de dicionários com resultados
            
        Raises:
            DatabaseException: Se falhar ao executar
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(query, params)
            results = [dict(row) for row in cursor.fetchall()]
            return results
        except Exception as e:
            raise DatabaseException(f"Erro ao executar query: {e}")
        finally:
            conn.close()
    
    def _execute_command(self, command: str, params: tuple = ()) -> int:
        """
        Executa comando INSERT/UPDATE/DELETE.
        
        Args:
            command: Comando SQL
            params: Parâmetros do comando
            
        Returns:
            Número de linhas afetadas
            
        Raises:
            DatabaseException: Se falhar ao executar
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(command, params)
            conn.commit()
            return cursor.rowcount
        except Exception as e:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando: {e}")
        finally:
            conn.close()
    
    def _execute_many(self, command: str, params_list: List[tuple]) -> int:
        """
        Executa comando em lote (batch).
        
        Args:
            command: Comando SQL
            params_list: Lista de tuplas de parâmetros
            
        Returns:
            Número total de linhas afetadas
            
        Raises:
            DatabaseException: Se falhar ao executar
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.executemany(command, params_list)
            conn.commit()
            return cursor.rowcount
        except Exception as e:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando em lote: {e}")
        finally:
            conn.close()
    
    def _get_last_insert_id(self) -> Optional[int]:
        """
        Retorna ID do último registro inserido.
        
        Returns:
            ID do último insert ou None
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT last_insert_rowid()")
            result = cursor.fetchone()
            return result[0] if result else None
        finally:
            conn.close()
    
    def _count(self, table: str, where_clause: str = "", params: tuple = ()) -> int:
        """
        Conta registros em uma tabela.
        
        Args:
            table: Nome da tabela
            where_clause: Cláusula WHERE (opcional)
            params: Parâmetros da cláusula WHERE
            
        Returns:
            Número de registros
        """
        query = f"SELECT COUNT(*) as count FROM {table}"
        if where_clause:
            query += f" WHERE {where_clause}"
        
        result = self._execute_query(query, params)
        return result[0]['count'] if result else 0
    
    def _exists(self, table: str, where_clause: str, params: tuple) -> bool:
        """
        Verifica se registro existe.
        
        Args:
            table: Nome da tabela
            where_clause: Cláusula WHERE
            params: Parâmetros da cláusula WHERE
            
        Returns:
            True se existe, False caso contrário
        """
        return self._count(table, where_clause, params) > 0
