"""configuration management and change control

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-04-30 13:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'z8a9b0c1d2e3'
down_revision = 'y7z8a9b0c1d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cm_baselines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_released', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'cm_config_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('baseline_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('item_type', sa.String(50), nullable=False),
        sa.Column('reference_id', sa.String(255), nullable=True),
        sa.Column('version', sa.String(100), nullable=False, server_default='1.0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['baseline_id'], ['cm_baselines.id'], ondelete='SET NULL'),
    )

    op.create_table(
        'cm_baseline_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('config_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('baseline_id', 'config_item_id', name='uq_bl_ci'),
        sa.ForeignKeyConstraint(['baseline_id'], ['cm_baselines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['config_item_id'], ['cm_config_items.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'cm_change_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('change_type', sa.String(50), nullable=False, server_default='ENHANCEMENT'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='MEDIUM'),
        sa.Column('status', sa.String(30), nullable=False, server_default='OPEN'),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'cm_change_impacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('change_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('affected_item_type', sa.String(50), nullable=False),
        sa.Column('affected_item_id', sa.String(255), nullable=False),
        sa.Column('affected_item_name', sa.String(255), nullable=True),
        sa.Column('impact_description', sa.Text(), nullable=True),
        sa.Column('revalidation_required', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('revalidation_status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['change_request_id'], ['cm_change_requests.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'cm_version_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('config_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version', sa.String(100), nullable=False),
        sa.Column('change_request_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('change_summary', sa.Text(), nullable=True),
        sa.Column('changed_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['config_item_id'], ['cm_config_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['change_request_id'], ['cm_change_requests.id'], ondelete='SET NULL'),
    )


def downgrade() -> None:
    op.drop_table('cm_version_history')
    op.drop_table('cm_change_impacts')
    op.drop_table('cm_change_requests')
    op.drop_table('cm_baseline_items')
    op.drop_table('cm_config_items')
    op.drop_table('cm_baselines')
