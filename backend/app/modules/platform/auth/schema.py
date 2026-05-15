import uuid
from pydantic import BaseModel


class TokenData(BaseModel):
    user_id: uuid.UUID
    email: str
    name: str
    role: str
    permissions: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str
    role: str
    permissions: list[str]
