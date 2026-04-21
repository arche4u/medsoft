import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base


class ESignEntityType(str, enum.Enum):
    CHANGE_REQUEST = "CHANGE_REQUEST"
    RELEASE = "RELEASE"
    VALIDATION = "VALIDATION"


class ESignMeaning(str, enum.Enum):
    APPROVAL = "APPROVAL"
    REVIEW = "REVIEW"
    AUTHORSHIP = "AUTHORSHIP"


class ElectronicSignature(Base):
    __tablename__ = "electronic_signatures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    entity_type: Mapped[ESignEntityType] = mapped_column(
        SAEnum(ESignEntityType, name="esignentitytype"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    meaning: Mapped[ESignMeaning] = mapped_column(
        SAEnum(ESignMeaning, name="esignmeaning"), nullable=False
    )
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip_address: Mapped[str | None] = mapped_column(String(100))
    comments: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship(back_populates="electronic_signatures")
