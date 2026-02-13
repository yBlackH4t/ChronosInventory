"""
Serviço de atualização do sistema.
Responsabilidade: Gerenciar verificação e instalação de atualizações.
"""

import os
import time
import requests
import subprocess
from typing import Optional, Tuple
from core.utils.validators import Validators
from core.utils.file_utils import FileUtils
from core.exceptions import UpdateException
from core.constants import UPDATE_MANIFEST_URL, UPDATE_TIMEOUT, APP_VERSION


class UpdateService:
    """
    Serviço de Atualização.
    Responsabilidade única: Gerenciar atualizações do sistema.
    """
    
    def check_for_updates(self) -> Optional[Tuple[str, str]]:
        """
        Verifica se há nova versão disponível.
        
        Returns:
            Tupla (versão: str, url_download: str) ou None se não houver atualização
            
        Raises:
            UpdateException: Se falhar ao verificar
        """
        try:
            # Cache busting: adiciona timestamp para evitar cache
            url = f"{UPDATE_MANIFEST_URL}?t={int(time.time())}"
            
            response = requests.get(url, timeout=UPDATE_TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            remote_version = data.get("latest_version", "0.0.0")
            download_url = data.get("installer_url")
            
            # Compara versões
            local_version = Validators.parse_version(APP_VERSION)
            remote_version_tuple = Validators.parse_version(remote_version)
            
            if remote_version_tuple > local_version:
                return remote_version, download_url
            
            return None
            
        except requests.RequestException as e:
            raise UpdateException(f"Erro ao verificar atualizações: {e}")
        except Exception as e:
            raise UpdateException(f"Erro inesperado ao verificar atualizações: {e}")
    
    def download_installer(self, url: str, version: str) -> str:
        """
        Baixa instalador da atualização.
        
        Args:
            url: URL do instalador
            version: Versão sendo baixada
            
        Returns:
            Caminho do instalador baixado
            
        Raises:
            UpdateException: Se falhar ao baixar
        """
        try:
            # Define caminho de destino
            temp_dir = FileUtils.get_temp_directory()
            filename = f"UpdateEstoque_v{version}.exe"
            dest_path = os.path.join(temp_dir, filename)
            
            # Remove arquivo anterior se existir
            if FileUtils.file_exists(dest_path):
                FileUtils.delete_file(dest_path)
            
            # Baixa instalador
            response = requests.get(url, stream=True, timeout=UPDATE_TIMEOUT)
            response.raise_for_status()
            
            with open(dest_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            return dest_path
            
        except requests.RequestException as e:
            # Remove arquivo corrompido se existir
            if 'dest_path' in locals() and FileUtils.file_exists(dest_path):
                FileUtils.delete_file(dest_path)
            raise UpdateException(f"Erro ao baixar instalador: {e}")
        except Exception as e:
            raise UpdateException(f"Erro inesperado ao baixar instalador: {e}")
    
    def run_installer(self, installer_path: str) -> bool:
        """
        Executa instalador da atualização.
        
        Args:
            installer_path: Caminho do instalador
            
        Returns:
            True se executado com sucesso
            
        Raises:
            UpdateException: Se falhar ao executar
        """
        try:
            # Flags do Inno Setup:
            # /VERYSILENT - Não mostra janela de progresso
            # /SP- - Pula verificação de espaço
            # /SUPPRESSMSGBOXES - Suprime caixas de mensagem
            # /NORESTART - Não reinicia automaticamente
            
            subprocess.Popen([
                installer_path,
                "/VERYSILENT",
                "/SP-",
                "/SUPPRESSMSGBOXES",
                "/NORESTART"
            ])
            
            return True
            
        except Exception as e:
            raise UpdateException(f"Erro ao executar instalador: {e}")
    
    def get_current_version(self) -> str:
        """
        Retorna versão atual do sistema.
        
        Returns:
            String de versão
        """
        return APP_VERSION
    
    def is_version_newer(self, version: str) -> bool:
        """
        Verifica se uma versão é mais nova que a atual.
        
        Args:
            version: Versão a comparar
            
        Returns:
            True se versão é mais nova, False caso contrário
        """
        current = Validators.parse_version(APP_VERSION)
        other = Validators.parse_version(version)
        return other > current
