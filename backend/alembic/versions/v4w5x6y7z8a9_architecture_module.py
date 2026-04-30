"""add software architecture module (IEC 62304 §5.3 / §5.4)

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'v4w5x6y7z8a9'
down_revision = 'u3v4w5x6y7z8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sw_components',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('component_type', sa.String(20), nullable=False, server_default='SUBSYSTEM'),
        sa.Column('safety_class', sa.String(1), nullable=False, server_default='A'),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['sw_components.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sw_components_project_id', 'sw_components', ['project_id'])
    op.create_index('ix_sw_components_parent_id', 'sw_components', ['parent_id'])

    op.create_table(
        'sw_interfaces',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('source_component_id', sa.UUID(), nullable=False),
        sa.Column('target_component_id', sa.UUID(), nullable=False),
        sa.Column('interface_type', sa.String(20), nullable=False, server_default='API'),
        sa.Column('name', sa.String(300), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('data_format', sa.String(200), nullable=True),
        sa.Column('communication_method', sa.String(200), nullable=True),
        sa.Column('safety_relevant', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_component_id'], ['sw_components.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_component_id'], ['sw_components.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sw_interfaces_project_id', 'sw_interfaces', ['project_id'])
    op.create_index('ix_sw_interfaces_source', 'sw_interfaces', ['source_component_id'])
    op.create_index('ix_sw_interfaces_target', 'sw_interfaces', ['target_component_id'])

    op.create_table(
        'sw_data_flows',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('interface_id', sa.UUID(), nullable=False),
        sa.Column('data_name', sa.String(300), nullable=False),
        sa.Column('data_type', sa.String(100), nullable=True),
        sa.Column('frequency', sa.String(100), nullable=True),
        sa.Column('criticality', sa.String(20), nullable=False, server_default='LOW'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['interface_id'], ['sw_interfaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sw_data_flows_interface', 'sw_data_flows', ['interface_id'])

    op.create_table(
        'sw_component_req_links',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('component_id', sa.UUID(), nullable=False),
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['component_id'], ['sw_components.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('component_id', 'requirement_id', name='uq_swcomp_req'),
    )

    op.create_table(
        'sw_component_risk_links',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('component_id', sa.UUID(), nullable=False),
        sa.Column('risk_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['component_id'], ['sw_components.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['risk_id'], ['risks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('component_id', 'risk_id', name='uq_swcomp_risk'),
    )

    op.create_table(
        'sw_component_tc_links',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('component_id', sa.UUID(), nullable=False),
        sa.Column('testcase_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['component_id'], ['sw_components.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['testcase_id'], ['testcases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('component_id', 'testcase_id', name='uq_swcomp_tc'),
    )


def downgrade():
    op.drop_table('sw_component_tc_links')
    op.drop_table('sw_component_risk_links')
    op.drop_table('sw_component_req_links')
    op.drop_table('sw_data_flows')
    op.drop_table('sw_interfaces')
    op.drop_table('sw_components')
