"""§6.2.5 release.notified_by audit columns

Adds `user_notified_by_id` and `regulator_notified_by_id` FKs to `releases`
so the audit trail explicitly captures who recorded each notification.
Previously the notification fields stored the summary + timestamp but the
"who" was only reachable via the AuditLog table — denormalizing it onto the
release row makes auditor queries simpler.

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w9x0y1z2a3b4"
down_revision = "v8w9x0y1z2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "releases",
        sa.Column(
            "user_notified_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "releases",
        sa.Column(
            "regulator_notified_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("releases", "regulator_notified_by_id")
    op.drop_column("releases", "user_notified_by_id")
