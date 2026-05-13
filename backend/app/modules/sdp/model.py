import uuid
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin
from app.core.approval_signoff import ApprovalSignoffMixin


# ── Status workflow ───────────────────────────────────────────────────────────
# DRAFT → IN_REVIEW → APPROVED → OBSOLETE
# Only APPROVED SDPs are operationally active.
# Editing an APPROVED SDP is forbidden; use /fork to create a new version.

# ── Lifecycle models ──────────────────────────────────────────────────────────
# V_MODEL / AGILE / HYBRID

# ── required_for_class field ──────────────────────────────────────────────────
# Stores a string like "ABC", "BC", or "C" indicating which safety classes
# require this phase / role. Checked by compliance queries.


class SoftwareDevelopmentPlan(Base, TimestampMixin, ApprovalSignoffMixin):
    """IEC 62304 §5.1 Software Development Plan.

    Status workflow: DRAFT → IN_REVIEW → APPROVED → OBSOLETE.
    Carries the standard prepared/reviewed/approved signoff via mixin.
    Editing an APPROVED SDP is forbidden — fork creates a new version.
    """
    __tablename__ = "sdp"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    lifecycle_model: Mapped[str] = mapped_column(String(30), nullable=False, default="V_MODEL")
    safety_class: Mapped[str] = mapped_column(String(1), nullable=False, default="C")
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="Software Development Plan")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # prepared_by/at, reviewed_by/at, approved_by/at come from ApprovalSignoffMixin

    sections: Mapped[list["SDPSection"]] = relationship(
        "SDPSection", back_populates="sdp", cascade="all, delete-orphan",
        order_by="SDPSection.sort_order", lazy="selectin",
    )
    phases: Mapped[list["SDPLifecyclePhase"]] = relationship(
        "SDPLifecyclePhase", back_populates="sdp", cascade="all, delete-orphan",
        order_by="SDPLifecyclePhase.phase_order", lazy="selectin",
    )
    roles: Mapped[list["SDPProjectRole"]] = relationship(
        "SDPProjectRole", back_populates="sdp", cascade="all, delete-orphan",
        order_by="SDPProjectRole.sort_order", lazy="selectin",
    )


class SDPSection(Base, TimestampMixin):
    __tablename__ = "sdp_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sdp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sdp.id", ondelete="CASCADE"), nullable=False
    )
    section_number: Mapped[str] = mapped_column(String(20), nullable=False)
    section_name: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    sdp: Mapped["SoftwareDevelopmentPlan"] = relationship("SoftwareDevelopmentPlan", back_populates="sections")


class SDPLifecyclePhase(Base, TimestampMixin):
    __tablename__ = "sdp_lifecycle_phases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sdp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sdp.id", ondelete="CASCADE"), nullable=False
    )
    phase_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phase_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    exit_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    activities: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_for_class: Mapped[str] = mapped_column(String(5), nullable=False, default="ABC")

    sdp: Mapped["SoftwareDevelopmentPlan"] = relationship("SoftwareDevelopmentPlan", back_populates="phases")


class SDPProjectRole(Base, TimestampMixin):
    __tablename__ = "sdp_project_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sdp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sdp.id", ondelete="CASCADE"), nullable=False
    )
    role_name: Mapped[str] = mapped_column(String(200), nullable=False)
    responsibilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_for_class: Mapped[str] = mapped_column(String(5), nullable=False, default="ABC")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    sdp: Mapped["SoftwareDevelopmentPlan"] = relationship("SoftwareDevelopmentPlan", back_populates="roles")
