import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ApprovalEntityType, ApprovalDecision


class ApprovalCreate(BaseModel):
    entity_type: ApprovalEntityType
    entity_id: uuid.UUID
    approver_name: str
    decision: ApprovalDecision
    comments: str | None = None


class ApprovalRead(BaseModel):
    id: uuid.UUID
    entity_type: ApprovalEntityType
    entity_id: uuid.UUID
    approver_name: str
    decision: ApprovalDecision
    comments: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}
