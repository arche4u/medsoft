"""IEC 81001-5-1 Threat Model — STRIDE per §5.3 architecture component.

A ThreatModel is a per-project, optionally per-release snapshot of the
project's threats. Each Threat is filed against a §5.3 SWComponent and
categorized by the STRIDE letter (Spoofing / Tampering / Repudiation /
Info-disclosure / DoS / Elevation). Mitigations describe the in-product
or in-process response. Threats with non-trivial residual risk are
escalated into the §7 risk register via `escalated_risk_id` — that keeps
risk_class=SECURITY rows centred in the unified ISO 14971 / IEC 81001-5-1
risk file rather than living in a sibling table.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


# STRIDE letter codes — kept as plain strings (not Enum) to match the
# project convention that status / taxonomy values stay open-vocabulary.
STRIDE_CATEGORIES = ("S", "T", "R", "I", "D", "E")


class ThreatModel(Base, TimestampMixin):
    """A versioned STRIDE threat model for a project (optionally bound to a release)."""

    __tablename__ = "threat_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(40), nullable=False, default="1.0")
    # DRAFT / IN_REVIEW / APPROVED / OBSOLETE — open taxonomy, plain String.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    # Optional binding to a §5.8 release so the model snapshot is pinned to a
    # release version (typical pattern: each major release re-runs STRIDE).
    release_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("releases.id", ondelete="SET NULL"), nullable=True
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    threats: Mapped[list["Threat"]] = relationship(
        "Threat", back_populates="threat_model", cascade="all, delete-orphan", lazy="selectin"
    )


class Threat(Base, TimestampMixin):
    """A single STRIDE threat filed against a §5.3 component."""

    __tablename__ = "threats"
    __table_args__ = (
        CheckConstraint("category IN ('S','T','R','I','D','E')", name="threat_stride_category"),
        CheckConstraint("severity IN ('LOW','MEDIUM','HIGH','CRITICAL')", name="threat_severity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    threat_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("threat_models.id", ondelete="CASCADE"), nullable=False
    )
    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )
    # STRIDE letter (S/T/R/I/D/E) plus a free-text title summarising the threat.
    category: Mapped[str] = mapped_column(String(1), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # CVSS-style banding for triage (LOW / MEDIUM / HIGH / CRITICAL).
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIUM")
    # IDENTIFIED / MITIGATED / ACCEPTED / TRANSFERRED — same vocabulary as
    # the §7 risk file so the closure semantics are uniform.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="IDENTIFIED")
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When residual risk is non-trivial the threat is escalated into the §7
    # unified risk register as a risk_class=SECURITY row — this FK preserves
    # the trail so auditors can walk threat ↔ risk in both directions.
    escalated_risk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="SET NULL"), nullable=True
    )

    threat_model: Mapped["ThreatModel"] = relationship("ThreatModel", back_populates="threats")
