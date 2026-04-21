import uuid
from datetime import datetime
from pydantic import BaseModel


class DHFDocumentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    generated_at: datetime
    file_path: str | None
    content: str | None

    model_config = {"from_attributes": True}
