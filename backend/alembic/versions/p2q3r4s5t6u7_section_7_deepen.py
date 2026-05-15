"""§7 Software Risk Management — deepen the risk register

Adds:

  1. risks.risk_class (String, default 'SAFETY')          — IEC 81001-5-1
     discriminator so cyber risk joins the same register later. Existing
     rows default to SAFETY.

  2. risks.re_evaluation_reason (Text)                    — §7.4 — captures
     WHY a risk needs re-evaluation (the triggering CR / feedback ref).
     risks.re_evaluation_triggered_at (DateTime tz)        — when the trigger
     fired (auto-set by the §7.4 hooks in feedback / change_control).
     risks.last_re_evaluated_at (DateTime tz)              — when QA / RA
     completed the most recent re-evaluation pass.
     risks.last_re_evaluated_by (String 200)               — actor name.

  3. risk_controls.component_id (FK sw_components)         — §7.2 — links a
     control to the §5.3 SWComponent that implements it (one click from
     control → code location).

  4. risk_contributions table                              — §7.1 — many-to-
     many between Risk and SoftwareItem (§4.3) OR SWComponent (§5.3) so the
     "which software items contribute to this hazard?" question answers in
     SQL. Exactly one of software_item_id / component_id per row; both
     enforced UNIQUE per (risk_id, *_id) so a risk doesn't double-link.

  5. verification_evidences table                          — §7.3 — closed-
     loop evidence sub-list per RiskControl. One row = one piece of
     evidence (SYSTEM_TEST run / INTEGRATION_TEST / UNIT_TEST / REVIEW /
     INSPECTION / ANALYSIS / EXTERNAL_REF) with PASS/FAIL + signoff. A
     control's implementation_status auto-flips to VERIFIED in the router
     when ≥1 PASS evidence is present.

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "p2q3r4s5t6u7"
down_revision = "o1p2q3r4s5t6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. risks.risk_class ─────────────────────────────────────────────────
    op.add_column(
        "risks",
        sa.Column("risk_class", sa.String(20), nullable=False, server_default="SAFETY"),
    )

    # ── 2. §7.4 re-evaluation audit fields on risks ────────────────────────
    op.add_column("risks", sa.Column("re_evaluation_reason", sa.Text, nullable=True))
    op.add_column("risks", sa.Column("re_evaluation_triggered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("risks", sa.Column("last_re_evaluated_at",      sa.DateTime(timezone=True), nullable=True))
    op.add_column("risks", sa.Column("last_re_evaluated_by",      sa.String(200), nullable=True))

    # ── 3. risk_controls.component_id ───────────────────────────────────────
    op.add_column(
        "risk_controls",
        sa.Column("component_id", UUID(as_uuid=True),
                  sa.ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True),
    )

    # ── 4. risk_contributions (§7.1) ───────────────────────────────────────
    op.create_table(
        "risk_contributions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("risk_id", UUID(as_uuid=True),
                  sa.ForeignKey("risks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("software_item_id", UUID(as_uuid=True),
                  sa.ForeignKey("software_items.id", ondelete="CASCADE"), nullable=True),
        sa.Column("component_id", UUID(as_uuid=True),
                  sa.ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=True),
        sa.Column("contribution_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.UniqueConstraint("risk_id", "software_item_id", name="uq_risk_contrib_si"),
        sa.UniqueConstraint("risk_id", "component_id",     name="uq_risk_contrib_comp"),
    )

    # ── 5. verification_evidences (§7.3) ───────────────────────────────────
    op.create_table(
        "verification_evidences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("control_id", UUID(as_uuid=True),
                  sa.ForeignKey("risk_controls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evidence_type", sa.String(30), nullable=False),
        sa.Column("system_test_id", UUID(as_uuid=True),
                  sa.ForeignKey("system_test_cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("integration_test_id", UUID(as_uuid=True),
                  sa.ForeignKey("integration_test_cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_test_id", UUID(as_uuid=True),
                  sa.ForeignKey("unit_test_cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("external_reference", sa.String(500), nullable=True),
        sa.Column("result", sa.String(10), nullable=False, server_default="PASS"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("verified_by", sa.String(200), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_verification_evidences_control",
        "verification_evidences",
        ["control_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_verification_evidences_control", table_name="verification_evidences")
    op.drop_table("verification_evidences")
    op.drop_table("risk_contributions")
    op.drop_column("risk_controls", "component_id")
    op.drop_column("risks", "last_re_evaluated_by")
    op.drop_column("risks", "last_re_evaluated_at")
    op.drop_column("risks", "re_evaluation_triggered_at")
    op.drop_column("risks", "re_evaluation_reason")
    op.drop_column("risks", "risk_class")
