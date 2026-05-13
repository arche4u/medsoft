"""3-stage signoff columns (prepared/reviewed) on SDP and SRS baselines

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-05-08 18:00:00

Adds prepared_by/prepared_at and reviewed_by/reviewed_at to:
- sdp (already has approved_by/approved_at)
- requirements_baselines (already has approved_by/approved_at)

Implements the "Prepared / Reviewed / Approved" signoff expected on every
regulated controlled document (IEC 62304 / 21 CFR Part 820).
"""
from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3a4b5c6'
down_revision = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


_SIGNOFF_COLS = [
    ('prepared_by', sa.String(200)),
    ('prepared_at', sa.DateTime(timezone=True)),
    ('reviewed_by', sa.String(200)),
    ('reviewed_at', sa.DateTime(timezone=True)),
]

_TARGET_TABLES = ('sdp', 'requirements_baselines')


def upgrade() -> None:
    for table in _TARGET_TABLES:
        for name, col_type in _SIGNOFF_COLS:
            op.add_column(table, sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for table in _TARGET_TABLES:
        for name, _ in reversed(_SIGNOFF_COLS):
            op.drop_column(table, name)
