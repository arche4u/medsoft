"""add software_safety_profiles table

Revision ID: j0e1f2g3h4i5
Revises: i9d0e1f2g3h4
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'j0e1f2g3h4i5'
down_revision = 'i9d0e1f2g3h4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'software_safety_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('iec62304_class', sa.String(1), nullable=False, server_default='C'),
        sa.Column('classification_rationale', sa.Text, nullable=True),
        sa.Column('rpn_scale', sa.Integer, nullable=False, server_default='5'),
        sa.Column('severity_definitions', sa.Text, nullable=True),
        sa.Column('probability_definitions', sa.Text, nullable=True),
        sa.Column('iso14971_aligned', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('software_failure_assumption', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('sdp_section_reference', sa.String(300), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('review_date', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', name='uq_safety_profile_project'),
    )


def downgrade() -> None:
    op.drop_table('software_safety_profiles')
