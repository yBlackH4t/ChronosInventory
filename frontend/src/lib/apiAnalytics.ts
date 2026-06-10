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
  baseUrl: string,
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

  isRequestInitLike,
}: ApiContext) {
  return {
    async getDashboardSummary(options: RequestInit = {}) {
      return request<DashboardSummary>(
        `/dashboard/resumo`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsStockSummary(
      paramsOrOptions: { scope?: AnalyticsScope } | RequestInit = {},
      options: RequestInit = {},
    ) {
      const params = isRequestInitLike(paramsOrOptions) ? {} : paramsOrOptions;
      const requestOptions = isRequestInitLike(paramsOrOptions)
        ? paramsOrOptions
        : options;
      const location_id = params.scope ?? null;
      const query = buildQuery({ location_id });
      return await request<StockSummary>(
        `/analytics/stock/summary${query}`,
        { method: "GET", ...requestOptions },
        baseUrl,
      );
    },

    async getAnalyticsStockDistribution(
      paramsOrOptions: { scope?: AnalyticsScope } | RequestInit = {},
      options: RequestInit = {},
    ) {
      const params = isRequestInitLike(paramsOrOptions) ? {} : paramsOrOptions;
      const requestOptions = isRequestInitLike(paramsOrOptions)
        ? paramsOrOptions
        : options;
      const location_id = params.scope ?? null;
      const query = buildQuery({ location_id });
      return await request<StockDistribution>(
        `/analytics/stock/distribution${query}`,
        { method: "GET", ...requestOptions },
        baseUrl,
      );
    },

    async getAnalyticsTopSaidas(
      params: {
        date_from: string;
        date_to: string;
        scope?: AnalyticsScope;
        limit?: number;
      },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        location_id,
        limit: params.limit,
      });
      return await request<TopSaidaItem[]>(
        `/analytics/movements/top-saidas${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsSaidasTimeseries(
      params: {
        date_from: string;
        date_to: string;
        scope?: AnalyticsScope;
        bucket?: "day" | "week" | "month";
      },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        location_id,
        bucket: params.bucket,
      });
      return request<SaidasPoint[]>(
        `/analytics/movements/timeseries${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsFlow(
      params: {
        date_from: string;
        date_to: string;
        scope?: AnalyticsScope;
        bucket?: "day" | "week" | "month";
      },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        location_id,
        bucket: params.bucket,
      });
      return await request<FlowPoint[]>(
        `/analytics/movements/flow${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsStockEvolution(
      params: {
        date_from: string;
        date_to: string;
        scope?: AnalyticsScope;
        bucket?: "day" | "week" | "month";
      },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        location_id,
        bucket: params.bucket,
      });
      return await request<StockEvolutionPoint[]>(
        `/analytics/stock/evolution${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsInactiveProducts(
      params: {
        days?: number;
        date_to?: string;
        limit?: number;
        scope?: AnalyticsScope;
      } = {},
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        days: params.days,
        date_to: params.date_to,
        location_id,
        limit: params.limit,
      });
      return await request<TopSemMovItem[]>(
        `/analytics/products/inactive${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsRecentStockouts(
      params: {
        days?: number;
        date_to?: string;
        limit?: number;
        scope?: AnalyticsScope;
      } = {},
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        days: params.days,
        date_to: params.date_to,
        location_id,
        limit: params.limit,
      });
      return request<RecentStockoutItem[]>(
        `/analytics/products/recent-stockouts${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getAnalyticsExternalTransfers(
      params: {
        date_from: string;
        date_to: string;
        tipo: "ENTRADA" | "SAIDA";
        scope?: AnalyticsScope;
        limit?: number;
      },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        tipo: params.tipo,
        location_id,
        limit: params.limit,
      });
      return request<ExternalTransferItem[]>(
        `/analytics/movements/external-transfers${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getTopSaidas(
      params: { date_from: string; date_to: string; scope?: AnalyticsScope },
      options: RequestInit = {},
    ) {
      return this.getAnalyticsTopSaidas({ ...params, limit: 5 }, options);
    },

    async getStockDistribution(options: RequestInit = {}) {
      return this.getAnalyticsStockDistribution({}, options);
    },

    async getEntradasSaidas(
      params: { date_from: string; date_to: string },
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<EntradasSaidasPoint[]>(
        `/analytics/entradas-saidas${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getEstoqueEvolucao(
      params: { date_from: string; date_to: string },
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<EstoqueEvolucaoPoint[]>(
        `/analytics/estoque-evolucao${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getTopSemMov(
      params: { days?: number; date_to?: string } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<TopSemMovItem[]>(
        `/analytics/top-sem-mov${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },
  };
}
