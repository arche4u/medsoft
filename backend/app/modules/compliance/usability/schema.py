import uuid
from datetime import datetime
from pydantic import BaseModel, Field


SEV_PATTERN = "^(LOW|MEDIUM|HIGH|CRITICAL)$"
UE_STATUS_PATTERN = "^(IDENTIFIED|MITIGATED|ACCEPTED|TRANSFERRED)$"
FILE_STATUS_PATTERN = "^(DRAFT|IN_REVIEW|APPROVED|OBSOLETE)$"


# ── UseError ─────────────────────────────────────────────────────────────────

class UseErrorCreate(BaseModel):
    description: str
    potential_harm: str | None = None
    severity: str = Field(default="MEDIUM", pattern=SEV_PATTERN)
    status: str = Field(default="IDENTIFIED", pattern=UE_STATUS_PATTERN)
    mitigation: str | None = None


class UseErrorUpdate(BaseModel):
    description: str | None = None
    potential_harm: str | None = None
    severity: str | None = Field(default=None, pattern=SEV_PATTERN)
    status: str | None = Field(default=None, pattern=UE_STATUS_PATTERN)
    mitigation: str | None = None
    escalated_risk_id: uuid.UUID | None = None


class UseErrorRead(BaseModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    description: str
    potential_harm: str | None
    severity: str
    status: str
    mitigation: str | None
    escalated_risk_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UseErrorEscalate(BaseModel):
    """Escalate a Use Error to the §7 risk register.

    Risk requires a `requirement_id` (NOT NULL) so the triager picks an
    appropriate target — typically a USER requirement covering the use
    scenario or a SOFTWARE requirement covering the underlying behaviour.
    """
    requirement_id: uuid.UUID
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)
    hazardous_situation: str | None = None


# ── UseScenario ──────────────────────────────────────────────────────────────

class UseScenarioCreate(BaseModel):
    name: str
    primary_function: str | None = None
    task_chain: str | None = None
    component_id: uuid.UUID | None = None


class UseScenarioUpdate(BaseModel):
    name: str | None = None
    primary_function: str | None = None
    task_chain: str | None = None
    component_id: uuid.UUID | None = None


class UseScenarioRead(BaseModel):
    id: uuid.UUID
    usability_file_id: uuid.UUID
    name: str
    primary_function: str | None
    task_chain: str | None
    component_id: uuid.UUID | None
    use_errors: list[UseErrorRead] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── UsabilityFile ────────────────────────────────────────────────────────────

class UsabilityFileCreate(BaseModel):
    project_id: uuid.UUID
    name: str = "Usability Engineering File"
    version: str = "1.0"
    intended_users: str | None = None
    intended_use_environment: str | None = None
    intended_medical_indication: str | None = None
    operating_principle: str | None = None


class UsabilityFileUpdate(BaseModel):
    name: str | None = None
    status: str | None = Field(default=None, pattern=FILE_STATUS_PATTERN)
    intended_users: str | None = None
    intended_use_environment: str | None = None
    intended_medical_indication: str | None = None
    operating_principle: str | None = None


class UsabilityFileRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    version: str
    status: str
    intended_users: str | None
    intended_use_environment: str | None
    intended_medical_indication: str | None
    operating_principle: str | None
    approved_by_id: uuid.UUID | None
    approved_at: datetime | None
    scenarios: list[UseScenarioRead] = []
    created_at: datetime

    model_config = {"from_attributes": True}
