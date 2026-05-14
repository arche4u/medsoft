"""Per-component Mermaid diagram_source on sw_components

Revision ID: j7e8f9a0b1c2
Revises: i6d7e8f9a0b1
Create Date: 2026-05-14 10:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = 'j7e8f9a0b1c2'
down_revision = 'i6d7e8f9a0b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'sw_components',
        sa.Column('diagram_source', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('sw_components', 'diagram_source')
