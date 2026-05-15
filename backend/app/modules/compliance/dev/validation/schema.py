import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ValidationStatus


class ValidationRecordCreate(BaseModel):
    project_id: uuid.UUID
    related_requirement_id: uuid.UUID
    description: str
    status: ValidationStatus = ValidationStatus.PLANNED


class ValidationRecordUpdate(BaseModel):
    description: str | None = None
    status: ValidationStatus | None = None


class ValidationRecordRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    related_requirement_id: uuid.UUID
    description: str
    status: ValidationStatus
    created_at: datetime

    model_config = {"from_attributes": True}
