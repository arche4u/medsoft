"""add tags to documents

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'n4i5j6k7l8m9'
down_revision = 'm3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('tags', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'tags')
