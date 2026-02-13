"""
Repository para operacoes com produtos.
Responsabilidade unica: acesso a dados de produtos.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.database.repositories.base_repository import BaseRepository
from core.exceptions import DatabaseException, ProductNotFoundException


class ProductRepository(BaseRepository):
    """Repository para gerenciar produtos no banco de dados."""

    _ALLOWED_SORT_COLUMNS = {
        "id": "id",
        "nome": "nome",
        "qtd_canoas": "qtd_canoas",
        "qtd_pf": "qtd_pf",
    }

    def get_all(self, search_term: str = "") -> List[Dict[str, Any]]:
        if search_term:
            query = "SELECT * FROM produtos WHERE nome LIKE ? ORDER BY nome"
            return self._execute_query(query, (f"%{search_term}%",))
        query = "SELECT * FROM produtos ORDER BY nome"
        return self._execute_query(query)

    def get_all_paginated(
        self,
        search_term: str = "",
        sort_column: str = "nome",
        sort_direction: str = "ASC",
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        sort_col = self._ALLOWED_SORT_COLUMNS.get(sort_column, "nome")
        sort_dir = "DESC" if str(sort_direction).upper() == "DESC" else "ASC"

        if search_term:
            query = f"SELECT * FROM produtos WHERE nome LIKE ? ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?"
            return self._execute_query(query, (f"%{search_term}%", limit, offset))

        query = f"SELECT * FROM produtos ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?"
        return self._execute_query(query, (limit, offset))

    def count_filtered(self, search_term: str = "") -> int:
        if search_term:
            result = self._execute_query(
                "SELECT COUNT(*) as total FROM produtos WHERE nome LIKE ?",
                (f"%{search_term}%",),
            )
        else:
            result = self._execute_query("SELECT COUNT(*) as total FROM produtos")
        return result[0]["total"] if result else 0

    def get_by_id(self, product_id: int) -> Optional[Dict[str, Any]]:
        results = self._execute_query("SELECT * FROM produtos WHERE id = ?", (product_id,))
        return results[0] if results else None

    def add(self, nome: str, qtd_canoas: int, qtd_pf: int, observacao: str | None = None) -> int:
        command = """
            INSERT INTO produtos (nome, qtd_canoas, qtd_pf, observacao)
            VALUES (?, ?, ?, ?)
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(command, (nome, qtd_canoas, qtd_pf, observacao))
            conn.commit()
            return int(cursor.lastrowid)
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando: {exc}")
        finally:
            conn.close()

    def update_stock(self, product_id: int, delta_canoas: int, delta_pf: int) -> bool:
        command = """
            UPDATE produtos
            SET qtd_canoas = qtd_canoas + ?,
                qtd_pf = qtd_pf + ?
            WHERE id = ?
        """
        rows_affected = self._execute_command(command, (delta_canoas, delta_pf, product_id))
        if rows_affected == 0:
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
        return True

    def set_stock(self, product_id: int, qtd_canoas: int, qtd_pf: int) -> bool:
        command = """
            UPDATE produtos
            SET qtd_canoas = ?,
                qtd_pf = ?
            WHERE id = ?
        """
        rows_affected = self._execute_command(command, (qtd_canoas, qtd_pf, product_id))
        if rows_affected == 0:
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
        return True

    def update_details(
        self,
        product_id: int,
        nome: str,
        qtd_canoas: int,
        qtd_pf: int,
        observacao: str | None = None,
    ) -> bool:
        command = """
            UPDATE produtos
            SET nome = ?, qtd_canoas = ?, qtd_pf = ?, observacao = ?
            WHERE id = ?
        """
        rows_affected = self._execute_command(command, (nome, qtd_canoas, qtd_pf, observacao, product_id))
        if rows_affected == 0:
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
        return True

    def delete(self, product_id: int) -> bool:
        rows_affected = self._execute_command("DELETE FROM produtos WHERE id = ?", (product_id,))
        if rows_affected == 0:
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
        return True

    def exists(self, product_id: int) -> bool:
        return self._exists("produtos", "id = ?", (product_id,))

    def get_total_stock_canoas(self) -> int:
        result = self._execute_query("SELECT SUM(qtd_canoas) as total FROM produtos")
        return result[0]["total"] if result and result[0]["total"] else 0

    def get_total_stock_pf(self) -> int:
        result = self._execute_query("SELECT SUM(qtd_pf) as total FROM produtos")
        return result[0]["total"] if result and result[0]["total"] else 0

    def count_products(self) -> int:
        return self._count("produtos")

    def bulk_insert(self, products: List[tuple]) -> int:
        command = """
            INSERT OR REPLACE INTO produtos (id, nome, qtd_canoas, qtd_pf)
            VALUES (?, ?, ?, ?)
        """
        return self._execute_many(command, products)

    # ---------------------------------------------------------------------
    # Imagens (novo modelo: tabela product_images)
    # ---------------------------------------------------------------------
    def list_product_images(self, product_id: int) -> List[Dict[str, Any]]:
        query = """
            SELECT id, product_id, mime_type, is_primary, created_at, LENGTH(image_data) as size_bytes
            FROM product_images
            WHERE product_id = ?
            ORDER BY is_primary DESC, id ASC
        """
        return self._execute_query(query, (product_id,))

    def count_product_images(self, product_id: int) -> int:
        result = self._execute_query(
            "SELECT COUNT(*) as total FROM product_images WHERE product_id = ?",
            (product_id,),
        )
        return int(result[0]["total"] if result else 0)

    def get_product_image_by_id(self, product_id: int, image_id: int) -> Optional[Dict[str, Any]]:
        query = """
            SELECT id, product_id, image_data, mime_type, is_primary, created_at
            FROM product_images
            WHERE product_id = ? AND id = ?
        """
        rows = self._execute_query(query, (product_id, image_id))
        return rows[0] if rows else None

    def get_primary_product_image(self, product_id: int) -> Optional[Dict[str, Any]]:
        rows = self._execute_query(
            """
            SELECT id, product_id, image_data, mime_type, is_primary, created_at
            FROM product_images
            WHERE product_id = ?
            ORDER BY is_primary DESC, id ASC
            LIMIT 1
            """,
            (product_id,),
        )
        return rows[0] if rows else None

    def add_product_image(
        self,
        product_id: int,
        image_bytes: bytes,
        mime_type: str,
        is_primary: bool = False,
    ) -> int:
        if not self.exists(product_id):
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")

        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")

            cursor.execute("SELECT COUNT(*) FROM product_images WHERE product_id = ?", (product_id,))
            total = int(cursor.fetchone()[0])
            final_primary = bool(is_primary or total == 0)

            if final_primary:
                cursor.execute("UPDATE product_images SET is_primary = 0 WHERE product_id = ?", (product_id,))

            cursor.execute(
                """
                INSERT INTO product_images (product_id, image_data, mime_type, is_primary)
                VALUES (?, ?, ?, ?)
                """,
                (product_id, image_bytes, mime_type, 1 if final_primary else 0),
            )
            image_id = int(cursor.lastrowid)
            conn.commit()
            return image_id
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao inserir imagem do produto: {exc}")
        finally:
            conn.close()

    def set_primary_product_image(self, product_id: int, image_id: int) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            cursor.execute(
                "SELECT 1 FROM product_images WHERE product_id = ? AND id = ?",
                (product_id, image_id),
            )
            if not cursor.fetchone():
                return False

            cursor.execute("UPDATE product_images SET is_primary = 0 WHERE product_id = ?", (product_id,))
            cursor.execute(
                "UPDATE product_images SET is_primary = 1 WHERE product_id = ? AND id = ?",
                (product_id, image_id),
            )
            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao definir imagem principal: {exc}")
        finally:
            conn.close()

    def delete_product_image(self, product_id: int, image_id: int) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            cursor.execute(
                "SELECT is_primary FROM product_images WHERE product_id = ? AND id = ?",
                (product_id, image_id),
            )
            row = cursor.fetchone()
            if not row:
                return False

            was_primary = int(row[0]) == 1
            cursor.execute(
                "DELETE FROM product_images WHERE product_id = ? AND id = ?",
                (product_id, image_id),
            )

            if was_primary:
                cursor.execute(
                    "SELECT id FROM product_images WHERE product_id = ? ORDER BY id ASC LIMIT 1",
                    (product_id,),
                )
                next_row = cursor.fetchone()
                if next_row:
                    cursor.execute(
                        "UPDATE product_images SET is_primary = 1 WHERE id = ?",
                        (next_row[0],),
                    )

            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao remover imagem do produto: {exc}")
        finally:
            conn.close()

    def clear_product_images(self, product_id: int) -> int:
        rows = self._execute_command("DELETE FROM product_images WHERE product_id = ?", (product_id,))
        # Mantem compatibilidade com campo legado.
        self._execute_command("UPDATE produtos SET imagem = NULL WHERE id = ?", (product_id,))
        return rows

    def replace_primary_product_image(self, product_id: int, image_bytes: bytes, mime_type: str) -> int:
        """
        Mantem semantica legada de "substituir imagem do produto".
        Se nao existir imagem, cria uma nova principal.
        """
        if not self.exists(product_id):
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")

        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            cursor.execute(
                "SELECT id FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1",
                (product_id,),
            )
            row = cursor.fetchone()

            if row:
                image_id = int(row[0])
                cursor.execute("UPDATE product_images SET is_primary = 0 WHERE product_id = ?", (product_id,))
                cursor.execute(
                    """
                    UPDATE product_images
                    SET image_data = ?, mime_type = ?, is_primary = 1
                    WHERE id = ?
                    """,
                    (image_bytes, mime_type, image_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO product_images (product_id, image_data, mime_type, is_primary)
                    VALUES (?, ?, ?, 1)
                    """,
                    (product_id, image_bytes, mime_type),
                )
                image_id = int(cursor.lastrowid)

            # Campo legado mantido para compatibilidade com tela antiga.
            cursor.execute("UPDATE produtos SET imagem = ? WHERE id = ?", (image_bytes, product_id))
            conn.commit()
            return image_id
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao atualizar imagem principal: {exc}")
        finally:
            conn.close()

    # ---------------------------------------------------------------------
    # Compatibilidade (metodos antigos)
    # ---------------------------------------------------------------------
    def get_product_image(self, product_id: int) -> Optional[bytes]:
        primary = self.get_primary_product_image(product_id)
        if primary and primary.get("image_data"):
            return primary["image_data"]

        # Fallback para banco legado sem migracao.
        result = self._execute_query("SELECT imagem FROM produtos WHERE id = ?", (product_id,))
        if result and result[0].get("imagem"):
            return result[0]["imagem"]
        return None

    def update_product_image(self, product_id: int, image_bytes: Optional[bytes]) -> bool:
        if image_bytes is None:
            self.clear_product_images(product_id)
            return True
        self.replace_primary_product_image(product_id, image_bytes, "image/jpeg")
        return True

    def count_products_with_images(self) -> int:
        result = self._execute_query(
            """
            SELECT COUNT(DISTINCT p.id) as total
            FROM produtos p
            LEFT JOIN product_images pi ON pi.product_id = p.id
            WHERE pi.id IS NOT NULL OR p.imagem IS NOT NULL
            """
        )
        return int(result[0]["total"] if result else 0)

    def count_out_of_stock(self) -> int:
        result = self._execute_query("SELECT COUNT(*) as total FROM produtos WHERE (qtd_canoas + qtd_pf) = 0")
        return int(result[0]["total"] if result else 0)
