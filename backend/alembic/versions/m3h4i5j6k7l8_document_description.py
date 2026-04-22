"""add description to documents

Revision ID: m3h4i5j6k7l8
Revises: l2g3h4i5j6k7
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'm3h4i5j6k7l8'
down_revision = 'l2g3h4i5j6k7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'description')
