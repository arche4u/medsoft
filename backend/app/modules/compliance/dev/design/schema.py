import uuid
from datetime import datetime
from pydantic import BaseModel


# ── Design Element schemas (IEC 62304 §5.4 — detailed design) ─────────────────

class DesignElementCreate(BaseModel):
    project_id: uuid.UUID
    component_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    title: str
    description: str | None = None


class DesignElementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    diagram_source: str | None = None
    parent_id: uuid.UUID | None = None


class DesignElementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    component_id: uuid.UUID
    parent_id: uuid.UUID | None
    readable_id: str | None
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
