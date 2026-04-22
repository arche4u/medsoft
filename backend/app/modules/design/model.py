import enum
import uuid
from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class DesignElementType(str, enum.Enum):
    ARCHITECTURE = "ARCHITECTURE"
    DETAILED = "DETAILED"


class DesignElement(Base, TimestampMixin):
    __tablename__ = "design_elements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    readable_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    type: Mapped[DesignElementType] = mapped_column(SAEnum(DesignElementType, name="designelementtype"), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    diagram_source: Mapped[str | None] = mapped_column(Text, nullable=True)


class DesignCategory(Base, TimestampMixin):
    """Per-project design element folder/category definitions."""
    __tablename__ = "design_categories"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_design_category_project_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#546e7a")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class RequirementDesignLink(Base):
    __tablename__ = "requirement_design_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=False)
    design_element_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=False)
