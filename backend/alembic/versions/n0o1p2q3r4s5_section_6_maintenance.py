"""§6 Software Maintenance Process

Adds the post-market surveillance funnel that closes the V-model loop:

  feedback_items table         (§6.2.1 — Feedback Intake)

Plus the §6.2.3/§6.2.4/§6.2.5 fields on existing tables:

  change_requests.modifies_released_software   bool   §6.2.3 trigger
  change_requests.effect_on_organization       text   §6.2.3
  change_requests.effect_on_released_software  text   §6.2.3
  change_requests.effect_on_interfacing_systems text  §6.2.3
  releases.user_notification_sent              bool   §6.2.5
  releases.user_notification_summary           text   §6.2.5
  releases.user_notified_at                    tstz   §6.2.5
  releases.regulator_notification_sent         bool   §6.2.5
  releases.regulator_notification_summary      text   §6.2.5
  releases.regulator_notified_at               tstz   §6.2.5

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "n0o1p2q3r4s5"
down_revision = "m9n0o1p2q3r4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── §6.2.1 feedback_items ────────────────────────────────────────────────
    op.create_table(
        "feedback_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("readable_id", sa.String(20), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("reporter", sa.String(200), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("affected_version", sa.String(50), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default="MINOR"),
        sa.Column("adverse_event", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("spec_deviation", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_problem", sa.Boolean, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="NEW"),
        sa.Column("evaluation_notes", sa.Text, nullable=True),
        sa.Column("evaluated_by", sa.String(200), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("safety_impact_assessment", sa.Text, nullable=True),
        sa.Column("change_needed", sa.Boolean, nullable=True),
        sa.Column("closure_rationale", sa.Text, nullable=True),
        sa.Column("escalated_problem_id", UUID(as_uuid=True),
                  sa.ForeignKey("problem_reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("escalated_change_request_id", UUID(as_uuid=True),
                  sa.ForeignKey("change_requests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "readable_id", name="uq_feedback_proj_readable"),
    )
    op.create_index("ix_feedback_project_status", "feedback_items", ["project_id", "status"])

    # ── §6.2.3/§6.2.4 change-request post-release analysis ───────────────────
    with op.batch_alter_table("change_requests") as b:
        b.add_column(sa.Column("modifies_released_software", sa.Boolean,
                               nullable=False, server_default=sa.text("false")))
        b.add_column(sa.Column("effect_on_organization", sa.Text, nullable=True))
        b.add_column(sa.Column("effect_on_released_software", sa.Text, nullable=True))
        b.add_column(sa.Column("effect_on_interfacing_systems", sa.Text, nullable=True))

    # ── §6.2.5 release user/regulator notification audit trail ───────────────
    with op.batch_alter_table("releases") as b:
        b.add_column(sa.Column("user_notification_sent", sa.Boolean,
                               nullable=False, server_default=sa.text("false")))
        b.add_column(sa.Column("user_notification_summary", sa.Text, nullable=True))
        b.add_column(sa.Column("user_notified_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("regulator_notification_sent", sa.Boolean,
                               nullable=False, server_default=sa.text("false")))
        b.add_column(sa.Column("regulator_notification_summary", sa.Text, nullable=True))
        b.add_column(sa.Column("regulator_notified_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("releases") as b:
        for col in ("regulator_notified_at", "regulator_notification_summary",
                    "regulator_notification_sent", "user_notified_at",
                    "user_notification_summary", "user_notification_sent"):
            b.drop_column(col)
    with op.batch_alter_table("change_requests") as b:
        for col in ("effect_on_interfacing_systems", "effect_on_released_software",
                    "effect_on_organization", "modifies_released_software"):
            b.drop_column(col)
    op.drop_index("ix_feedback_project_status", table_name="feedback_items")
    op.drop_table("feedback_items")
