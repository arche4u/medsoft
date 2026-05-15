import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


# ── Risk Category ─────────────────────────────────────────────────────────────

class RiskCategoryCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    label: str
    color: str = "#546e7a"

class RiskCategoryUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    sort_order: int | None = None

class RiskCategoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    label: str
    color: str
    sort_order: int
    is_builtin: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Risk Control ──────────────────────────────────────────────────────────────

class RiskControlCreate(BaseModel):
    control_type: str = Field(pattern="^(INHERENT_SAFETY|PROTECTIVE_MEASURE|INFORMATION_FOR_SAFETY)$")
    description: str
    requirement_id: uuid.UUID | None = None
    system_test_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    implementation_status: str = Field(default="PROPOSED", pattern="^(PROPOSED|IMPLEMENTED|VERIFIED)$")

class RiskControlUpdate(BaseModel):
    control_type: str | None = Field(default=None, pattern="^(INHERENT_SAFETY|PROTECTIVE_MEASURE|INFORMATION_FOR_SAFETY)$")
    description: str | None = None
    requirement_id: uuid.UUID | None = None
    system_test_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    implementation_status: str | None = Field(default=None, pattern="^(PROPOSED|IMPLEMENTED|VERIFIED)$")


# ── §7.3 — Verification Evidence ─────────────────────────────────────────────

class VerificationEvidenceCreate(BaseModel):
    evidence_type: str = Field(pattern="^(SYSTEM_TEST|INTEGRATION_TEST|UNIT_TEST|REVIEW|INSPECTION|ANALYSIS|EXTERNAL_REF)$")
    system_test_id: uuid.UUID | None = None
    integration_test_id: uuid.UUID | None = None
    unit_test_id: uuid.UUID | None = None
    external_reference: str | None = None
    result: str = Field(default="PASS", pattern="^(PASS|FAIL)$")
    notes: str | None = None
    verified_by: str | None = None


class VerificationEvidenceRead(BaseModel):
    id: uuid.UUID
    control_id: uuid.UUID
    evidence_type: str
    system_test_id: uuid.UUID | None
    integration_test_id: uuid.UUID | None
    unit_test_id: uuid.UUID | None
    external_reference: str | None
    result: str
    notes: str | None
    verified_by: str | None
    verified_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RiskControlRead(BaseModel):
    id: uuid.UUID
    risk_id: uuid.UUID
    control_type: str
    description: str
    requirement_id: uuid.UUID | None
    system_test_id: uuid.UUID | None
    component_id: uuid.UUID | None
    implementation_status: str
    evidence: list[VerificationEvidenceRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── §7.1 — Risk Contribution (software → hazard analysis) ────────────────────

class RiskContributionCreate(BaseModel):
    software_item_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    contribution_notes: str | None = None


class RiskContributionRead(BaseModel):
    id: uuid.UUID
    risk_id: uuid.UUID
    software_item_id: uuid.UUID | None
    component_id: uuid.UUID | None
    contribution_notes: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── §7.4 — Re-evaluation recording ──────────────────────────────────────────

class RiskReEvaluate(BaseModel):
    """Record the outcome of a §7.4 risk re-evaluation. Clears
    `re_evaluation_required` and writes the audit fields. Caller may also
    update severity / probability if the re-evaluation concluded the risk
    score has changed."""
    notes: str
    re_evaluated_by: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    probability: int | None = Field(default=None, ge=1, le=5)
    new_status: str | None = Field(default=None, pattern="^(OPEN|IN_CONTROL|ACCEPTED|CLOSED)$")


# ── Residual Risk ─────────────────────────────────────────────────────────────

class ResidualRiskUpsert(BaseModel):
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)
    rationale: str | None = None
    is_accepted: bool = False
    accepted_by: str | None = None

class ResidualRiskRead(BaseModel):
    id: uuid.UUID
    risk_id: uuid.UUID
    severity: int
    probability: int
    risk_level: str
    rationale: str | None
    is_accepted: bool
    accepted_by: str | None
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Risk ──────────────────────────────────────────────────────────────────────

class RiskCreate(BaseModel):
    requirement_id: uuid.UUID
    category_id: uuid.UUID | None = None
    title: str | None = None
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)
    evaluation_notes: str | None = None
    # IEC 81001-5-1 + AAMI TIR57 discriminator.
    risk_class: str = Field(default="SAFETY", pattern="^(SAFETY|SECURITY|SAFETY_SECURITY)$")


class RiskUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    title: str | None = None
    hazard: str | None = None
    hazardous_situation: str | None = None
    harm: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    probability: int | None = Field(default=None, ge=1, le=5)
    evaluation_notes: str | None = None
    risk_class: str | None = Field(default=None, pattern="^(SAFETY|SECURITY|SAFETY_SECURITY)$")


class RiskStatusUpdate(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_CONTROL|RE_EVALUATION_REQUIRED|ACCEPTED|CLOSED)$")


class RiskRead(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    category_id: uuid.UUID | None = None
    risk_class: str
    title: str | None = None
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int
    probability: int
    risk_level: str
    status: str
    evaluation_notes: str | None
    re_evaluation_required: bool
    re_evaluation_reason: str | None = None
    re_evaluation_triggered_at: datetime | None = None
    last_re_evaluated_at: datetime | None = None
    last_re_evaluated_by: str | None = None
    controls: list[RiskControlRead] = []
    residual_risk: ResidualRiskRead | None = None
    contributions: list[RiskContributionRead] = []
    model_config = ConfigDict(from_attributes=True)


# ── Dashboard ─────────────────────────────────────────────────────────────────

class HeatmapCell(BaseModel):
    severity: int
    probability: int
    count: int

class RiskDashboard(BaseModel):
    total: int
    by_level: dict[str, int]
    by_status: dict[str, int]
    re_evaluation_count: int
    heatmap: list[HeatmapCell]
    controls_total: int
    controls_verified: int
    residual_accepted: int


# ── Software Safety Profile ───────────────────────────────────────────────────

class SafetyProfileCreate(BaseModel):
    project_id: uuid.UUID
    iec62304_class: str = Field(default="C", pattern="^[ABC]$")
    classification_rationale: str | None = None
    rpn_scale: int = Field(default=5, ge=5, le=10)
    severity_definitions: str | None = None
    probability_definitions: str | None = None
    iso14971_aligned: bool = True
    software_failure_assumption: bool = True
    sdp_section_reference: str | None = None
    approved_by: str | None = None
    review_date: str | None = None
    # IEC 62304 §4.4 — project-level legacy-software declaration
    has_legacy_software: bool = False
    legacy_software_statement: str | None = None


class SafetyProfileUpdate(BaseModel):
    iec62304_class: str | None = Field(default=None, pattern="^[ABC]$")
    classification_rationale: str | None = None
    rpn_scale: int | None = Field(default=None, ge=5, le=10)
    severity_definitions: str | None = None
    probability_definitions: str | None = None
    iso14971_aligned: bool | None = None
    software_failure_assumption: bool | None = None
    sdp_section_reference: str | None = None
    approved_by: str | None = None
    review_date: str | None = None
    has_legacy_software: bool | None = None
    legacy_software_statement: str | None = None


class SafetyProfileRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    iec62304_class: str
    classification_rationale: str | None
    rpn_scale: int
    severity_definitions: str | None
    probability_definitions: str | None
    iso14971_aligned: bool
    software_failure_assumption: bool
    sdp_section_reference: str | None
    approved_by: str | None
    review_date: str | None
    has_legacy_software: bool
    legacy_software_statement: str | None
    created_at: Any
    updated_at: Any
    model_config = ConfigDict(from_attributes=True)
