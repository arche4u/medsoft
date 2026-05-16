"""IEC 62366-1 Usability Engineering File (UEF).

A UsabilityFile is the canonical per-project document covering §5.1–§5.9
of IEC 62366-1: Use Specification (intended users / use environments /
indication / operating principle) plus a list of hazard-related Use
Scenarios, each containing one or more foreseeable Use Errors. Use
Errors with non-trivial residual risk escalate into the §7 risk register
as risk_class=USABILITY rows (the unified register already supports the
SAFETY / SECURITY / SAFETY_SECURITY discriminators; USABILITY is added
as a new value but no schema change is needed — `risk_class` is plain
String per the project convention).

Formative + summative evaluations live in a sibling table later in
Phase 9C; this file focuses on the §5.1–§5.5 surface that everything
else references.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class UsabilityFile(Base, TimestampMixin):
    """Per-project, versioned Usability Engineering File (UEF)."""

    __tablename__ = "usability_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="Usability Engineering File")
    version: Mapped[str] = mapped_column(String(40), nullable=False, default="1.0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    # ── §5.1 Use Specification ───────────────────────────────────────────────
    # Free-text fields covering the four IEC 62366-1 §5.1 inputs every
    # downstream step references.
    intended_users: Mapped[str | None] = mapped_column(Text, nullable=True)
    intended_use_environment: Mapped[str | None] = mapped_column(Text, nullable=True)
    intended_medical_indication: Mapped[str | None] = mapped_column(Text, nullable=True)
    operating_principle: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Approval audit trail — same pattern as Architecture Baselines + SDP.
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    scenarios: Mapped[list["UseScenario"]] = relationship(
        "UseScenario", back_populates="usability_file", cascade="all, delete-orphan", lazy="selectin"
    )


class UseScenario(Base, TimestampMixin):
    """Hazard-related use scenario — IEC 62366-1 §5.4."""

    __tablename__ = "use_scenarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usability_file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usability_files.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    # Primary operating function the user is performing (e.g., "Set
    # infusion rate", "Acknowledge alarm").
    primary_function: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Step-by-step task chain (the user's expected path).
    task_chain: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional link back to a §5.3 SWComponent the scenario exercises.
    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )

    usability_file: Mapped["UsabilityFile"] = relationship("UsabilityFile", back_populates="scenarios")
    use_errors: Mapped[list["UseError"]] = relationship(
        "UseError", back_populates="scenario", cascade="all, delete-orphan", lazy="selectin"
    )


class UseError(Base, TimestampMixin):
    """A foreseeable use error inside a scenario — IEC 62366-1 §5.4 output."""

    __tablename__ = "use_errors"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('LOW','MEDIUM','HIGH','CRITICAL')", name="use_error_severity",
        ),
        CheckConstraint(
            "status IN ('IDENTIFIED','MITIGATED','ACCEPTED','TRANSFERRED')", name="use_error_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("use_scenarios.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    potential_harm: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIUM")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="IDENTIFIED")
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # FK to the §7 risk register row created from this use error. Same
    # bidirectional-trail pattern used by Threats + Vulnerabilities.
    escalated_risk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="SET NULL"), nullable=True
    )

    scenario: Mapped["UseScenario"] = relationship("UseScenario", back_populates="use_errors")
