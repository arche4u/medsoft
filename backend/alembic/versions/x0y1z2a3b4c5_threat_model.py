"""§81001-5-1 threat model + threats tables

Adds the two-table base for the Phase 8B Threat Model module: ThreatModel
(versioned per project, optionally release-bound) and Threat (STRIDE
category + severity + status, FK to a §5.3 SWComponent and optional
FK back into the §7 risks register).

Revision ID: x0y1z2a3b4c5
Revises: w9x0y1z2a3b4
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "x0y1z2a3b4c5"
down_revision = "w9x0y1z2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "threat_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.String(40), nullable=False, server_default="1.0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("release_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("releases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index("ix_threat_models_project", "threat_models", ["project_id"])

    op.create_table(
        "threats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("threat_model_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("threat_models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("component_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(1), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(10), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(20), nullable=False, server_default="IDENTIFIED"),
        sa.Column("mitigation", sa.Text(), nullable=True),
        sa.Column("escalated_risk_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("risks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.CheckConstraint("category IN ('S','T','R','I','D','E')", name="threat_stride_category"),
        sa.CheckConstraint("severity IN ('LOW','MEDIUM','HIGH','CRITICAL')", name="threat_severity"),
    )
    op.create_index("ix_threats_model", "threats", ["threat_model_id"])
    op.create_index("ix_threats_component", "threats", ["component_id"])


def downgrade() -> None:
    op.drop_index("ix_threats_component", table_name="threats")
    op.drop_index("ix_threats_model", table_name="threats")
    op.drop_table("threats")
    op.drop_index("ix_threat_models_project", table_name="threat_models")
    op.drop_table("threat_models")
