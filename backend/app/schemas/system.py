from pydantic import BaseModel


class HealthOut(BaseModel):
    status: str
    version: str


class VersionOut(BaseModel):
    version: str
