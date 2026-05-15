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


# ── Risk class discriminator (IEC 62304 §7 + IEC 81001-5-1 + AAMI TIR57) ─────
# A single risk register hosts software-safety, cybersecurity, and combined
# safety-security risks under one ISO 14971 file. The class field lets the
# UI filter / tab and lets reports separate the two without forking schema.
# SAFETY            classical software-safety risk (default; back-compat)
# SECURITY          cybersecurity risk (IEC 81001-5-1 / AAMI TIR57)
# SAFETY_SECURITY   risk where a security vulnerability could cause a safety
#                    hazard (the bridge case AAMI TIR57 emphasises)


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_categories.id", ondelete="SET NULL"), nullable=True
    )
    # ── Cyber-ready risk class discriminator ─────────────────────────────────
    # SAFETY / SECURITY / SAFETY_SECURITY. Default SAFETY for back-compat —
    # every pre-existing row is implicitly a safety risk.
    risk_class: Mapped[str] = mapped_column(String(20), nullable=False, default="SAFETY")

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
    # ── §7.4 re-evaluation audit fields ──────────────────────────────────────
    # When `re_evaluation_required=True` is set programmatically (by feedback
    # safety assessment, CR that modifies released software, or linked
    # requirement edit), record WHY so QA / RA can see what triggered the
    # re-evaluation without grepping audit logs.
    re_evaluation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    re_evaluation_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_re_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_re_evaluated_by: Mapped[str | None] = mapped_column(String(200), nullable=True)

    requirement: Mapped["Requirement"] = relationship(back_populates="risks")
    controls: Mapped[list["RiskControl"]] = relationship(
        "RiskControl", back_populates="risk", cascade="all, delete-orphan", lazy="selectin"
    )
    residual_risk: Mapped["ResidualRisk | None"] = relationship(
        "ResidualRisk", back_populates="risk", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    contributions: Mapped[list["RiskContribution"]] = relationship(
        "RiskContribution", back_populates="risk", cascade="all, delete-orphan", lazy="selectin"
    )


class RiskControl(Base, TimestampMixin):
    """ISO 14971 risk control measure — links a risk to a requirement, a
    §5.3 SWComponent (where the control lives in code), and zero-or-more
    pieces of verification evidence (§7.3 closed loop)."""
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
    # §7.2 — link to the §5.3 SWComponent that implements this control. Lets
    # auditors trace "where in the architecture does this control actually
    # live" in one click.
    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )
    implementation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PROPOSED")
    verification_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    risk: Mapped["Risk"] = relationship("Risk", back_populates="controls")
    evidence: Mapped[list["VerificationEvidence"]] = relationship(
        "VerificationEvidence", back_populates="control",
        cascade="all, delete-orphan", lazy="selectin",
        order_by="VerificationEvidence.verified_at.desc()",
    )


# ── §7.1 — Analysis of software contributing to hazardous situations ────────
class RiskContribution(Base):
    """Many-to-many: which §4.3 SoftwareItem and/or §5.3 SWComponent
    contributes to this hazard? Per IEC 62304 §7.1 the manufacturer must
    document software contributions to hazardous situations; the FK lets
    auditors answer 'which software items are implicated by this risk?'
    and 'which risks does this software item carry?' in either direction.

    Exactly one of `software_item_id` / `component_id` is set per row.
    """
    __tablename__ = "risk_contributions"
    __table_args__ = (
        UniqueConstraint("risk_id", "software_item_id", name="uq_risk_contrib_si"),
        UniqueConstraint("risk_id", "component_id",     name="uq_risk_contrib_comp"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), nullable=False
    )
    software_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_items.id", ondelete="CASCADE"), nullable=True
    )
    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=True
    )
    contribution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    risk: Mapped["Risk"] = relationship("Risk", back_populates="contributions")


# ── §7.3 — Verification of risk control measures ────────────────────────────
class VerificationEvidence(Base):
    """One piece of verification evidence for a RiskControl. Multiple
    evidence rows are allowed per control (e.g. a SYSTEM_TEST run + a
    separate REVIEW signoff). A control's `implementation_status` flips to
    VERIFIED when at least one PASS evidence row is present (enforced in
    the router on POST / DELETE)."""
    __tablename__ = "verification_evidences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    control_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_controls.id", ondelete="CASCADE"), nullable=False
    )
    # Evidence type — drives which FK column(s) carry the reference.
    # SYSTEM_TEST / INTEGRATION_TEST / UNIT_TEST / REVIEW / INSPECTION /
    # ANALYSIS / EXTERNAL_REF
    evidence_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # One of these is set (or none, for pure narrative evidence).
    system_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    integration_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("integration_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    unit_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("unit_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    external_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    result: Mapped[str] = mapped_column(String(10), nullable=False, default="PASS")  # PASS / FAIL
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    control: Mapped["RiskControl"] = relationship("RiskControl", back_populates="evidence")


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
