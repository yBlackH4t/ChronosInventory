from pydantic import BaseModel


class LocationSummary(BaseModel):
    location_id: int
    location_name: str
    location_label: str
    color: str | None = None
    total: int


class DashboardSummaryOut(BaseModel):
    locations: list[LocationSummary]
    total_geral: int
    itens_distintos: int
    zerados: int
