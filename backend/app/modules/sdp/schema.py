import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── Sections ──────────────────────────────────────────────────────────────────

class SDPSectionCreate(BaseModel):
    section_number: str
    section_name: str
    content: str | None = None
    sort_order: int = 0

class SDPSectionUpdate(BaseModel):
    section_name: str | None = None
    content: str | None = None
    sort_order: int | None = None

class SDPSectionRead(BaseModel):
    id: uuid.UUID
    sdp_id: uuid.UUID
    section_number: str
    section_name: str
    content: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Lifecycle phases ──────────────────────────────────────────────────────────

class SDPPhaseCreate(BaseModel):
    phase_name: str
    phase_order: int = 0
    entry_criteria: str | None = None
    exit_criteria: str | None = None
    activities: str | None = None
    required_for_class: str = Field(default="ABC", pattern="^[ABC]{1,3}$")

class SDPPhaseUpdate(BaseModel):
    phase_name: str | None = None
    phase_order: int | None = None
    entry_criteria: str | None = None
    exit_criteria: str | None = None
    activities: str | None = None
    required_for_class: str | None = Field(default=None, pattern="^[ABC]{1,3}$")

class SDPPhaseRead(BaseModel):
    id: uuid.UUID
    sdp_id: uuid.UUID
    phase_name: str
    phase_order: int
    entry_criteria: str | None
    exit_criteria: str | None
    activities: str | None
    required_for_class: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Roles ─────────────────────────────────────────────────────────────────────

class SDPRoleCreate(BaseModel):
    role_name: str
    responsibilities: str | None = None
    required_for_class: str = Field(default="ABC", pattern="^[ABC]{1,3}$")
    sort_order: int = 0

class SDPRoleUpdate(BaseModel):
    role_name: str | None = None
    responsibilities: str | None = None
    required_for_class: str | None = Field(default=None, pattern="^[ABC]{1,3}$")
    sort_order: int | None = None

class SDPRoleRead(BaseModel):
    id: uuid.UUID
    sdp_id: uuid.UUID
    role_name: str
    responsibilities: str | None
    required_for_class: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Main SDP ──────────────────────────────────────────────────────────────────

class SDPCreate(BaseModel):
    project_id: uuid.UUID
    version: str = "1.0"
    lifecycle_model: str = Field(default="V_MODEL", pattern="^(V_MODEL|AGILE|HYBRID)$")
    safety_class: str = Field(default="C", pattern="^[ABC]$")
    title: str = "Software Development Plan"
    description: str | None = None
    created_by: str | None = None

class SDPUpdate(BaseModel):
    lifecycle_model: str | None = Field(default=None, pattern="^(V_MODEL|AGILE|HYBRID)$")
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    title: str | None = None
    description: str | None = None
    created_by: str | None = None

class SDPStatusTransition(BaseModel):
    status: str = Field(pattern="^(DRAFT|IN_REVIEW|APPROVED|OBSOLETE)$")
    approved_by: str | None = None
    review_notes: str | None = None

class SDPRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    lifecycle_model: str
    safety_class: str
    title: str
    description: str | None
    created_by: str | None
    approved_by: str | None
    approved_at: datetime | None
    review_notes: str | None
    sections: list[SDPSectionRead] = []
    phases: list[SDPPhaseRead] = []
    roles: list[SDPRoleRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class SDPSummary(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    lifecycle_model: str
    safety_class: str
    title: str
    created_by: str | None
    approved_by: str | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Compliance check ──────────────────────────────────────────────────────────

class SDPComplianceCheck(BaseModel):
    rule: str
    label: str
    satisfied: bool
    detail: str

class SDPComplianceStatus(BaseModel):
    sdp_id: uuid.UUID
    is_ready_for_approval: bool
    checks: list[SDPComplianceCheck]
