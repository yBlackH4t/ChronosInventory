"""
Repository para operações com histórico de movimentações.
Responsabilidade única: Acesso a dados de histórico.
"""

from typing import List, Dict, Any
from core.database.repositories.base_repository import BaseRepository
from core.utils.date_formatter import DateFormatter


class HistoryRepository(BaseRepository):
    """Repository para gerenciar histórico de movimentações."""
    
    def add_log(self, operacao: str, produto_nome: str, quantidade: int, observacao: str) -> int:
        """
        Adiciona registro de log no histórico.
        
        Args:
            operacao: Tipo de operação (ENTRADA, SAIDA, TRANSFERENCIA, etc)
            produto_nome: Nome do produto
            quantidade: Quantidade movimentada
            observacao: Observações adicionais
            
        Returns:
            ID do log criado
        """
        command = """
            INSERT INTO historico (operacao, produto_nome, quantidade, observacao)
            VALUES (?, ?, ?, ?)
        """
        self._execute_command(command, (operacao, produto_nome, quantidade, observacao))
        return self._get_last_insert_id()
    
    def get_all_logs(self, limit: int = None) -> List[Dict[str, Any]]:
        """
        Retorna todos os logs do histórico.
        
        Args:
            limit: Número máximo de registros (opcional)
            
        Returns:
            Lista de logs ordenados por data (mais recentes primeiro)
        """
        query = """
            SELECT data_hora, operacao, produto_nome, quantidade, observacao 
            FROM historico 
            ORDER BY id DESC
        """
        
        if limit:
            query += f" LIMIT {limit}"
        
        return self._execute_query(query)
    
    def get_logs_by_product(self, produto_nome: str) -> List[Dict[str, Any]]:
        """
        Retorna logs de um produto específico.
        
        Args:
            produto_nome: Nome do produto
            
        Returns:
            Lista de logs do produto
        """
        query = """
            SELECT data_hora, operacao, produto_nome, quantidade, observacao 
            FROM historico 
            WHERE produto_nome = ?
            ORDER BY id DESC
        """
        return self._execute_query(query, (produto_nome,))
    
    def get_logs_by_operation(self, operacao: str) -> List[Dict[str, Any]]:
        """
        Retorna logs de um tipo de operação específico.
        
        Args:
            operacao: Tipo de operação (ENTRADA, SAIDA, etc)
            
        Returns:
            Lista de logs da operação
        """
        query = """
            SELECT data_hora, operacao, produto_nome, quantidade, observacao 
            FROM historico 
            WHERE operacao = ?
            ORDER BY id DESC
        """
        return self._execute_query(query, (operacao,))
    
    def get_logs_by_date_range(self, start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """
        Retorna logs em um intervalo de datas.
        
        Args:
            start_date: Data inicial (formato: YYYY-MM-DD HH:MM:SS)
            end_date: Data final (formato: YYYY-MM-DD HH:MM:SS)
            
        Returns:
            Lista de logs no intervalo
        """
        query = """
            SELECT data_hora, operacao, produto_nome, quantidade, observacao 
            FROM historico 
            WHERE data_hora BETWEEN ? AND ?
            ORDER BY id DESC
        """
        return self._execute_query(query, (start_date, end_date))
    
    def get_exit_count_by_product(self) -> Dict[str, int]:
        """
        Retorna contagem de saídas por produto.
        Útil para relatório de Curva ABC.
        
        Returns:
            Dicionário {produto_nome: quantidade_total_saidas}
        """
        query = """
            SELECT produto_nome, SUM(quantidade) as total
            FROM historico
            WHERE operacao LIKE '%SAIDA%'
            GROUP BY produto_nome
        """
        results = self._execute_query(query)
        
        # Converte para dicionário
        return {row['produto_nome']: row['total'] for row in results}
    
    def count_logs(self) -> int:
        """
        Retorna número total de logs.
        
        Returns:
            Quantidade de registros no histórico
        """
        return self._count("historico")
    
    def delete_old_logs(self, days: int) -> int:
        """
        Remove logs mais antigos que X dias.
        Útil para manutenção do banco.
        
        Args:
            days: Número de dias para manter
            
        Returns:
            Número de logs removidos
        """
        command = """
            DELETE FROM historico 
            WHERE data_hora < datetime('now', '-' || ? || ' days')
        """
        return self._execute_command(command, (days,))
    
    def clear_all_logs(self) -> int:
        """
        Remove todos os logs do histórico.
        CUIDADO: Operação irreversível!
        
        Returns:
            Número de logs removidos
        """
        command = "DELETE FROM historico"
        return self._execute_command(command)
