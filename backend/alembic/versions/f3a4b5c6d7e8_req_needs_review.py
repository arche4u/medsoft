"""Cross-category change-impact: needs_review flag on requirements

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-05-11 10:00:00

Adds a `needs_review` / `needs_review_reason` pair to live requirements so
that editing a parent (e.g. USER) can auto-flag its descendants in other
categories (SYSTEM/SOFTWARE). The UI surfaces these flags as a "needs review"
chip per requirement and a project-wide change-impact dashboard so SDLC
state is easy to monitor (per IEC 62304 §6.2/§9 traceable change control).
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'requirements',
        sa.Column('needs_review', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'requirements',
        sa.Column('needs_review_reason', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('requirements', 'needs_review_reason')
    op.drop_column('requirements', 'needs_review')
