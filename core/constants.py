"""
Constantes do sistema.
Centraliza valores fixos utilizados em todo o projeto.
"""

# Versão do Sistema
APP_VERSION = "1.1.4"

# URLs de Atualização
UPDATE_MANIFEST_URL = "https://github.com/yBlackH4t/ChronosInventory/releases/latest/download/latest.json"
UPDATE_TIMEOUT = 10

# Changelog
CHANGELOG = {
    "1.2.2": """
        • IMAGENS: Fotos agora são armazenadas no banco de dados (BLOB)
        ao invés de arquivos separados. Cada imagem é vinculada ao ID do produto.
        • OTIMIZAÇÃO: Imagens são automaticamente redimensionadas e comprimidas
        (max 800x800, JPEG 85%) para economizar espaço no banco.
        • MIGRAÇÃO: Sistema migra automaticamente para a nova estrutura.
        • PERFORMANCE: Cache de imagens melhorado para carregamento mais rápido.
    """,
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

# Banco de Dados
DB_NAME = "estoque.db"
LEGACY_DB_PATH = r"C:\Gestao de Estoque\estoque.db"

# Diretórios
APP_NAME = "Chronos Inventory"
IMAGES_FOLDER = "imagens"
BACKUPS_FOLDER = "backups"

# Extensões de Arquivo
SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".png", ".jpeg"]
SUPPORTED_EXCEL_EXTENSIONS = [".xlsx", ".xls"]

# Configurações de UI
WINDOW_TITLE = f"Chronos Inventory - v{APP_VERSION}"
WINDOW_SIZE = "1240x820"
SIDEBAR_WIDTH = 240
PHOTO_SIZE = (180, 180)
IMAGE_CACHE_LIMIT = 20

# Configurações de Tabela
TABLE_COLUMNS = {
    "ID": {"width": 60, "anchor": "center"},
    "NOME": {"width": 550, "anchor": "w"},
    "CANOAS": {"width": 120, "anchor": "center"},
    "PF": {"width": 120, "anchor": "center"}
}

# Operações de Estoque
OPERATION_TYPES = {
    "ENTRADA": "Entrada",
    "SAIDA": "Saida",
    "TRANSFERENCIA": "Transf",
    "CADASTRO": "CADASTRO",
    "EXCLUSAO": "EXCLUSAO"
}

# Locais de Estoque
STOCK_LOCATIONS = {
    "CANOAS": "Canoas",
    "PASSO_FUNDO": "Passo Fundo"
}

# Direções de Transferência
TRANSFER_DIRECTIONS = {
    "CANOAS_TO_PF": "Canoas -> PF",
    "PF_TO_CANOAS": "PF -> Canoas"
}

# Cores da UI (Dark Theme)
UI_COLORS = {
    "PRIMARY": "#2980b9",
    "SUCCESS": "#27ae60",
    "DANGER": "#e74c3c",
    "WARNING": "#f39c12",
    "INFO": "#3498db",
    "DARK": "#2b2b2b",
    "LIGHT": "#ecf0f1",
    "CANOAS_CARD": "#1f538d",
    "PF_CARD": "#d35400"
}

# Configurações de Relatório
REPORT_PAGE_SIZE = "A4"
REPORT_COLUMN_WIDTHS_ABC = [300, 80, 70]
REPORT_COLUMN_WIDTHS_STOCK = [50, 250, 75, 75]

# Classificação ABC
ABC_CLASSIFICATION = {
    "A": {"min": 50, "label": "A"},
    "B": {"min": 10, "label": "B"},
    "C": {"min": 0, "label": "C"}
}

# Formatos de Data
DATE_FORMAT_DISPLAY = "%d/%m/%Y %H:%M:%S"
DATE_FORMAT_DB = "%Y-%m-%d %H:%M:%S"
DATE_FORMAT_FILE = "%Y%m%d_%H%M%S"

# Mensagens do Sistema
MESSAGES = {
    "NO_SELECTION": "Selecione um item na tabela para operar...",
    "INVALID_QUANTITY": "Quantidade inválida.",
    "INSUFFICIENT_STOCK": "Saldo insuficiente em {location}",
    "PRODUCT_REQUIRED": "O nome do produto é obrigatório.",
    "QUANTITY_REQUIRED": "As quantidades devem ser números inteiros.",
    "NEGATIVE_QUANTITY": "As quantidades não podem ser negativas.",
    "MIN_STOCK_REQUIRED": "É necessário informar ao menos uma unidade em estoque.",
    "DELETE_CONFIRM": "Apagar produto e sua foto?",
    "PHOTO_DELETE_CONFIRM": "Apagar foto permanentemente?",
    "UPDATE_AVAILABLE": "Versão {version} disponível. Baixar?",
    "SYSTEM_UPDATED": "O sistema já está atualizado!",
    "BACKUP_SUCCESS": "Backup (Excel + DB) exportado com sucesso!",
    "MIGRATION_SUCCESS": "Migração concluída! Excel movido para backups/{filename}",
    "DB_CONNECTED": "Sistema conectado ao Banco de Dados SQLite."
}
