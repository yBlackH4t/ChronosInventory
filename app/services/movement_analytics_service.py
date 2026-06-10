"""
Analytics de movimentacoes e estoque.
Responsabilidade: consultas agregadas, series temporais e relatorios read-only.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Callable, List, Optional

from core.constants import DATE_FORMAT_DB
from core.database.repositories.inventory_location_repository import InventoryLocationRepository


class MovementAnalyticsService:
    def __init__(
        self,
        *,
        repo,
        normalize_location: Callable[[Optional[int | str]], Optional[int]],
        location_repo: InventoryLocationRepository | None = None,
    ) -> None:
        self.repo = repo
        self.normalize_location = normalize_location
        self.location_repo = location_repo

    def get_stock_summary(self, scope: Optional[int | str] = None) -> dict:
        summary = self.repo.get_stock_summary(location_id=self.normalize_location(scope))
        locations_db = self.location_repo.get_all_active() if self.location_repo else []
        
        # Build the 'locations' list for StockSummaryOut
        locations_list = []
        loc_totals = summary.get("location_totals", {})
        
        for loc in locations_db:
            loc_id = loc.id
            locations_list.append({
                "location_id": loc_id,
                "location_name": loc.name,
                "location_label": loc.label or loc.name,
                "color": loc.color or "#3b82f6",
                "total": loc_totals.get(loc_id, 0)
            })
            
        return {
            "locations": locations_list,
            "total_geral": summary["total_geral"],
            "zerados": summary["zerados"]
        }

    def get_stock_distribution(self, scope: Optional[int | str] = None) -> dict:
        summary = self.repo.get_stock_summary(location_id=self.normalize_location(scope))
        total = summary.get("total_geral", 0)
        
        locations_db = self.location_repo.get_all_active() if self.location_repo else []
        loc_totals = summary.get("location_totals", {})
        
        items = []
        for loc in locations_db:
            loc_id = loc.id
            qtd = loc_totals.get(loc_id, 0)
            percentual = round((qtd / total) * 100, 2) if total > 0 else 0.0
            items.append({
                "local": loc.name,
                "quantidade": qtd,
                "percentual": percentual
            })
            
        return {
            "items": items,
            "total": total,
        }

    def get_top_saidas(self, date_from: date, date_to: date, scope: Optional[int | str] = None, limit: int = 5) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        origem = self.normalize_location(scope)
        rows = self.repo.get_top_saidas(df, dt, origem, limit)
        return [{"produto_id": row["produto_id"], "nome": row["nome"], "total_saida": int(row["total_saida"] or 0)} for row in rows]

    def get_saidas_timeseries(self, date_from: date, date_to: date, bucket: str, scope: Optional[int | str] = None) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        origem = self.normalize_location(scope)
        rows = self.repo.get_saidas_timeseries(df, dt, bucket=bucket, origem_local_id=origem)
        return [{"period": row["periodo"], "total_saida": int(row.get("total_saida") or 0)} for row in rows]

    def get_flow_timeseries(self, date_from: date, date_to: date, bucket: str, scope: Optional[int | str] = None) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_flow_timeseries(df, dt, bucket=bucket, location_id=self.normalize_location(scope))
        return [
            {"period": row["periodo"], "entradas": int(row.get("entradas") or 0), "saidas": int(row.get("saidas") or 0)}
            for row in rows
        ]

    def get_stock_evolution_series(self, date_from: date, date_to: date, bucket: str, scope: Optional[int | str] = None) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_stock_evolution(df, dt, bucket=bucket, location_id=self.normalize_location(scope))
        return [{"period": row["periodo"], "total_stock": int(row["total_stock"] or 0)} for row in rows]

    def get_top_sem_mov(self, days: int, date_to: date, limit: int = 5, scope: Optional[int | str] = None) -> List[dict]:
        cutoff_dt = datetime.combine(date_to, time.min) - timedelta(days=days)
        cutoff = cutoff_dt.strftime(DATE_FORMAT_DB)
        date_to_limit = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_top_sem_mov(cutoff, date_to_limit, limit=limit, location_id=self.normalize_location(scope))
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
            items.append({"produto_id": row["produto_id"], "nome": row["nome"], "last_movement": last, "dias_sem_mov": dias})
        return items

    def get_recent_stockouts(self, days: int, date_to: date, limit: int = 5, scope: Optional[int | str] = None) -> List[dict]:
        cutoff_dt = datetime.combine(date_to, time.min) - timedelta(days=days)
        cutoff = cutoff_dt.strftime(DATE_FORMAT_DB)
        date_to_limit = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_recent_stockouts(cutoff, date_to_limit, limit=limit, location_id=self.normalize_location(scope))
        return [
            {
                "produto_id": int(row["produto_id"]),
                "nome": str(row["nome"]),
                "total_saida_recente": int(row.get("total_saida_recente") or 0),
                "last_sale": row.get("last_sale"),
            }
            for row in rows
        ]

    def get_external_transfer_totals(
        self,
        date_from: date,
        date_to: date,
        tipo: str,
        scope: Optional[int | str] = None,
        limit: int = 15,
    ) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.get_external_transfer_totals(df, dt, tipo=tipo.upper(), location_id=self.normalize_location(scope), limit=limit)
        return [
            {
                "produto_id": int(row["produto_id"]),
                "nome": str(row["nome"]),
                "total_quantidade": int(row.get("total_quantidade") or 0),
                "total_movimentacoes": int(row.get("total_movimentacoes") or 0),
                "ultima_transferencia": row.get("ultima_transferencia"),
            }
            for row in rows
        ]

    def list_real_sales(self, date_from: date, date_to: date, scope: Optional[int | str] = None) -> List[dict]:
        df = datetime.combine(date_from, time.min).strftime(DATE_FORMAT_DB)
        dt = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        origem = self.normalize_location(scope)
        rows = self.repo.list_real_sales(df, dt, origem_local_id=origem)
        return [
            {
                "movement_id": int(row["id"]),
                "date": str(row["data_hora"]),
                "produto_id": int(row["produto_id"]),
                "produto_nome": str(row["produto_nome"]),
                "quantidade": int(row["quantidade"] or 0),
                "origem": row["origem"] if "origem" in row else None,
                "documento": row.get("documento"),
                "observacao": row.get("observacao"),
            }
            for row in rows
        ]

    def list_inactive_products_report(self, days: int, date_to: date, scope: Optional[int | str] = None) -> List[dict]:
        cutoff_dt = datetime.combine(date_to, time.min) - timedelta(days=days)
        cutoff = cutoff_dt.strftime(DATE_FORMAT_DB)
        date_to_limit = datetime.combine(date_to, time.max).strftime(DATE_FORMAT_DB)
        rows = self.repo.list_inactive_products_report(cutoff, date_to_limit, location_id=self.normalize_location(scope))
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
                    "produto_id": int(row["produto_id"]),
                    "nome": str(row["nome"]),
                    "estoque_atual": int(row.get("estoque_atual") or 0),
                    "local": str(row.get("local") or scope),
                    "last_movement": last,
                    "dias_sem_mov": dias,
                }
            )
        return items

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
            series.append({"date": key, "entradas": int(row.get("entradas") or 0), "saidas": int(row.get("saidas") or 0)})
            current += timedelta(days=1)
        return series

    def get_estoque_evolucao(self, date_from: date, date_to: date) -> List[dict]:
        rows = self.get_stock_evolution_series(date_from, date_to, bucket="day")
        return [{"date": row["period"], "total_stock": row["total_stock"]} for row in rows]
