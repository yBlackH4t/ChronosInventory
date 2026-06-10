import { createAnalyticsApi } from "./apiAnalytics";
import { createSystemApi } from "./apiSystem";
import { createInventoryApi } from "./inventoryApi";
import { createProductsApi } from "./productsApi";

import { ApiError } from "../types/api";
import type {
  OfficialBaseDirectoryTestOut,
  OfficialBaseApplyOut,
  OfficialBaseDeleteIn,
  BackupAutoConfigIn,
  OfficialBasePublishIn,
  BackupValidateOut,
  InventoryLocation,
  BackupRestoreOut,
  BackupRestoreTestIn,
  OfficialBaseConfigIn,
  OfficialBaseDeleteOut,
  BackupListItemOut,
  BackupOut,
  BackupRestoreTestOut,
  OfficialBasePublishOut,
  ListMovementsParams,
  HealthOut,
  ErrorResponse,
  OfficialBaseStatusOut,
  CreateLocationIn,
  LocalShareServerOut,
  MovementOut,
  SuccessResponse,
  DownloadResponse,
  BackupAutoConfigOut,
  RemoteShareStatusOut,
  MovementCreate,
  UpdateLocationIn,
  SelectedStockReportIn,
  OfficialBaseHistoryItemOut,
  AnalyticsScope,
  ImportSummary,
  BackupRestoreIn,
} from "../types/api";
export * from "../types/api";
type QueryValue = string | number | boolean | null | undefined;

const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function buildQuery(params: Record<string, QueryValue>): string {
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

function isRequestInitLike(value: unknown): value is RequestInit {
  if (!value || typeof value !== "object") return false;
  const candidate = value as RequestInit;
  return (
    "signal" in candidate ||
    "headers" in candidate ||
    "method" in candidate ||
    "body" in candidate ||
    "credentials" in candidate ||
    "cache" in candidate ||
    "mode" in candidate
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  baseUrl: string,
): Promise<SuccessResponse<T>> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
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

  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(
    contentDisposition,
  );
  return decodeURIComponent(match?.[1] || match?.[2] || "");
}

async function requestBlob(
  path: string,
  options: RequestInit = {},
  baseUrl: string,
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
  const systemApi = createSystemApi({ baseUrl, request, buildQuery });
  const analyticsApi = createAnalyticsApi({
    baseUrl,
    request,
    buildQuery,
    isNotFound,
    isRequestInitLike,
  });
  const inventoryApi = createInventoryApi({ baseUrl, request, buildQuery });
  const productsApi = createProductsApi({ baseUrl, request, buildQuery });

  return {
    async health(options: RequestInit = {}) {
      return request<HealthOut>(
        `/health`,
        { method: "GET", ...options },
        baseUrl,
      );
    },
    ...systemApi,

    ...productsApi,

    async createMovement(payload: MovementCreate, options: RequestInit = {}) {
      return request<MovementOut>(
        `/movimentacoes`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async listMovements(
      params: ListMovementsParams = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<MovementOut[]>(
        `/movimentacoes${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getProductHistory(
      productId: number,
      params: Omit<ListMovementsParams, "produto_id"> = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<MovementOut[]>(
        `/produtos/${productId}/historico${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async backupCreate(options: RequestInit = {}) {
      return request<BackupOut>(
        `/backup/criar`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async backupList(options: RequestInit = {}) {
      return request<BackupListItemOut[]>(
        `/backup/listar`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async backupValidate(backupName?: string, options: RequestInit = {}) {
      const query = buildQuery({ backup_name: backupName });
      return request<BackupValidateOut>(
        `/backup/validar${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async backupRestore(payload: BackupRestoreIn, options: RequestInit = {}) {
      return request<BackupRestoreOut>(
        `/backup/restaurar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async backupCreatePreUpdate(options: RequestInit = {}) {
      return request<BackupOut>(
        `/backup/pre-update`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async backupRestorePreUpdate(options: RequestInit = {}) {
      return request<BackupRestoreOut>(
        `/backup/restaurar-pre-update`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async backupRestoreTest(
      payload: BackupRestoreTestIn,
      options: RequestInit = {},
    ) {
      return request<BackupRestoreTestOut>(
        `/backup/testar-restauracao`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async backupAutoConfig(options: RequestInit = {}) {
      return request<BackupAutoConfigOut>(
        `/backup/auto-config`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getSystemConfig(options: RequestInit = {}) {
      return request<{ is_white_label: boolean }>(
        `/system/config`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getLocations(options: RequestInit = {}) {
      return request<InventoryLocation[]>(
        `/inventory-locations`,
        { method: "GET", ...options },
        baseUrl,
      );
    },
    async createLocation(payload: CreateLocationIn, options: RequestInit = {}) {
      return request<InventoryLocation>(
        `/inventory-locations`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },
    async updateLocation(
      id: number,
      payload: UpdateLocationIn,
      options: RequestInit = {},
    ) {
      return request<InventoryLocation>(
        `/inventory-locations/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },
    async deleteLocation(
      id: number,
      force: boolean = false,
      options: RequestInit = {},
    ) {
      return request<void>(
        `/inventory-locations/${id}?force=${force ? "true" : "false"}`,
        {
          method: "DELETE",
          ...options,
        },
        baseUrl,
      );
    },

    async backupUpdateAutoConfig(
      payload: BackupAutoConfigIn,
      options: RequestInit = {},
    ) {
      return request<BackupAutoConfigOut>(
        `/backup/auto-config`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async backupDiagnostics(options: RequestInit = {}) {
      return requestBlob(
        `/backup/diagnostico`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async officialBaseStatus(options: RequestInit = {}) {
      return request<OfficialBaseStatusOut>(
        `/backup/base-oficial/status`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async officialBaseUpdateConfig(
      payload: OfficialBaseConfigIn,
      options: RequestInit = {},
    ) {
      return request<OfficialBaseStatusOut>(
        `/backup/base-oficial/config`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseTestDirectory(options: RequestInit = {}) {
      return request<OfficialBaseDirectoryTestOut>(
        `/backup/base-oficial/testar-pasta`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async officialBaseHistory(
      params: { limit?: number } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseHistoryItemOut[]>(
        `/backup/base-oficial/historico${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async officialBasePublish(
      payload: OfficialBasePublishIn,
      options: RequestInit = {},
    ) {
      return request<OfficialBasePublishOut>(
        `/backup/base-oficial/publicar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseDeletePublication(
      payload: OfficialBaseDeleteIn,
      options: RequestInit = {},
    ) {
      return request<OfficialBaseDeleteOut>(
        `/backup/base-oficial/publicacoes`,
        {
          method: "DELETE",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseApply(options: RequestInit = {}) {
      return request<OfficialBaseApplyOut>(
        `/backup/base-oficial/aplicar`,
        {
          method: "POST",
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseServerStart(options: RequestInit = {}) {
      return request<LocalShareServerOut>(
        `/backup/base-oficial-servidor/iniciar`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async officialBaseServerStop(options: RequestInit = {}) {
      return request<LocalShareServerOut>(
        `/backup/base-oficial-servidor/parar`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async officialBaseServerRemoteStatus(
      params: { server_url?: string | null } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<RemoteShareStatusOut>(
        `/backup/base-oficial-servidor/remoto${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async officialBaseServerHistory(
      params: { limit?: number } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseHistoryItemOut[]>(
        `/backup/base-oficial-servidor/historico${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async officialBaseServerPublish(
      payload: OfficialBasePublishIn,
      options: RequestInit = {},
    ) {
      return request<OfficialBasePublishOut>(
        `/backup/base-oficial-servidor/publicar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseServerDeletePublication(
      payload: OfficialBaseDeleteIn,
      options: RequestInit = {},
    ) {
      return request<OfficialBaseDeleteOut>(
        `/backup/base-oficial-servidor/publicacoes`,
        {
          method: "DELETE",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async officialBaseServerApply(
      params: { server_url?: string | null } = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseApplyOut>(
        `/backup/base-oficial-servidor/aplicar${query}`,
        {
          method: "POST",
          ...options,
        },
        baseUrl,
      );
    },

    ...inventoryApi,

    async importExcel(file: File, options: RequestInit = {}) {
      const formData = new FormData();
      formData.append("file", file);
      return request<ImportSummary>(
        "/import/excel",
        {
          method: "POST",
          body: formData,
          ...options,
        },
        baseUrl,
      );
    },

    async analyzeImportFile(file: File, options: RequestInit = {}) {
      const formData = new FormData();
      formData.append("file", file);
      return request<{ file_id: string; headers: string[]; preview: any[] }>(
        "/import-dynamic/analyze",
        {
          method: "POST",
          body: formData,
          ...options,
        },
        baseUrl,
      );
    },

    async executeImport(
      payload: {
        file_id: string;
        match_by: string;
        name_col: string;
        id_col?: string;
        location_mappings: Record<string, string>;
        update_stock?: boolean;
        motivo?: string;
      },
      options: RequestInit = {},
    ) {
      return request<ImportSummary>(
        "/import-dynamic/execute",
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async exportProducts(options: RequestInit = {}) {
      return requestBlob(
        `/export/produtos`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async exportStockOverview(options: RequestInit = {}) {
      return requestBlob(
        `/export/estoque-resumo`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async reportStockPDF(options: RequestInit = {}) {
      return requestBlob(
        `/relatorios/estoque.pdf`,
        { method: "POST", ...options },
        baseUrl,
      );
    },

    async reportSelectedStockPDF(
      payload: SelectedStockReportIn,
      options: RequestInit = {},
    ) {
      return requestBlob(
        `/relatorios/estoque-selecionado.pdf`,
        {
          ...options,
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
        },
        baseUrl,
      );
    },

    async reportRealSalesPDF(
      params: { date_from: string; date_to: string; scope?: AnalyticsScope },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        date_from: params.date_from,
        date_to: params.date_to,
        location_id,
      });
      return requestBlob(
        `/relatorios/vendas-reais.pdf${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async reportInactiveStockPDF(
      params: { days?: number; date_to?: string; scope?: AnalyticsScope },
      options: RequestInit = {},
    ) {
      const location_id = params.scope ?? null;
      const query = buildQuery({
        days: params.days,
        date_to: params.date_to,
        location_id,
      });
      return requestBlob(
        `/relatorios/estoque-parado.pdf${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    ...analyticsApi,
  };
}
