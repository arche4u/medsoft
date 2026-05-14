import uuid
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin
from app.core.approval_signoff import ApprovalSignoffMixin


# ── Status workflow ───────────────────────────────────────────────────────────
# DRAFT → IN_REVIEW → APPROVED → OBSOLETE.
# Editing an APPROVED plan is forbidden — fork creates a new version.


class Plan(Base, TimestampMixin, ApprovalSignoffMixin):
    """Generic IEC 62304 planning document.

    Covers Maintenance (§6.1), Risk Management (§7), Configuration Management
    (§8.1), Problem Resolution (§9), and any custom plan type — every plan is a
    versioned, signed-off document made of editable sections. The §5.1 Software
    Development Plan keeps its own richer module (it additionally carries
    lifecycle phases + project roles), but follows the same workflow.

    `plan_type` is a free string so new custom plan types can be added without a
    schema change; the built-in types and their default-section templates live
    in `defaults.py`.
    """
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    # Built-in key (MAINTENANCE / RISK_MGMT / CONFIG_MGMT / PROBLEM_RESOLUTION)
    # or a custom slug. Not an Enum — custom plan types are first-class.
    plan_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # IEC 62304 clause reference, e.g. "6.1" / "7" / "8.1" / "9"; null for custom.
    iec_clause: Mapped[str | None] = mapped_column(String(20), nullable=True)
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    safety_class: Mapped[str] = mapped_column(String(1), nullable=False, default="C")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # prepared_by/at, reviewed_by/at, approved_by/at come from ApprovalSignoffMixin

    sections: Mapped[list["PlanSection"]] = relationship(
        "PlanSection", back_populates="plan", cascade="all, delete-orphan",
        order_by="PlanSection.sort_order", lazy="selectin",
    )


class PlanSection(Base, TimestampMixin):
    __tablename__ = "plan_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    section_number: Mapped[str] = mapped_column(String(20), nullable=False)
    section_name: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    plan: Mapped["Plan"] = relationship("Plan", back_populates="sections")
