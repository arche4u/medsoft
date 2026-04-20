import enum
import uuid
from sqlalchemy import Enum as SAEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class ValidationStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    PASSED = "PASSED"
    FAILED = "FAILED"


class ValidationRecord(Base, TimestampMixin):
    __tablename__ = "validation_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    related_requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ValidationStatus] = mapped_column(
        SAEnum(ValidationStatus, name="validationstatus"),
        nullable=False,
        default=ValidationStatus.PLANNED,
    )
