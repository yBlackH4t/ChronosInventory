import type {
  AnalyticsScope,
  DashboardSummary,
  EntradasSaidasPoint,
  EstoqueEvolucaoPoint,
  ExternalTransferItem,
  FlowPoint,
  RecentStockoutItem,
  SaidasPoint,
  StockDistribution,
  StockEvolutionPoint,
  StockSummary,
  SuccessResponse,
  TopSaidaItem,
  TopSemMovItem,
} from "./api";

type QueryValue = string | number | boolean | null | undefined;

type RequestFn = <T>(
  input: string,
  init: RequestInit | undefined,
  baseUrl: string
) => Promise<SuccessResponse<T>>;

type BuildQueryFn = (params: Record<string, QueryValue>) => string;
type IsNotFoundFn = (error: unknown) => boolean;
type IsRequestInitLikeFn = (value: unknown) => value is RequestInit;

type ApiContext = {
  baseUrl: string;
  request: RequestFn;
  buildQuery: BuildQueryFn;
  isNotFound: IsNotFoundFn;
  isRequestInitLike: IsRequestInitLikeFn;
};

export function createAnalyticsApi({
  baseUrl,
  request,
  buildQuery,
  isNotFound,
  isRequestInitLike,
}: ApiContext) {
  return {
    async getDashboardSummary(options: RequestInit = {}) {
      return request<DashboardSummary>(`/dashboard/resumo`, { method: "GET", ...options }, baseUrl);
    },

    async getAnalyticsStockSummary(
      paramsOrOptions: { scope?: AnalyticsScope } | RequestInit = {},
      options: RequestInit = {}
    ) {
      const params = isRequestInitLike(paramsOrOptions) ? {} : paramsOrOptions;
      const requestOptions = isRequestInitLike(paramsOrOptions) ? paramsOrOptions : options;
      const scope = params.scope ?? "AMBOS";
      const query = buildQuery({ scope });
      try {
        return await request<StockSummary>(
          `/analytics/stock/summary${query}`,
          { method: "GET", ...requestOptions },
          baseUrl
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<DashboardSummary>(
          `/dashboard/resumo`,
          { method: "GET", ...requestOptions },
          baseUrl
        );
        if (scope === "CANOAS") {
          return {
            data: {
              total_canoas: legacy.data.total_canoas,
              total_pf: 0,
              total_geral: legacy.data.total_canoas,
              zerados: legacy.data.zerados,
            },
            meta: legacy.meta,
          };
        }
        if (scope === "PF") {
          return {
            data: {
              total_canoas: 0,
              total_pf: legacy.data.total_pf,
              total_geral: legacy.data.total_pf,
              zerados: legacy.data.zerados,
            },
            meta: legacy.meta,
          };
        }
        return {
          data: {
            total_canoas: legacy.data.total_canoas,
            total_pf: legacy.data.total_pf,
            total_geral: legacy.data.total_geral,
            zerados: legacy.data.zerados,
          },
          meta: legacy.meta,
        };
      }
    },

    async getAnalyticsStockDistribution(
      paramsOrOptions: { scope?: AnalyticsScope } | RequestInit = {},
      options: RequestInit = {}
    ) {
      const params = isRequestInitLike(paramsOrOptions) ? {} : paramsOrOptions;
      const requestOptions = isRequestInitLike(paramsOrOptions) ? paramsOrOptions : options;
      const scope = params.scope ?? "AMBOS";
      const query = buildQuery({ scope });
      try {
        return await request<StockDistribution>(
          `/analytics/stock/distribution${query}`,
          { method: "GET", ...requestOptions },
          baseUrl
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<{ canoas: number; pf: number; total: number }>(
          `/analytics/estoque-distribuicao`,
          { method: "GET", ...requestOptions },
          baseUrl
        );
        const total = legacy.data.total || 0;
        if (scope === "CANOAS") {
          return {
            data: {
              items: [
                {
                  local: "CANOAS" as const,
                  quantidade: legacy.data.canoas,
                  percentual: legacy.data.canoas > 0 ? 100 : 0,
                },
              ],
              total: legacy.data.canoas,
            },
            meta: legacy.meta,
          };
        }
        if (scope === "PF") {
          return {
            data: {
              items: [
                {
                  local: "PF" as const,
                  quantidade: legacy.data.pf,
                  percentual: legacy.data.pf > 0 ? 100 : 0,
                },
              ],
              total: legacy.data.pf,
            },
            meta: legacy.meta,
          };
        }
        return {
          data: {
            items: [
              {
                local: "CANOAS" as const,
                quantidade: legacy.data.canoas,
                percentual: total > 0 ? Number(((legacy.data.canoas / total) * 100).toFixed(2)) : 0,
              },
              {
                local: "PF" as const,
                quantidade: legacy.data.pf,
                percentual: total > 0 ? Number(((legacy.data.pf / total) * 100).toFixed(2)) : 0,
              },
            ],
            total,
          },
          meta: legacy.meta,
        };
      }
    },

    async getAnalyticsTopSaidas(
      params: { date_from: string; date_to: string; scope: "CANOAS" | "PF" | "AMBOS"; limit?: number },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      try {
        return await request<TopSaidaItem[]>(`/analytics/movements/top-saidas${query}`, { method: "GET", ...options }, baseUrl);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        return request<TopSaidaItem[]>(`/analytics/top-saidas${query}`, { method: "GET", ...options }, baseUrl);
      }
    },

    async getAnalyticsSaidasTimeseries(
      params: {
        date_from: string;
        date_to: string;
        scope: "CANOAS" | "PF" | "AMBOS";
        bucket?: "day" | "week" | "month";
      },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<SaidasPoint[]>(`/analytics/movements/timeseries${query}`, { method: "GET", ...options }, baseUrl);
    },

    async getAnalyticsFlow(
      params: {
        date_from: string;
        date_to: string;
        scope?: "CANOAS" | "PF" | "AMBOS";
        bucket?: "day" | "week" | "month";
      },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      try {
        return await request<FlowPoint[]>(`/analytics/movements/flow${query}`, { method: "GET", ...options }, baseUrl);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<EntradasSaidasPoint[]>(
          `/analytics/entradas-saidas${buildQuery({ date_from: params.date_from, date_to: params.date_to })}`,
          { method: "GET", ...options },
          baseUrl
        );
        return {
          data: legacy.data.map((item) => ({
            period: item.date,
            entradas: item.entradas,
            saidas: item.saidas,
          })),
          meta: legacy.meta,
        };
      }
    },

    async getAnalyticsStockEvolution(
      params: { date_from: string; date_to: string; scope?: "CANOAS" | "PF" | "AMBOS"; bucket?: "day" | "week" | "month" },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      try {
        return await request<StockEvolutionPoint[]>(
          `/analytics/stock/evolution${query}`,
          { method: "GET", ...options },
          baseUrl
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<EstoqueEvolucaoPoint[]>(
          `/analytics/estoque-evolucao${buildQuery({ date_from: params.date_from, date_to: params.date_to })}`,
          { method: "GET", ...options },
          baseUrl
        );
        return {
          data: legacy.data.map((item) => ({
            period: item.date,
            total_stock: item.total_stock,
          })),
          meta: legacy.meta,
        };
      }
    },

    async getAnalyticsInactiveProducts(
      params: { days?: number; date_to?: string; limit?: number; scope?: "CANOAS" | "PF" | "AMBOS" } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      try {
        return await request<TopSemMovItem[]>(`/analytics/products/inactive${query}`, { method: "GET", ...options }, baseUrl);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        return request<TopSemMovItem[]>(
          `/analytics/top-sem-mov${buildQuery({ days: params.days, date_to: params.date_to })}`,
          { method: "GET", ...options },
          baseUrl
        );
      }
    },

    async getAnalyticsRecentStockouts(
      params: { days?: number; date_to?: string; limit?: number; scope?: "CANOAS" | "PF" | "AMBOS" } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<RecentStockoutItem[]>(
        `/analytics/products/recent-stockouts${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async getAnalyticsExternalTransfers(
      params: {
        date_from: string;
        date_to: string;
        tipo: "ENTRADA" | "SAIDA";
        scope?: "CANOAS" | "PF" | "AMBOS";
        limit?: number;
      },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<ExternalTransferItem[]>(
        `/analytics/movements/external-transfers${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async getTopSaidas(
      params: { date_from: string; date_to: string; scope: "CANOAS" | "PF" | "AMBOS" },
      options: RequestInit = {}
    ) {
      return this.getAnalyticsTopSaidas({ ...params, limit: 5 }, options);
    },

    async getStockDistribution(options: RequestInit = {}) {
      return this.getAnalyticsStockDistribution({}, options);
    },

    async getEntradasSaidas(params: { date_from: string; date_to: string }, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<EntradasSaidasPoint[]>(`/analytics/entradas-saidas${query}`, { method: "GET", ...options }, baseUrl);
    },

    async getEstoqueEvolucao(params: { date_from: string; date_to: string }, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<EstoqueEvolucaoPoint[]>(`/analytics/estoque-evolucao${query}`, { method: "GET", ...options }, baseUrl);
    },

    async getTopSemMov(params: { days?: number; date_to?: string } = {}, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<TopSemMovItem[]>(`/analytics/top-sem-mov${query}`, { method: "GET", ...options }, baseUrl);
    },
  };
}
