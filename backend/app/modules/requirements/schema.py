import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator
from .model import RequirementType


class RequirementCreate(BaseModel):
    project_id: uuid.UUID
    type: RequirementType
    parent_id: uuid.UUID | None = None
    title: str
    description: str | None = None

    @model_validator(mode="after")
    def check_parent_rule(self):
        if self.type == RequirementType.USER and self.parent_id is not None:
            raise ValueError("USER requirements must not have a parent")
        if self.type in (RequirementType.SYSTEM, RequirementType.SOFTWARE) and self.parent_id is None:
            raise ValueError(f"{self.type} requirements must have a parent_id")
        return self


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class RequirementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    type: RequirementType
    parent_id: uuid.UUID | None
    title: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadSummary(BaseModel):
    total_added: int
    total_skipped: int
    added: list[dict]
    skipped: list[dict]
