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


class RiskCreate(BaseModel):
    requirement_id: uuid.UUID
    category_id: uuid.UUID | None = None
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)
    mitigation: str | None = None


class RiskUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    hazard: str | None = None
    hazardous_situation: str | None = None
    harm: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    probability: int | None = Field(default=None, ge=1, le=5)
    mitigation: str | None = None


class RiskRead(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    category_id: uuid.UUID | None = None
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int
    probability: int
    risk_level: str
    mitigation: str | None

    model_config = {"from_attributes": True}


# ── Software Safety Profile ───────────────────────────────────────────────────

class SafetyProfileCreate(BaseModel):
    project_id: uuid.UUID
    iec62304_class: str = Field(default="C", pattern="^[ABC]$")
    classification_rationale: str | None = None
    rpn_scale: int = Field(default=5, ge=5, le=10)
    severity_definitions: str | None = None   # JSON string
    probability_definitions: str | None = None  # JSON string
    iso14971_aligned: bool = True
    software_failure_assumption: bool = True
    sdp_section_reference: str | None = None
    approved_by: str | None = None
    review_date: str | None = None


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
    created_at: Any
    updated_at: Any

    model_config = {"from_attributes": True}
