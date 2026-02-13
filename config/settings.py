"""
Configurações centralizadas do sistema.
"""

from core.constants import APP_VERSION, UPDATE_MANIFEST_URL, UPDATE_TIMEOUT


class Settings:
    """
    Classe de configurações do sistema.
    Centraliza todas as configurações em um único local.
    """
    
    # Versão
    VERSION = APP_VERSION
    
    # Atualização
    UPDATE_URL = UPDATE_MANIFEST_URL
    UPDATE_TIMEOUT = UPDATE_TIMEOUT
    
    # Changelog
    CHANGELOG = {
        "1.2.1": """
        • SISTEMA: Banco de dados movido para AppData com 
        migração automática de versões antigas, instalador mudou a posição
        do diretorio para C:\\Program Files\\ .
        • CORREÇÃO: Resolvido travamento na inicialização (WMI Fix).
        • UI: Clique nos cabeçalhos da tabela para ordenar colunas.
        • SEGURANÇA: Backups automáticos antes de atualizações críticas.
        • MELHORIAS: Janela de histórico corrigida e validação de cadastros.
        """
    }
    
    @classmethod
    def get_changelog(cls, version: str = None) -> str:
        """
        Retorna changelog de uma versão específica ou da versão atual.
        
        Args:
            version: Versão específica (opcional)
            
        Returns:
            Texto do changelog
        """
        version = version or cls.VERSION
        return cls.CHANGELOG.get(version, "Sem notas para esta versão.")
