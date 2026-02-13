"""
Repository para operacoes com movimentacoes de estoque (API).
Responsabilidade unica: acesso a dados de movimentacoes e analytics.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.database.repositories.base_repository import BaseRepository
from core.exceptions import DatabaseException, ProductNotFoundException


class MovementRepository(BaseRepository):
    _ALLOWED_SORT_COLUMNS = {
        "data": "data_hora",
        "tipo": "tipo",
        "quantidade": "quantidade",
        "id": "id",
    }

    _BUCKET_EXPR = {
        "day": "strftime('%Y-%m-%d', data_hora)",
        "week": "strftime('%Y-%W', data_hora)",
        "month": "strftime('%Y-%m', data_hora)",
    }

    @staticmethod
    def _saida_liquida_expr(alias: str = "m") -> str:
        return f"""
            CASE
                WHEN {alias}.quantidade - COALESCE((
                    SELECT SUM(d.quantidade)
                    FROM movimentacoes d
                    WHERE d.natureza = 'DEVOLUCAO'
                      AND d.movimento_ref_id = {alias}.id
                ), 0) > 0
                THEN {alias}.quantidade - COALESCE((
                    SELECT SUM(d.quantidade)
                    FROM movimentacoes d
                    WHERE d.natureza = 'DEVOLUCAO'
                      AND d.movimento_ref_id = {alias}.id
                ), 0)
                ELSE 0
            END
        """

    def get_product_by_id(self, conn, product_id: int) -> Optional[Dict[str, Any]]:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM produtos WHERE id = ?", (product_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_movement_by_id(self, conn, movement_id: int) -> Optional[Dict[str, Any]]:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM movimentacoes WHERE id = ?", (movement_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_total_devolucao_by_ref(self, conn, movement_ref_id: int) -> int:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(SUM(quantidade), 0) as total
            FROM movimentacoes
            WHERE natureza = 'DEVOLUCAO' AND movimento_ref_id = ?
            """,
            (movement_ref_id,),
        )
        row = cursor.fetchone()
        return int(row[0] if row else 0)

    def update_stock(self, conn, product_id: int, delta_canoas: int, delta_pf: int) -> None:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE produtos
            SET qtd_canoas = qtd_canoas + ?,
                qtd_pf = qtd_pf + ?
            WHERE id = ?
            """,
            (delta_canoas, delta_pf, product_id),
        )
        if cursor.rowcount == 0:
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")

    def insert_movement(
        self,
        conn,
        tipo: str,
        produto_id: int,
        quantidade: int,
        origem: Optional[str],
        destino: Optional[str],
        observacao: Optional[str],
        natureza: str,
        local_externo: Optional[str],
        documento: Optional[str],
        movimento_ref_id: Optional[int],
        data_hora: str,
    ) -> int:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO movimentacoes (
                data_hora, tipo, produto_id, quantidade, origem, destino, observacao,
                natureza, local_externo, documento, movimento_ref_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data_hora,
                tipo,
                produto_id,
                quantidade,
                origem,
                destino,
                observacao,
                natureza,
                local_externo,
                documento,
                movimento_ref_id,
            ),
        )
        return int(cursor.lastrowid)

    def insert_history(
        self,
        conn,
        operacao: str,
        produto_nome: str,
        quantidade: int,
        observacao: str,
        data_hora: Optional[str] = None,
    ) -> None:
        cursor = conn.cursor()
        if data_hora:
            cursor.execute(
                """
                INSERT INTO historico (data_hora, operacao, produto_nome, quantidade, observacao)
                VALUES (?, ?, ?, ?, ?)
                """,
                (data_hora, operacao, produto_nome, quantidade, observacao),
            )
        else:
            cursor.execute(
                """
                INSERT INTO historico (operacao, produto_nome, quantidade, observacao)
                VALUES (?, ?, ?, ?)
                """,
                (operacao, produto_nome, quantidade, observacao),
            )

    def list_movements(
        self,
        produto_id: Optional[int] = None,
        tipo: Optional[str] = None,
        natureza: Optional[str] = None,
        origem: Optional[str] = None,
        destino: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        sort_column: str = "data",
        sort_direction: str = "DESC",
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        sort_col = self._ALLOWED_SORT_COLUMNS.get(sort_column, "data_hora")
        sort_dir = "DESC" if str(sort_direction).upper() == "DESC" else "ASC"

        query = """
            SELECT m.id,
                   m.data_hora,
                   m.tipo,
                   m.produto_id,
                   p.nome as produto_nome,
                   m.quantidade,
                   m.origem,
                   m.destino,
                   m.observacao,
                   m.natureza,
                   m.local_externo,
                   m.documento,
                   m.movimento_ref_id
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE 1=1
        """
        params: List[Any] = []

        if produto_id is not None:
            query += " AND produto_id = ?"
            params.append(produto_id)
        if tipo:
            query += " AND tipo = ?"
            params.append(tipo)
        if natureza:
            query += " AND natureza = ?"
            params.append(natureza)
        if origem:
            query += " AND origem = ?"
            params.append(origem)
        if destino:
            query += " AND destino = ?"
            params.append(destino)
        if date_from:
            query += " AND data_hora >= ?"
            params.append(date_from)
        if date_to:
            query += " AND data_hora <= ?"
            params.append(date_to)

        query += f" ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        return self._execute_query(query, tuple(params))

    def count_movements(
        self,
        produto_id: Optional[int] = None,
        tipo: Optional[str] = None,
        natureza: Optional[str] = None,
        origem: Optional[str] = None,
        destino: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> int:
        query = """
            SELECT COUNT(*) as total
            FROM movimentacoes
            WHERE 1=1
        """
        params: List[Any] = []

        if produto_id is not None:
            query += " AND produto_id = ?"
            params.append(produto_id)
        if tipo:
            query += " AND tipo = ?"
            params.append(tipo)
        if natureza:
            query += " AND natureza = ?"
            params.append(natureza)
        if origem:
            query += " AND origem = ?"
            params.append(origem)
        if destino:
            query += " AND destino = ?"
            params.append(destino)
        if date_from:
            query += " AND data_hora >= ?"
            params.append(date_from)
        if date_to:
            query += " AND data_hora <= ?"
            params.append(date_to)

        result = self._execute_query(query, tuple(params))
        return result[0]["total"] if result else 0

    def get_top_saidas(
        self,
        date_from: str,
        date_to: str,
        origem: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        saida_liquida = self._saida_liquida_expr("m")
        query = """
            SELECT m.produto_id as produto_id,
                   p.nome as nome,
                   SUM(
                   """
        query += saida_liquida
        query += """
                   ) as total_saida
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.tipo = 'SAIDA'
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [date_from, date_to]

        if origem:
            query += " AND m.origem = ?"
            params.append(origem)

        query += """
            GROUP BY m.produto_id, p.nome
            HAVING total_saida > 0
            ORDER BY total_saida DESC
            LIMIT ?
        """
        params.append(limit)

        return self._execute_query(query, tuple(params))

    def get_stock_summary(self) -> Dict[str, int]:
        row = self._execute_query(
            """
            SELECT
              COALESCE(SUM(qtd_canoas), 0) as total_canoas,
              COALESCE(SUM(qtd_pf), 0) as total_pf,
              COALESCE(SUM(CASE WHEN (qtd_canoas + qtd_pf) = 0 THEN 1 ELSE 0 END), 0) as zerados
            FROM produtos
            """
        )[0]
        total_canoas = int(row.get("total_canoas") or 0)
        total_pf = int(row.get("total_pf") or 0)
        return {
            "total_canoas": total_canoas,
            "total_pf": total_pf,
            "total_geral": total_canoas + total_pf,
            "zerados": int(row.get("zerados") or 0),
        }

    def get_saidas_timeseries(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
        origem: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        expr = self._BUCKET_EXPR.get(bucket)
        if not expr:
            raise DatabaseException("Bucket invalido para serie temporal.")
        saida_liquida = self._saida_liquida_expr("m")

        query = f"""
            SELECT {expr} as periodo,
                   SUM(
                   {saida_liquida}
                   ) as total_saida
            FROM movimentacoes m
            WHERE m.tipo = 'SAIDA'
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [date_from, date_to]

        if origem:
            query += " AND m.origem = ?"
            params.append(origem)

        query += " GROUP BY periodo HAVING total_saida > 0 ORDER BY periodo ASC"
        return self._execute_query(query, tuple(params))

    def get_flow_timeseries(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
        scope: str = "AMBOS",
    ) -> List[Dict[str, Any]]:
        expr = self._BUCKET_EXPR.get(bucket)
        if not expr:
            raise DatabaseException("Bucket invalido para serie temporal.")
        saida_liquida = self._saida_liquida_expr("m")

        params: List[Any] = [date_from, date_to]
        query = f"""
            SELECT {expr} as periodo,
                   SUM(CASE
                        WHEN tipo = 'ENTRADA' {"AND destino = ?" if scope in {'CANOAS', 'PF'} else ''}
                        THEN quantidade ELSE 0 END
                   ) as entradas,
                   SUM(CASE
                        WHEN tipo = 'SAIDA' {"AND origem = ?" if scope in {'CANOAS', 'PF'} else ''}
                        THEN {saida_liquida} ELSE 0 END
                   ) as saidas
            FROM movimentacoes m
            WHERE tipo IN ('ENTRADA', 'SAIDA')
              AND data_hora >= ?
              AND data_hora <= ?
            GROUP BY periodo
            ORDER BY periodo ASC
        """
        if scope in {"CANOAS", "PF"}:
            params = [scope, scope, date_from, date_to]

        return self._execute_query(query, tuple(params))

    def get_stock_evolution(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
    ) -> List[Dict[str, Any]]:
        """
        Evolucao de estoque total baseada no saldo diario acumulado.
        TRANSFERENCIA nao altera total geral (saldo 0).
        """
        expr = self._BUCKET_EXPR.get(bucket)
        if not expr:
            raise DatabaseException("Bucket invalido para serie temporal.")

        current_total_row = self._execute_query(
            "SELECT COALESCE(SUM(qtd_canoas + qtd_pf), 0) as total FROM produtos"
        )[0]
        current_total = int(current_total_row.get("total") or 0)

        net_to_now_row = self._execute_query(
            """
            SELECT COALESCE(SUM(
                CASE
                    WHEN tipo = 'ENTRADA' THEN quantidade
                    WHEN tipo = 'SAIDA' THEN -quantidade
                    ELSE 0
                END
            ), 0) as delta
            FROM movimentacoes
            WHERE data_hora >= ?
            """,
            (date_from,),
        )[0]
        total_at_start = current_total - int(net_to_now_row.get("delta") or 0)

        deltas = self._execute_query(
            f"""
            SELECT {expr} as periodo,
                   SUM(
                        CASE
                            WHEN tipo = 'ENTRADA' THEN quantidade
                            WHEN tipo = 'SAIDA' THEN -quantidade
                            ELSE 0
                        END
                   ) as delta
            FROM movimentacoes
            WHERE data_hora >= ? AND data_hora <= ?
            GROUP BY periodo
            ORDER BY periodo ASC
            """,
            (date_from, date_to),
        )

        running = total_at_start
        result: List[Dict[str, Any]] = []
        for row in deltas:
            running += int(row.get("delta") or 0)
            result.append({"periodo": row["periodo"], "total_stock": running})

        return result

    def get_top_sem_mov(self, cutoff: str, limit: int = 5) -> List[Dict[str, Any]]:
        return self._execute_query(
            """
            SELECT p.id as produto_id,
                   p.nome as nome,
                   MAX(m.data_hora) as last_movement
            FROM produtos p
            LEFT JOIN movimentacoes m ON m.produto_id = p.id
            GROUP BY p.id, p.nome
            HAVING last_movement IS NULL OR last_movement < ?
            ORDER BY last_movement ASC
            LIMIT ?
            """,
            (cutoff, limit),
        )

    # Compat endpoints antigos
    def get_entradas_saidas_por_dia(self, date_from: str, date_to: str) -> List[Dict[str, Any]]:
        saida_liquida = self._saida_liquida_expr("m")
        return self._execute_query(
            f"""
            SELECT date(data_hora) as dia,
                   SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END) as entradas,
                   SUM(CASE WHEN tipo = 'SAIDA' THEN {saida_liquida} ELSE 0 END) as saidas
            FROM movimentacoes m
            WHERE data_hora >= ? AND data_hora <= ?
            GROUP BY date(data_hora)
            ORDER BY dia ASC
            """,
            (date_from, date_to),
        )

    def get_net_movimento_total(self, date_from: str, date_to: str) -> int:
        result = self._execute_query(
            """
            SELECT SUM(
                CASE
                    WHEN tipo = 'ENTRADA' THEN quantidade
                    WHEN tipo = 'SAIDA' THEN -quantidade
                    ELSE 0
                END
            ) as total
            FROM movimentacoes
            WHERE data_hora >= ? AND data_hora <= ?
            """,
            (date_from, date_to),
        )
        return int(result[0]["total"] or 0) if result else 0

    def get_net_movimento_por_dia(self, date_from: str, date_to: str) -> List[Dict[str, Any]]:
        return self._execute_query(
            """
            SELECT date(data_hora) as dia,
                   SUM(
                       CASE
                           WHEN tipo = 'ENTRADA' THEN quantidade
                           WHEN tipo = 'SAIDA' THEN -quantidade
                           ELSE 0
                       END
                   ) as delta
            FROM movimentacoes
            WHERE data_hora >= ? AND data_hora <= ?
            GROUP BY date(data_hora)
            ORDER BY dia ASC
            """,
            (date_from, date_to),
        )
