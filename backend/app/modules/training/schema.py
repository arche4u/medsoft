import uuid
from datetime import datetime
from pydantic import BaseModel


class TrainingRecordCreate(BaseModel):
    user_id: uuid.UUID
    training_name: str
    description: str | None = None
    completed_at: datetime
    valid_until: datetime


class TrainingRecordRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    training_name: str
    description: str | None
    completed_at: datetime
    valid_until: datetime
    is_valid: bool = False

    model_config = {"from_attributes": True}
