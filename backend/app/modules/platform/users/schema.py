import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role_id: uuid.UUID


class UserUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    role_id: uuid.UUID | None = None


class UserRead(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role_id: uuid.UUID
    is_active: bool
    created_at: datetime
    role_name: str | None = None

    model_config = {"from_attributes": True}
