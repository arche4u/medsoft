"""IEC 62304 §6.2.1 — Feedback Intake (post-market surveillance funnel).

Every inbound report from customer support / vigilance / PMCF / field
service / literature / social media is logged here, triaged per §6.2.1.2,
safety-evaluated per §6.2.1.3, and either closed with a rationale OR
escalated to:
  - a Problem Report (§9 — `capa.problem_reports`), per §6.2.1.2/§6.2.2
  - a Change Request (§6.3 — `change_control.change_requests`), per §6.2.1.3

Both escalations record their origin FeedbackItem.id so the audit trail
runs feedback → problem/change → modification → release end-to-end.

Workflow states (plain String per project convention):
  NEW           → logged, not triaged
  UNDER_REVIEW  → triage in progress
  EVALUATED     → §6.2.1.2 evaluation complete (is_problem decided)
  ESCALATED     → linked to a ProblemReport or ChangeRequest
  CLOSED        → no action needed (with rationale) OR escalation resolved

Field rationale per IEC 62304 §6.2.1.2:
  "Problem Reports shall include actual or potential adverse events, and
   deviations from specifications." → `adverse_event` and `spec_deviation`
   flags must be captured at evaluation time.

Per §6.2.1.3:
  "Each Problem Report shall be evaluated to determine how it affects the
   SAFETY of medical device software …" → `safety_impact_assessment` text.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base, TimestampMixin


class FeedbackItem(Base, TimestampMixin):
    __tablename__ = "feedback_items"
    __table_args__ = (
        UniqueConstraint("project_id", "readable_id", name="uq_feedback_proj_readable"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    readable_id: Mapped[str] = mapped_column(String(20), nullable=False)

    # ── Source / provenance (§6.2.1.1 — monitor feedback) ────────────────────
    # Channel taxonomy (free string so projects can add their own):
    #   CUSTOMER_SUPPORT / VIGILANCE / PMCF / FIELD_SERVICE / INTERNAL /
    #   LITERATURE / SOCIAL_MEDIA / REGULATORY
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    reporter: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── §6.2.1.2 — document and evaluate ──────────────────────────────────────
    # Severity classification (COSMETIC / MINOR / MAJOR / SAFETY).
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="MINOR")
    # Per §6.2.1.2: Problem Reports shall include actual or potential adverse
    # events, and deviations from specifications. Both flags are captured here
    # at evaluation so the escalation decision is auditable.
    adverse_event: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spec_deviation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Triage outcome — the §6.2.1.2 determination "is this a problem?"
    is_problem: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NEW")
    evaluation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── §6.2.1.3 — evaluate effect on SAFETY ─────────────────────────────────
    safety_impact_assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_needed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    closure_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Escalation links (one of these gets set when status → ESCALATED) ─────
    # §6.2.2 — use problem resolution process
    escalated_problem_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("problem_reports.id", ondelete="SET NULL"), nullable=True
    )
    # §6.2.3/§6.2.4 — analyse + approve change request for released software
    escalated_change_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("change_requests.id", ondelete="SET NULL"), nullable=True
    )

    problem: Mapped["ProblemReport | None"] = relationship(
        "ProblemReport", foreign_keys=[escalated_problem_id], lazy="selectin"
    )
    change_request: Mapped["ChangeRequest | None"] = relationship(
        "ChangeRequest", foreign_keys=[escalated_change_request_id], lazy="selectin"
    )
