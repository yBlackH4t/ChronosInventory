from pydantic import BaseModel


class DashboardSummaryOut(BaseModel):
    total_canoas: int
    total_pf: int
    total_geral: int
    itens_distintos: int
    zerados: int
