"""units module

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a9
Create Date: 2026-04-30 10:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'w5x6y7z8a9b0'
down_revision = 'v4w5x6y7z8a9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'software_units',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('component_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('programming_language', sa.String(100), nullable=True),
        sa.Column('repository_url', sa.String(500), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('safety_class', sa.String(1), nullable=False, server_default='A'),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['component_id'], ['sw_components.id'], ondelete='SET NULL'),
    )

    op.create_table(
        'code_artifacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('unit_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('repository', sa.String(500), nullable=False),
        sa.Column('branch', sa.String(200), nullable=True),
        sa.Column('commit_id', sa.String(200), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('version_tag', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['unit_id'], ['software_units.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'unit_test_cases',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('unit_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('test_type', sa.String(50), nullable=False, server_default='FUNCTIONAL'),
        sa.Column('expected_result', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['unit_id'], ['software_units.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'unit_test_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('test_case_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('execution_date', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('result', sa.String(10), nullable=False),
        sa.Column('logs', sa.Text(), nullable=True),
        sa.Column('coverage_percentage', sa.Float(), nullable=True),
        sa.Column('executed_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['test_case_id'], ['unit_test_cases.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'unit_requirement_links',
        sa.Column('unit_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requirement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('unit_id', 'requirement_id'),
        sa.ForeignKeyConstraint(['unit_id'], ['software_units.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'unit_risk_links',
        sa.Column('unit_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('risk_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('unit_id', 'risk_id'),
        sa.ForeignKeyConstraint(['unit_id'], ['software_units.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['risk_id'], ['risks.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('unit_risk_links')
    op.drop_table('unit_requirement_links')
    op.drop_table('unit_test_results')
    op.drop_table('unit_test_cases')
    op.drop_table('code_artifacts')
    op.drop_table('software_units')
