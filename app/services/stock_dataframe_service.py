from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd


class StockDataFrameService:
    def products_to_dataframe(self, products) -> pd.DataFrame:
        if not products:
            return pd.DataFrame(columns=["ID", "Produto", "Canoas", "PF"])

        data = [
            {
                "ID": p.id,
                "Produto": p.nome,
                "Canoas": p.qtd_canoas,
                "PF": p.qtd_pf,
            }
            for p in products
        ]

        return pd.DataFrame(data)

    def selected_products_to_dataframe(self, product_ids: List[int], products_data: List[Dict[str, Any]]) -> pd.DataFrame:
        normalized_ids: List[int] = []
        seen: set[int] = set()
        for raw_id in product_ids:
            product_id = int(raw_id)
            if product_id <= 0 or product_id in seen:
                continue
            normalized_ids.append(product_id)
            seen.add(product_id)

        if not normalized_ids:
            return pd.DataFrame(columns=["ID", "Produto", "Canoas", "PF", "Total", "Onde tem"])

        by_id = {int(item["id"]): item for item in products_data}
        data = []
        for product_id in normalized_ids:
            item = by_id.get(product_id)
            if not item:
                continue
            qtd_canoas = int(item.get("qtd_canoas") or 0)
            qtd_pf = int(item.get("qtd_pf") or 0)
            total = qtd_canoas + qtd_pf
            data.append(
                {
                    "ID": product_id,
                    "Produto": item.get("nome") or "",
                    "Canoas": qtd_canoas,
                    "PF": qtd_pf,
                    "Total": total,
                    "Onde tem": self.location_summary(qtd_canoas, qtd_pf),
                }
            )

        return pd.DataFrame(data, columns=["ID", "Produto", "Canoas", "PF", "Total", "Onde tem"])

    def location_summary(self, qtd_canoas: int, qtd_pf: int) -> str:
        if qtd_canoas > 0 and qtd_pf > 0:
            return "Canoas / PF"
        if qtd_canoas > 0:
            return "Canoas"
        if qtd_pf > 0:
            return "PF"
        return "Sem saldo"
