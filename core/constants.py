"""
System constants.
Centralizes fixed values used across the project.
"""

# System version
APP_VERSION = "2.1.2"
MIGRATION_VERSION = "2.1.0"

# Update URLs
UPDATE_MANIFEST_URL = "https://github.com/yBlackH4t/ChronosInventory/releases/latest/download/latest.json"
UPDATE_TIMEOUT = 10

# Inventory locations
MAX_LOCATIONS = 5

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
    "INSUFFICIENT_STOCK": "Saldo insuficiente em {location}",
}
