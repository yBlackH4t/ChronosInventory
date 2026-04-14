from pydantic import BaseModel, Field


class HealthOut(BaseModel):
    status: str
    version: str


class VersionOut(BaseModel):
    version: str


class StockProfileOut(BaseModel):
    id: str
    name: str
    path: str
    db_exists: bool
    created_at: str
    updated_at: str
    is_active: bool


class StockProfilesStateOut(BaseModel):
    active_profile_id: str
    active_profile_name: str
    current_database_path: str
    restart_required: bool = False
    root_directory: str
    profiles: list[StockProfileOut]


class StockProfileCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    profile_id: str | None = Field(default=None, max_length=40)


class StockProfileActivateIn(BaseModel):
    profile_id: str = Field(min_length=1, max_length=40)


class StockProfileActivateOut(BaseModel):
    active_profile_id: str
    active_profile_name: str
    requires_restart: bool
    message: str


class StockProfileDeleteOut(BaseModel):
    deleted_profile_id: str
    deleted_profile_name: str
    deleted_path: str
    message: str


class StockCompareIn(BaseModel):
    left_path: str = Field(min_length=1, max_length=500)
    right_path: str = Field(min_length=1, max_length=500)
    left_label: str | None = Field(default=None, max_length=80)
    right_label: str | None = Field(default=None, max_length=80)


class StockCompareFileOut(BaseModel):
    label: str
    path: str
    file_size: int
    total_items: int
    active_items: int
    with_stock_items: int


class StockCompareSummaryOut(BaseModel):
    total_compared_items: int
    identical_items: int
    divergent_items: int
    only_left_items: int
    only_right_items: int
    canoas_mismatch_items: int
    pf_mismatch_items: int
    name_mismatch_items: int
    active_mismatch_items: int


class StockCompareRowOut(BaseModel):
    product_id: int
    display_name: str
    left_name: str | None = None
    right_name: str | None = None
    left_qtd_canoas: int | None = None
    right_qtd_canoas: int | None = None
    diff_canoas: int
    left_qtd_pf: int | None = None
    right_qtd_pf: int | None = None
    diff_pf: int
    left_ativo: bool | None = None
    right_ativo: bool | None = None
    statuses: list[str]
    has_difference: bool


class StockCompareOut(BaseModel):
    left: StockCompareFileOut
    right: StockCompareFileOut
    summary: StockCompareSummaryOut
    rows: list[StockCompareRowOut]


class PublishedCompareManifestOut(BaseModel):
    machine_label: str
    published_at: str
    app_version: str
    db_version: str
    database_filename: str
    database_sha256: str
    total_items: int
    active_items: int
    with_stock_items: int
    file_size: int


class PublishedCompareBaseOut(BaseModel):
    machine_label: str
    zip_path: str
    manifest_path: str
    manifest: PublishedCompareManifestOut
    is_current_machine: bool = False


class PublishedCompareStatusOut(BaseModel):
    compare_root_dir: str | None = None
    official_base_dir: str | None = None
    machine_label: str
    configured: bool
    local_snapshot_available: bool
    local_snapshot: PublishedCompareBaseOut | None = None
    available_bases: list[PublishedCompareBaseOut]


class PublishedComparePublishOut(BaseModel):
    machine_label: str
    published_at: str
    zip_path: str
    manifest_path: str
    history_zip_path: str
    history_manifest_path: str


class CompareServerStatusOut(BaseModel):
    machine_label: str
    current_database_path: str
    server_running: bool
    server_port: int
    server_urls: list[str]
    remote_server_url: str | None = None
    local_snapshot_available: bool
    local_snapshot: PublishedCompareBaseOut | None = None


class RemoteCompareServerOut(BaseModel):
    server_url: str
    reachable: bool
    machine_label: str | None = None
    app_version: str | None = None
    compare_available: bool = False
    compare_manifest: PublishedCompareManifestOut | None = None
    message: str


class RemoteCompareServerIn(BaseModel):
    server_url: str = Field(min_length=1, max_length=500)
