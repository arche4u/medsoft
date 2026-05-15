import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator


class KnowledgeEntryCreate(BaseModel):
    project_id: uuid.UUID
    category: str
    standard: str | None = None
    clause_ref: str | None = None
    title: str
    summary: str | None = None
    content: str | None = None
    tags: list[str] = []
    sort_order: int = 99


class KnowledgeEntryUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    category: str | None = None
    standard: str | None = None
    clause_ref: str | None = None
    sort_order: int | None = None


class KnowledgeEntryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
    is_global: bool
    category: str
    standard: str | None
    clause_ref: str | None
    title: str
    summary: str | None
    content: str | None
    tags: list[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v):
        return v if isinstance(v, list) else []

    model_config = {"from_attributes": True}
