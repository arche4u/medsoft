import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import AuditAction


class AuditLogRead(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: AuditAction
    timestamp: datetime
    user_id: uuid.UUID | None = None
    details: str | None = None

    model_config = {"from_attributes": True}
