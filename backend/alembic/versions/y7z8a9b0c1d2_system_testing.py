"""system testing and release management

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-04-30 12:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'y7z8a9b0c1d2'
down_revision = 'x6y7z8a9b0c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'system_test_cases',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requirement_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('test_type', sa.String(50), nullable=False, server_default='FUNCTIONAL'),
        sa.Column('preconditions', sa.Text(), nullable=True),
        sa.Column('test_steps', sa.Text(), nullable=True),
        sa.Column('expected_result', sa.Text(), nullable=True),
        sa.Column('safety_relevance', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='SET NULL'),
    )

    op.create_table(
        'system_test_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('test_case_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('execution_date', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('result', sa.String(10), nullable=False),
        sa.Column('logs', sa.Text(), nullable=True),
        sa.Column('actual_result', sa.Text(), nullable=True),
        sa.Column('defects_found', sa.Text(), nullable=True),
        sa.Column('executed_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['test_case_id'], ['system_test_cases.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'st_additional_req_links',
        sa.Column('stc_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requirement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('stc_id', 'requirement_id'),
        sa.ForeignKeyConstraint(['stc_id'], ['system_test_cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'st_risk_links',
        sa.Column('stc_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('risk_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('stc_id', 'risk_id'),
        sa.ForeignKeyConstraint(['stc_id'], ['system_test_cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['risk_id'], ['risks.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'release_artifacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('artifact_type', sa.String(50), nullable=False),
        sa.Column('reference_id', sa.String(255), nullable=False),
        sa.Column('version', sa.String(100), nullable=True),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'release_checklist_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='GENERAL'),
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('evidence_link', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_auto', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'release_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column('snapshot_json', sa.Text(), nullable=False),
        sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('release_snapshots')
    op.drop_table('release_checklist_items')
    op.drop_table('release_artifacts')
    op.drop_table('st_risk_links')
    op.drop_table('st_additional_req_links')
    op.drop_table('system_test_results')
    op.drop_table('system_test_cases')
