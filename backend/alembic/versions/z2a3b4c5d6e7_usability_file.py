"""§62366-1 usability engineering tables

Adds usability_files + use_scenarios + use_errors. Three-level
hierarchy mirrors the §5.1–§5.4 structure of IEC 62366-1: a Usability
File per project + version, each containing hazard-related Use
Scenarios, each containing foreseeable Use Errors with optional
back-FK to the §7 unified risk register.

Revision ID: z2a3b4c5d6e7
Revises: y1z2a3b4c5d6
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "z2a3b4c5d6e7"
down_revision = "y1z2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usability_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False,
                  server_default="Usability Engineering File"),
        sa.Column("version", sa.String(40), nullable=False, server_default="1.0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("intended_users", sa.Text(), nullable=True),
        sa.Column("intended_use_environment", sa.Text(), nullable=True),
        sa.Column("intended_medical_indication", sa.Text(), nullable=True),
        sa.Column("operating_principle", sa.Text(), nullable=True),
        sa.Column("approved_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index("ix_usability_files_project", "usability_files", ["project_id"])

    op.create_table(
        "use_scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("usability_file_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("usability_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("primary_function", sa.Text(), nullable=True),
        sa.Column("task_chain", sa.Text(), nullable=True),
        sa.Column("component_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index("ix_use_scenarios_file", "use_scenarios", ["usability_file_id"])

    op.create_table(
        "use_errors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scenario_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("use_scenarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("potential_harm", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(10), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(20), nullable=False, server_default="IDENTIFIED"),
        sa.Column("mitigation", sa.Text(), nullable=True),
        sa.Column("escalated_risk_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("risks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.CheckConstraint("severity IN ('LOW','MEDIUM','HIGH','CRITICAL')", name="use_error_severity"),
        sa.CheckConstraint("status IN ('IDENTIFIED','MITIGATED','ACCEPTED','TRANSFERRED')", name="use_error_status"),
    )
    op.create_index("ix_use_errors_scenario", "use_errors", ["scenario_id"])


def downgrade() -> None:
    op.drop_index("ix_use_errors_scenario", table_name="use_errors")
    op.drop_table("use_errors")
    op.drop_index("ix_use_scenarios_file", table_name="use_scenarios")
    op.drop_table("use_scenarios")
    op.drop_index("ix_usability_files_project", table_name="usability_files")
    op.drop_table("usability_files")
