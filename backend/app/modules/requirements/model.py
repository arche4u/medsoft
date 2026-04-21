import enum
import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin

# Built-in type names kept as constants for hierarchy validation
BUILTIN_TYPES = ("USER", "SYSTEM", "SOFTWARE")

# Kept for backward compat in validation logic
class RequirementType(str, enum.Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    SOFTWARE = "SOFTWARE"


class RequirementCategory(Base, TimestampMixin):
    """Per-project requirement type definitions (built-in + custom)."""
    __tablename__ = "requirement_categories"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_req_category_project_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#546e7a")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    # Self-referential: custom sub-categories sit under a parent category
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_categories.id", ondelete="SET NULL"), nullable=True
    )


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"
    __table_args__ = (UniqueConstraint("project_id", "readable_id", name="uq_req_project_readable_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)   # references RequirementCategory.name
    readable_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    project: Mapped["Project"] = relationship(back_populates="requirements")
    tracelinks: Mapped[list["TraceLink"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan", passive_deletes=True
    )
    risks: Mapped[list["Risk"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan", passive_deletes=True
    )
