"""§6.3.2 maintenance-release lineage

Adds `releases.parent_release_id` so each release can link to the prior
RELEASED version it supersedes (a maintenance update, bug-fix release,
upgrade kit, etc. per IEC 62304 §6.3.2). NULL for the project's first
release. The FK has ON DELETE SET NULL so deleting an old release
doesn't cascade-orphan its descendants.

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "o1p2q3r4s5t6"
down_revision = "n0o1p2q3r4s5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "releases",
        sa.Column("parent_release_id", UUID(as_uuid=True),
                  sa.ForeignKey("releases.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("releases", "parent_release_id")
