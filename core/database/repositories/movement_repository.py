"""
Repository para operacoes com movimentacoes de estoque (API).
Responsabilidade unica: acesso a dados de movimentacoes e analytics.

v3.0.0: Estoques dinâmicos via produto_estoque.
- update_stock opera em produto_estoque
- insert_movement usa origem_local_id/destino_local_id (int)
- Analytics usam location_id em vez de strings hardcoded
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from core.database.repositories.base_repository import BaseRepository
from core.exceptions import DatabaseException, ProductNotFoundException

logger = logging.getLogger(__name__)


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

    def update_stock(self, conn, product_id: int, deltas: Dict[int, int]) -> None:
        """
        Aplica deltas de estoque por location no produto_estoque.

        Args:
            conn: Conexão ativa (dentro de transação)
            product_id: ID do produto
            deltas: {location_id: delta} — positivo ou negativo
        """
        cursor = conn.cursor()
        for location_id, delta in deltas.items():
            if delta == 0:
                continue
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
                # Row doesn't exist yet — insert if delta is positive
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

    def insert_movement(
        self,
        conn,
        tipo: str,
        produto_id: int,
        quantidade: int,
        origem_local_id: Optional[int],
        destino_local_id: Optional[int],
        observacao: Optional[str],
        natureza: str,
        motivo_ajuste: Optional[str],
        local_externo: Optional[str],
        documento: Optional[str],
        movimento_ref_id: Optional[int],
        data_hora: str,
    ) -> int:
        """
        Insere movimentação usando location IDs.

        Args:
            conn: Conexão ativa (dentro de transação)
            tipo: ENTRADA, SAIDA, TRANSFERENCIA
            produto_id: ID do produto
            quantidade: Quantidade movimentada
            origem_local_id: ID do local de origem (None para entradas externas)
            destino_local_id: ID do local de destino (None para saídas externas)
            observacao: Observação
            natureza: OPERACAO_NORMAL, DEVOLUCAO, TRANSFERENCIA_EXTERNA, etc.
            motivo_ajuste: Motivo (para ajustes)
            local_externo: Local externo (transferências externas)
            documento: Documento associado
            movimento_ref_id: ID de movimentação de referência (devoluções)
            data_hora: Timestamp

        Returns:
            ID da movimentação criada
        """
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO movimentacoes (
                data_hora, tipo, produto_id, quantidade,
                origem_local_id, destino_local_id,
                observacao, natureza, motivo_ajuste, local_externo,
                documento, movimento_ref_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data_hora,
                tipo,
                produto_id,
                quantidade,
                origem_local_id,
                destino_local_id,
                observacao,
                natureza,
                motivo_ajuste,
                local_externo,
                documento,
                movimento_ref_id,
            ),
        )
        return int(cursor.lastrowid)



    def list_movements(
        self,
        produto_id: Optional[int] = None,
        tipo: Optional[str] = None,
        natureza: Optional[str] = None,
        origem_local_id: Optional[int] = None,
        destino_local_id: Optional[int] = None,
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
                   m.origem_local_id,
                   m.destino_local_id,
                   m.observacao,
                   m.natureza,
                   m.motivo_ajuste,
                   m.local_externo,
                   m.documento,
                   m.movimento_ref_id
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE 1=1
        """
        params: List[Any] = []

        if produto_id is not None:
            query += " AND m.produto_id = ?"
            params.append(produto_id)
        if tipo:
            query += " AND m.tipo = ?"
            params.append(tipo)
        if natureza:
            query += " AND m.natureza = ?"
            params.append(natureza)
        if origem_local_id is not None:
            query += " AND m.origem_local_id = ?"
            params.append(origem_local_id)
        if destino_local_id is not None:
            query += " AND m.destino_local_id = ?"
            params.append(destino_local_id)
        if date_from:
            query += " AND m.data_hora >= ?"
            params.append(date_from)
        if date_to:
            query += " AND m.data_hora <= ?"
            params.append(date_to)

        query += f" ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        return self._execute_query(query, tuple(params))

    def count_movements(
        self,
        produto_id: Optional[int] = None,
        tipo: Optional[str] = None,
        natureza: Optional[str] = None,
        origem_local_id: Optional[int] = None,
        destino_local_id: Optional[int] = None,
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
        if origem_local_id is not None:
            query += " AND origem_local_id = ?"
            params.append(origem_local_id)
        if destino_local_id is not None:
            query += " AND destino_local_id = ?"
            params.append(destino_local_id)
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
        origem_local_id: Optional[int] = None,
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
              AND m.natureza = 'OPERACAO_NORMAL'
              AND p.ativo = 1
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [date_from, date_to]

        if origem_local_id is not None:
            query += " AND m.origem_local_id = ?"
            params.append(origem_local_id)

        query += """
            GROUP BY m.produto_id, p.nome
            HAVING total_saida > 0
            ORDER BY total_saida DESC
            LIMIT ?
        """
        params.append(limit)

        return self._execute_query(query, tuple(params))

    def list_real_sales(
        self,
        date_from: str,
        date_to: str,
        origem_local_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT m.id,
                   m.data_hora,
                   m.produto_id,
                   p.nome AS produto_nome,
                   m.quantidade,
                   m.origem_local_id,
                   m.documento,
                   m.observacao
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.tipo = 'SAIDA'
              AND m.natureza = 'OPERACAO_NORMAL'
              AND p.ativo = 1
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [date_from, date_to]

        if origem_local_id is not None:
            query += " AND m.origem_local_id = ?"
            params.append(origem_local_id)

        query += " ORDER BY m.data_hora DESC, m.id DESC"
        return self._execute_query(query, tuple(params))

    @staticmethod
    def _scope_movement_delta_expr(location_id: int, alias: str = "m") -> str:
        """
        Gera expressão SQL CASE para calcular delta de estoque
        para um location_id específico.
        """
        return f"""
            CASE
                WHEN {alias}.tipo = 'ENTRADA' AND {alias}.destino_local_id = {location_id} THEN {alias}.quantidade
                WHEN {alias}.tipo = 'SAIDA' AND {alias}.origem_local_id = {location_id} THEN -{alias}.quantidade
                WHEN {alias}.tipo = 'TRANSFERENCIA' AND {alias}.destino_local_id = {location_id} THEN {alias}.quantidade
                WHEN {alias}.tipo = 'TRANSFERENCIA' AND {alias}.origem_local_id = {location_id} THEN -{alias}.quantidade
                ELSE 0
            END
        """

    def get_stock_summary(self, location_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Retorna resumo de estoque. Se location_id for informado,
        filtra para aquele local; senão, retorna totais globais.

        Returns:
            Dict com location_totals, total_geral, zerados
        """
        if location_id is not None:
            row = self._execute_query(
                """
                SELECT
                  COALESCE(SUM(pi.quantidade), 0) as total_location,
                  COALESCE(SUM(CASE WHEN pi.quantidade = 0 THEN 1 ELSE 0 END), 0) as zerados
                FROM produto_estoque pi
                JOIN produtos p ON p.id = pi.produto_id
                JOIN locais l ON l.id = pi.local_id
                WHERE p.ativo = 1 AND l.ativo = 1 AND pi.local_id = ?
                """,
                (location_id,),
            )[0]
            total_loc = int(row.get("total_location") or 0)
            return {
                "location_totals": {location_id: total_loc},
                "total_geral": total_loc,
                "zerados": int(row.get("zerados") or 0),
            }

        # Global summary across all locations
        rows = self._execute_query(
            """
            SELECT pi.local_id as loc_id,
                   COALESCE(SUM(pi.quantidade), 0) as total
            FROM produto_estoque pi
            JOIN produtos p ON p.id = pi.produto_id
            JOIN locais l ON l.id = pi.local_id
            WHERE p.ativo = 1 AND l.ativo = 1
            GROUP BY pi.local_id
            """
        )
        location_totals = {r["loc_id"]: int(r["total"] or 0) for r in rows}
        total_geral = sum(location_totals.values())

        zerados_row = self._execute_query(
            """
            SELECT COUNT(*) as zerados
            FROM produtos p
            WHERE p.ativo = 1
              AND COALESCE((
                  SELECT SUM(pi.quantidade)
                  FROM produto_estoque pi
                  JOIN locais l ON l.id = pi.local_id
                  WHERE pi.produto_id = p.id AND l.ativo = 1
              ), 0) = 0
            """
        )[0]
        return {
            "location_totals": location_totals,
            "total_geral": total_geral,
            "zerados": int(zerados_row.get("zerados") or 0),
        }

    def get_saidas_timeseries(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
        origem_local_id: Optional[int] = None,
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
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.tipo = 'SAIDA'
              AND p.ativo = 1
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [date_from, date_to]

        if origem_local_id is not None:
            query += " AND m.origem_local_id = ?"
            params.append(origem_local_id)

        query += " GROUP BY periodo HAVING total_saida > 0 ORDER BY periodo ASC"
        return self._execute_query(query, tuple(params))

    def get_flow_timeseries(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
        location_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        expr = self._BUCKET_EXPR.get(bucket)
        if not expr:
            raise DatabaseException("Bucket invalido para serie temporal.")
        saida_liquida = self._saida_liquida_expr("m")

        params: List[Any] = []
        dest_filter = ""
        orig_filter = ""
        if location_id is not None:
            dest_filter = "AND m.destino_local_id = ?"
            orig_filter = "AND m.origem_local_id = ?"
            params.extend([location_id, location_id])

        params.extend([date_from, date_to])

        query = f"""
            SELECT {expr} as periodo,
                   SUM(CASE
                        WHEN m.tipo = 'ENTRADA' {dest_filter}
                        THEN m.quantidade ELSE 0 END
                   ) as entradas,
                   SUM(CASE
                        WHEN m.tipo = 'SAIDA' {orig_filter}
                        THEN {saida_liquida} ELSE 0 END
                   ) as saidas
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.tipo IN ('ENTRADA', 'SAIDA')
              AND p.ativo = 1
              AND m.data_hora >= ?
              AND m.data_hora <= ?
            GROUP BY periodo
            ORDER BY periodo ASC
        """

        return self._execute_query(query, tuple(params))

    def get_stock_evolution(
        self,
        date_from: str,
        date_to: str,
        bucket: str = "day",
        location_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Evolucao de estoque total baseada no saldo diario acumulado.
        TRANSFERENCIA nao altera total geral (saldo 0).

        Args:
            location_id: Se informado, evolução para aquele local;
                         senão, evolução global.
        """
        expr = self._BUCKET_EXPR.get(bucket)
        if not expr:
            raise DatabaseException("Bucket invalido para serie temporal.")

        if location_id is not None:
            # Current total for this location from produto_estoque
            current_total_row = self._execute_query(
                """
                SELECT COALESCE(SUM(pi.quantidade), 0) as total
                FROM produto_estoque pi
                JOIN produtos p ON p.id = pi.produto_id
                WHERE p.ativo = 1 AND pi.local_id = ?
                """,
                (location_id,),
            )[0]
        else:
            current_total_row = self._execute_query(
                """
                SELECT COALESCE(SUM(pi.quantidade), 0) as total
                FROM produto_estoque pi
                JOIN produtos p ON p.id = pi.produto_id
                WHERE p.ativo = 1
                """
            )[0]
        current_total = int(current_total_row.get("total") or 0)

        if location_id is not None:
            scope_delta_expr = self._scope_movement_delta_expr(location_id, "m")
            net_to_now_row = self._execute_query(
                f"""
                SELECT COALESCE(SUM({scope_delta_expr}), 0) as delta
                FROM movimentacoes m
                JOIN produtos p ON p.id = m.produto_id
                WHERE p.ativo = 1
                  AND m.data_hora >= ?
                """,
                (date_from,),
            )[0]
        else:
            net_to_now_row = self._execute_query(
                """
                SELECT COALESCE(SUM(
                    CASE
                        WHEN m.tipo = 'ENTRADA' THEN m.quantidade
                        WHEN m.tipo = 'SAIDA' THEN -m.quantidade
                        ELSE 0
                    END
                ), 0) as delta
                FROM movimentacoes m
                JOIN produtos p ON p.id = m.produto_id
                WHERE p.ativo = 1
                  AND m.data_hora >= ?
                """,
                (date_from,),
            )[0]
        total_at_start = current_total - int(net_to_now_row.get("delta") or 0)

        if location_id is not None:
            scope_delta_expr = self._scope_movement_delta_expr(location_id, "m")
            deltas = self._execute_query(
                f"""
                SELECT {expr} as periodo,
                       SUM({scope_delta_expr}) as delta
                FROM movimentacoes m
                JOIN produtos p ON p.id = m.produto_id
                WHERE p.ativo = 1
                  AND m.data_hora >= ? AND m.data_hora <= ?
                GROUP BY periodo
                ORDER BY periodo ASC
                """,
                (date_from, date_to),
            )
        else:
            deltas = self._execute_query(
                f"""
                SELECT {expr} as periodo,
                       SUM(
                            CASE
                                WHEN m.tipo = 'ENTRADA' THEN m.quantidade
                                WHEN m.tipo = 'SAIDA' THEN -m.quantidade
                                ELSE 0
                            END
                       ) as delta
                FROM movimentacoes m
                JOIN produtos p ON p.id = m.produto_id
                WHERE p.ativo = 1
                  AND m.data_hora >= ? AND m.data_hora <= ?
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

    def get_top_sem_mov(
        self,
        cutoff: str,
        date_to: str,
        limit: int = 5,
        location_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if location_id is not None:
            return self._execute_query(
                """
                SELECT p.id as produto_id,
                       p.nome as nome,
                       MAX(m.data_hora) as last_movement
                FROM produtos p
                JOIN produto_estoque pi
                  ON pi.produto_id = p.id AND pi.local_id = ? AND pi.quantidade > 0
                LEFT JOIN movimentacoes m
                  ON m.produto_id = p.id
                 AND m.data_hora <= ?
                 AND (m.origem_local_id = ? OR m.destino_local_id = ?)
                WHERE p.ativo = 1
                GROUP BY p.id, p.nome
                HAVING last_movement IS NULL OR last_movement < ?
                ORDER BY last_movement ASC
                LIMIT ?
                """,
                (location_id, date_to, location_id, location_id, cutoff, limit),
            )
        return self._execute_query(
            """
            SELECT p.id as produto_id,
                   p.nome as nome,
                   MAX(m.data_hora) as last_movement
            FROM produtos p
            LEFT JOIN movimentacoes m
              ON m.produto_id = p.id
             AND m.data_hora <= ?
            WHERE p.ativo = 1
            GROUP BY p.id, p.nome
            HAVING last_movement IS NULL OR last_movement < ?
            ORDER BY last_movement ASC
            LIMIT ?
            """,
            (date_to, cutoff, limit),
        )

    def get_recent_stockouts(
        self,
        cutoff: str,
        date_to: str,
        limit: int = 5,
        location_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        saida_liquida = self._saida_liquida_expr("m")

        if location_id is not None:
            return self._execute_query(
                f"""
                SELECT p.id as produto_id,
                       p.nome as nome,
                       SUM({saida_liquida}) as total_saida_recente,
                       MAX(m.data_hora) as last_sale
                FROM produtos p
                JOIN produto_estoque pi
                  ON pi.produto_id = p.id AND pi.local_id = ? AND pi.quantidade = 0
                JOIN movimentacoes m ON m.produto_id = p.id
                WHERE p.ativo = 1
                  AND m.tipo = 'SAIDA'
                  AND m.natureza = 'OPERACAO_NORMAL'
                  AND m.origem_local_id = ?
                  AND m.data_hora >= ?
                  AND m.data_hora <= ?
                GROUP BY p.id, p.nome
                HAVING total_saida_recente > 0
                ORDER BY total_saida_recente DESC, last_sale DESC
                LIMIT ?
                """,
                (location_id, location_id, cutoff, date_to, limit),
            )

        return self._execute_query(
            f"""
            SELECT p.id as produto_id,
                   p.nome as nome,
                   SUM({saida_liquida}) as total_saida_recente,
                   MAX(m.data_hora) as last_sale
            FROM produtos p
            JOIN movimentacoes m ON m.produto_id = p.id
            WHERE p.ativo = 1
              AND COALESCE((
                  SELECT SUM(pi.quantidade) FROM produto_estoque pi WHERE pi.produto_id = p.id
              ), 0) = 0
              AND m.tipo = 'SAIDA'
              AND m.natureza = 'OPERACAO_NORMAL'
              AND m.data_hora >= ?
              AND m.data_hora <= ?
            GROUP BY p.id, p.nome
            HAVING total_saida_recente > 0
            ORDER BY total_saida_recente DESC, last_sale DESC
            LIMIT ?
            """,
            (cutoff, date_to, limit),
        )

    def get_external_transfer_totals(
        self,
        date_from: str,
        date_to: str,
        tipo: str,
        location_id: Optional[int] = None,
        limit: int = 15,
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT m.produto_id as produto_id,
                   p.nome as nome,
                   SUM(m.quantidade) as total_quantidade,
                   COUNT(*) as total_movimentacoes,
                   MAX(m.data_hora) as ultima_transferencia
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.tipo = ?
              AND m.natureza = 'TRANSFERENCIA_EXTERNA'
              AND p.ativo = 1
              AND m.data_hora >= ?
              AND m.data_hora <= ?
        """
        params: List[Any] = [tipo, date_from, date_to]

        if location_id is not None:
            if tipo == "ENTRADA":
                query += " AND m.destino_local_id = ?"
            else:
                query += " AND m.origem_local_id = ?"
            params.append(location_id)

        query += """
            GROUP BY m.produto_id, p.nome
            HAVING total_quantidade > 0
            ORDER BY total_quantidade DESC, total_movimentacoes DESC, ultima_transferencia DESC, p.nome ASC
            LIMIT ?
        """
        params.append(limit)
        return self._execute_query(query, tuple(params))

    def list_inactive_products_report(
        self,
        cutoff: str,
        date_to: str,
        location_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if location_id is not None:
            return self._execute_query(
                """
                SELECT p.id as produto_id,
                       p.nome as nome,
                       pi.quantidade as estoque_atual,
                       pi.local_id as location_id,
                       MAX(m.data_hora) as last_movement
                FROM produtos p
                JOIN produto_estoque pi
                  ON pi.produto_id = p.id AND pi.local_id = ? AND pi.quantidade > 0
                LEFT JOIN movimentacoes m
                  ON m.produto_id = p.id
                 AND m.data_hora <= ?
                 AND (m.origem_local_id = ? OR m.destino_local_id = ?)
                WHERE p.ativo = 1
                GROUP BY p.id, p.nome, pi.quantidade
                HAVING last_movement IS NULL OR last_movement < ?
                ORDER BY last_movement ASC, p.nome ASC
                """,
                (location_id, date_to, location_id, location_id, cutoff),
            )
        return self._execute_query(
            """
            SELECT p.id as produto_id,
                   p.nome as nome,
                   COALESCE((
                       SELECT SUM(pi.quantidade)
                       FROM produto_estoque pi
                       WHERE pi.produto_id = p.id
                   ), 0) as estoque_atual,
                   MAX(m.data_hora) as last_movement
            FROM produtos p
            LEFT JOIN movimentacoes m
              ON m.produto_id = p.id
             AND m.data_hora <= ?
            WHERE p.ativo = 1
              AND COALESCE((
                  SELECT SUM(pi.quantidade)
                  FROM produto_estoque pi
                  WHERE pi.produto_id = p.id
              ), 0) > 0
            GROUP BY p.id, p.nome
            HAVING last_movement IS NULL OR last_movement < ?
            ORDER BY last_movement ASC, p.nome ASC
            """,
            (date_to, cutoff),
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
            JOIN produtos p ON p.id = m.produto_id
            WHERE p.ativo = 1
              AND data_hora >= ? AND data_hora <= ?
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
                    WHEN m.tipo = 'ENTRADA' THEN m.quantidade
                    WHEN m.tipo = 'SAIDA' THEN -m.quantidade
                    ELSE 0
                END
            ) as total
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE p.ativo = 1
              AND data_hora >= ? AND data_hora <= ?
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
                           WHEN m.tipo = 'ENTRADA' THEN m.quantidade
                           WHEN m.tipo = 'SAIDA' THEN -m.quantidade
                           ELSE 0
                       END
                   ) as delta
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            WHERE p.ativo = 1
              AND data_hora >= ? AND data_hora <= ?
            GROUP BY date(data_hora)
            ORDER BY dia ASC
            """,
            (date_from, date_to),
        )
