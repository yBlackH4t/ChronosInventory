"""
System constants.
Centralizes fixed values used across the project.
"""

# System version
APP_VERSION = "1.2.2"

# Update URLs
UPDATE_MANIFEST_URL = "https://github.com/yBlackH4t/ChronosInventory/releases/latest/download/latest.json"
UPDATE_TIMEOUT = 10

# Legacy changelog texts (kept for backward compatibility with old code paths)
CHANGELOG = {
    "1.2.2": """
        - IMAGES: Photos are now stored in the database (BLOB)
          instead of separate files. Each image is linked to product ID.
        - OPTIMIZATION: Images are automatically resized and compressed
          (max 800x800, JPEG 85%) to save database space.
        - MIGRATION: System migrates automatically to the new structure.
        - PERFORMANCE: Improved image cache for faster loading.
    """,
    "1.2.1": """
        - SYSTEM: Database moved to AppData with automatic migration
          from old versions; installer default path changed to
          C:\\Program Files\\.
        - FIX: Startup freeze resolved (WMI fix).
        - UI: Click table headers to sort columns.
        - SECURITY: Automatic backups before critical updates.
        - IMPROVEMENTS: History window and registration validation fixes.
    """,
}

# Database
DB_NAME = "estoque.db"
LEGACY_DB_PATH = r"C:\Gestao de Estoque\estoque.db"

# Directories
APP_NAME = "Chronos Inventory"
IMAGES_FOLDER = "imagens"
BACKUPS_FOLDER = "backups"

# File extensions
SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".png", ".jpeg"]
SUPPORTED_EXCEL_EXTENSIONS = [".xlsx", ".xls"]

# UI settings (legacy desktop compatibility)
WINDOW_TITLE = f"Chronos Inventory - v{APP_VERSION}"
WINDOW_SIZE = "1240x820"
SIDEBAR_WIDTH = 240
PHOTO_SIZE = (180, 180)
IMAGE_CACHE_LIMIT = 20

# Table settings
TABLE_COLUMNS = {
    "ID": {"width": 60, "anchor": "center"},
    "NOME": {"width": 550, "anchor": "w"},
    "CANOAS": {"width": 120, "anchor": "center"},
    "PF": {"width": 120, "anchor": "center"},
}

# Stock operation types
OPERATION_TYPES = {
    "ENTRADA": "Entrada",
    "SAIDA": "Saida",
    "TRANSFERENCIA": "Transf",
    "CADASTRO": "CADASTRO",
    "EXCLUSAO": "EXCLUSAO",
}

# Stock locations
STOCK_LOCATIONS = {
    "CANOAS": "Canoas",
    "PASSO_FUNDO": "Passo Fundo",
}

# Transfer directions
TRANSFER_DIRECTIONS = {
    "CANOAS_TO_PF": "Canoas -> PF",
    "PF_TO_CANOAS": "PF -> Canoas",
}

# UI colors (legacy desktop compatibility)
UI_COLORS = {
    "PRIMARY": "#2980b9",
    "SUCCESS": "#27ae60",
    "DANGER": "#e74c3c",
    "WARNING": "#f39c12",
    "INFO": "#3498db",
    "DARK": "#2b2b2b",
    "LIGHT": "#ecf0f1",
    "CANOAS_CARD": "#1f538d",
    "PF_CARD": "#d35400",
}

# Report settings
REPORT_PAGE_SIZE = "A4"
REPORT_COLUMN_WIDTHS_ABC = [300, 80, 70]
REPORT_COLUMN_WIDTHS_STOCK = [50, 250, 75, 75]

# ABC classification
ABC_CLASSIFICATION = {
    "A": {"min": 50, "label": "A"},
    "B": {"min": 10, "label": "B"},
    "C": {"min": 0, "label": "C"},
}

# Date formats
DATE_FORMAT_DISPLAY = "%d/%m/%Y %H:%M:%S"
DATE_FORMAT_DB = "%Y-%m-%d %H:%M:%S"
DATE_FORMAT_FILE = "%Y%m%d_%H%M%S"

# System messages
MESSAGES = {
    "NO_SELECTION": "Selecione um item na tabela para operar...",
    "INVALID_QUANTITY": "Quantidade invalida.",
    "INSUFFICIENT_STOCK": "Saldo insuficiente em {location}",
    "PRODUCT_REQUIRED": "O nome do produto e obrigatorio.",
    "QUANTITY_REQUIRED": "As quantidades devem ser numeros inteiros.",
    "NEGATIVE_QUANTITY": "As quantidades nao podem ser negativas.",
    "MIN_STOCK_REQUIRED": "Estoque inicial nao pode ser 0. Use entrada/devolucao para registrar depois.",
    "DELETE_CONFIRM": "Apagar produto e sua foto?",
    "PHOTO_DELETE_CONFIRM": "Apagar foto permanentemente?",
    "UPDATE_AVAILABLE": "Versao {version} disponivel. Baixar?",
    "SYSTEM_UPDATED": "O sistema ja esta atualizado!",
    "BACKUP_SUCCESS": "Backup (Excel + DB) exportado com sucesso!",
    "MIGRATION_SUCCESS": "Migracao concluida! Excel movido para backups/{filename}",
    "DB_CONNECTED": "Sistema conectado ao banco de dados SQLite.",
}
