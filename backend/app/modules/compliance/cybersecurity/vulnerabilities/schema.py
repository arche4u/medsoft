import uuid
from datetime import datetime
from pydantic import BaseModel, Field


SEVERITY_PATTERN = "^(LOW|MEDIUM|HIGH|CRITICAL)$"
STATUS_PATTERN = "^(NEW|TRIAGED|MITIGATED|RESOLVED|FALSE_POSITIVE)$"


class VulnerabilityCreate(BaseModel):
    project_id: uuid.UUID
    cve_id: str | None = None
    title: str
    description: str | None = None
    cvss_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cvss_vector: str | None = None
    severity_band: str = Field(default="MEDIUM", pattern=SEVERITY_PATTERN)
    affected_soup_id: uuid.UUID | None = None
    affected_component_id: uuid.UUID | None = None
    disclosed_at: datetime | None = None
    fixed_in_version: str | None = None
    notes: str | None = None


class VulnerabilityUpdate(BaseModel):
    cve_id: str | None = None
    title: str | None = None
    description: str | None = None
    cvss_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cvss_vector: str | None = None
    severity_band: str | None = Field(default=None, pattern=SEVERITY_PATTERN)
    affected_soup_id: uuid.UUID | None = None
    affected_component_id: uuid.UUID | None = None
    status: str | None = Field(default=None, pattern=STATUS_PATTERN)
    disclosed_at: datetime | None = None
    fixed_in_version: str | None = None
    notes: str | None = None


class VulnerabilityRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    cve_id: str | None
    title: str
    description: str | None
    cvss_score: float | None
    cvss_vector: str | None
    severity_band: str
    affected_soup_id: uuid.UUID | None
    affected_component_id: uuid.UUID | None
    status: str
    escalated_risk_id: uuid.UUID | None
    disclosed_at: datetime | None
    fixed_in_version: str | None
    notes: str | None
    triaged_by_id: uuid.UUID | None
    triaged_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VulnerabilityEscalate(BaseModel):
    """Inputs for escalating a Vulnerability into the §7 risk register.

    Risk requires a `requirement_id` (NOT NULL) so the triager picks an
    appropriate target requirement (typically a cyber non-functional
    SOFTWARE-tier requirement). Severity/probability are int 1-5 to match
    the existing Risk schema.
    """
    requirement_id: uuid.UUID
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)
    hazardous_situation: str | None = None
