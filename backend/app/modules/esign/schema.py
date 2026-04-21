import uuid
from datetime import datetime
from pydantic import BaseModel
from .model import ESignEntityType, ESignMeaning


class ESignCreate(BaseModel):
    entity_type: ESignEntityType
    entity_id: uuid.UUID
    meaning: ESignMeaning
    password: str
    comments: str | None = None


class ESignRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    entity_type: ESignEntityType
    entity_id: uuid.UUID
    meaning: ESignMeaning
    signed_at: datetime
    ip_address: str | None
    comments: str | None
    signer_name: str | None = None
    signer_email: str | None = None

    model_config = {"from_attributes": True}
