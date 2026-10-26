import { useQuery } from "@tanstack/react-query";

import type { StockSummary, SuccessResponse } from "../lib/api";
import { api } from "../lib/apiClient";
import { useProfileScope } from "../state/profileScope";

/** Totais por filial do estoque inteiro (o mesmo cache do Painel). */
export function useStockTotals() {
  const { profileScopeKey } = useProfileScope();
  return useQuery<SuccessResponse<StockSummary>>({
    queryKey: ["analytics", profileScopeKey, "stock-summary", null],
    queryFn: ({ signal }) => api.getAnalyticsStockSummary({ scope: null }, { signal }),
    staleTime: 60_000,
  });
}
