"""add risk_categories table

Revision ID: q7r8s9t0u1v2
Revises: p6k7l8m9n0o1
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'q7r8s9t0u1v2'
down_revision = 'p6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'risk_categories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('color', sa.String(20), nullable=False, server_default='#546e7a'),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='99'),
        sa.Column('is_builtin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'name', name='uq_risk_category_project_name'),
    )


def downgrade() -> None:
    op.drop_table('risk_categories')
