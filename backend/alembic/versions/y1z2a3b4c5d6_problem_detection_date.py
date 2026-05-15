"""§9 ProblemReport.detection_date

Adds an explicit field-discovery date to problem reports, distinct from the
auto-populated created_at (system log time). §9 post-market surveillance audit
trails require both: when the problem was actually discovered in the field /
during testing, and when the team logged it into the QMS.

Revision ID: y1z2a3b4c5d6
Revises: z8a9b0c1d2e3
Create Date: 2026-05-15 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = 'y1z2a3b4c5d6'
down_revision = 'z8a9b0c1d2e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "problem_reports",
        sa.Column("detection_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("problem_reports", "detection_date")
