import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ThreatCreate(BaseModel):
    component_id: uuid.UUID | None = None
    category: str = Field(pattern="^[STRIDE]$")
    title: str
    description: str | None = None
    severity: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    status: str = Field(default="IDENTIFIED", pattern="^(IDENTIFIED|MITIGATED|ACCEPTED|TRANSFERRED)$")
    mitigation: str | None = None
    escalated_risk_id: uuid.UUID | None = None


class ThreatUpdate(BaseModel):
    component_id: uuid.UUID | None = None
    category: str | None = Field(default=None, pattern="^[STRIDE]$")
    title: str | None = None
    description: str | None = None
    severity: str | None = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    status: str | None = Field(default=None, pattern="^(IDENTIFIED|MITIGATED|ACCEPTED|TRANSFERRED)$")
    mitigation: str | None = None
    escalated_risk_id: uuid.UUID | None = None


class ThreatRead(BaseModel):
    id: uuid.UUID
    threat_model_id: uuid.UUID
    component_id: uuid.UUID | None
    category: str
    title: str
    description: str | None
    severity: str
    status: str
    mitigation: str | None
    escalated_risk_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreatModelCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    description: str | None = None
    version: str = "1.0"
    release_id: uuid.UUID | None = None


class ThreatModelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(DRAFT|IN_REVIEW|APPROVED|OBSOLETE)$")
    release_id: uuid.UUID | None = None


class ThreatModelRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    version: str
    status: str
    release_id: uuid.UUID | None
    approved_by_id: uuid.UUID | None
    approved_at: datetime | None
    threats: list[ThreatRead] = []
    created_at: datetime

    model_config = {"from_attributes": True}
