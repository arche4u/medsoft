import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ChangeRequestState


class ChangeRequestCreate(BaseModel):
    project_id: uuid.UUID
    title: str
    description: str | None = None


class ChangeRequestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class ChangeRequestTransition(BaseModel):
    new_status: ChangeRequestState


class ChangeImpactCreate(BaseModel):
    change_request_id: uuid.UUID
    impacted_requirement_id: uuid.UUID | None = None
    impacted_design_id: uuid.UUID | None = None
    impacted_testcase_id: uuid.UUID | None = None
    impact_description: str | None = None


class ChangeImpactRead(BaseModel):
    id: uuid.UUID
    change_request_id: uuid.UUID
    impacted_requirement_id: uuid.UUID | None
    impacted_design_id: uuid.UUID | None
    impacted_testcase_id: uuid.UUID | None
    impact_description: str | None

    model_config = {"from_attributes": True}


class ChangeRequestRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None
    status: ChangeRequestState
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangeRequestDetail(ChangeRequestRead):
    impacts: list[ChangeImpactRead] = []
