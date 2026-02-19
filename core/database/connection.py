"""
Gerenciador de conexao com banco de dados SQLite.
Implementa padrao Singleton para garantir unica instancia.
"""

import os
import sqlite3
from typing import Optional

from core.constants import LEGACY_DB_PATH
from core.exceptions import DatabaseException
from core.utils.file_utils import FileUtils


class DatabaseConnection:
    """
    Singleton para gerenciar conexao com SQLite.
    Responsabilidade unica: fornecer conexoes configuradas ao banco.
    """

    _instance: Optional["DatabaseConnection"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseConnection, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.db_path = FileUtils.get_database_path()
        self._handle_legacy_migration()
        print(f"Database path in use: {self.db_path}")
        self._initialized = True
        self._initialize_database()

    def _handle_legacy_migration(self) -> None:
        """
        Importa banco legado se necessario.
        So importa se legado existir e banco novo ainda nao existir.
        """
        migration = FileUtils.migrate_legacy_data_to(os.path.dirname(self.db_path))
        if migration.get("copied_files", 0) > 0:
            print(
                "Migracao de dados legados concluida: "
                f"{migration['copied_files']} arquivo(s) para '{self.db_path}'."
            )

        if not os.path.exists(self.db_path) and os.path.exists(LEGACY_DB_PATH):
            print(f"Banco de dados legado encontrado em '{LEGACY_DB_PATH}'. Importando para AppData...")
            try:
                FileUtils.copy_file(LEGACY_DB_PATH, self.db_path)
                print("Copia do banco legado realizada com sucesso.")

                try:
                    FileUtils.rename_file(LEGACY_DB_PATH, LEGACY_DB_PATH + ".migrated_to_appdata")
                    print("Arquivo legado renomeado com sucesso.")
                except Exception as exc:
                    print(
                        "AVISO: Copia bem sucedida, mas nao foi possivel renomear o arquivo antigo. "
                        f"Erro: {exc}"
                    )
            except Exception as exc:
                print(f"ERRO CRITICO: Falha ao copiar banco de dados legado. {exc}")
                if os.path.exists(self.db_path):
                    FileUtils.delete_file(self.db_path)
                raise DatabaseException(f"Falha ao importar banco legado: {exc}")

    def get_connection(self) -> sqlite3.Connection:
        """
        Retorna nova conexao com row_factory e pragmas de performance.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            return conn
        except Exception as exc:
            raise DatabaseException(f"Erro ao conectar ao banco de dados: {exc}")

    def _initialize_database(self) -> None:
        """
        Cria tabelas e indices necessarios.
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS produtos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    qtd_canoas INTEGER DEFAULT 0,
                    qtd_pf INTEGER DEFAULT 0,
                    imagem BLOB,
                    observacao TEXT,
                    ativo INTEGER NOT NULL DEFAULT 1,
                    inativado_em DATETIME,
                    motivo_inativacao TEXT
                );
                """
            )

            cursor.execute("PRAGMA table_info(produtos);")
            columns = {row[1] for row in cursor.fetchall()}
            if "observacao" not in columns:
                cursor.execute("ALTER TABLE produtos ADD COLUMN observacao TEXT;")
            if "ativo" not in columns:
                cursor.execute("ALTER TABLE produtos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;")
            if "inativado_em" not in columns:
                cursor.execute("ALTER TABLE produtos ADD COLUMN inativado_em DATETIME;")
            if "motivo_inativacao" not in columns:
                cursor.execute("ALTER TABLE produtos ADD COLUMN motivo_inativacao TEXT;")
            cursor.execute("UPDATE produtos SET ativo = 1 WHERE ativo IS NULL;")

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS historico (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    operacao TEXT,
                    produto_nome TEXT,
                    quantidade INTEGER,
                    observacao TEXT
                );
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS movimentacoes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    tipo TEXT NOT NULL,
                    produto_id INTEGER NOT NULL,
                    quantidade INTEGER NOT NULL,
                    origem TEXT,
                    destino TEXT,
                    observacao TEXT,
                    natureza TEXT NOT NULL DEFAULT 'OPERACAO_NORMAL',
                    motivo_ajuste TEXT,
                    local_externo TEXT,
                    documento TEXT,
                    movimento_ref_id INTEGER,
                    FOREIGN KEY(produto_id) REFERENCES produtos(id)
                );
                """
            )

            cursor.execute("PRAGMA table_info(movimentacoes);")
            movement_columns = {row[1] for row in cursor.fetchall()}
            if "natureza" not in movement_columns:
                cursor.execute(
                    "ALTER TABLE movimentacoes ADD COLUMN natureza TEXT NOT NULL DEFAULT 'OPERACAO_NORMAL';"
                )
            if "motivo_ajuste" not in movement_columns:
                cursor.execute("ALTER TABLE movimentacoes ADD COLUMN motivo_ajuste TEXT;")
            if "local_externo" not in movement_columns:
                cursor.execute("ALTER TABLE movimentacoes ADD COLUMN local_externo TEXT;")
            if "documento" not in movement_columns:
                cursor.execute("ALTER TABLE movimentacoes ADD COLUMN documento TEXT;")
            if "movimento_ref_id" not in movement_columns:
                cursor.execute("ALTER TABLE movimentacoes ADD COLUMN movimento_ref_id INTEGER;")

            cursor.execute(
                """
                UPDATE movimentacoes
                SET natureza = 'OPERACAO_NORMAL'
                WHERE natureza IS NULL OR natureza = ''
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS product_images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    image_data BLOB NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(product_id) REFERENCES produtos(id) ON DELETE CASCADE
                );
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    local TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'ABERTO',
                    observacao TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    applied_at DATETIME
                );
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    produto_id INTEGER NOT NULL,
                    qtd_sistema INTEGER NOT NULL,
                    qtd_fisico INTEGER,
                    divergencia INTEGER,
                    motivo_ajuste TEXT,
                    observacao TEXT,
                    applied_movement_id INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY(produto_id) REFERENCES produtos(id),
                    FOREIGN KEY(applied_movement_id) REFERENCES movimentacoes(id),
                    UNIQUE(session_id, produto_id)
                );
                """
            )

            # Indices de listagem/analytics
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_produtos_ativo_nome ON produtos(ativo, nome);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_produto_data ON movimentacoes(produto_id, data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_data ON movimentacoes(tipo, data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_origem_data ON movimentacoes(tipo, origem, data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_destino_data ON movimentacoes(tipo, destino, data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mov_natureza_data ON movimentacoes(natureza, data_hora);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventory_sessions_status ON inventory_sessions(status, created_at);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventory_counts_session ON inventory_counts(session_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventory_counts_divergencia ON inventory_counts(session_id, divergencia);")

            # Migra imagens legadas de produtos.imagem para tabela dedicada.
            cursor.execute("SELECT COUNT(*) as total FROM product_images;")
            has_images = cursor.fetchone()[0] > 0
            if not has_images and "imagem" in columns:
                cursor.execute("SELECT id, imagem FROM produtos WHERE imagem IS NOT NULL;")
                for row in cursor.fetchall():
                    cursor.execute(
                        """
                        INSERT INTO product_images (product_id, image_data, mime_type, is_primary)
                        VALUES (?, ?, 'image/jpeg', 1)
                        """,
                        (row[0], row[1]),
                    )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS system_info (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
                """
            )

            cursor.execute("SELECT value FROM system_info WHERE key='db_version'")
            row = cursor.fetchone()
            if not row:
                from core.constants import APP_VERSION

                cursor.execute(
                    "INSERT INTO system_info (key, value) VALUES (?, ?)",
                    ("db_version", APP_VERSION),
                )

            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao inicializar banco de dados: {exc}")
        finally:
            conn.close()

    def execute_query(self, query: str, params: tuple = ()) -> list:
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
        except Exception as exc:
            raise DatabaseException(f"Erro ao executar query: {exc}")
        finally:
            conn.close()

    def execute_command(self, command: str, params: tuple = ()) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(command, params)
            conn.commit()
            return cursor.rowcount
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando: {exc}")
        finally:
            conn.close()

    def get_database_path(self) -> str:
        return self.db_path
