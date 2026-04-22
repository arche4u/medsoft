import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator


# ── Test Category schemas ─────────────────────────────────────────────────────

class TestCategoryCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    label: str
    color: str = "#546e7a"

    @model_validator(mode="after")
    def normalise_name(self):
        self.name = self.name.strip().upper().replace(" ", "_")
        if not self.name:
            raise ValueError("name must not be empty")
        return self


class TestCategoryUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    sort_order: int | None = None


class TestCategoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    label: str
    color: str
    sort_order: int
    is_builtin: bool

    model_config = {"from_attributes": True}


class TestCaseBase(BaseModel):
    project_id: uuid.UUID
    title: str
    description: str | None = None


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class TestCaseRead(TestCaseBase):
    id: uuid.UUID
    readable_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
