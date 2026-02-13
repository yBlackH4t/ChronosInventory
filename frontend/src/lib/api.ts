export type SuccessResponse<T> = {
  data: T;
  meta?: any;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: any;
  };
};

export class ApiError extends Error {
  code: string;
  details?: any;
  status: number;

  constructor(code: string, message: string, details: any, status: number) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type Product = {
  id: number;
  nome: string;
  qtd_canoas: number;
  qtd_pf: number;
  total_stock: number;
  observacao?: string | null;
};

export type ProductCreate = {
  nome: string;
  qtd_canoas: number;
  qtd_pf: number;
  observacao?: string | null;
};

export type ProductPut = ProductCreate;
export type ProductPatch = Partial<ProductCreate>;

export type ProductImage = {
  image_base64: string;
};

export type ProductImageItem = {
  id: number;
  mime_type: string;
  is_primary: boolean;
  size_bytes: number;
  created_at?: string | null;
  image_base64: string;
};

export type ProductImageListOut = {
  items: ProductImageItem[];
  total: number;
  max_images: number;
};

export type ProductImageUploadOut = {
  id: number;
  message: string;
  size_bytes: number;
  mime_type: string;
};

export type ProductImagesUploadOut = {
  added: ProductImageUploadOut[];
  total: number;
  max_images: number;
};

export type ProductImageSetPrimaryOut = {
  id: number;
  message: string;
};

export type ListProductsParams = {
  query?: string;
  page?: number;
  page_size?: number;
  sort?: string;
};

export type MovementCreate = {
  tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  produto_id: number;
  quantidade: number;
  origem?: "CANOAS" | "PF";
  destino?: "CANOAS" | "PF";
  observacao?: string;
  natureza?: "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
  local_externo?: string;
  documento?: string;
  movimento_ref_id?: number;
  data?: string;
};

export type MovementOut = {
  id: number;
  produto_id: number;
  produto_nome?: string | null;
  tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  quantidade: number;
  origem?: "CANOAS" | "PF";
  destino?: "CANOAS" | "PF";
  observacao?: string;
  natureza: "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
  local_externo?: string;
  documento?: string;
  movimento_ref_id?: number;
  data: string;
};

export type ListMovementsParams = {
  produto_id?: number;
  tipo?: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  natureza?: "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
  origem?: "CANOAS" | "PF";
  destino?: "CANOAS" | "PF";
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
};

export type BackupOut = {
  path: string;
  size: number;
  created_at: string;
};

export type DashboardSummary = {
  total_canoas: number;
  total_pf: number;
  total_geral: number;
  itens_distintos: number;
  zerados: number;
};

export type StockSummary = {
  total_canoas: number;
  total_pf: number;
  total_geral: number;
  zerados: number;
};

export type StockDistributionItem = {
  local: "CANOAS" | "PF";
  quantidade: number;
  percentual: number;
};

export type StockDistribution = {
  items: StockDistributionItem[];
  total: number;
};

export type TopSaidaItem = {
  produto_id: number;
  nome: string;
  total_saida: number;
};

export type SaidasPoint = {
  period: string;
  total_saida: number;
};

export type FlowPoint = {
  period: string;
  entradas: number;
  saidas: number;
};

export type StockEvolutionPoint = {
  period: string;
  total_stock: number;
};

export type EntradasSaidasPoint = {
  date: string;
  entradas: number;
  saidas: number;
};

export type EstoqueEvolucaoPoint = {
  date: string;
  total_stock: number;
};

export type TopSemMovItem = {
  produto_id: number;
  nome: string;
  last_movement?: string | null;
  dias_sem_mov: number;
};

export type ImportSummary = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  message?: string;
};

export type HealthOut = {
  status: string;
  version: string;
};

export type DownloadResponse = {
  blob: Blob;
  filename?: string;
  headers: Headers;
};

const DEFAULT_BASE_URL =
  (import.meta as any).env?.VITE_API_URL || "http://127.0.0.1:8000";

function buildQuery(params: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    usp.set(key, String(value));
  });
  const query = usp.toString();
  return query ? `?${query}` : "";
}

function isNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  baseUrl: string
): Promise<SuccessResponse<T>> {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = new Headers(options.headers || {});
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    ...options,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (json as ErrorResponse)?.error || {
      code: "http_error",
      message: response.statusText || "Erro",
      details: json,
    };
    throw new ApiError(err.code, err.message, err.details, response.status);
  }

  return json as SuccessResponse<T>;
}

function getFilenameFromHeaders(headers: Headers): string | undefined {
  const direct = headers.get("x-filename");
  if (direct) return direct;

  const contentDisposition = headers.get("content-disposition");
  if (!contentDisposition) return undefined;

  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
  return decodeURIComponent(match?.[1] || match?.[2] || "");
}

async function requestBlob(
  path: string,
  options: RequestInit = {},
  baseUrl: string
): Promise<DownloadResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    const err = (json as ErrorResponse)?.error || {
      code: "http_error",
      message: response.statusText || "Erro",
      details: json,
    };
    throw new ApiError(err.code, err.message, err.details, response.status);
  }

  const blob = await response.blob();
  const filename = getFilenameFromHeaders(response.headers);
  return { blob, filename, headers: response.headers };
}

export function createApiClient(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    async health(options: RequestInit = {}) {
      return request<HealthOut>(`/health`, { method: "GET", ...options }, baseUrl);
    },

    async listProducts(params: ListProductsParams = {}, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<Product[]>(`/produtos${query}`, { method: "GET", ...options }, baseUrl);
    },

    async getProduct(id: number, options: RequestInit = {}) {
      return request<Product>(`/produtos/${id}`, { method: "GET", ...options }, baseUrl);
    },

    async createProduct(payload: ProductCreate, options: RequestInit = {}) {
      return request<Product>(
        `/produtos`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async updateProduct(id: number, payload: ProductPut, options: RequestInit = {}) {
      return request<Product>(
        `/produtos/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async patchProduct(id: number, payload: ProductPatch, options: RequestInit = {}) {
      return request<Product>(
        `/produtos/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async deleteProduct(id: number, options: RequestInit = {}) {
      return request<{ id: number; nome: string; message: string }>(
        `/produtos/${id}`,
        {
          method: "DELETE",
          ...options,
        },
        baseUrl
      );
    },

    async getProductImage(id: number, options: RequestInit = {}) {
      return request<ProductImage>(`/produtos/${id}/imagem`, { method: "GET", ...options }, baseUrl);
    },

    async listProductImages(id: number, options: RequestInit = {}) {
      return request<ProductImageListOut>(`/produtos/${id}/imagens`, { method: "GET", ...options }, baseUrl);
    },

    async uploadProductImage(id: number, file: File, options: RequestInit = {}) {
      const form = new FormData();
      form.append("file", file);
      return request<ProductImageUploadOut>(
        `/produtos/${id}/imagem`,
        {
          method: "POST",
          body: form,
          ...options,
        },
        baseUrl
      );
    },

    async uploadProductImages(id: number, files: File[], options: RequestInit = {}) {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      return request<ProductImagesUploadOut>(
        `/produtos/${id}/imagens`,
        {
          method: "POST",
          body: form,
          ...options,
        },
        baseUrl
      );
    },

    async setPrimaryProductImage(id: number, imageId: number, options: RequestInit = {}) {
      return request<ProductImageSetPrimaryOut>(
        `/produtos/${id}/imagens/${imageId}/principal`,
        {
          method: "PATCH",
          ...options,
        },
        baseUrl
      );
    },

    async deleteProductImage(id: number, imageId: number, options: RequestInit = {}) {
      return request<{ id: number; message: string }>(
        `/produtos/${id}/imagens/${imageId}`,
        {
          method: "DELETE",
          ...options,
        },
        baseUrl
      );
    },

    async createMovement(payload: MovementCreate, options: RequestInit = {}) {
      return request<MovementOut>(
        `/movimentacoes`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async listMovements(params: ListMovementsParams = {}, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<MovementOut[]>(`/movimentacoes${query}`, { method: "GET", ...options }, baseUrl);
    },

    async getProductHistory(
      productId: number,
      params: Omit<ListMovementsParams, "produto_id"> = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<MovementOut[]>(
        `/produtos/${productId}/historico${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async backupCreate(options: RequestInit = {}) {
      return request<BackupOut>(`/backup/criar`, { method: "POST", ...options }, baseUrl);
    },

    async importExcel(file: File, options: RequestInit = {}) {
      const form = new FormData();
      form.append("file", file);
      return request<ImportSummary>(
        `/import/excel`,
        {
          method: "POST",
          body: form,
          ...options,
        },
        baseUrl
      );
    },

    async exportProducts(options: RequestInit = {}) {
      return requestBlob(`/export/produtos`, { method: "POST", ...options }, baseUrl);
    },

    async reportStockPDF(options: RequestInit = {}) {
      return requestBlob(`/relatorios/estoque.pdf`, { method: "POST", ...options }, baseUrl);
    },

    async getDashboardSummary(options: RequestInit = {}) {
      return request<DashboardSummary>(`/dashboard/resumo`, { method: "GET", ...options }, baseUrl);
    },

    async getAnalyticsStockSummary(options: RequestInit = {}) {
      try {
        return await request<StockSummary>(`/analytics/stock/summary`, { method: "GET", ...options }, baseUrl);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<DashboardSummary>(`/dashboard/resumo`, { method: "GET", ...options }, baseUrl);
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

    async getAnalyticsStockDistribution(options: RequestInit = {}) {
      try {
        return await request<StockDistribution>(`/analytics/stock/distribution`, { method: "GET", ...options }, baseUrl);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const legacy = await request<{ canoas: number; pf: number; total: number }>(
          `/analytics/estoque-distribuicao`,
          { method: "GET", ...options },
          baseUrl
        );
        const total = legacy.data.total || 0;
        const mapped: StockDistribution = {
          items: [
            {
              local: "CANOAS",
              quantidade: legacy.data.canoas,
              percentual: total > 0 ? Number(((legacy.data.canoas / total) * 100).toFixed(2)) : 0,
            },
            {
              local: "PF",
              quantidade: legacy.data.pf,
              percentual: total > 0 ? Number(((legacy.data.pf / total) * 100).toFixed(2)) : 0,
            },
          ],
          total: total,
        };
        return {
          data: mapped,
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
        return request<TopSaidaItem[]>(
          `/analytics/top-saidas${query}`,
          { method: "GET", ...options },
          baseUrl
        );
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
      params: { date_from: string; date_to: string; bucket?: "day" | "week" | "month" },
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
      params: { days?: number; date_to?: string; limit?: number } = {},
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

    // Compatibilidade com chamadas antigas
    async getTopSaidas(
      params: { date_from: string; date_to: string; scope: "CANOAS" | "PF" | "AMBOS" },
      options: RequestInit = {}
    ) {
      return this.getAnalyticsTopSaidas({ ...params, limit: 5 }, options);
    },

    async getStockDistribution(options: RequestInit = {}) {
      return this.getAnalyticsStockDistribution(options);
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
