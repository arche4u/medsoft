import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator
from .model import DesignElementType


class DesignElementCreate(BaseModel):
    project_id: uuid.UUID
    type: DesignElementType
    parent_id: uuid.UUID | None = None
    title: str
    description: str | None = None

    @model_validator(mode="after")
    def check_parent(self):
        if self.type == DesignElementType.ARCHITECTURE and self.parent_id is not None:
            raise ValueError("ARCHITECTURE elements must not have a parent")
        if self.type == DesignElementType.DETAILED and self.parent_id is None:
            raise ValueError("DETAILED elements must have a parent_id")
        return self


class DesignElementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class DesignElementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    readable_id: str | None
    type: DesignElementType
    parent_id: uuid.UUID | None
    title: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RequirementDesignLinkCreate(BaseModel):
    requirement_id: uuid.UUID
    design_element_id: uuid.UUID


class RequirementDesignLinkRead(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    design_element_id: uuid.UUID

    model_config = {"from_attributes": True}
