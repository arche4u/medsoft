import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator
from .model import DesignElementType


# ── Design Category schemas ───────────────────────────────────────────────────

class DesignCategoryCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    label: str
    color: str = "#546e7a"

    @model_validator(mode="after")
    def normalise_name(self):
        self.name = self.name.strip().upper().replace(" ", "_")
        if not self.name:
            raise ValueError("name must not be empty")
        return self


class DesignCategoryUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    sort_order: int | None = None


class DesignCategoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    label: str
    color: str
    sort_order: int
    is_builtin: bool

    model_config = {"from_attributes": True}


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
    diagram_source: str | None = None


class DesignElementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    readable_id: str | None
    type: DesignElementType
    parent_id: uuid.UUID | None
    title: str
    description: str | None
    diagram_source: str | None = None
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
