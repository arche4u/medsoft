import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ChangeRequestState


class ChangeRequestCreate(BaseModel):
    project_id: uuid.UUID
    title: str
    description: str | None = None
    modifies_released_software: bool = False


class ChangeRequestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    # IEC 62304 §6.2.3 — post-release analysis fields. Required before
    # APPROVED transition when modifies_released_software is True.
    modifies_released_software: bool | None = None
    effect_on_organization: str | None = None
    effect_on_released_software: str | None = None
    effect_on_interfacing_systems: str | None = None


class ChangeRequestTransition(BaseModel):
    new_status: ChangeRequestState


class ChangeImpactCreate(BaseModel):
    change_request_id: uuid.UUID
    impacted_requirement_id: uuid.UUID | None = None
    impacted_design_id: uuid.UUID | None = None
    impacted_system_test_id: uuid.UUID | None = None
    impact_description: str | None = None


class ChangeImpactRead(BaseModel):
    id: uuid.UUID
    change_request_id: uuid.UUID
    impacted_requirement_id: uuid.UUID | None
    impacted_design_id: uuid.UUID | None
    impacted_system_test_id: uuid.UUID | None
    impact_description: str | None

    model_config = {"from_attributes": True}


class ChangeRequestRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None
    status: ChangeRequestState
    modifies_released_software: bool
    effect_on_organization: str | None
    effect_on_released_software: str | None
    effect_on_interfacing_systems: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangeRequestDetail(ChangeRequestRead):
    impacts: list[ChangeImpactRead] = []
