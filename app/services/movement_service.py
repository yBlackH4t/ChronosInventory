"""
Servico de movimentacoes de estoque.
Responsabilidade: validar, aplicar movimentacao e expor analytics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple

from app.models.validators import StockMovementValidator
from app.services.movement_analytics_service import MovementAnalyticsService
from app.services.movement_rules_service import (
    MOTIVO_AJUSTE_LABEL_MAP,
    NATUREZA_AJUSTE,
    NATUREZA_DEVOLUCAO,
    NATUREZA_OPERACAO_NORMAL,
    NATUREZA_TRANSFERENCIA_EXTERNA,
    MovementRulesService,
)
from core.constants import DATE_FORMAT_DB
from core.database.repositories.movement_repository import MovementRepository
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import (
    InsufficientStockException,
    InvalidTransferException,
    ProductNotFoundException,
    ValidationException,
)


@dataclass
class MovementRecord:
    id: int
    produto_id: int
    produto_nome: Optional[str]
    tipo: str
    quantidade: int
    origem_location_id: Optional[int]
    destino_location_id: Optional[int]
    origem: Optional[str]
    destino: Optional[str]
    observacao: Optional[str]
    natureza: str
    motivo_ajuste: Optional[str]
    local_externo: Optional[str]
    documento: Optional[str]
    movimento_ref_id: Optional[int]
    data: datetime


class MovementService:
    """Servico para criar/listar movimentacoes com transacao."""

    def __init__(self) -> None:
        from core.database.repositories.inventory_location_repository import InventoryLocationRepository
        from core.database.connection import DatabaseConnection
        self.repo = MovementRepository()
        self.product_repo = ProductRepository()
        self.rules = MovementRulesService()
        self.analytics = MovementAnalyticsService(
            repo=self.repo,
            normalize_location=self.rules.normalize_location,
            location_repo=InventoryLocationRepository(DatabaseConnection().get_connection())
        )

    def create_movement(
        self,
        tipo: str,
        produto_id: int,
        quantidade: int,
        origem_location_id: Optional[int] = None,
        destino_location_id: Optional[int] = None,
        observacao: Optional[str] = None,
        natureza: Optional[str] = None,
        motivo_ajuste: Optional[str] = None,
        local_externo: Optional[str] = None,
        documento: Optional[str] = None,
        movimento_ref_id: Optional[int] = None,
        data: Optional[datetime] = None,
    ) -> MovementRecord:
        tipo = tipo.upper()
        origem = self.rules.normalize_location(origem_location_id)
        destino = self.rules.normalize_location(destino_location_id)
        natureza = self.rules.normalize_natureza(natureza)
        motivo_ajuste = self.rules.normalize_motivo_ajuste(motivo_ajuste)
        observacao = observacao.strip() if observacao else None
        local_externo = local_externo.strip() if local_externo else None
        documento = documento.strip() if documento else None

        if tipo == "ENTRADA":
            if not destino:
                raise ValidationException("Destino obrigatorio para ENTRADA.")
        elif tipo == "SAIDA":
            if not origem:
                raise ValidationException("Origem obrigatoria para SAIDA.")
        elif tipo == "TRANSFERENCIA":
            self.rules.validate_transfer(origem, destino)
        else:
            raise ValidationException("Tipo de movimentacao invalido.")

        self.rules.validate_business_rules(
            tipo=tipo,
            natureza=natureza,
            local_externo=local_externo,
            motivo_ajuste=motivo_ajuste,
            observacao=observacao,
        )
        if natureza != NATUREZA_AJUSTE:
            motivo_ajuste = None
        if natureza != NATUREZA_TRANSFERENCIA_EXTERNA:
            local_externo = None
        if natureza not in {NATUREZA_DEVOLUCAO, "ESTORNO"}:
            movimento_ref_id = None

        StockMovementValidator.validate_movement_data(
            tipo,
            quantidade,
            location=(destino if tipo == "ENTRADA" else origem),
            transfer_direction=(f"{origem} -> {destino}" if tipo == "TRANSFERENCIA" else None),
        )

        data_hora = (data or datetime.now()).strftime(DATE_FORMAT_DB)

        conn = self.repo.db.get_connection()
        try:
            conn.execute("BEGIN")

            # Load product
            product_row = self.repo.get_product_by_id(conn, produto_id)
            if not product_row:
                raise ProductNotFoundException(f"Produto com ID {produto_id} nao encontrado.")
            
            product = dict(product_row)
            cursor = conn.cursor()
            cursor.execute("SELECT local_id, quantidade FROM produto_estoque WHERE produto_id = ?", (produto_id,))
            product["inventories"] = {row["local_id"]: row["quantidade"] for row in cursor.fetchall()}
            
            if int(product.get("ativo") or 0) != 1:
                raise ValidationException("Produto inativo. Reative o item para registrar movimentacoes.")

            if natureza == NATUREZA_DEVOLUCAO:
                if not movimento_ref_id:
                    raise ValidationException("Informe o movimento de referencia para DEVOLUCAO.")
                ref_movement = self.repo.get_movement_by_id(conn, int(movimento_ref_id))
                if not ref_movement:
                    raise ValidationException("Movimento de referencia nao encontrado.")
                if str(ref_movement.get("tipo", "")).upper() != "SAIDA":
                    raise ValidationException("Movimento de referencia deve ser do tipo SAIDA.")
                if int(ref_movement.get("produto_id") or 0) != int(produto_id):
                    raise ValidationException("Movimento de referencia deve ser do mesmo produto.")

                devolvido = self.repo.get_total_devolucao_by_ref(conn, int(movimento_ref_id))
                original_saida = int(ref_movement.get("quantidade") or 0)
                saldo_devolucao = max(original_saida - devolvido, 0)
                if quantidade > saldo_devolucao:
                    raise ValidationException(
                        "Quantidade de devolucao excede saldo disponivel da saida referenciada."
                    )

            deltas_by_location_id = self.rules.compute_deltas(tipo, quantidade, origem_location_id, destino_location_id)

            # Validate sufficient stock
            inventories = product.get("inventories", {})
            for loc_id, delta in deltas_by_location_id.items():
                if delta < 0:
                    current_stock = inventories.get(loc_id, 0)
                    StockMovementValidator.validate_sufficient_stock(current_stock, abs(delta), str(loc_id))

            self.repo.update_stock(conn, produto_id, deltas_by_location_id)

            movement_id = self.repo.insert_movement(
                conn,
                tipo,
                produto_id,
                quantidade,
                origem_location_id,
                destino_location_id,
                observacao,
                natureza,
                motivo_ajuste,
                local_externo,
                documento,
                movimento_ref_id,
                data_hora,
            )

            conn.commit()
            return MovementRecord(
                id=movement_id,
                produto_id=produto_id,
                produto_nome=product["nome"],
                tipo=tipo,
                quantidade=quantidade,
                origem_location_id=origem_location_id,
                destino_location_id=destino_location_id,
                origem=self.rules.to_human(origem_location_id),
                destino=self.rules.to_human(destino_location_id),
                observacao=observacao,
                natureza=natureza,
                motivo_ajuste=motivo_ajuste,
                local_externo=local_externo,
                documento=documento,
                movimento_ref_id=movimento_ref_id,
                data=datetime.fromisoformat(data_hora),
            )
        except (ValidationException, InvalidTransferException, InsufficientStockException, ProductNotFoundException):
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_movements(
        self,
        produto_id: Optional[int],
        tipo: Optional[str],
        natureza: Optional[str],
        origem_location_id: Optional[int],
        destino_location_id: Optional[int],
        date_from: Optional[datetime],
        date_to: Optional[datetime],
        sort_column: str,
        sort_direction: str,
        limit: int,
        offset: int,
    ) -> Tuple[List[MovementRecord], int]:
        df = date_from.strftime(DATE_FORMAT_DB) if date_from else None
        dt = date_to.strftime(DATE_FORMAT_DB) if date_to else None

        rows = self.repo.list_movements(
            produto_id=produto_id,
            tipo=tipo,
            natureza=natureza,
            origem_local_id=origem_location_id,
            destino_local_id=destino_location_id,
            date_from=df,
            date_to=dt,
            sort_column=sort_column,
            sort_direction=sort_direction,
            limit=limit,
            offset=offset,
        )
        total = self.repo.count_movements(
            produto_id=produto_id,
            tipo=tipo,
            natureza=natureza,
            origem_local_id=origem_location_id,
            destino_local_id=destino_location_id,
            date_from=df,
            date_to=dt,
        )

        return [
            MovementRecord(
                id=row["id"],
                produto_id=row["produto_id"],
                produto_nome=row.get("produto_nome"),
                tipo=row["tipo"],
                quantidade=row["quantidade"],
                origem_location_id=row["origem_local_id"],
                destino_location_id=row["destino_local_id"],
                origem=self.rules.to_human(row["origem_local_id"]),
                destino=self.rules.to_human(row["destino_local_id"]),
                observacao=row.get("observacao"),
                natureza=row.get("natureza") or NATUREZA_OPERACAO_NORMAL,
                motivo_ajuste=row.get("motivo_ajuste"),
                local_externo=row.get("local_externo"),
                documento=row.get("documento"),
                movimento_ref_id=row.get("movimento_ref_id"),
                data=datetime.fromisoformat(row["data_hora"]),
            )
            for row in rows
        ], total

    def get_stock_summary(self, scope: str = "AMBOS") -> dict:
        return self.analytics.get_stock_summary(scope)

    def get_stock_distribution(self, scope: str = "AMBOS") -> dict:
        return self.analytics.get_stock_distribution(scope)

    def get_top_saidas(
        self,
        date_from: date,
        date_to: date,
        scope: Optional[int | str] = None,
        limit: int = 5,
    ) -> List[dict]:
        return self.analytics.get_top_saidas(date_from, date_to, scope, limit)

    def get_saidas_timeseries(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
        scope: Optional[int | str] = None,
    ) -> List[dict]:
        return self.analytics.get_saidas_timeseries(date_from, date_to, bucket, scope)

    def get_flow_timeseries(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
        scope: str,
    ) -> List[dict]:
        return self.analytics.get_flow_timeseries(date_from, date_to, bucket, scope)

    def get_stock_evolution_series(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
        scope: str = "AMBOS",
    ) -> List[dict]:
        return self.analytics.get_stock_evolution_series(date_from, date_to, bucket, scope)

    def get_top_sem_mov(self, days: int, date_to: date, limit: int = 5, scope: str = "AMBOS") -> List[dict]:
        return self.analytics.get_top_sem_mov(days, date_to, limit, scope)

    def get_recent_stockouts(self, days: int, date_to: date, limit: int = 5, scope: str = "AMBOS") -> List[dict]:
        return self.analytics.get_recent_stockouts(days, date_to, limit, scope)

    def get_external_transfer_totals(
        self,
        date_from: date,
        date_to: date,
        tipo: str,
        scope: str = "AMBOS",
        limit: int = 15,
    ) -> List[dict]:
        return self.analytics.get_external_transfer_totals(date_from, date_to, tipo, scope, limit)

    def list_real_sales(self, date_from: date, date_to: date, scope: str = "AMBOS") -> List[dict]:
        return self.analytics.list_real_sales(date_from, date_to, scope)

    def list_inactive_products_report(self, days: int, date_to: date, scope: str = "AMBOS") -> List[dict]:
        return self.analytics.list_inactive_products_report(days, date_to, scope)

    # Compatibilidade de endpoints antigos
    def get_entradas_saidas(self, date_from: date, date_to: date) -> List[dict]:
        return self.analytics.get_entradas_saidas(date_from, date_to)

    def get_estoque_evolucao(self, date_from: date, date_to: date) -> List[dict]:
        return self.analytics.get_estoque_evolucao(date_from, date_to)

