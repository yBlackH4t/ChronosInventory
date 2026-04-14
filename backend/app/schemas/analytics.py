from __future__ import annotations

from pydantic import BaseModel


class TopSaidaItem(BaseModel):
    produto_id: int
    nome: str
    total_saida: int


class StockSummaryOut(BaseModel):
    total_canoas: int
    total_pf: int
    total_geral: int
    zerados: int


class StockDistributionItem(BaseModel):
    local: str
    quantidade: int
    percentual: float


class StockDistributionOut(BaseModel):
    items: list[StockDistributionItem]
    total: int


class FlowPoint(BaseModel):
    period: str
    entradas: int
    saidas: int


class SaidasPoint(BaseModel):
    period: str
    total_saida: int


class StockEvolutionPoint(BaseModel):
    period: str
    total_stock: int


class TopSemMovItem(BaseModel):
    produto_id: int
    nome: str
    last_movement: str | None = None
    dias_sem_mov: int


class RecentStockoutItem(BaseModel):
    produto_id: int
    nome: str
    total_saida_recente: int
    last_sale: str | None = None


class ExternalTransferItem(BaseModel):
    produto_id: int
    nome: str
    total_quantidade: int
    total_movimentacoes: int
    ultima_transferencia: str | None = None


# Compat com endpoints antigos
class EntradasSaidasPoint(BaseModel):
    date: str
    entradas: int
    saidas: int


class EstoqueEvolucaoPoint(BaseModel):
    date: str
    total_stock: int
