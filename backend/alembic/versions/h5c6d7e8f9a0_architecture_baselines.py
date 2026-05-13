"""Architecture Document baseline (IEC 62304 §5.3)

Revision ID: h5c6d7e8f9a0
Revises: g4b5c6d7e8f9
Create Date: 2026-05-12 14:00:00

Adds the project-level architecture baseline tables — mirror of the SDP/SRS
versioned-approval pattern:

- architecture_baselines: version + signoff + status, optional CMBaseline mirror
- architecture_baseline_components: frozen SWComponent snapshots at approval
- architecture_baseline_interfaces: frozen SWInterface snapshots (with
  data-flow rows flattened into a text summary so deleted interfaces don't
  lose the audit trail)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'h5c6d7e8f9a0'
down_revision = 'g4b5c6d7e8f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'architecture_baselines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('cm_baseline_id', postgresql.UUID(as_uuid=True), nullable=True),
        # ApprovalSignoffMixin columns
        sa.Column('prepared_by', sa.String(200), nullable=True),
        sa.Column('prepared_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by', sa.String(200), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['cm_baseline_id'], ['cm_baselines.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('project_id', 'version', name='uq_archbaseline_proj_version'),
    )

    op.create_table(
        'architecture_baseline_components',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('component_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('component_type', sa.String(20), nullable=False),
        sa.Column('safety_class', sa.String(1), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('parent_name', sa.String(500), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['baseline_id'], ['architecture_baselines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['component_id'], ['sw_components.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_archbaseline_comp_baseline', 'architecture_baseline_components', ['baseline_id'])

    op.create_table(
        'architecture_baseline_interfaces',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('interface_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(300), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('interface_type', sa.String(20), nullable=False),
        sa.Column('source_component_name', sa.String(500), nullable=False),
        sa.Column('target_component_name', sa.String(500), nullable=False),
        sa.Column('data_format', sa.String(200), nullable=True),
        sa.Column('communication_method', sa.String(200), nullable=True),
        sa.Column('safety_relevant', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('data_flows_summary', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['baseline_id'], ['architecture_baselines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['interface_id'], ['sw_interfaces.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_archbaseline_iface_baseline', 'architecture_baseline_interfaces', ['baseline_id'])


def downgrade() -> None:
    op.drop_index('ix_archbaseline_iface_baseline', table_name='architecture_baseline_interfaces')
    op.drop_table('architecture_baseline_interfaces')
    op.drop_index('ix_archbaseline_comp_baseline', table_name='architecture_baseline_components')
    op.drop_table('architecture_baseline_components')
    op.drop_table('architecture_baselines')
