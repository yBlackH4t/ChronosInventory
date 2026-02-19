"""
Servico de inventario ciclico.
Responsabilidade: abrir sessao, registrar contagens e aplicar ajustes em lote.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from app.models.validators import StockMovementValidator
from app.services.movement_service import (
    MOTIVOS_AJUSTE_VALIDOS,
    NATUREZA_AJUSTE,
)
from core.constants import DATE_FORMAT_DB
from core.database.connection import DatabaseConnection
from core.database.repositories.movement_repository import MovementRepository
from core.exceptions import ValidationException


INVENTORY_STATUS_ABERTO = "ABERTO"
INVENTORY_STATUS_APLICADO = "APLICADO"
INVENTORY_LOCAL_VALIDOS = {"CANOAS", "PF"}


@dataclass
class InventorySessionRecord:
    id: int
    nome: str
    local: str
    status: str
    observacao: Optional[str]
    created_at: datetime
    updated_at: datetime
    applied_at: Optional[datetime]
    total_items: int
    counted_items: int
    divergent_items: int


@dataclass
class InventoryCountRecord:
    produto_id: int
    produto_nome: str
    qtd_sistema: int
    qtd_fisico: Optional[int]
    divergencia: Optional[int]
    motivo_ajuste: Optional[str]
    observacao: Optional[str]
    applied_movement_id: Optional[int]
    updated_at: Optional[datetime]


class InventoryService:
    def __init__(self) -> None:
        self.db = DatabaseConnection()
        self.movement_repo = MovementRepository()

    def create_session(self, nome: str, local: str, observacao: Optional[str]) -> InventorySessionRecord:
        nome = (nome or "").strip()
        if not nome:
            raise ValidationException("Nome da sessao de inventario e obrigatorio.")
        local = self._normalize_local(local)
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
            return self._get_session_by_id(conn, session_id)
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
            return [self._row_to_session(row) for row in rows]
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
            return self._get_session_by_id(conn, session_id)
        finally:
            conn.close()

    def list_session_counts(
        self,
        session_id: int,
        limit: int = 50,
        offset: int = 0,
        only_divergent: bool = False,
        query: str = "",
    ) -> Tuple[List[InventoryCountRecord], int]:
        conn = self.db.get_connection()
        try:
            self._ensure_session_exists(conn, session_id)

            where = ["c.session_id = ?"]
            params: List[object] = [session_id]
            if only_divergent:
                where.append("COALESCE(c.divergencia, 0) <> 0")
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
            return [self._row_to_count(item) for item in rows], total
        finally:
            conn.close()

    def update_counts(
        self,
        session_id: int,
        items: List[dict],
    ) -> InventorySessionRecord:
        if not items:
            raise ValidationException("Informe ao menos um item para contagem.")

        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            self._ensure_session_open(conn, session_id)

            for item in items:
                produto_id = int(item["produto_id"])
                qtd_fisico = int(item["qtd_fisico"])
                if qtd_fisico < 0:
                    raise ValidationException("Contagem fisica nao pode ser negativa.")

                motivo_ajuste = self._normalize_motivo_ajuste(item.get("motivo_ajuste"))
                observacao = (item.get("observacao") or "").strip() or None

                row = cursor.execute(
                    """
                    SELECT qtd_sistema
                    FROM inventory_counts
                    WHERE session_id = ? AND produto_id = ?
                    """,
                    (session_id, produto_id),
                ).fetchone()
                if not row:
                    raise ValidationException(f"Produto {produto_id} nao pertence a sessao de inventario.")

                qtd_sistema = int(row[0])
                divergencia = qtd_fisico - qtd_sistema
                if divergencia == 0:
                    motivo_ajuste = None

                cursor.execute(
                    """
                    UPDATE inventory_counts
                    SET qtd_fisico = ?,
                        divergencia = ?,
                        motivo_ajuste = ?,
                        observacao = ?,
                        applied_movement_id = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = ? AND produto_id = ?
                    """,
                    (qtd_fisico, divergencia, motivo_ajuste, observacao, session_id, produto_id),
                )

            cursor.execute(
                """
                UPDATE inventory_sessions
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (session_id,),
            )
            conn.commit()
            return self._get_session_by_id(conn, session_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def apply_session_adjustments(self, session_id: int) -> dict:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            session = self._ensure_session_open(conn, session_id)
            local = str(session["local"])
            nome_sessao = str(session["nome"])

            rows = cursor.execute(
                """
                SELECT c.produto_id,
                       p.nome AS produto_nome,
                       c.qtd_sistema,
                       c.qtd_fisico,
                       c.divergencia,
                       c.motivo_ajuste,
                       c.observacao
                FROM inventory_counts c
                JOIN produtos p ON p.id = c.produto_id
                WHERE c.session_id = ?
                  AND c.qtd_fisico IS NOT NULL
                  AND COALESCE(c.divergencia, 0) <> 0
                  AND c.applied_movement_id IS NULL
                ORDER BY p.nome ASC
                """,
                (session_id,),
            ).fetchall()
            if not rows:
                raise ValidationException("Nenhuma divergencia pendente para aplicar na sessao.")

            movement_ids: List[int] = []
            data_hora = datetime.now().strftime(DATE_FORMAT_DB)
            for row in rows:
                produto_id = int(row["produto_id"])
                produto_nome = str(row["produto_nome"])
                divergencia = int(row["divergencia"] or 0)
                motivo_ajuste = self._normalize_motivo_ajuste(row["motivo_ajuste"])
                observacao = (row["observacao"] or "").strip()

                if not motivo_ajuste:
                    raise ValidationException(
                        f"Motivo obrigatorio para aplicar ajuste no produto '{produto_nome}'."
                    )
                if not observacao:
                    raise ValidationException(
                        f"Observacao obrigatoria para aplicar ajuste no produto '{produto_nome}'."
                    )

                quantidade = abs(divergencia)
                tipo = "ENTRADA" if divergencia > 0 else "SAIDA"
                origem = local if tipo == "SAIDA" else None
                destino = local if tipo == "ENTRADA" else None
                delta_canoas, delta_pf = self._compute_deltas(local, divergencia)

                product_row = cursor.execute(
                    "SELECT qtd_canoas, qtd_pf FROM produtos WHERE id = ?",
                    (produto_id,),
                ).fetchone()
                if not product_row:
                    raise ValidationException(f"Produto {produto_id} nao encontrado.")

                if delta_canoas < 0:
                    StockMovementValidator.validate_sufficient_stock(
                        int(product_row["qtd_canoas"] or 0),
                        abs(delta_canoas),
                        "Canoas",
                    )
                if delta_pf < 0:
                    StockMovementValidator.validate_sufficient_stock(
                        int(product_row["qtd_pf"] or 0),
                        abs(delta_pf),
                        "Passo Fundo",
                    )

                self.movement_repo.update_stock(conn, produto_id, delta_canoas, delta_pf)

                movement_obs = (
                    f"Ajuste inventario sessao #{session_id} ({nome_sessao}) | "
                    f"Motivo: {motivo_ajuste} | Sistema: {row['qtd_sistema']} | "
                    f"Fisico: {row['qtd_fisico']} | Divergencia: {divergencia} | {observacao}"
                )
                self.movement_repo.insert_history(
                    conn=conn,
                    operacao="AJUSTE",
                    produto_nome=produto_nome,
                    quantidade=quantidade,
                    observacao=movement_obs,
                    data_hora=data_hora,
                )
                movement_id = self.movement_repo.insert_movement(
                    conn=conn,
                    tipo=tipo,
                    produto_id=produto_id,
                    quantidade=quantidade,
                    origem=origem,
                    destino=destino,
                    observacao=movement_obs,
                    natureza=NATUREZA_AJUSTE,
                    motivo_ajuste=motivo_ajuste,
                    local_externo=None,
                    documento=f"INV-{session_id}",
                    movimento_ref_id=None,
                    data_hora=data_hora,
                )
                movement_ids.append(movement_id)

                cursor.execute(
                    """
                    UPDATE inventory_counts
                    SET applied_movement_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = ? AND produto_id = ?
                    """,
                    (movement_id, session_id, produto_id),
                )

            cursor.execute(
                """
                UPDATE inventory_sessions
                SET status = ?,
                    applied_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (INVENTORY_STATUS_APLICADO, data_hora, data_hora, session_id),
            )
            conn.commit()
            return {
                "session_id": session_id,
                "applied_items": len(movement_ids),
                "movement_ids": movement_ids,
                "status": INVENTORY_STATUS_APLICADO,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _get_session_by_id(self, conn, session_id: int) -> InventorySessionRecord:
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
        return self._row_to_session(row)

    def _ensure_session_exists(self, conn, session_id: int) -> None:
        row = conn.execute("SELECT id FROM inventory_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise ValidationException("Sessao de inventario nao encontrada.")

    def _ensure_session_open(self, conn, session_id: int):
        row = conn.execute(
            "SELECT id, nome, local, status FROM inventory_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not row:
            raise ValidationException("Sessao de inventario nao encontrada.")
        if str(row["status"]).upper() != INVENTORY_STATUS_ABERTO:
            raise ValidationException("Sessao de inventario nao esta aberta para alteracoes.")
        return row

    def _normalize_local(self, local: str) -> str:
        local = (local or "").strip().upper()
        if local not in INVENTORY_LOCAL_VALIDOS:
            raise ValidationException("Local invalido para inventario. Use CANOAS ou PF.")
        return local

    def _normalize_motivo_ajuste(self, motivo: Optional[str]) -> Optional[str]:
        if not motivo:
            return None
        motivo = str(motivo).strip().upper()
        if motivo not in MOTIVOS_AJUSTE_VALIDOS:
            raise ValidationException(
                "Motivo de ajuste invalido. Use: AVARIA, PERDA, CORRECAO_INVENTARIO, ERRO_OPERACIONAL, TRANSFERENCIA."
            )
        return motivo

    def _compute_deltas(self, local: str, divergencia: int) -> Tuple[int, int]:
        if local == "CANOAS":
            return divergencia, 0
        return 0, divergencia

    def _row_to_session(self, row) -> InventorySessionRecord:
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

    def _row_to_count(self, row) -> InventoryCountRecord:
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
