import enum
import uuid
from sqlalchemy import Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class RequirementType(str, enum.Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    SOFTWARE = "SOFTWARE"


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    type: Mapped[RequirementType] = mapped_column(SAEnum(RequirementType, name="requirementtype"), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    project: Mapped["Project"] = relationship(back_populates="requirements")
    tracelinks: Mapped[list["TraceLink"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")
    risks: Mapped[list["Risk"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")
