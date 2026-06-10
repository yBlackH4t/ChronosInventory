import type {
  InventorySessionCreateIn,
  InventorySessionOut,
  InventorySessionSummaryOut,
  InventoryStatusFilter,
  InventoryCountOut,
  InventoryCountsUpdateIn,
  InventoryApplyOut,
  InventorySessionDeleteOut,
  SuccessResponse,
} from "../types/api";

type QueryValue = string | number | boolean | null | undefined;

type RequestFn = <T>(
  input: string,
  init: RequestInit | undefined,
  baseUrl: string,
) => Promise<SuccessResponse<T>>;

type BuildQueryFn = (params: Record<string, QueryValue>) => string;

export type ApiContext = {
  baseUrl: string;
  request: RequestFn;
  buildQuery: BuildQueryFn;
};

export function createInventoryApi({
  baseUrl,
  request,
  buildQuery,
}: ApiContext) {
  return {
    async inventoryCreateSession(
      payload: InventorySessionCreateIn,
      options: RequestInit = {},
    ) {
      return request<InventorySessionOut>(
        `/inventario/sessoes`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async inventoryListSessions(
      params: { page?: number; page_size?: number } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<InventorySessionOut[]>(
        `/inventario/sessoes${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async inventoryGetSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionOut>(
        `/inventario/sessoes/${sessionId}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async inventoryGetSessionSummary(
      sessionId: number,
      options: RequestInit = {},
    ) {
      return request<InventorySessionSummaryOut>(
        `/inventario/sessoes/${sessionId}/resumo`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async inventoryListSessionItems(
      sessionId: number,
      params: {
        only_divergent?: boolean;
        query?: string;
        page?: number;
        page_size?: number;
        status_filter?: InventoryStatusFilter;
      } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<InventoryCountOut[]>(
        `/inventario/sessoes/${sessionId}/itens${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async inventoryUpdateSessionItems(
      sessionId: number,
      payload: InventoryCountsUpdateIn,
      options: RequestInit = {},
    ) {
      return request<InventorySessionOut>(
        `/inventario/sessoes/${sessionId}/itens`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async inventoryApplySession(sessionId: number, options: RequestInit = {}) {
      return request<InventoryApplyOut>(
        `/inventario/sessoes/${sessionId}/aplicar`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async inventoryCloseSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionOut>(
        `/inventario/sessoes/${sessionId}/fechar`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async inventoryDeleteSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionDeleteOut>(
        `/inventario/sessoes/${sessionId}`,
        { method: "DELETE", ...options },
        baseUrl,
      );
    },
  };
}
