"""
Ajustes e transicoes de sessao do inventario.
Responsabilidade: salvar contagens, fechar/excluir sessao e aplicar ajustes.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from app.models.validators import StockMovementValidator
from app.services.inventory_types import INVENTORY_STATUS_APLICADO, INVENTORY_STATUS_FECHADO
from app.services.movement_rules_service import MOTIVOS_AJUSTE_VALIDOS, NATUREZA_AJUSTE
from core.constants import DATE_FORMAT_DB
from core.exceptions import ValidationException


class InventoryAdjustmentService:
    def __init__(self, *, db, movement_repo, session_service) -> None:
        self.db = db
        self.movement_repo = movement_repo
        self.session_service = session_service

    def update_counts(self, session_id: int, items: List[dict]):
        if not items:
            raise ValidationException("Informe ao menos um item para contagem.")

        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            self.session_service.ensure_session_open(conn, session_id)

            for item in items:
                produto_id = int(item["produto_id"])
                qtd_fisico = int(item["qtd_fisico"])
                if qtd_fisico < 0:
                    raise ValidationException("Contagem fisica nao pode ser negativa.")

                motivo_ajuste = self.normalize_motivo_ajuste(item.get("motivo_ajuste"))
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
            return self.session_service.get_session_by_id(conn, session_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def close_session(self, session_id: int):
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            row = cursor.execute("SELECT id, status FROM inventory_sessions WHERE id = ?", (session_id,)).fetchone()
            if not row:
                raise ValidationException("Sessao de inventario nao encontrada.")

            status = str(row["status"]).upper()
            if status == INVENTORY_STATUS_APLICADO:
                raise ValidationException("Sessao aplicada nao pode ser fechada.")
            if status == INVENTORY_STATUS_FECHADO:
                raise ValidationException("Sessao de inventario ja esta fechada.")

            cursor.execute(
                """
                UPDATE inventory_sessions
                SET status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (INVENTORY_STATUS_FECHADO, session_id),
            )
            conn.commit()
            return self.session_service.get_session_by_id(conn, session_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_session(self, session_id: int) -> dict:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN")
            row = cursor.execute(
                """
                SELECT id, nome, status
                FROM inventory_sessions
                WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            if not row:
                raise ValidationException("Sessao de inventario nao encontrada.")

            status = str(row["status"]).upper()
            if status == INVENTORY_STATUS_APLICADO:
                raise ValidationException("Sessao aplicada nao pode ser excluida.")

            applied_row = cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM inventory_counts
                WHERE session_id = ?
                  AND applied_movement_id IS NOT NULL
                """,
                (session_id,),
            ).fetchone()
            if int(applied_row["total"] or 0) > 0:
                raise ValidationException("Sessao com ajustes aplicados nao pode ser excluida.")

            cursor.execute("DELETE FROM inventory_sessions WHERE id = ?", (session_id,))
            conn.commit()
            return {
                "session_id": int(row["id"]),
                "session_name": str(row["nome"]),
                "status": status,
                "message": "Sessao de inventario excluida com sucesso.",
            }
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
            session = self.session_service.ensure_session_open(conn, session_id)
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
                motivo_ajuste = self.normalize_motivo_ajuste(row["motivo_ajuste"])
                observacao = (row["observacao"] or "").strip()

                if not motivo_ajuste:
                    raise ValidationException(f"Motivo obrigatorio para aplicar ajuste no produto '{produto_nome}'.")
                if not observacao:
                    raise ValidationException(f"Observacao obrigatoria para aplicar ajuste no produto '{produto_nome}'.")

                quantidade = abs(divergencia)
                tipo = "ENTRADA" if divergencia > 0 else "SAIDA"
                origem = local if tipo == "SAIDA" else None
                destino = local if tipo == "ENTRADA" else None
                delta_canoas, delta_pf = self.compute_deltas(local, divergencia)

                product_row = cursor.execute(
                    "SELECT qtd_canoas, qtd_pf FROM produtos WHERE id = ?",
                    (produto_id,),
                ).fetchone()
                if not product_row:
                    raise ValidationException(f"Produto {produto_id} nao encontrado.")

                if delta_canoas < 0:
                    StockMovementValidator.validate_sufficient_stock(int(product_row["qtd_canoas"] or 0), abs(delta_canoas), "Canoas")
                if delta_pf < 0:
                    StockMovementValidator.validate_sufficient_stock(int(product_row["qtd_pf"] or 0), abs(delta_pf), "Passo Fundo")

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

    @staticmethod
    def normalize_motivo_ajuste(motivo: Optional[str]) -> Optional[str]:
        if not motivo:
            return None
        motivo = str(motivo).strip().upper()
        if motivo not in MOTIVOS_AJUSTE_VALIDOS:
            raise ValidationException(
                "Motivo de ajuste invalido. Use: AVARIA, PERDA, CORRECAO_INVENTARIO, ERRO_OPERACIONAL, TRANSFERENCIA."
            )
        return motivo

    @staticmethod
    def compute_deltas(local: str, divergencia: int) -> Tuple[int, int]:
        if local == "CANOAS":
            return divergencia, 0
        return 0, divergencia
