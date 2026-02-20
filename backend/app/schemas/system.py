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
