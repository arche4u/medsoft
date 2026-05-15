import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── Software Item ─────────────────────────────────────────────────────────────

class SoftwareItemCreate(BaseModel):
    project_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    item_type: str = Field(default="SUBSYSTEM", pattern="^(SYSTEM|SUBSYSTEM|UNIT)$")
    # Optional: when omitted the item inherits its parent's class (IEC 62304 §4.3).
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    classification_justification: str | None = None


class SoftwareItemUpdate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str | None = None
    description: str | None = None
    item_type: str | None = Field(default=None, pattern="^(SYSTEM|SUBSYSTEM|UNIT)$")
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    classification_justification: str | None = None
    status: str | None = Field(default=None, pattern="^(DRAFT|REVIEWED|APPROVED)$")


class SoftwareItemRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    description: str | None
    item_type: str
    safety_class: str
    classification_justification: str | None
    status: str
    risk_ids: list[uuid.UUID] = []
    requirement_ids: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Link payloads ─────────────────────────────────────────────────────────────

class LinkRisksPayload(BaseModel):
    risk_ids: list[uuid.UUID]


class LinkRequirementsPayload(BaseModel):
    requirement_ids: list[uuid.UUID]


# ── Compliance ────────────────────────────────────────────────────────────────

class ComplianceCheck(BaseModel):
    rule: str
    label: str
    required: bool
    satisfied: bool
    detail: str


class ComplianceStatus(BaseModel):
    item_id: uuid.UUID
    safety_class: str
    is_compliant: bool
    checks: list[ComplianceCheck]
    blocks: list[str]
    suggested_class: str
    suggestion_reason: str
    # §5.5 direct-unit rollup (units linked to this item via SoftwareUnit.software_item_id).
    # Preserves the existing requirement-based rollup; this is additive evidence.
    direct_unit_count: int = 0
    direct_unit_pass_rate: float | None = None


# ── Status transition ─────────────────────────────────────────────────────────

class StatusTransition(BaseModel):
    status: str = Field(pattern="^(DRAFT|REVIEWED|APPROVED)$")
