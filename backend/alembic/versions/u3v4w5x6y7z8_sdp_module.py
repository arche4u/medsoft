"""add software development plan module (IEC 62304 §5.1)

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'u3v4w5x6y7z8'
down_revision = 't2u3v4w5x6y7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sdp',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('lifecycle_model', sa.String(30), nullable=False, server_default='V_MODEL'),
        sa.Column('safety_class', sa.String(1), nullable=False, server_default='C'),
        sa.Column('title', sa.String(500), nullable=False, server_default='Software Development Plan'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sdp_project_id', 'sdp', ['project_id'])
    op.create_index('ix_sdp_status', 'sdp', ['status'])

    op.create_table(
        'sdp_sections',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('sdp_id', sa.UUID(), nullable=False),
        sa.Column('section_number', sa.String(20), nullable=False),
        sa.Column('section_name', sa.String(300), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['sdp_id'], ['sdp.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sdp_sections_sdp_id', 'sdp_sections', ['sdp_id'])

    op.create_table(
        'sdp_lifecycle_phases',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('sdp_id', sa.UUID(), nullable=False),
        sa.Column('phase_name', sa.String(200), nullable=False),
        sa.Column('phase_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('entry_criteria', sa.Text(), nullable=True),
        sa.Column('exit_criteria', sa.Text(), nullable=True),
        sa.Column('activities', sa.Text(), nullable=True),
        sa.Column('required_for_class', sa.String(5), nullable=False, server_default='ABC'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['sdp_id'], ['sdp.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sdp_phases_sdp_id', 'sdp_lifecycle_phases', ['sdp_id'])

    op.create_table(
        'sdp_project_roles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('sdp_id', sa.UUID(), nullable=False),
        sa.Column('role_name', sa.String(200), nullable=False),
        sa.Column('responsibilities', sa.Text(), nullable=True),
        sa.Column('required_for_class', sa.String(5), nullable=False, server_default='ABC'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['sdp_id'], ['sdp.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sdp_roles_sdp_id', 'sdp_project_roles', ['sdp_id'])


def downgrade():
    op.drop_table('sdp_project_roles')
    op.drop_table('sdp_lifecycle_phases')
    op.drop_table('sdp_sections')
    op.drop_table('sdp')
