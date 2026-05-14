"""IEC 62304 Plans module (§6 Maintenance, §7 Risk Mgmt, §8.1 Config Mgmt, §9 Problem Resolution)

Revision ID: l3h4i5j6k7l8
Revises: k8f9a0b1c2d3
Create Date: 2026-05-14 14:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'l3h4i5j6k7l8'
down_revision = 'k8f9a0b1c2d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan_type', sa.String(40), nullable=False),
        sa.Column('iec_clause', sa.String(20), nullable=True),
        sa.Column('version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('safety_class', sa.String(1), nullable=False, server_default='C'),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        # ApprovalSignoffMixin columns
        sa.Column('prepared_by', sa.String(200), nullable=True),
        sa.Column('prepared_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by', sa.String(200), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        # TimestampMixin
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_plans_project_type', 'plans', ['project_id', 'plan_type'])

    op.create_table(
        'plan_sections',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('section_number', sa.String(20), nullable=False),
        sa.Column('section_name', sa.String(300), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_plan_sections_plan', 'plan_sections', ['plan_id', 'sort_order'])


def downgrade() -> None:
    op.drop_index('ix_plan_sections_plan', table_name='plan_sections')
    op.drop_table('plan_sections')
    op.drop_index('ix_plans_project_type', table_name='plans')
    op.drop_table('plans')
