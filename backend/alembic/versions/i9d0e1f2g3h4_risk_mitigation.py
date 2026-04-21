"""add mitigation field to risks

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'i9d0e1f2g3h4'
down_revision = 'h8c9d0e1f2g3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('risks', sa.Column('mitigation', sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column('risks', 'mitigation')
