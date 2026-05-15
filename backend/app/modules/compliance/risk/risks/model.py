import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class RiskCategory(Base, TimestampMixin):
    """Per-project risk folder/category definitions."""
    __tablename__ = "risk_categories"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_risk_category_project_name"),
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


def _compute_level(severity: int, probability: int) -> str:
    score = severity * probability
    if score <= 4:
        return "LOW"
    elif score <= 9:
        return "MEDIUM"
    return "HIGH"


# ── Risk status values ────────────────────────────────────────────────────────
# OPEN                  → initial state, no controls yet
# IN_CONTROL            → at least one risk control added
# RE_EVALUATION_REQUIRED → a linked requirement was changed
# ACCEPTED              → residual risk evaluated and accepted
# CLOSED                → all controls verified, risk file complete

# ── Risk control types (ISO 14971 §6.2) ──────────────────────────────────────
# INHERENT_SAFETY       → design out the hazard
# PROTECTIVE_MEASURE    → guards, alarms, barriers
# INFORMATION_FOR_SAFETY → labeling, warnings, IFU

# ── Risk control implementation statuses ─────────────────────────────────────
# PROPOSED   → defined, not yet implemented
# IMPLEMENTED → in software/hardware, not yet verified
# VERIFIED    → verification test passed


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_categories.id", ondelete="SET NULL"), nullable=True
    )
    # ISO 14971 hazard analysis fields
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hazard: Mapped[str] = mapped_column(String(500), nullable=False)
    hazardous_situation: Mapped[str] = mapped_column(String(500), nullable=False)
    harm: Mapped[str] = mapped_column(String(500), nullable=False)
    # Initial (pre-control) risk scoring
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    # Legacy mitigation text (kept for backward compat)
    mitigation: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Lifecycle management
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN")
    evaluation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    re_evaluation_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    requirement: Mapped["Requirement"] = relationship(back_populates="risks")
    controls: Mapped[list["RiskControl"]] = relationship(
        "RiskControl", back_populates="risk", cascade="all, delete-orphan", lazy="selectin"
    )
    residual_risk: Mapped["ResidualRisk | None"] = relationship(
        "ResidualRisk", back_populates="risk", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )


class RiskControl(Base, TimestampMixin):
    """ISO 14971 risk control measure — links a risk to a requirement and/or test case."""
    __tablename__ = "risk_controls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), nullable=False
    )
    control_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True
    )
    system_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    implementation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PROPOSED")
    verification_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    risk: Mapped["Risk"] = relationship("Risk", back_populates="controls")


class ResidualRisk(Base, TimestampMixin):
    """Post-control residual risk assessment (ISO 14971 §6.4)."""
    __tablename__ = "residual_risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_accepted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accepted_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    risk: Mapped["Risk"] = relationship("Risk", back_populates="residual_risk")


class SoftwareSafetyProfile(Base, TimestampMixin):
    """Per-project IEC 62304 safety classification and RPN methodology declaration."""
    __tablename__ = "software_safety_profiles"
    __table_args__ = (UniqueConstraint("project_id", name="uq_safety_profile_project"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    iec62304_class: Mapped[str] = mapped_column(String(1), nullable=False, default="C")
    classification_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    rpn_scale: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    severity_definitions: Mapped[str | None] = mapped_column(Text, nullable=True)
    probability_definitions: Mapped[str | None] = mapped_column(Text, nullable=True)
    iso14971_aligned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    software_failure_assumption: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sdp_section_reference: Mapped[str | None] = mapped_column(String(300), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    review_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
