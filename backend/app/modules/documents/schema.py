import uuid
from datetime import datetime
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    project_id: uuid.UUID
    doc_type: str
    category: str
    title: str
    status: str = "NOT_STARTED"
    version: str | None = None
    notes: str | None = None
    description: str | None = None
    tags: list[str] = []


class DocumentUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    version: str | None = None
    notes: str | None = None
    content: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class DocumentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    doc_type: str
    category: str
    title: str
    status: str
    version: str | None
    notes: str | None
    content: str | None
    description: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    from pydantic import field_validator

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v):
        return v if v is not None else []

    model_config = {"from_attributes": True}
