"""phase2: design, verification, validation, audit

Revision ID: c4e83b2d9f51
Revises: b3f92a1c8d40
Create Date: 2026-04-20 17:00:00.000000
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "c4e83b2d9f51"
down_revision: Union[str, None] = "b3f92a1c8d40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── design_elements (creates designelementtype enum automatically) ────────
    op.create_table(
        "design_elements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("ARCHITECTURE", "DETAILED", name="designelementtype"),
            nullable=False,
        ),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_foreign_key(
        "fk_design_elements_parent_id", "design_elements", "design_elements",
        ["parent_id"], ["id"],
    )

    # ── requirement_design_links ──────────────────────────────────────────────
    op.create_table(
        "requirement_design_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("requirement_id", sa.UUID(), nullable=False),
        sa.Column("design_element_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirements.id"]),
        sa.ForeignKeyConstraint(["design_element_id"], ["design_elements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── test_executions (creates executionstatus enum automatically) ──────────
    op.create_table(
        "test_executions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("testcase_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PASS", "FAIL", "BLOCKED", name="executionstatus"),
            nullable=False,
        ),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["testcase_id"], ["testcases.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── validation_records (creates validationstatus enum automatically) ──────
    op.create_table(
        "validation_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("related_requirement_id", sa.UUID(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PLANNED", "PASSED", "FAILED", name="validationstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["related_requirement_id"], ["requirements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── audit_logs (creates auditaction enum automatically) ───────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column(
            "action",
            sa.Enum("CREATE", "UPDATE", "DELETE", name="auditaction"),
            nullable=False,
        ),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("validation_records")
    op.drop_table("test_executions")
    op.drop_table("requirement_design_links")
    op.drop_constraint("fk_design_elements_parent_id", "design_elements", type_="foreignkey")
    op.drop_table("design_elements")
    op.execute("DROP TYPE IF EXISTS designelementtype")
    op.execute("DROP TYPE IF EXISTS executionstatus")
    op.execute("DROP TYPE IF EXISTS validationstatus")
    op.execute("DROP TYPE IF EXISTS auditaction")
