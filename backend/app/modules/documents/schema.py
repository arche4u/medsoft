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


class DocumentUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    version: str | None = None
    notes: str | None = None


class DocumentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    doc_type: str
    category: str
    title: str
    status: str
    version: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
