"""
Repository para operacoes com produtos.
Responsabilidade unica: acesso a dados de produtos.

v3.0.0: Estoques via product_inventory (locais dinâmicos).
- Queries fazem JOIN com product_inventory + inventory_locations
- Removidos get_total_stock_canoas/get_total_stock_pf
- Adicionado get_stock_totals_by_location()
- create/update escrevem em product_inventory
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from core.database.repositories.base_repository import BaseRepository
from core.exceptions import DatabaseException, ProductNotFoundException

logger = logging.getLogger(__name__)


class ProductRepository(BaseRepository):
    """Repository para gerenciar produtos no banco de dados."""

    _ALLOWED_SORT_COLUMNS = {
        "id": "p.id",
        "nome": "p.nome",
        "total_stock": "total_stock",
        "ativo": "p.ativo",
    }

    @staticmethod
    def _append_search_filter(search_term: str, where_clauses: List[str], params: List[Any]) -> None:
        term = (search_term or "").strip()
        if not term:
            return

        if term.startswith("#"):
            id_term = term[1:].strip()
            if id_term.isdigit():
                where_clauses.append("p.id = ?")
                params.append(int(id_term))
            else:
                where_clauses.append("1 = 0")
            return

        where_clauses.append("p.nome LIKE ?")
        params.append(f"%{term}%")

    # ------------------------------------------------------------------
    # Internal helpers: attach inventories to product dicts
    # ------------------------------------------------------------------

    def _attach_inventories(self, products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Dado uma lista de dicts de produto, carrega inventories do
        product_inventory e injeta como campo 'inventories': {loc_id: qty}.
        """
        if not products:
            return products

        product_ids = [p["id"] for p in products]
        placeholders = ",".join("?" for _ in product_ids)
        rows = self._execute_query(
            f"""
            SELECT e.produto_id, e.local_id, e.quantidade
            FROM produto_estoque e
            INNER JOIN locais l ON e.local_id = l.id
            WHERE e.produto_id IN ({placeholders}) AND l.ativo = 1
            """,
            tuple(product_ids),
        )

        # Build map: {produto_id: {location_id: quantidade}}
        inv_map: Dict[int, Dict[int, int]] = {}
        for row in rows:
            pid = row["produto_id"]
            lid = row["local_id"]
            qty = int(row["quantidade"] or 0)
            inv_map.setdefault(pid, {})[lid] = qty

        for product in products:
            product["inventories"] = inv_map.get(product["id"], {})

        return products

    def _attach_inventories_single(self, product: Dict[str, Any]) -> Dict[str, Any]:
        """Attach inventories to a single product dict."""
        if not product:
            return product
        result = self._attach_inventories([product])
        return result[0]

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_all(self, search_term: str = "", status: str = "ATIVO") -> List[Dict[str, Any]]:
        where_clauses: List[str] = ["1=1"]
        params: List[Any] = []
        self._append_status_filter(status, where_clauses, params)
        self._append_search_filter(search_term, where_clauses, params)
        query = f"""
            SELECT p.*,
                   pv.nome AS produto_vinculado_nome,
                   (SELECT COUNT(*) FROM produtos p3 WHERE p3.produto_vinculado_id = p.id) AS linked_count
            FROM produtos p
            LEFT JOIN produtos pv ON pv.id = p.produto_vinculado_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY p.nome
        """
        products = self._execute_query(query, tuple(params))
        return self._attach_inventories(products)

    def get_all_paginated(
        self,
        search_term: str = "",
        sort_column: str = "nome",
        sort_direction: str = "ASC",
        limit: int = 20,
        offset: int = 0,
        status: str = "ATIVO",
        has_stock: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        sort_col = self._ALLOWED_SORT_COLUMNS.get(sort_column, "p.nome")
        sort_dir = "DESC" if str(sort_direction).upper() == "DESC" else "ASC"

        where_clauses: List[str] = ["1=1"]
        params: List[Any] = []
        self._append_status_filter(status, where_clauses, params)
        self._append_search_filter(search_term, where_clauses, params)

        # Build HAVING clause for stock filter
        having_clause = ""
        if has_stock is True:
            having_clause = "HAVING total_stock > 0"
        elif has_stock is False:
            having_clause = "HAVING total_stock = 0"

        query = f"""
            SELECT p.*,
                   COALESCE(SUM(pi.quantidade), 0) AS total_stock,
                   pv.nome AS produto_vinculado_nome,
                   (SELECT COUNT(*) FROM produtos p3 WHERE p3.produto_vinculado_id = p.id) AS linked_count
            FROM produtos p
            LEFT JOIN produto_estoque pi ON pi.produto_id = p.id
            LEFT JOIN produtos pv ON pv.id = p.produto_vinculado_id
            WHERE {' AND '.join(where_clauses)}
            GROUP BY p.id
            {having_clause}
            ORDER BY {sort_col} {sort_dir}
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        products = self._execute_query(query, tuple(params))
        return self._attach_inventories(products)

    def count_filtered(
        self,
        search_term: str = "",
        status: str = "ATIVO",
        has_stock: Optional[bool] = None,
    ) -> int:
        where_clauses: List[str] = ["1=1"]
        params: List[Any] = []
        self._append_status_filter(status, where_clauses, params)
        self._append_search_filter(search_term, where_clauses, params)

        having_clause = ""
        if has_stock is True:
            having_clause = "HAVING COALESCE(SUM(pi.quantidade), 0) > 0"
        elif has_stock is False:
            having_clause = "HAVING COALESCE(SUM(pi.quantidade), 0) = 0"

        result = self._execute_query(
            f"""
            SELECT COUNT(*) as total FROM (
                SELECT p.id
                FROM produtos p
                LEFT JOIN produto_estoque pi ON pi.produto_id = p.id
                WHERE {' AND '.join(where_clauses)}
                GROUP BY p.id
                {having_clause}
            )
            """,
            tuple(params),
        )
        return result[0]["total"] if result else 0

    def get_by_id(self, product_id: int) -> Optional[Dict[str, Any]]:
        results = self._execute_query(
            """
            SELECT p.*,
                   pv.nome AS produto_vinculado_nome,
                   (SELECT COUNT(*) FROM produtos p3 WHERE p3.produto_vinculado_id = p.id) AS linked_count
            FROM produtos p
            LEFT JOIN produtos pv ON pv.id = p.produto_vinculado_id
            WHERE p.id = ?
            """,
            (product_id,)
        )
        if not results:
            return None
        return self._attach_inventories_single(results[0])

    def get_by_ids(self, product_ids: List[int]) -> List[Dict[str, Any]]:
        if not product_ids:
            return []
        placeholders = ",".join("?" for _ in product_ids)
        query = f"""
            SELECT p.*,
                   pv.nome AS produto_vinculado_nome,
                   (SELECT COUNT(*) FROM produtos p3 WHERE p3.produto_vinculado_id = p.id) AS linked_count
            FROM produtos p
            LEFT JOIN produtos pv ON pv.id = p.produto_vinculado_id
            WHERE p.id IN ({placeholders})
        """
        products = self._execute_query(query, tuple(product_ids))
        return self._attach_inventories(products)

    def get_linked_products(self, product_id: int) -> List[Dict[str, Any]]:
        query = f"""
            SELECT p.*,
                   pv.nome AS produto_vinculado_nome,
                   (SELECT COUNT(*) FROM produtos p3 WHERE p3.produto_vinculado_id = p.id) AS linked_count,
                   COALESCE(SUM(pi.quantidade), 0) AS total_stock
            FROM produtos p
            LEFT JOIN produto_estoque pi ON pi.produto_id = p.id
            LEFT JOIN produtos pv ON pv.id = p.produto_vinculado_id
            WHERE p.produto_vinculado_id = ?
            GROUP BY p.id
            ORDER BY p.nome
        """
        products = self._execute_query(query, (product_id,))
        return self._attach_inventories(products)

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def add(self, nome: str, inventories: Dict[int, int], observacao: str | None = None, product_id: int | None = None, produto_vinculado_id: int | None = None) -> int:
        """
        Insere novo produto e seus estoques por location.

        Args:
            nome: Nome do produto (já normalizado)
            inventories: {local_id: quantidade}
            observacao: Observação opcional

        Returns:
            ID do produto criado
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            if product_id is not None:
                cursor.execute(
                    """
                    INSERT INTO produtos (id, nome, observacao, ativo, produto_vinculado_id)
                    VALUES (?, ?, ?, 1, ?)
                    """,
                    (product_id, nome, observacao, produto_vinculado_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO produtos (nome, observacao, ativo, produto_vinculado_id)
                    VALUES (?, ?, 1, ?)
                    """,
                    (nome, observacao, produto_vinculado_id),
                )
                product_id = int(cursor.lastrowid)

            # Insere estoque por location
            for location_id, qty in inventories.items():
                cursor.execute(
                    """
                    INSERT INTO produto_estoque (produto_id, local_id, quantidade, atualizado_em)
                    VALUES (?, ?, ?, datetime('now'))
                    """,
                    (product_id, location_id, qty),
                )

            conn.commit()
            logger.info("Produto criado: id=%d, nome=%s, inventories=%s", product_id, nome, inventories)
            return product_id
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando: {exc}")
        finally:
            conn.close()

    def update_stock(self, product_id: int, deltas: Dict[int, int]) -> bool:
        """
        Aplica deltas de estoque por location no produto_estoque.

        Args:
            product_id: ID do produto
            deltas: {local_id: delta} — positivo ou negativo

        Returns:
            True se atualizado com sucesso
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            for location_id, delta in deltas.items():
                if delta == 0:
                    continue
                # Tenta atualizar registro existente
                cursor.execute(
                    """
                    UPDATE produto_estoque
                    SET quantidade = quantidade + ?,
                        atualizado_em = datetime('now')
                    WHERE produto_id = ? AND local_id = ?
                    """,
                    (delta, product_id, location_id),
                )
                if cursor.rowcount == 0:
                    # Se não existia, insere (delta deve ser >= 0)
                    if delta < 0:
                        raise DatabaseException(
                            f"Não existe estoque no local {location_id} para produto {product_id}."
                        )
                    cursor.execute(
                        """
                        INSERT INTO produto_estoque
                            (produto_id, local_id, quantidade, atualizado_em)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (product_id, location_id, delta),
                    )
            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            if isinstance(exc, DatabaseException):
                raise
            raise DatabaseException(f"Erro ao atualizar estoque: {exc}")
        finally:
            conn.close()

    def set_stock(self, product_id: int, inventories: Dict[int, int]) -> bool:
        """
        Define estoque absoluto por location (UPSERT).

        Args:
            product_id: ID do produto
            inventories: {local_id: quantidade}

        Returns:
            True se atualizado com sucesso
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            for location_id, qty in inventories.items():
                cursor.execute(
                    """
                    UPDATE produto_estoque
                    SET quantidade = ?, atualizado_em = datetime('now')
                    WHERE produto_id = ? AND local_id = ?
                    """,
                    (qty, product_id, location_id),
                )
                if cursor.rowcount == 0:
                    cursor.execute(
                        """
                        INSERT INTO produto_estoque
                            (produto_id, local_id, quantidade, atualizado_em)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (product_id, location_id, qty),
                    )
            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao definir estoque: {exc}")
        finally:
            conn.close()

    def update_details(
        self,
        product_id: int,
        nome: str,
        inventories: Dict[int, int],
        observacao: str | None = None,
        produto_vinculado_id: int | None = None,
    ) -> bool:
        """
        Atualiza dados do produto (nome, observacao) e estoques por location.

        Args:
            product_id: ID do produto
            nome: Nome atualizado
            inventories: {local_id: quantidade} completo
            observacao: Observação

        Returns:
            True se atualizado com sucesso
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            cursor.execute(
                "UPDATE produtos SET nome = ?, observacao = ?, produto_vinculado_id = ? WHERE id = ?",
                (nome, observacao, produto_vinculado_id, product_id),
            )
            if cursor.rowcount == 0:
                raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")

            # Upsert each location's stock
            for location_id, qty in inventories.items():
                cursor.execute(
                    """
                    UPDATE produto_estoque
                    SET quantidade = ?, atualizado_em = datetime('now')
                    WHERE produto_id = ? AND local_id = ?
                    """,
                    (qty, product_id, location_id),
                )
                if cursor.rowcount == 0:
                    cursor.execute(
                        """
                        INSERT INTO produto_estoque
                            (produto_id, local_id, quantidade, atualizado_em)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (product_id, location_id, qty),
                    )

            conn.commit()
            return True
        except ProductNotFoundException:
            conn.rollback()
            raise
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao atualizar produto: {exc}")
        finally:
            conn.close()

    def delete(self, product_id: int) -> bool:
        """Remove produto e seus registros de estoque."""
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            # Desvincula produtos filhos
            cursor.execute("UPDATE produtos SET produto_vinculado_id = NULL WHERE produto_vinculado_id = ?", (product_id,))
            # Remove movimentações
            cursor.execute("DELETE FROM movimentacoes WHERE produto_id = ?", (product_id,))
            # produto_estoque has ON DELETE CASCADE, but be explicit
            cursor.execute("DELETE FROM produto_estoque WHERE produto_id = ?", (product_id,))
            cursor.execute("DELETE FROM produtos WHERE id = ?", (product_id,))
            if cursor.rowcount == 0:
                raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
            conn.commit()
            return True
        except ProductNotFoundException:
            conn.rollback()
            raise
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao remover produto: {exc}")
        finally:
            conn.close()

    def exists(self, product_id: int) -> bool:
        return self._exists("produtos", "id = ?", (product_id,))

    def bulk_set_active(
        self,
        ids: List[int],
        ativo: bool,
        motivo_inativacao: Optional[str] = None,
    ) -> int:
        if not ids:
            return 0

        placeholders = ",".join("?" for _ in ids)
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            if ativo:
                query = f"""
                    UPDATE produtos
                    SET ativo = 1,
                        inativado_em = NULL,
                        motivo_inativacao = NULL
                    WHERE id IN ({placeholders})
                """
                cursor.execute(query, tuple(ids))
            else:
                query = f"""
                    UPDATE produtos
                    SET ativo = 0,
                        inativado_em = CURRENT_TIMESTAMP,
                        motivo_inativacao = ?
                    WHERE id IN ({placeholders})
                """
                cursor.execute(query, tuple([motivo_inativacao] + ids))
            updated = int(cursor.rowcount or 0)
            conn.commit()
            return updated
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao atualizar status dos produtos: {exc}")
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Stock aggregation (dynamic locations)
    # ------------------------------------------------------------------

    def get_stock_totals_by_location(self) -> Dict[int, int]:
        """
        Retorna total de estoque por location para produtos ativos.

        Returns:
            Dict {local_id: total_quantidade}
        """
        rows = self._execute_query(
            """
            SELECT pi.local_id, COALESCE(SUM(pi.quantidade), 0) as total
            FROM produto_estoque pi
            JOIN produtos p ON p.id = pi.produto_id
            WHERE p.ativo = 1
            GROUP BY pi.local_id
            """
        )
        return {row["local_id"]: int(row["total"] or 0) for row in rows}

    def get_stock_by_location(self, location_id: int) -> int:
        """Retorna total de estoque em um location específico (produtos ativos)."""
        result = self._execute_query(
            """
            SELECT COALESCE(SUM(pi.quantidade), 0) as total
            FROM produto_estoque pi
            JOIN produtos p ON p.id = pi.produto_id
            WHERE p.ativo = 1 AND pi.local_id = ?
            """,
            (location_id,),
        )
        return int(result[0]["total"]) if result else 0

    def count_products(self) -> int:
        return self._count("produtos", "ativo = 1")

    def count_out_of_stock(self) -> int:
        """Conta produtos ativos que não possuem estoque em nenhum location."""
        result = self._execute_query(
            """
            SELECT COUNT(*) as total
            FROM produtos p
            WHERE p.ativo = 1
              AND COALESCE((
                  SELECT SUM(pi.quantidade)
                  FROM produto_estoque pi
                  WHERE pi.produto_id = p.id
              ), 0) = 0
            """
        )
        return int(result[0]["total"] if result else 0)

    def bulk_insert(self, products: List[tuple]) -> int:
        """
        Bulk insert/replace de produtos.
        Cada tupla: (id, nome, inventories_dict)
        Nota: inventories_dict é {local_id: qty}
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            count = 0
            for product_tuple in products:
                pid, nome = product_tuple[0], product_tuple[1]
                inventories = product_tuple[2] if len(product_tuple) > 2 else {}
                cursor.execute(
                    "INSERT OR REPLACE INTO produtos (id, nome) VALUES (?, ?)",
                    (pid, nome),
                )
                for location_id, qty in inventories.items():
                    cursor.execute(
                        """
                        INSERT OR REPLACE INTO produto_estoque
                            (produto_id, local_id, quantidade, atualizado_em)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (pid, location_id, qty),
                    )
                count += 1
            conn.commit()
            return count
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao executar comando em lote: {exc}")
        finally:
            conn.close()

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
        try:
            self._execute_command("UPDATE produtos SET imagem = NULL WHERE id = ?", (product_id,))
        except Exception:
            pass
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

            # Campo legado mantido para compatibilidade com tela antiga se a coluna existir.
            try:
                cursor.execute("UPDATE produtos SET imagem = ? WHERE id = ?", (image_bytes, product_id))
            except Exception:
                pass
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
        try:
            result = self._execute_query("SELECT imagem FROM produtos WHERE id = ?", (product_id,))
            if result and result[0].get("imagem"):
                return result[0]["imagem"]
        except Exception:
            pass
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

    def _append_status_filter(self, status: str, where_clauses: List[str], params: List[Any]) -> None:
        normalized = str(status or "ATIVO").upper()
        if normalized == "ATIVO":
            where_clauses.append("p.ativo = 1")
            return
        if normalized == "INATIVO":
            where_clauses.append("p.ativo = 0")
            return
        if normalized == "TODOS":
            return
        raise DatabaseException("Filtro de status invalido. Use ATIVO, INATIVO ou TODOS.")

    def _append_stock_filter(self, has_stock: Optional[bool], where_clauses: List[str]) -> None:
        """Deprecated: stock filtering now handled via HAVING clause in paginated queries."""
        if has_stock is None:
            return
        logger.warning("_append_stock_filter is deprecated; use HAVING clause instead.")
