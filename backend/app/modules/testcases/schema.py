import uuid
from datetime import datetime
from pydantic import BaseModel


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
