import { createAnalyticsApi } from "./apiAnalytics";
import { createSystemApi } from "./apiSystem";

export type ApiMeta = {
  page?: number;
  page_size?: number;
  total_items?: number;
  total_pages?: number;
  has_next?: boolean;
} & Record<string, unknown>;

export type SuccessResponse<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(code: string, message: string, details: unknown, status: number) {
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
  ativo?: boolean;
  inativado_em?: string | null;
  motivo_inativacao?: string | null;
};

export type ProductCreate = {
  nome: string;
  qtd_canoas: number;
  qtd_pf: number;
  observacao?: string | null;
};

export type ProductPut = ProductCreate;
export type ProductPatch = Partial<ProductCreate>;

export type ProductStatusFilter = "ATIVO" | "INATIVO" | "TODOS";

export type ProductStatusBulkIn = {
  ids: number[];
  ativo: boolean;
  motivo_inativacao?: string | null;
};

export type ProductStatusBulkOut = {
  updated: number;
};

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

export type ListProductsStatusParams = ListProductsParams & {
  status?: ProductStatusFilter;
  has_stock?: boolean;
};

export type MovementCreate = {
  tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  produto_id: number;
  quantidade: number;
  origem?: "CANOAS" | "PF";
  destino?: "CANOAS" | "PF";
  observacao?: string;
  natureza?: "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
  motivo_ajuste?: "AVARIA" | "PERDA" | "CORRECAO_INVENTARIO" | "ERRO_OPERACIONAL" | "TRANSFERENCIA";
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
  motivo_ajuste?: "AVARIA" | "PERDA" | "CORRECAO_INVENTARIO" | "ERRO_OPERACIONAL" | "TRANSFERENCIA";
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

export type BackupListItemOut = {
  name: string;
  path: string;
  size: number;
  created_at: string;
};

export type BackupValidateOut = {
  path: string;
  ok: boolean;
  result: string;
};

export type BackupRestoreIn = {
  backup_name: string;
};

export type BackupRestoreOut = {
  restored_from: string;
  active_database: string;
  pre_restore_backup: string;
  validation_result: string;
};

export type BackupAutoConfigOut = {
  enabled: boolean;
  hour: number;
  minute: number;
  retention_days: number;
  schedule_mode: "DAILY" | "WEEKLY";
  weekday: number;
  last_run_date?: string | null;
  last_result?: string | null;
  last_backup_name?: string | null;
};

export type BackupAutoConfigIn = {
  enabled: boolean;
  hour: number;
  minute: number;
  retention_days: number;
  schedule_mode: "DAILY" | "WEEKLY";
  weekday: number;
};

export type BackupRestoreTestIn = {
  backup_name?: string | null;
};

export type BackupRestoreTestOut = {
  backup_name: string;
  backup_path: string;
  ok: boolean;
  integrity_result: string;
  required_tables: string[];
  missing_tables: string[];
};

export type OfficialBaseRole = "publisher" | "consumer";

export type OfficialBaseManifestOut = {
  format_version: number;
  published_at: string;
  publisher_machine: string;
  publisher_name?: string | null;
  app_version: string;
  min_app_version: string;
  db_version: string;
  database_filename: string;
  database_sha256: string;
  notes?: string | null;
  products_count?: number | null;
  products_with_stock_count?: number | null;
  movements_count?: number | null;
  database_size?: number | null;
};

export type OfficialBaseHistoryItemOut = {
  manifest_path: string;
  zip_path?: string | null;
  manifest: OfficialBaseManifestOut;
};

export type OfficialBaseDirectoryTestOut = {
  directory_exists: boolean;
  directory_accessible: boolean;
  read_ok: boolean;
  write_ok: boolean;
  latest_manifest_found: boolean;
  message: string;
};

export type OfficialBaseStatusOut = {
  config_path: string;
  role: OfficialBaseRole;
  official_base_dir?: string | null;
  machine_label: string;
  publisher_name?: string | null;
  server_enabled?: boolean;
  server_port?: number;
  server_running?: boolean;
  server_urls?: string[];
  remote_server_url?: string | null;
  can_publish: boolean;
  can_publish_server?: boolean;
  directory_configured: boolean;
  directory_accessible: boolean;
  current_app_version: string;
  current_db_version: string;
  current_database_path: string;
  current_database_size: number;
  current_products_count: number;
  current_products_with_stock_count: number;
  current_movements_count: number;
  latest_available: boolean;
  latest_zip_path?: string | null;
  latest_manifest_path?: string | null;
  latest_manifest?: OfficialBaseManifestOut | null;
  app_compatible_with_latest?: boolean | null;
  server_latest_available?: boolean;
  server_latest_zip_path?: string | null;
  server_latest_manifest_path?: string | null;
  server_latest_manifest?: OfficialBaseManifestOut | null;
  app_compatible_with_server_latest?: boolean | null;
};

export type OfficialBaseConfigIn = {
  role: OfficialBaseRole;
  official_base_dir?: string | null;
  machine_label?: string | null;
  publisher_name?: string | null;
  server_port?: number | null;
  remote_server_url?: string | null;
  server_enabled?: boolean | null;
};

export type OfficialBasePublishIn = {
  notes?: string | null;
};

export type OfficialBaseDeleteIn = {
  manifest_path?: string | null;
  delete_latest?: boolean;
};

export type OfficialBasePublishOut = {
  published_at: string;
  zip_path: string;
  manifest_path: string;
  history_zip_path: string;
  history_manifest_path: string;
  app_version: string;
  db_version: string;
  machine_label: string;
  publisher_name?: string | null;
  notes?: string | null;
};

export type OfficialBaseDeleteOut = {
  deleted_manifest_path: string;
  deleted_zip_path?: string | null;
  deleted_latest: boolean;
  message: string;
};

export type OfficialBaseApplyOut = {
  restored_from: string;
  active_database: string;
  pre_restore_backup: string;
  validation_result: string;
  published_at: string;
  publisher_machine: string;
  publisher_name?: string | null;
  app_version: string;
  db_version: string;
  notes?: string | null;
  restart_required: boolean;
};

export type LocalShareServerOut = {
  enabled: boolean;
  running: boolean;
  port: number;
  urls: string[];
  machine_label: string;
  publisher_name?: string | null;
};

export type RemoteShareStatusOut = {
  server_url: string;
  reachable: boolean;
  machine_label?: string | null;
  app_version?: string | null;
  official_available: boolean;
  compare_available: boolean;
  official_manifest?: OfficialBaseManifestOut | null;
  message: string;
};

export type InventorySessionLocal = "CANOAS" | "PF";
export type InventorySessionStatus = "ABERTO" | "FECHADO" | "APLICADO";
export type InventoryAdjustmentReason =
  | "AVARIA"
  | "PERDA"
  | "CORRECAO_INVENTARIO"
  | "ERRO_OPERACIONAL"
  | "TRANSFERENCIA";

export type InventorySessionCreateIn = {
  nome: string;
  local: InventorySessionLocal;
  observacao?: string | null;
};

export type InventorySessionOut = {
  id: number;
  nome: string;
  local: InventorySessionLocal;
  status: InventorySessionStatus;
  observacao?: string | null;
  created_at: string;
  updated_at: string;
  applied_at?: string | null;
  total_items: number;
  counted_items: number;
  divergent_items: number;
};

export type InventorySessionSummaryOut = {
  session_id: number;
  total_items: number;
  counted_items: number;
  divergent_items: number;
  matched_items: number;
  missing_items: number;
  surplus_items: number;
  not_counted_items: number;
  pending_items: number;
  applied_items: number;
};

export type InventoryStatusFilter =
  | "ALL"
  | "DIVERGENT"
  | "MATCHED"
  | "MISSING"
  | "SURPLUS"
  | "NOT_COUNTED"
  | "PENDING"
  | "APPLIED";

export type InventoryCountOut = {
  produto_id: number;
  produto_nome: string;
  qtd_sistema: number;
  qtd_fisico?: number | null;
  divergencia?: number | null;
  motivo_ajuste?: InventoryAdjustmentReason | null;
  observacao?: string | null;
  applied_movement_id?: number | null;
  updated_at?: string | null;
};

export type InventoryCountItemIn = {
  produto_id: number;
  qtd_fisico: number;
  motivo_ajuste?: InventoryAdjustmentReason | null;
  observacao?: string | null;
};

export type InventoryCountsUpdateIn = {
  items: InventoryCountItemIn[];
};

export type InventoryApplyOut = {
  session_id: number;
  applied_items: number;
  movement_ids: number[];
  status: InventorySessionStatus;
};

export type InventorySessionDeleteOut = {
  session_id: number;
  session_name: string;
  status: InventorySessionStatus;
  message: string;
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

export type AnalyticsScope = "CANOAS" | "PF" | "AMBOS";

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

export type RecentStockoutItem = {
  produto_id: number;
  nome: string;
  total_saida_recente: number;
  last_sale?: string | null;
};

export type ExternalTransferItem = {
  produto_id: number;
  nome: string;
  total_quantidade: number;
  total_movimentacoes: number;
  ultima_transferencia?: string | null;
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

export type StockProfileOut = {
  id: string;
  name: string;
  path: string;
  db_exists: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

export type StockProfilesStateOut = {
  active_profile_id: string;
  active_profile_name: string;
  current_database_path: string;
  restart_required: boolean;
  root_directory: string;
  profiles: StockProfileOut[];
};

export type StockProfileCreateIn = {
  name: string;
  profile_id?: string | null;
};

export type StockProfileActivateIn = {
  profile_id: string;
};

export type StockProfileActivateOut = {
  active_profile_id: string;
  active_profile_name: string;
  requires_restart: boolean;
  message: string;
};

export type StockProfileDeleteOut = {
  deleted_profile_id: string;
  deleted_profile_name: string;
  deleted_path: string;
  message: string;
};

export type StockCompareIn = {
  left_path: string;
  right_path: string;
  left_label?: string | null;
  right_label?: string | null;
};

export type StockCompareFileOut = {
  label: string;
  path: string;
  file_size: number;
  total_items: number;
  active_items: number;
  with_stock_items: number;
};

export type StockCompareSummaryOut = {
  total_compared_items: number;
  identical_items: number;
  divergent_items: number;
  only_left_items: number;
  only_right_items: number;
  canoas_mismatch_items: number;
  pf_mismatch_items: number;
  name_mismatch_items: number;
  active_mismatch_items: number;
};

export type StockCompareRowOut = {
  product_id: number;
  display_name: string;
  left_name?: string | null;
  right_name?: string | null;
  left_qtd_canoas?: number | null;
  right_qtd_canoas?: number | null;
  diff_canoas: number;
  left_qtd_pf?: number | null;
  right_qtd_pf?: number | null;
  diff_pf: number;
  left_ativo?: boolean | null;
  right_ativo?: boolean | null;
  statuses: string[];
  has_difference: boolean;
};

export type StockCompareOut = {
  left: StockCompareFileOut;
  right: StockCompareFileOut;
  summary: StockCompareSummaryOut;
  rows: StockCompareRowOut[];
};

export type PublishedCompareManifestOut = {
  machine_label: string;
  published_at: string;
  app_version: string;
  db_version: string;
  database_filename: string;
  database_sha256: string;
  total_items: number;
  active_items: number;
  with_stock_items: number;
  file_size: number;
};

export type PublishedCompareBaseOut = {
  machine_label: string;
  zip_path: string;
  manifest_path: string;
  manifest: PublishedCompareManifestOut;
  is_current_machine: boolean;
};

export type PublishedCompareStatusOut = {
  compare_root_dir?: string | null;
  official_base_dir?: string | null;
  machine_label: string;
  configured: boolean;
  local_snapshot_available: boolean;
  local_snapshot?: PublishedCompareBaseOut | null;
  available_bases: PublishedCompareBaseOut[];
};

export type PublishedComparePublishOut = {
  machine_label: string;
  published_at: string;
  zip_path: string;
  manifest_path: string;
  history_zip_path: string;
  history_manifest_path: string;
};

export type PublishedCompareDeleteIn = {
  manifest_path?: string | null;
  delete_latest?: boolean;
};

export type PublishedCompareDeleteOut = {
  deleted_manifest_path: string;
  deleted_zip_path?: string | null;
  deleted_latest: boolean;
  message: string;
};

export type CompareServerStatusOut = {
  machine_label: string;
  current_database_path: string;
  server_running: boolean;
  server_port: number;
  server_urls: string[];
  remote_server_url?: string | null;
  history_items_count: number;
  history_retention_limit: number;
  local_snapshot_available: boolean;
  local_snapshot?: PublishedCompareBaseOut | null;
};

export type RemoteCompareServerOut = {
  server_url: string;
  reachable: boolean;
  machine_label?: string | null;
  app_version?: string | null;
  server_port?: number | null;
  compare_available: boolean;
  compare_manifest?: PublishedCompareManifestOut | null;
  message: string;
};

export type DownloadResponse = {
  blob: Blob;
  filename?: string;
  headers: Headers;
};

export type SelectedStockReportIn = {
  product_ids: number[];
};

type QueryValue = string | number | boolean | null | undefined;

const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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
  const systemApi = createSystemApi({ baseUrl, request, buildQuery });
  const analyticsApi = createAnalyticsApi({
    baseUrl,
    request,
    buildQuery,
    isNotFound,
    isRequestInitLike,
  });

  return {
    async health(options: RequestInit = {}) {
      return request<HealthOut>(`/health`, { method: "GET", ...options }, baseUrl);
    },
    ...systemApi,

    async listProducts(params: ListProductsParams = {}, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<Product[]>(`/produtos${query}`, { method: "GET", ...options }, baseUrl);
    },

    async listProductsStatus(params: ListProductsStatusParams = {}, options: RequestInit = {}) {
      const query = buildQuery(params);
      return request<Product[]>(`/produtos/gestao-status${query}`, { method: "GET", ...options }, baseUrl);
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

    async bulkUpdateProductStatus(payload: ProductStatusBulkIn, options: RequestInit = {}) {
      return request<ProductStatusBulkOut>(
        `/produtos/status-lote`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async backupList(options: RequestInit = {}) {
      return request<BackupListItemOut[]>(`/backup/listar`, { method: "GET", ...options }, baseUrl);
    },

    async backupValidate(backupName?: string, options: RequestInit = {}) {
      const query = buildQuery({ backup_name: backupName });
      return request<BackupValidateOut>(`/backup/validar${query}`, { method: "GET", ...options }, baseUrl);
    },

    async backupRestore(payload: BackupRestoreIn, options: RequestInit = {}) {
      return request<BackupRestoreOut>(
        `/backup/restaurar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async backupCreatePreUpdate(options: RequestInit = {}) {
      return request<BackupOut>(`/backup/pre-update`, { method: "POST", ...options }, baseUrl);
    },

    async backupRestorePreUpdate(options: RequestInit = {}) {
      return request<BackupRestoreOut>(`/backup/restaurar-pre-update`, { method: "POST", ...options }, baseUrl);
    },

    async backupRestoreTest(payload: BackupRestoreTestIn, options: RequestInit = {}) {
      return request<BackupRestoreTestOut>(
        `/backup/testar-restauracao`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async backupAutoConfig(options: RequestInit = {}) {
      return request<BackupAutoConfigOut>(`/backup/auto-config`, { method: "GET", ...options }, baseUrl);
    },

    async backupUpdateAutoConfig(payload: BackupAutoConfigIn, options: RequestInit = {}) {
      return request<BackupAutoConfigOut>(
        `/backup/auto-config`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async backupDiagnostics(options: RequestInit = {}) {
      return requestBlob(`/backup/diagnostico`, { method: "GET", ...options }, baseUrl);
    },

    async officialBaseStatus(options: RequestInit = {}) {
      return request<OfficialBaseStatusOut>(`/backup/base-oficial/status`, { method: "GET", ...options }, baseUrl);
    },

    async officialBaseUpdateConfig(payload: OfficialBaseConfigIn, options: RequestInit = {}) {
      return request<OfficialBaseStatusOut>(
        `/backup/base-oficial/config`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseTestDirectory(options: RequestInit = {}) {
      return request<OfficialBaseDirectoryTestOut>(
        `/backup/base-oficial/testar-pasta`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async officialBaseHistory(
      params: { limit?: number } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseHistoryItemOut[]>(
        `/backup/base-oficial/historico${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async officialBasePublish(payload: OfficialBasePublishIn, options: RequestInit = {}) {
      return request<OfficialBasePublishOut>(
        `/backup/base-oficial/publicar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseDeletePublication(payload: OfficialBaseDeleteIn, options: RequestInit = {}) {
      return request<OfficialBaseDeleteOut>(
        `/backup/base-oficial/publicacoes`,
        {
          method: "DELETE",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseApply(options: RequestInit = {}) {
      return request<OfficialBaseApplyOut>(
        `/backup/base-oficial/aplicar`,
        {
          method: "POST",
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseServerStart(options: RequestInit = {}) {
      return request<LocalShareServerOut>(
        `/backup/base-oficial-servidor/iniciar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async officialBaseServerStop(options: RequestInit = {}) {
      return request<LocalShareServerOut>(
        `/backup/base-oficial-servidor/parar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async officialBaseServerRemoteStatus(
      params: { server_url?: string | null } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<RemoteShareStatusOut>(
        `/backup/base-oficial-servidor/remoto${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async officialBaseServerHistory(
      params: { limit?: number } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseHistoryItemOut[]>(
        `/backup/base-oficial-servidor/historico${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async officialBaseServerPublish(payload: OfficialBasePublishIn, options: RequestInit = {}) {
      return request<OfficialBasePublishOut>(
        `/backup/base-oficial-servidor/publicar`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseServerDeletePublication(payload: OfficialBaseDeleteIn, options: RequestInit = {}) {
      return request<OfficialBaseDeleteOut>(
        `/backup/base-oficial-servidor/publicacoes`,
        {
          method: "DELETE",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async officialBaseServerApply(
      params: { server_url?: string | null } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<OfficialBaseApplyOut>(
        `/backup/base-oficial-servidor/aplicar${query}`,
        {
          method: "POST",
          ...options,
        },
        baseUrl
      );
    },

    async inventoryCreateSession(payload: InventorySessionCreateIn, options: RequestInit = {}) {
      return request<InventorySessionOut>(
        `/inventario/sessoes`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async inventoryListSessions(
      params: { page?: number; page_size?: number } = {},
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<InventorySessionOut[]>(`/inventario/sessoes${query}`, { method: "GET", ...options }, baseUrl);
    },

    async inventoryGetSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionOut>(`/inventario/sessoes/${sessionId}`, { method: "GET", ...options }, baseUrl);
    },

    async inventoryGetSessionSummary(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionSummaryOut>(
        `/inventario/sessoes/${sessionId}/resumo`,
        { method: "GET", ...options },
        baseUrl
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
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return request<InventoryCountOut[]>(
        `/inventario/sessoes/${sessionId}/itens${query}`,
        { method: "GET", ...options },
        baseUrl
      );
    },

    async inventoryUpdateSessionItems(
      sessionId: number,
      payload: InventoryCountsUpdateIn,
      options: RequestInit = {}
    ) {
      return request<InventorySessionOut>(
        `/inventario/sessoes/${sessionId}/itens`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl
      );
    },

    async inventoryApplySession(sessionId: number, options: RequestInit = {}) {
      return request<InventoryApplyOut>(
        `/inventario/sessoes/${sessionId}/aplicar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async inventoryCloseSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionOut>(
        `/inventario/sessoes/${sessionId}/fechar`,
        { method: "POST", ...options },
        baseUrl
      );
    },

    async inventoryDeleteSession(sessionId: number, options: RequestInit = {}) {
      return request<InventorySessionDeleteOut>(
        `/inventario/sessoes/${sessionId}`,
        { method: "DELETE", ...options },
        baseUrl
      );
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

    async exportStockOverview(options: RequestInit = {}) {
      return requestBlob(`/export/estoque-resumo`, { method: "POST", ...options }, baseUrl);
    },

    async reportStockPDF(options: RequestInit = {}) {
      return requestBlob(`/relatorios/estoque.pdf`, { method: "POST", ...options }, baseUrl);
    },

    async reportSelectedStockPDF(payload: SelectedStockReportIn, options: RequestInit = {}) {
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
        baseUrl
      );
    },

    async reportRealSalesPDF(
      params: { date_from: string; date_to: string; scope?: "CANOAS" | "PF" | "AMBOS" },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return requestBlob(`/relatorios/vendas-reais.pdf${query}`, { method: "GET", ...options }, baseUrl);
    },

    async reportInactiveStockPDF(
      params: { days?: number; date_to?: string; scope?: "CANOAS" | "PF" | "AMBOS" },
      options: RequestInit = {}
    ) {
      const query = buildQuery(params);
      return requestBlob(`/relatorios/estoque-parado.pdf${query}`, { method: "GET", ...options }, baseUrl);
    },

    ...analyticsApi,
  };
}
