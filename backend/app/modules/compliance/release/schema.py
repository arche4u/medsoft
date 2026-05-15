import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator
from .model import ReleaseStatus


class ReleaseCreate(BaseModel):
    project_id: uuid.UUID
    version: str
    # IEC 62304 §6.3.2 — optional link to predecessor RELEASED version.
    parent_release_id: uuid.UUID | None = None


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
    # IEC 62304 §6.2.5 — communicate to users and regulators
    user_notification_sent: bool
    user_notification_summary: str | None
    user_notified_at: datetime | None
    regulator_notification_sent: bool
    regulator_notification_summary: str | None
    regulator_notified_at: datetime | None
    # §6.3.2 lineage
    parent_release_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReleaseDetail(ReleaseRead):
    items: list[ReleaseItemRead] = []


class ReleaseNotificationUpdate(BaseModel):
    """§6.2.5 — record that users/regulators have been notified about a
    released-software change."""
    audience: str  # "USER" or "REGULATOR"
    summary: str


class ReadinessCheck(BaseModel):
    ready: bool
    total_system_tests: int
    passed: int
    not_passed: list[uuid.UUID]
