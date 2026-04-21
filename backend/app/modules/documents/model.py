import enum
import uuid
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class DocumentStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    DRAFT       = "DRAFT"
    IN_REVIEW   = "IN_REVIEW"
    APPROVED    = "APPROVED"
    OBSOLETE    = "OBSOLETE"


class DocumentCategory(str, enum.Enum):
    PLANS      = "PLANS"
    TECHNICAL  = "TECHNICAL"
    DEVELOPMENT = "DEVELOPMENT"


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NOT_STARTED")
    version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: {section_id: html}
