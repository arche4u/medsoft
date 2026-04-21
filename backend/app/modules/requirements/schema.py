import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator


class RequirementCategoryCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    label: str
    color: str = "#546e7a"
    parent_id: uuid.UUID | None = None   # optional: nest under an existing category

    @model_validator(mode="after")
    def normalise_name(self):
        self.name = self.name.strip().upper().replace(" ", "_")
        if not self.name:
            raise ValueError("name must not be empty")
        return self


class RequirementCategoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    label: str
    color: str
    is_builtin: bool
    sort_order: int
    parent_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class RequirementCreate(BaseModel):
    project_id: uuid.UUID
    type: str
    parent_id: uuid.UUID | None = None      # optional for all types except USER (enforced in router)
    title: str
    description: str | None = None

    @model_validator(mode="after")
    def user_must_have_no_parent(self):
        if self.type.upper() == "USER" and self.parent_id is not None:
            raise ValueError("USER requirements must not have a parent")
        return self


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class RequirementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    type: str
    readable_id: str
    parent_id: uuid.UUID | None
    title: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadSummary(BaseModel):
    total_added: int
    total_skipped: int
    added: list[dict]
    skipped: list[dict]
