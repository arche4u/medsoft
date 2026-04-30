"""integration testing module

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-04-30 11:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'x6y7z8a9b0c1'
down_revision = 'w5x6y7z8a9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'integration_test_cases',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('interface_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('source_component_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('target_component_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('test_type', sa.String(50), nullable=False, server_default='DATA_FLOW'),
        sa.Column('preconditions', sa.Text(), nullable=True),
        sa.Column('test_steps', sa.Text(), nullable=True),
        sa.Column('expected_result', sa.Text(), nullable=True),
        sa.Column('safety_relevance', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('latency_threshold_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['interface_id'], ['sw_interfaces.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['source_component_id'], ['sw_components.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['target_component_id'], ['sw_components.id'], ondelete='SET NULL'),
    )

    op.create_table(
        'integration_test_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('test_case_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('execution_date', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('result', sa.String(10), nullable=False),
        sa.Column('logs', sa.Text(), nullable=True),
        sa.Column('latency_ms', sa.Float(), nullable=True),
        sa.Column('data_integrity_check', sa.String(10), nullable=True),
        sa.Column('executed_by', sa.String(200), nullable=True),
        sa.Column('error_details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['test_case_id'], ['integration_test_cases.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'itc_requirement_links',
        sa.Column('itc_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requirement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('itc_id', 'requirement_id'),
        sa.ForeignKeyConstraint(['itc_id'], ['integration_test_cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'itc_risk_links',
        sa.Column('itc_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('risk_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('itc_id', 'risk_id'),
        sa.ForeignKeyConstraint(['itc_id'], ['integration_test_cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['risk_id'], ['risks.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('itc_risk_links')
    op.drop_table('itc_requirement_links')
    op.drop_table('integration_test_results')
    op.drop_table('integration_test_cases')
