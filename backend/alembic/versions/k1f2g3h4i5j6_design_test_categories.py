"""design and test categories

Revision ID: k1f2g3h4i5j6
Revises: j0e1f2g3h4i5
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'k1f2g3h4i5j6'
down_revision = 'j0e1f2g3h4i5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'design_categories',
        sa.Column('id',         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',       sa.String(50),  nullable=False),
        sa.Column('label',      sa.String(100), nullable=False),
        sa.Column('color',      sa.String(20),  nullable=False, server_default='#546e7a'),
        sa.Column('sort_order', sa.Integer(),   nullable=False, server_default='99'),
        sa.Column('is_builtin', sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'name', name='uq_design_category_project_name'),
    )

    op.create_table(
        'test_categories',
        sa.Column('id',         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',       sa.String(50),  nullable=False),
        sa.Column('label',      sa.String(100), nullable=False),
        sa.Column('color',      sa.String(20),  nullable=False, server_default='#546e7a'),
        sa.Column('sort_order', sa.Integer(),   nullable=False, server_default='99'),
        sa.Column('is_builtin', sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'name', name='uq_test_category_project_name'),
    )


def downgrade() -> None:
    op.drop_table('test_categories')
    op.drop_table('design_categories')
