import type {
  CompareServerStatusOut,
  PublishedCompareBaseOut,
  PublishedCompareDeleteIn,
  PublishedCompareDeleteOut,
  PublishedComparePublishOut,
  PublishedCompareStatusOut,
  RemoteCompareServerOut,
  StockCompareIn,
  StockCompareOut,
  StockProfileActivateIn,
  StockProfileActivateOut,
  StockProfileCreateIn,
  StockProfileDeleteOut,
  StockProfileOut,
  StockProfilesStateOut,
  SuccessResponse,
} from "./api";

type QueryValue = string | number | boolean | null | undefined;

type RequestFn = <T>(
  input: string,
  init: RequestInit | undefined,
  baseUrl: string
) => Promise<SuccessResponse<T>>;

type BuildQueryFn = (params: Record<string, QueryValue>) => string;

type ApiContext = {
  baseUrl: string;
  request: RequestFn;
  buildQuery: BuildQueryFn;
};

export function createSystemApi({ baseUrl, request, buildQuery }: ApiContext) {
  return {
    async listStockProfiles(options: RequestInit = {}) {
      return request<StockProfilesStateOut>(`/sistema/estoques`, { method: "GET", ...options }, baseUrl);
    },

    async createStockProfile(payload: StockProfileCreateIn, options: RequestInit = {}) {
      return request<StockProfileOut>(
        `/sistema/estoques`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async activateStockProfile(payload: StockProfileActivateIn, options: RequestInit = {}) {
      return request<StockProfileActivateOut>(
        `/sistema/estoques/ativo`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async deleteStockProfile(profileId: string, options: RequestInit = {}) {
      return request<StockProfileDeleteOut>(
        `/sistema/estoques/${encodeURIComponent(profileId)}`,
        { method: "DELETE", ...options },
        baseUrl
      );
    },

    async compareStockDatabases(payload: StockCompareIn, options: RequestInit = {}) {
      return request<StockCompareOut>(
        `/sistema/comparar-bases`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async getPublishedCompareStatus(options: RequestInit = {}) {
      return request<PublishedCompareStatusOut>(
        `/sistema/comparativo-publicado/status`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async publishCompareSnapshot(options: RequestInit = {}) {
      return request<PublishedComparePublishOut>(
        `/sistema/comparativo-publicado/publicar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async compareWithPublishedSnapshot(machineLabel: string, options: RequestInit = {}) {
      return request<StockCompareOut>(
        `/sistema/comparativo-publicado/${encodeURIComponent(machineLabel)}/comparar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async getCompareServerStatus(options: RequestInit = {}) {
      return request<CompareServerStatusOut>(
        `/sistema/comparativo-servidor/status`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async listCompareServerHistory(
      params: { limit?: number } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<PublishedCompareBaseOut[]>(
        `/sistema/comparativo-servidor/historico${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async publishCompareServerSnapshot(options: RequestInit = {}) {
      return request<PublishedComparePublishOut>(
        `/sistema/comparativo-servidor/publicar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async deleteCompareServerPublication(
      payload: PublishedCompareDeleteIn,
      options: RequestInit = {}
    ) {
      return request<PublishedCompareDeleteOut>(
        `/sistema/comparativo-servidor/publicacoes`,
        {
          method: "DELETE",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async inspectRemoteCompareServer(serverUrl: string, options: RequestInit = {}) {
      const query = buildQuery({ server_url: serverUrl });
      return request<RemoteCompareServerOut>(
        `/sistema/comparativo-servidor/remoto${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async compareWithRemoteServer(serverUrl: string, options: RequestInit = {}) {
      return request<StockCompareOut>(
        `/sistema/comparativo-servidor/comparar`,
        {
          method: "POST",
          body: JSON.stringify({ server_url: serverUrl }),
          ...options,
        },
        baseUrl
      );
    },
  };
}
