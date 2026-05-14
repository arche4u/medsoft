import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── Sections ──────────────────────────────────────────────────────────────────

class PlanSectionCreate(BaseModel):
    section_number: str
    section_name: str
    content: str | None = None
    sort_order: int = 0

class PlanSectionUpdate(BaseModel):
    section_number: str | None = None
    section_name: str | None = None
    content: str | None = None
    sort_order: int | None = None

class PlanSectionRead(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    section_number: str
    section_name: str
    content: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Plan ──────────────────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    project_id: uuid.UUID
    # Built-in key (MAINTENANCE / RISK_MGMT / CONFIG_MGMT / PROBLEM_RESOLUTION)
    # or a custom slug. For built-in types title/iec_clause/sections default
    # from the catalog; for custom types `title` is required.
    plan_type: str
    version: str = "1.0"
    safety_class: str = Field(default="C", pattern="^[ABC]$")
    title: str | None = None
    iec_clause: str | None = None
    description: str | None = None
    created_by: str | None = None

class PlanUpdate(BaseModel):
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    title: str | None = None
    iec_clause: str | None = None
    description: str | None = None
    created_by: str | None = None

class PlanStatusTransition(BaseModel):
    """Body for /plans/{id}/status. The router decides which signoff names are
    required for the requested transition (prepared_by on DRAFT→IN_REVIEW,
    reviewed_by + approved_by on IN_REVIEW→APPROVED)."""
    status: str = Field(pattern="^(DRAFT|IN_REVIEW|APPROVED|OBSOLETE)$")
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None
    review_notes: str | None = None

class PlanRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    plan_type: str
    iec_clause: str | None
    version: str
    status: str
    safety_class: str
    title: str
    description: str | None
    created_by: str | None
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    review_notes: str | None
    sections: list[PlanSectionRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PlanSummary(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    plan_type: str
    iec_clause: str | None
    version: str
    status: str
    safety_class: str
    title: str
    created_by: str | None
    prepared_by: str | None
    reviewed_by: str | None
    approved_by: str | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PlanTransitionResult(BaseModel):
    """Envelope around a transitioned plan that can also surface non-blocking
    warnings (e.g. reviewer == approver) to the UI."""
    plan: PlanRead
    warnings: list[str] = []


# ── Plan-type catalog ─────────────────────────────────────────────────────────

class PlanTypeInfo(BaseModel):
    """One built-in plan type — served by GET /plans/types so the UI lists the
    standard IEC 62304 plans without hardcoding them."""
    key: str
    label: str
    iec_clause: str
    description: str


# ── Compliance check ──────────────────────────────────────────────────────────

class PlanComplianceCheck(BaseModel):
    rule: str
    label: str
    satisfied: bool
    detail: str

class PlanComplianceStatus(BaseModel):
    plan_id: uuid.UUID
    is_ready_for_approval: bool
    checks: list[PlanComplianceCheck]
