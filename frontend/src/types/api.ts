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

export type InventoryLocation = {
  id: number;
  name: string;
  label?: string;
  color?: string;
  ordem?: number;
  ativo: boolean;
};

export type CreateLocationIn = {
  name: string;
  label: string;
};

export type UpdateLocationIn = {
  label?: string;
  ativo?: boolean;
};

export type Product = {
  id: number;
  nome: string;
  inventories: Record<number, number>;
  total_stock: number;
  observacao?: string | null;
  ativo?: boolean;
  inativado_em?: string | null;
  motivo_inativacao?: string | null;
};

export type ProductCreate = {
  nome: string;
  inventories: Record<number, number>;
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
  origem_location_id?: number | null;
  destino_location_id?: number | null;
  observacao?: string;
  natureza?:
    | "OPERACAO_NORMAL"
    | "TRANSFERENCIA_EXTERNA"
    | "DEVOLUCAO"
    | "AJUSTE"
    | "ESTORNO";
  motivo_ajuste?:
    | "AVARIA"
    | "PERDA"
    | "CORRECAO_INVENTARIO"
    | "ERRO_OPERACIONAL"
    | "TRANSFERENCIA";
  local_externo?: string;
  documento?: string;
  movimento_ref_id?: number;
  data?: string;
};

export type MovementBatchItem = {
  produto_id: number;
  quantidade: number;
};

export type MovementBatchCreate = {
  tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  items: MovementBatchItem[];
  origem_location_id?: number | null;
  destino_location_id?: number | null;
  observacao?: string;
  natureza?:
    | "OPERACAO_NORMAL"
    | "TRANSFERENCIA_EXTERNA"
    | "DEVOLUCAO"
    | "AJUSTE"
    | "ESTORNO";
  motivo_ajuste?:
    | "AVARIA"
    | "PERDA"
    | "CORRECAO_INVENTARIO"
    | "ERRO_OPERACIONAL"
    | "TRANSFERENCIA";
  local_externo?: string;
  documento?: string;
  data?: string;
};

export type MovementOut = {
  id: number;
  produto_id: number;
  produto_nome?: string | null;
  tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  quantidade: number;
  origem_location_id?: number | null;
  destino_location_id?: number | null;
  observacao?: string;
  natureza:
    | "OPERACAO_NORMAL"
    | "TRANSFERENCIA_EXTERNA"
    | "DEVOLUCAO"
    | "AJUSTE"
    | "ESTORNO";
  motivo_ajuste?:
    | "AVARIA"
    | "PERDA"
    | "CORRECAO_INVENTARIO"
    | "ERRO_OPERACIONAL"
    | "TRANSFERENCIA";
  local_externo?: string;
  documento?: string;
  movimento_ref_id?: number;
  data: string;
};

export type ListMovementsParams = {
  produto_id?: number;
  tipo?: "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
  natureza?:
    | "OPERACAO_NORMAL"
    | "TRANSFERENCIA_EXTERNA"
    | "DEVOLUCAO"
    | "AJUSTE"
    | "ESTORNO";
  origem_location_id?: number | null;
  destino_location_id?: number | null;
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

export type InventorySessionStatus = "ABERTO" | "FECHADO" | "APLICADO";
export type InventoryAdjustmentReason =
  | "AVARIA"
  | "PERDA"
  | "CORRECAO_INVENTARIO"
  | "ERRO_OPERACIONAL"
  | "TRANSFERENCIA";

export type InventorySessionCreateIn = {
  nome: string;
  location_id: number;
  observacao?: string | null;
};

export type InventorySessionOut = {
  id: number;
  nome: string;
  location_id: number;
  local_label?: string | null;
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

export type LocationSummary = {
  location_id: number;
  location_name: string;
  location_label: string;
  color?: string | null;
  total: number;
};

export type DashboardSummary = {
  locations: LocationSummary[];
  total_geral: number;
  itens_distintos: number;
  zerados: number;
};

export type LocationStockTotal = {
  location_id: number;
  location_name: string;
  location_label: string;
  color?: string | null;
  total: number;
};

export type StockSummary = {
  locations: LocationStockTotal[];
  total_geral: number;
  zerados: number;
};

export type StockDistributionItem = {
  location_id: number;
  local: string;
  quantidade: number;
  percentual: number;
};

export type StockDistribution = {
  items: StockDistributionItem[];
  total: number;
};

export type AnalyticsScope = number | null;

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
  stock_mismatch_items: number;
  name_mismatch_items: number;
  active_mismatch_items: number;
};

export type StockCompareRowOut = {
  product_id: number;
  display_name: string;
  left_name?: string | null;
  right_name?: string | null;
  left_stock?: number | null;
  right_stock?: number | null;
  diff_stock: number;
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
