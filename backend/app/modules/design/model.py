import uuid
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class DesignElement(Base, TimestampMixin):
    """IEC 62304 §5.4 — software detailed design.

    Every design element details exactly one §5.3 architecture component
    (`component_id`). Elements may optionally nest under another design
    element of the *same* component (`parent_id`) for sub-detail breakdown.
    The cross-component hierarchy lives in the SWComponent tree (§5.3) — this
    table no longer carries its own ARCHITECTURE/DETAILED tier or category
    folders (both were redundant with the §5.3 module).
    """
    __tablename__ = "design_elements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    # The §5.3 architecture component this detailed design belongs to.
    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    # Optional sub-nesting under another design element of the SAME component.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=True
    )
    readable_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    diagram_source: Mapped[str | None] = mapped_column(Text, nullable=True)


class RequirementDesignLink(Base):
    __tablename__ = "requirement_design_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=False)
    design_element_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=False)
