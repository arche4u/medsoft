import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ExecutionStatus


class TestExecutionCreate(BaseModel):
    testcase_id: uuid.UUID
    status: ExecutionStatus
    notes: str | None = None


class TestExecutionRead(BaseModel):
    id: uuid.UUID
    testcase_id: uuid.UUID
    status: ExecutionStatus
    executed_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}
