import uuid
from datetime import datetime
from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ProjectBase):
    name: str | None = None


class ProjectRead(ProjectBase):
    id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
