from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SelectedStockReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_ids: list[int] = Field(min_length=1)

    @field_validator("product_ids")
    @classmethod
    def validate_product_ids(cls, value: list[int]) -> list[int]:
        normalized: list[int] = []
        seen: set[int] = set()
        for raw_id in value:
            product_id = int(raw_id)
            if product_id <= 0:
                raise ValueError("Todos os IDs de produto devem ser maiores que zero.")
            if product_id in seen:
                continue
            normalized.append(product_id)
            seen.add(product_id)
        if not normalized:
            raise ValueError("Selecione ao menos um produto para gerar o relatorio.")
        return normalized
