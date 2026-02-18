"""
Gerenciador de migracoes de banco.
Responsabilidade: aplicar patches versionados com snapshot e rollback seguro.
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple

from core.constants import APP_VERSION
from core.database.connection import DatabaseConnection
from core.exceptions import MigrationException
from core.utils.validators import Validators


MigrationHandler = Callable[[sqlite3.Connection], None]


@dataclass(frozen=True)
class MigrationStep:
    version: str
    handler: MigrationHandler


class MigrationManager:
    """
    Gerencia migracoes de schema com controle de versao.
    """

    def __init__(self, db_connection: Optional[DatabaseConnection] = None):
        self.db_connection = db_connection or DatabaseConnection()

    def check_and_run_migrations(self) -> Tuple[bool, str]:
        conn: Optional[sqlite3.Connection] = self.db_connection.get_connection()
        backup_path: Optional[str] = None
        try:
            current_version = self._get_db_version(conn)
            current_tuple = Validators.parse_version(current_version)
            target_tuple = Validators.parse_version(APP_VERSION)

            if current_tuple >= target_tuple:
                return False, current_version

            backup_path = self._create_backup(current_version)
            for step in self._get_migration_steps():
                step_tuple = Validators.parse_version(step.version)
                if step_tuple <= current_tuple or step_tuple > target_tuple:
                    continue
                step.handler(conn)
                current_version = step.version
                current_tuple = step_tuple

            self._set_db_version(conn, APP_VERSION)
            conn.commit()
            return True, APP_VERSION
        except Exception as exc:
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
            conn = None
            if backup_path:
                self._restore_backup(backup_path)
            raise MigrationException(f"Erro na migracao de banco: {exc}") from exc
        finally:
            if conn is not None:
                conn.close()

    def get_current_database_version(self) -> str:
        conn = self.db_connection.get_connection()
        try:
            return self._get_db_version(conn)
        finally:
            conn.close()

    def _get_migration_steps(self) -> List[MigrationStep]:
        return [
            MigrationStep("1.0.1", self._migration_add_product_observacao),
            MigrationStep("1.0.2", self._migration_add_movimento_metadata),
            MigrationStep("1.0.3", self._migration_create_product_images),
            MigrationStep("1.0.4", self._migration_create_indexes),
        ]

    def _migration_add_product_observacao(self, conn: sqlite3.Connection) -> None:
        if not self._column_exists(conn, "produtos", "observacao"):
            conn.execute("ALTER TABLE produtos ADD COLUMN observacao TEXT;")

    def _migration_add_movimento_metadata(self, conn: sqlite3.Connection) -> None:
        if not self._column_exists(conn, "movimentacoes", "natureza"):
            conn.execute(
                "ALTER TABLE movimentacoes ADD COLUMN natureza TEXT NOT NULL DEFAULT 'OPERACAO_NORMAL';"
            )
        if not self._column_exists(conn, "movimentacoes", "local_externo"):
            conn.execute("ALTER TABLE movimentacoes ADD COLUMN local_externo TEXT;")
        if not self._column_exists(conn, "movimentacoes", "documento"):
            conn.execute("ALTER TABLE movimentacoes ADD COLUMN documento TEXT;")
        if not self._column_exists(conn, "movimentacoes", "movimento_ref_id"):
            conn.execute("ALTER TABLE movimentacoes ADD COLUMN movimento_ref_id INTEGER;")

        conn.execute(
            """
            UPDATE movimentacoes
            SET natureza = 'OPERACAO_NORMAL'
            WHERE natureza IS NULL OR natureza = ''
            """
        )

    def _migration_create_product_images(self, conn: sqlite3.Connection) -> None:
        conn.execute(
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

        if self._column_exists(conn, "produtos", "imagem"):
            total = conn.execute("SELECT COUNT(*) FROM product_images").fetchone()[0]
            if int(total or 0) == 0:
                rows = conn.execute("SELECT id, imagem FROM produtos WHERE imagem IS NOT NULL").fetchall()
                for row in rows:
                    conn.execute(
                        """
                        INSERT INTO product_images (product_id, image_data, mime_type, is_primary)
                        VALUES (?, ?, 'image/jpeg', 1)
                        """,
                        (row[0], row[1]),
                    )

    def _migration_create_indexes(self, conn: sqlite3.Connection) -> None:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data_hora);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_produto_data ON movimentacoes(produto_id, data_hora);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_data ON movimentacoes(tipo, data_hora);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_origem_data ON movimentacoes(tipo, origem, data_hora);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mov_tipo_destino_data ON movimentacoes(tipo, destino, data_hora);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary);")

    def _create_backup(self, db_version: str) -> str:
        db_path = self.db_connection.get_database_path()
        backup_path = f"{db_path}.pre_migration_v{db_version}.bak"
        src_conn = None
        dst_conn = None
        try:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            src_conn = sqlite3.connect(db_path)
            src_conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            dst_conn = sqlite3.connect(backup_path)
            with dst_conn:
                src_conn.backup(dst_conn)
            return backup_path
        finally:
            if dst_conn is not None:
                dst_conn.close()
            if src_conn is not None:
                src_conn.close()

    def _restore_backup(self, backup_path: str) -> None:
        db_path = self.db_connection.get_database_path()
        src_conn = None
        dst_conn = None
        try:
            src_conn = sqlite3.connect(backup_path)
            dst_conn = sqlite3.connect(db_path)
            with dst_conn:
                src_conn.backup(dst_conn)
        finally:
            if dst_conn is not None:
                dst_conn.close()
            if src_conn is not None:
                src_conn.close()

        for suffix in ("-wal", "-shm"):
            aux = db_path + suffix
            if os.path.exists(aux):
                os.remove(aux)

    def _get_db_version(self, conn: sqlite3.Connection) -> str:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS system_info (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            """
        )
        row = conn.execute("SELECT value FROM system_info WHERE key = 'db_version'").fetchone()
        if row and row[0]:
            return str(row[0])
        conn.execute(
            "INSERT OR REPLACE INTO system_info (key, value) VALUES ('db_version', ?)",
            ("0.0.0",),
        )
        return "0.0.0"

    def _set_db_version(self, conn: sqlite3.Connection, version: str) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO system_info (key, value) VALUES ('db_version', ?)",
            (version,),
        )

    def _column_exists(self, conn: sqlite3.Connection, table: str, column: str) -> bool:
        rows = conn.execute(f"PRAGMA table_info({table});").fetchall()
        return any(row[1] == column for row in rows)
