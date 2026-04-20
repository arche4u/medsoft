import uuid
from pydantic import BaseModel, Field


class RiskCreate(BaseModel):
    requirement_id: uuid.UUID
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int = Field(ge=1, le=5)
    probability: int = Field(ge=1, le=5)


class RiskUpdate(BaseModel):
    hazard: str | None = None
    hazardous_situation: str | None = None
    harm: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    probability: int | None = Field(default=None, ge=1, le=5)


class RiskRead(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    hazard: str
    hazardous_situation: str
    harm: str
    severity: int
    probability: int
    risk_level: str

    model_config = {"from_attributes": True}
