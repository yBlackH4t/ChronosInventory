"""
Servico de sessoes de inventario.
Responsabilidade: criar, listar, resumir e consultar contagens de uma sessao.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Tuple

from core.exceptions import ValidationException

from app.services.inventory_types import (
    INVENTORY_LOCAL_VALIDOS,
    INVENTORY_STATUS_ABERTO,
    INVENTORY_STATUS_FILTERS,
    InventoryCountRecord,
    InventorySessionRecord,
)


class InventorySessionService:
    def __init__(self, *, db) -> None:
        self.db = db

    def create_session(self, nome: str, local: str, observacao: str | None) -> InventorySessionRecord:
        nome = (nome or "").strip()
        if not nome:
            raise ValidationException("Nome da sessao de inventario e obrigatorio.")
        local = self.normalize_local(local)
        observacao = observacao.strip() if observacao else None

        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            cursor.execute(
                """
                INSERT INTO inventory_sessions (nome, local, status, observacao)
                VALUES (?, ?, ?, ?)
                """,
                (nome, local, INVENTORY_STATUS_ABERTO, observacao),
            )
            session_id = int(cursor.lastrowid)
            cursor.execute(
                """
                INSERT INTO inventory_counts (session_id, produto_id, qtd_sistema)
                SELECT ?, p.id,
                       CASE
                         WHEN ? = 'CANOAS' THEN COALESCE(p.qtd_canoas, 0)
                         WHEN ? = 'PF' THEN COALESCE(p.qtd_pf, 0)
                         ELSE 0
                       END
                FROM produtos p
                WHERE COALESCE(p.ativo, 1) = 1
                """,
                (session_id, local, local),
            )
            conn.commit()
            return self.get_session_by_id(conn, session_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_sessions(self, limit: int = 20, offset: int = 0) -> List[InventorySessionRecord]:
        conn = self.db.get_connection()
        try:
            rows = conn.execute(
                """
                SELECT s.id,
                       s.nome,
                       s.local,
                       s.status,
                       s.observacao,
                       s.created_at,
                       s.updated_at,
                       s.applied_at,
                       COUNT(c.id) AS total_items,
                       COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL THEN 1 ELSE 0 END), 0) AS counted_items,
                       COALESCE(SUM(CASE WHEN COALESCE(c.divergencia, 0) <> 0 THEN 1 ELSE 0 END), 0) AS divergent_items
                FROM inventory_sessions s
                LEFT JOIN inventory_counts c ON c.session_id = s.id
                GROUP BY s.id, s.nome, s.local, s.status, s.observacao, s.created_at, s.updated_at, s.applied_at
                ORDER BY s.created_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
            return [self.row_to_session(row) for row in rows]
        finally:
            conn.close()

    def count_sessions(self) -> int:
        conn = self.db.get_connection()
        try:
            row = conn.execute("SELECT COUNT(*) AS total FROM inventory_sessions").fetchone()
            return int(row[0] if row else 0)
        finally:
            conn.close()

    def get_session(self, session_id: int) -> InventorySessionRecord:
        conn = self.db.get_connection()
        try:
            return self.get_session_by_id(conn, session_id)
        finally:
            conn.close()

    def get_session_summary(self, session_id: int) -> dict:
        conn = self.db.get_connection()
        try:
            self.ensure_session_exists(conn, session_id)
            row = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_items,
                    COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL THEN 1 ELSE 0 END), 0) AS counted_items,
                    COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) <> 0 THEN 1 ELSE 0 END), 0) AS divergent_items,
                    COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) = 0 THEN 1 ELSE 0 END), 0) AS matched_items,
                    COALESCE(SUM(CASE WHEN COALESCE(c.divergencia, 0) < 0 THEN 1 ELSE 0 END), 0) AS missing_items,
                    COALESCE(SUM(CASE WHEN COALESCE(c.divergencia, 0) > 0 THEN 1 ELSE 0 END), 0) AS surplus_items,
                    COALESCE(SUM(CASE WHEN c.qtd_fisico IS NULL THEN 1 ELSE 0 END), 0) AS not_counted_items,
                    COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) <> 0 AND c.applied_movement_id IS NULL THEN 1 ELSE 0 END), 0) AS pending_items,
                    COALESCE(SUM(CASE WHEN c.applied_movement_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS applied_items
                FROM inventory_counts c
                WHERE c.session_id = ?
                """,
                (session_id,),
            ).fetchone()
            return {
                "session_id": int(session_id),
                "total_items": int(row["total_items"] or 0),
                "counted_items": int(row["counted_items"] or 0),
                "divergent_items": int(row["divergent_items"] or 0),
                "matched_items": int(row["matched_items"] or 0),
                "missing_items": int(row["missing_items"] or 0),
                "surplus_items": int(row["surplus_items"] or 0),
                "not_counted_items": int(row["not_counted_items"] or 0),
                "pending_items": int(row["pending_items"] or 0),
                "applied_items": int(row["applied_items"] or 0),
            }
        finally:
            conn.close()

    def list_session_counts(
        self,
        session_id: int,
        limit: int = 50,
        offset: int = 0,
        only_divergent: bool = False,
        query: str = "",
        status_filter: str = "ALL",
    ) -> Tuple[List[InventoryCountRecord], int]:
        conn = self.db.get_connection()
        try:
            self.ensure_session_exists(conn, session_id)

            where = ["c.session_id = ?"]
            params: List[object] = [session_id]
            status_filter = self.normalize_status_filter(status_filter)
            if only_divergent and status_filter == "ALL":
                status_filter = "DIVERGENT"

            if status_filter == "DIVERGENT":
                where.append("c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) <> 0")
            elif status_filter == "MATCHED":
                where.append("c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) = 0")
            elif status_filter == "MISSING":
                where.append("COALESCE(c.divergencia, 0) < 0")
            elif status_filter == "SURPLUS":
                where.append("COALESCE(c.divergencia, 0) > 0")
            elif status_filter == "NOT_COUNTED":
                where.append("c.qtd_fisico IS NULL")
            elif status_filter == "PENDING":
                where.append("c.qtd_fisico IS NOT NULL AND COALESCE(c.divergencia, 0) <> 0 AND c.applied_movement_id IS NULL")
            elif status_filter == "APPLIED":
                where.append("c.applied_movement_id IS NOT NULL")

            query = (query or "").strip()
            if query:
                where.append("(p.nome LIKE ? OR CAST(p.id AS TEXT) = ?)")
                params.extend([f"%{query.upper()}%", query])
            where_sql = " AND ".join(where)

            rows = conn.execute(
                f"""
                SELECT c.produto_id,
                       p.nome AS produto_nome,
                       c.qtd_sistema,
                       c.qtd_fisico,
                       c.divergencia,
                       c.motivo_ajuste,
                       c.observacao,
                       c.applied_movement_id,
                       c.updated_at
                FROM inventory_counts c
                JOIN produtos p ON p.id = c.produto_id
                WHERE {where_sql}
                ORDER BY p.nome ASC
                LIMIT ? OFFSET ?
                """,
                tuple(params + [limit, offset]),
            ).fetchall()
            total_row = conn.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM inventory_counts c
                JOIN produtos p ON p.id = c.produto_id
                WHERE {where_sql}
                """,
                tuple(params),
            ).fetchone()
            total = int(total_row[0] if total_row else 0)
            return [self.row_to_count(item) for item in rows], total
        finally:
            conn.close()

    def get_session_by_id(self, conn, session_id: int) -> InventorySessionRecord:
        row = conn.execute(
            """
            SELECT s.id,
                   s.nome,
                   s.local,
                   s.status,
                   s.observacao,
                   s.created_at,
                   s.updated_at,
                   s.applied_at,
                   COUNT(c.id) AS total_items,
                   COALESCE(SUM(CASE WHEN c.qtd_fisico IS NOT NULL THEN 1 ELSE 0 END), 0) AS counted_items,
                   COALESCE(SUM(CASE WHEN COALESCE(c.divergencia, 0) <> 0 THEN 1 ELSE 0 END), 0) AS divergent_items
            FROM inventory_sessions s
            LEFT JOIN inventory_counts c ON c.session_id = s.id
            WHERE s.id = ?
            GROUP BY s.id, s.nome, s.local, s.status, s.observacao, s.created_at, s.updated_at, s.applied_at
            """,
            (session_id,),
        ).fetchone()
        if not row:
            raise ValidationException("Sessao de inventario nao encontrada.")
        return self.row_to_session(row)

    def ensure_session_exists(self, conn, session_id: int) -> None:
        row = conn.execute("SELECT id FROM inventory_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise ValidationException("Sessao de inventario nao encontrada.")

    def ensure_session_open(self, conn, session_id: int):
        row = conn.execute(
            "SELECT id, nome, local, status FROM inventory_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not row:
            raise ValidationException("Sessao de inventario nao encontrada.")
        if str(row["status"]).upper() != INVENTORY_STATUS_ABERTO:
            raise ValidationException("Sessao de inventario nao esta aberta para alteracoes.")
        return row

    @staticmethod
    def normalize_local(local: str) -> str:
        local = (local or "").strip().upper()
        if local not in INVENTORY_LOCAL_VALIDOS:
            raise ValidationException("Local invalido para inventario. Use CANOAS ou PF.")
        return local

    @staticmethod
    def normalize_status_filter(status_filter: str | None) -> str:
        value = str(status_filter or "ALL").strip().upper()
        if value not in INVENTORY_STATUS_FILTERS:
            raise ValidationException(
                "Filtro de inventario invalido. Use ALL, DIVERGENT, MATCHED, MISSING, SURPLUS, NOT_COUNTED, PENDING ou APPLIED."
            )
        return value

    @staticmethod
    def row_to_session(row) -> InventorySessionRecord:
        return InventorySessionRecord(
            id=int(row["id"]),
            nome=str(row["nome"]),
            local=str(row["local"]),
            status=str(row["status"]),
            observacao=row["observacao"],
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
            applied_at=datetime.fromisoformat(str(row["applied_at"])) if row["applied_at"] else None,
            total_items=int(row["total_items"] or 0),
            counted_items=int(row["counted_items"] or 0),
            divergent_items=int(row["divergent_items"] or 0),
        )

    @staticmethod
    def row_to_count(row) -> InventoryCountRecord:
        return InventoryCountRecord(
            produto_id=int(row["produto_id"]),
            produto_nome=str(row["produto_nome"]),
            qtd_sistema=int(row["qtd_sistema"] or 0),
            qtd_fisico=int(row["qtd_fisico"]) if row["qtd_fisico"] is not None else None,
            divergencia=int(row["divergencia"]) if row["divergencia"] is not None else None,
            motivo_ajuste=row["motivo_ajuste"],
            observacao=row["observacao"],
            applied_movement_id=int(row["applied_movement_id"]) if row["applied_movement_id"] else None,
            updated_at=datetime.fromisoformat(str(row["updated_at"])) if row["updated_at"] else None,
        )
