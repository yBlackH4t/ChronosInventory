"""
Servico de movimentacoes de estoque.
Responsabilidade: validar, aplicar movimentacao e expor analytics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple

from app.models.validators import StockMovementValidator
from core.constants import DATE_FORMAT_DB
from core.database.repositories.movement_repository import MovementRepository
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import (
    InsufficientStockException,
    InvalidTransferException,
    ProductNotFoundException,
    ValidationException,
)

LOCATION_MAP = {
    "CANOAS": "Canoas",
    "PF": "Passo Fundo",
}

NATUREZA_OPERACAO_NORMAL = "OPERACAO_NORMAL"
NATUREZA_TRANSFERENCIA_EXTERNA = "TRANSFERENCIA_EXTERNA"
NATUREZA_DEVOLUCAO = "DEVOLUCAO"
NATUREZA_AJUSTE = "AJUSTE"
NATUREZAS_VALIDAS = {
    NATUREZA_OPERACAO_NORMAL,
    NATUREZA_TRANSFERENCIA_EXTERNA,
    NATUREZA_DEVOLUCAO,
    NATUREZA_AJUSTE,
}

NATUREZA_LABEL_MAP = {
    NATUREZA_OPERACAO_NORMAL: "Operacao normal",
    NATUREZA_TRANSFERENCIA_EXTERNA: "Transferencia externa",
    NATUREZA_DEVOLUCAO: "Devolucao",
    NATUREZA_AJUSTE: "Ajuste",
}


@dataclass
class MovementRecord:
    id: int
    produto_id: int
    produto_nome: Optional[str]
    tipo: str
    quantidade: int
    origem: Optional[str]
    destino: Optional[str]
    observacao: Optional[str]
    natureza: str
    local_externo: Optional[str]
    documento: Optional[str]
    movimento_ref_id: Optional[int]
    data: datetime


class MovementService:
    """Servico para criar/listar movimentacoes com transacao."""

    def __init__(self) -> None:
        self.repo = MovementRepository()
        self.product_repo = ProductRepository()

    def create_movement(
        self,
        tipo: str,
        produto_id: int,
        quantidade: int,
        origem: Optional[str],
        destino: Optional[str],
        observacao: Optional[str],
        natureza: Optional[str],
        local_externo: Optional[str],
        documento: Optional[str],
        movimento_ref_id: Optional[int],
        data: Optional[datetime],
    ) -> MovementRecord:
        tipo = tipo.upper()
        origem = self._normalize_location(origem)
        destino = self._normalize_location(destino)
        natureza = self._normalize_natureza(natureza)
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
            if not origem or not destino:
                raise ValidationException("Origem e destino sao obrigatorios para TRANSFERENCIA.")
            if origem == destino:
                raise InvalidTransferException("Origem e destino devem ser diferentes.")
        else:
            raise ValidationException("Tipo de movimentacao invalido.")

        self._validate_business_rules(tipo, natureza, local_externo)
        if natureza != NATUREZA_TRANSFERENCIA_EXTERNA:
            local_externo = None
        if natureza != NATUREZA_DEVOLUCAO:
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

            product = self.repo.get_product_by_id(conn, produto_id)
            if not product:
                raise ProductNotFoundException(f"Produto com ID {produto_id} nao encontrado.")

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

            delta_canoas, delta_pf = self._compute_deltas(tipo, quantidade, origem, destino)

            if delta_canoas < 0:
                StockMovementValidator.validate_sufficient_stock(product["qtd_canoas"], abs(delta_canoas), "Canoas")
            if delta_pf < 0:
                StockMovementValidator.validate_sufficient_stock(product["qtd_pf"], abs(delta_pf), "Passo Fundo")

            self.repo.update_stock(conn, produto_id, delta_canoas, delta_pf)

            history_obs = self._build_history_observation(
                tipo=tipo,
                origem=origem,
                destino=destino,
                observacao=observacao,
                natureza=natureza,
                local_externo=local_externo,
                documento=documento,
                movimento_ref_id=movimento_ref_id,
            )
            self.repo.insert_history(conn, tipo, product["nome"], quantidade, history_obs, data_hora)

            movement_id = self.repo.insert_movement(
                conn,
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
                data_hora,
            )

            conn.commit()
            return MovementRecord(
                id=movement_id,
                produto_id=produto_id,
                produto_nome=product["nome"],
                tipo=tipo,
                quantidade=quantidade,
                origem=origem,
                destino=destino,
                observacao=observacao,
                natureza=natureza,
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
        origem: Optional[str],
        destino: Optional[str],
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
            origem=origem,
            destino=destino,
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
            origem=origem,
            destino=destino,
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
                origem=row["origem"],
                destino=row["destino"],
                observacao=row.get("observacao"),
                natureza=row.get("natureza") or NATUREZA_OPERACAO_NORMAL,
                local_externo=row.get("local_externo"),
                documento=row.get("documento"),
                movimento_ref_id=row.get("movimento_ref_id"),
                data=datetime.fromisoformat(row["data_hora"]),
            )
            for row in rows
        ], total

    def get_stock_summary(self) -> dict:
        return self.repo.get_stock_summary()

    def get_stock_distribution(self) -> dict:
        summary = self.repo.get_stock_summary()
        total = summary["total_geral"] or 0
        if total == 0:
            return {
                "items": [
                    {"local": "CANOAS", "quantidade": 0, "percentual": 0.0},
                    {"local": "PF", "quantidade": 0, "percentual": 0.0},
                ],
                "total": 0,
            }

        canoas = summary["total_canoas"]
        pf = summary["total_pf"]
        return {
            "items": [
                {"local": "CANOAS", "quantidade": canoas, "percentual": round((canoas / total) * 100, 2)},
                {"local": "PF", "quantidade": pf, "percentual": round((pf / total) * 100, 2)},
            ],
            "total": total,
        }

    def get_top_saidas(
        self,
        date_from: date,
        date_to: date,
        origem: Optional[str],
        limit: int = 5,
    ) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        origem = self._normalize_location(origem) if origem else None

        rows = self.repo.get_top_saidas(df, dt, origem, limit)
        return [
            {
                "produto_id": row["produto_id"],
                "nome": row["nome"],
                "total_saida": int(row["total_saida"] or 0),
            }
            for row in rows
        ]

    def get_saidas_timeseries(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
        origem: Optional[str],
    ) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        origem = self._normalize_location(origem) if origem else None
        rows = self.repo.get_saidas_timeseries(df, dt, bucket=bucket, origem=origem)
        return [
            {
                "period": row["periodo"],
                "total_saida": int(row.get("total_saida") or 0),
            }
            for row in rows
        ]

    def get_flow_timeseries(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
        scope: str,
    ) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_flow_timeseries(df, dt, bucket=bucket, scope=scope)
        return [
            {
                "period": row["periodo"],
                "entradas": int(row.get("entradas") or 0),
                "saidas": int(row.get("saidas") or 0),
            }
            for row in rows
        ]

    def get_stock_evolution_series(
        self,
        date_from: date,
        date_to: date,
        bucket: str,
    ) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_stock_evolution(df, dt, bucket=bucket)
        return [{"period": row["periodo"], "total_stock": int(row["total_stock"] or 0)} for row in rows]

    def get_top_sem_mov(self, days: int, date_to: date, limit: int = 5) -> List[dict]:
        cutoff_dt = datetime.combine(date_to, time.min) - timedelta(days=days)
        cutoff = cutoff_dt.strftime(DATE_FORMAT_DB)

        rows = self.repo.get_top_sem_mov(cutoff, limit=limit)
        items: List[dict] = []
        for row in rows:
            last = row.get("last_movement")
            dias = days
            if last:
                try:
                    last_dt = datetime.strptime(last, DATE_FORMAT_DB)
                    dias = max((date_to - last_dt.date()).days, 0)
                except Exception:
                    dias = days

            items.append(
                {
                    "produto_id": row["produto_id"],
                    "nome": row["nome"],
                    "last_movement": last,
                    "dias_sem_mov": dias,
                }
            )

        return items

    # Compatibilidade de endpoints antigos
    def get_entradas_saidas(self, date_from: date, date_to: date) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_entradas_saidas_por_dia(df, dt)
        by_day = {row["dia"]: row for row in rows}

        series: List[dict] = []
        current = date_from
        while current <= date_to:
            key = current.isoformat()
            row = by_day.get(key, {})
            series.append(
                {
                    "date": key,
                    "entradas": int(row.get("entradas") or 0),
                    "saidas": int(row.get("saidas") or 0),
                }
            )
            current += timedelta(days=1)
        return series

    def get_estoque_evolucao(self, date_from: date, date_to: date) -> List[dict]:
        rows = self.get_stock_evolution_series(date_from, date_to, bucket="day")
        return [{"date": row["period"], "total_stock": row["total_stock"]} for row in rows]

    def _normalize_location(self, loc: Optional[str]) -> Optional[str]:
        if loc is None:
            return None
        loc = loc.upper()
        if loc not in LOCATION_MAP:
            raise ValidationException("Local invalido. Use CANOAS ou PF.")
        return loc

    def _compute_deltas(
        self,
        tipo: str,
        quantidade: int,
        origem: Optional[str],
        destino: Optional[str],
    ) -> Tuple[int, int]:
        delta_canoas = 0
        delta_pf = 0

        if tipo == "ENTRADA":
            if destino == "CANOAS":
                delta_canoas = quantidade
            elif destino == "PF":
                delta_pf = quantidade
        elif tipo == "SAIDA":
            if origem == "CANOAS":
                delta_canoas = -quantidade
            elif origem == "PF":
                delta_pf = -quantidade
        elif tipo == "TRANSFERENCIA":
            if origem == "CANOAS" and destino == "PF":
                delta_canoas = -quantidade
                delta_pf = quantidade
            elif origem == "PF" and destino == "CANOAS":
                delta_pf = -quantidade
                delta_canoas = quantidade

        return delta_canoas, delta_pf

    def _build_history_observation(
        self,
        tipo: str,
        origem: Optional[str],
        destino: Optional[str],
        observacao: Optional[str],
        natureza: str,
        local_externo: Optional[str],
        documento: Optional[str],
        movimento_ref_id: Optional[int],
    ) -> str:
        if tipo == "TRANSFERENCIA":
            base = f"{self._to_human(origem)} -> {self._to_human(destino)}"
        elif tipo == "ENTRADA":
            base = f"Entrada em {self._to_human(destino)}"
        else:
            base = f"Saida em {self._to_human(origem)}"

        details: List[str] = []
        if natureza != NATUREZA_OPERACAO_NORMAL:
            details.append(f"Natureza: {NATUREZA_LABEL_MAP.get(natureza, natureza)}")
        if local_externo:
            details.append(f"Local externo: {local_externo}")
        if documento:
            details.append(f"Documento: {documento}")
        if movimento_ref_id:
            details.append(f"Movimento ref: {movimento_ref_id}")
        if observacao:
            details.append(observacao)

        if details:
            return f"{base} | {' | '.join(details)}"
        return base

    def _to_human(self, loc: Optional[str]) -> str:
        if not loc:
            return ""
        return LOCATION_MAP[loc]

    def _normalize_natureza(self, natureza: Optional[str]) -> str:
        if not natureza:
            return NATUREZA_OPERACAO_NORMAL
        natureza = natureza.upper()
        if natureza not in NATUREZAS_VALIDAS:
            raise ValidationException("Natureza invalida.")
        return natureza

    def _validate_business_rules(
        self,
        tipo: str,
        natureza: str,
        local_externo: Optional[str],
    ) -> None:
        if natureza == NATUREZA_DEVOLUCAO and tipo != "ENTRADA":
            raise ValidationException("Natureza DEVOLUCAO exige movimentacao do tipo ENTRADA.")

        if natureza == NATUREZA_TRANSFERENCIA_EXTERNA:
            if tipo != "SAIDA":
                raise ValidationException("Natureza TRANSFERENCIA_EXTERNA exige movimentacao do tipo SAIDA.")
            if not local_externo:
                raise ValidationException("Informe o local externo para TRANSFERENCIA_EXTERNA.")
