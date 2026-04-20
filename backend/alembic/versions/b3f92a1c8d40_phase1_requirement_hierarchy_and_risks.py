"""phase1: requirement hierarchy and risks

Revision ID: b3f92a1c8d40
Revises: 1d15c6bf7cf9
Create Date: 2026-04-20 16:00:00.000000
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "b3f92a1c8d40"
down_revision: Union[str, None] = "1d15c6bf7cf9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type
    op.execute("CREATE TYPE requirementtype AS ENUM ('USER', 'SYSTEM', 'SOFTWARE')")

    # Add type column with server_default so existing rows become USER
    op.add_column(
        "requirements",
        sa.Column(
            "type",
            sa.Enum("USER", "SYSTEM", "SOFTWARE", name="requirementtype", create_type=False),
            nullable=False,
            server_default="USER",
        ),
    )
    # Drop the server_default — only needed for the backfill
    op.alter_column("requirements", "type", server_default=None)

    # Add parent_id self-FK
    op.add_column(
        "requirements",
        sa.Column("parent_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_requirements_parent_id",
        "requirements",
        "requirements",
        ["parent_id"],
        ["id"],
    )

    # Create risks table
    op.create_table(
        "risks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("requirement_id", sa.UUID(), nullable=False),
        sa.Column("hazard", sa.String(500), nullable=False),
        sa.Column("hazardous_situation", sa.String(500), nullable=False),
        sa.Column("harm", sa.String(500), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=False),
        sa.Column("probability", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("risks")
    op.drop_constraint("fk_requirements_parent_id", "requirements", type_="foreignkey")
    op.drop_column("requirements", "parent_id")
    op.drop_column("requirements", "type")
    op.execute("DROP TYPE requirementtype")
