"""Polymorphic attachments (images + PDF supporting docs)

Revision ID: i6d7e8f9a0b1
Revises: h5c6d7e8f9a0
Create Date: 2026-05-14 09:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'i6d7e8f9a0b1'
down_revision = 'h5c6d7e8f9a0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'attachments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(64), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('stored_path', sa.String(1024), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('uploaded_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    # Lookup index for the most common query: "all attachments for this entity"
    op.create_index('ix_attachment_entity', 'attachments', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_index('ix_attachment_entity', table_name='attachments')
    op.drop_table('attachments')
