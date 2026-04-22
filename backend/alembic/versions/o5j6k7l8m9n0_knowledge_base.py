"""add knowledge_entries table

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'o5j6k7l8m9n0'
down_revision = 'n4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'knowledge_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True),
        sa.Column('is_global', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('standard', sa.String(50), nullable=True),
        sa.Column('clause_ref', sa.String(30), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('summary', sa.String(500), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='99'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
    )
    op.create_index('ix_knowledge_entries_project_id', 'knowledge_entries', ['project_id'])
    op.create_index('ix_knowledge_entries_is_global', 'knowledge_entries', ['is_global'])
    op.create_index('ix_knowledge_entries_standard', 'knowledge_entries', ['standard'])


def downgrade():
    op.drop_table('knowledge_entries')
