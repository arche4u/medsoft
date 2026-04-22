"""add diagram_source to design_elements

Revision ID: l2g3h4i5j6k7
Revises: k1f2g3h4i5j6
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'l2g3h4i5j6k7'
down_revision = 'k1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('design_elements', sa.Column('diagram_source', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('design_elements', 'diagram_source')
