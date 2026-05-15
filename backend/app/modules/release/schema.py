import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator
from .model import ReleaseStatus


class ReleaseCreate(BaseModel):
    project_id: uuid.UUID
    version: str


class ReleaseTransition(BaseModel):
    new_status: ReleaseStatus


class ReleaseItemCreate(BaseModel):
    release_id: uuid.UUID
    requirement_id: uuid.UUID | None = None
    system_test_id: uuid.UUID | None = None
    design_element_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def at_least_one_ref(self):
        if not any([self.requirement_id, self.system_test_id, self.design_element_id]):
            raise ValueError("At least one of requirement_id, system_test_id, or design_element_id must be provided")
        return self


class ReleaseItemRead(BaseModel):
    id: uuid.UUID
    release_id: uuid.UUID
    requirement_id: uuid.UUID | None
    system_test_id: uuid.UUID | None
    design_element_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class ReleaseRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: ReleaseStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class ReleaseDetail(ReleaseRead):
    items: list[ReleaseItemRead] = []


class ReadinessCheck(BaseModel):
    ready: bool
    total_system_tests: int
    passed: int
    not_passed: list[uuid.UUID]
