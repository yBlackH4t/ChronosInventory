import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type { ProductVisualItem } from "../lib/api";

// Miniatura da foto e vendas das últimas 13 semanas dos produtos na tela.
export function useProductsVisual(ids: number[]) {
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b), [ids]);
  const query = useQuery({
    queryKey: ["produtos-visual", key],
    queryFn: ({ signal }) => api.getProductsVisual(key.slice(0, 100), { signal }),
    enabled: key.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const map = new Map<number, ProductVisualItem>();
    for (const item of query.data?.data ?? []) map.set(item.id, item);
    return map;
  }, [query.data]);
}
