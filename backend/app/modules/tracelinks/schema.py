import uuid
from pydantic import BaseModel


class TraceLinkBase(BaseModel):
    requirement_id: uuid.UUID
    testcase_id: uuid.UUID


class TraceLinkCreate(TraceLinkBase):
    pass


class TraceLinkRead(TraceLinkBase):
    id: uuid.UUID

    model_config = {"from_attributes": True}
