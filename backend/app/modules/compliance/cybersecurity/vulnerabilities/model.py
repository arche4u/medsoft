"""IEC 81001-5-1 Vulnerability Intake.

A VulnerabilityReport is the canonical record for a CVE / vendor advisory /
internal finding affecting this project's software (typically a §8.2.2 SOUP
entry or a §5.3 architecture component). Once triaged and judged
safety-impacting, a vulnerability is escalated into the §7 unified risk
register via a manual `escalate` endpoint that creates a Risk row with
risk_class=SECURITY and records the linkage on `escalated_risk_id`.

The escalate step is manual (not auto) because Risk requires a
`requirement_id` (NOT NULL) which doesn't map cleanly to every CVE — the
triager picks the most appropriate requirement (typically a cyber non-
functional SOFTWARE requirement) at escalation time.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class VulnerabilityReport(Base, TimestampMixin):
    """CVE / advisory / internal vulnerability finding."""

    __tablename__ = "vulnerability_reports"
    __table_args__ = (
        CheckConstraint(
            "severity_band IN ('LOW','MEDIUM','HIGH','CRITICAL')",
            name="vuln_severity_band",
        ),
        CheckConstraint(
            "status IN ('NEW','TRIAGED','MITIGATED','RESOLVED','FALSE_POSITIVE')",
            name="vuln_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    # CVE identifier (e.g., "CVE-2024-12345") or vendor advisory ID. Free-text
    # because not every finding has a public CVE; internal findings get an
    # arbitrary stable ID assigned by the triager.
    cve_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # CVSS 3.1 base score + vector string. Optional — internal findings may
    # use the severity_band only.
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    severity_band: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIUM")
    # Affected SOUP entry (CMConfigItem with item_type=SOUP) — typical for
    # third-party dependency CVEs.
    affected_soup_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cm_config_items.id", ondelete="SET NULL"), nullable=True
    )
    # Affected §5.3 architecture component — used when the finding lives in
    # first-party code.
    affected_component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NEW")
    # When escalated to a §7 Risk: the FK closes the loop so auditors can
    # walk vulnerability ↔ risk in both directions.
    escalated_risk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="SET NULL"), nullable=True
    )
    disclosed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fixed_in_version: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Triage notes, vendor response, embargo dates — anything free-text the
    # triager needs to record.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    triaged_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
