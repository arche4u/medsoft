import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AttachmentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    entity_type: str
    entity_id: str
    filename: str
    content_type: str
    size_bytes: int
    description: str | None
    uploaded_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttachmentUpdate(BaseModel):
    description: str | None = None
