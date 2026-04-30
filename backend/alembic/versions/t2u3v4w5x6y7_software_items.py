"""add software items module (IEC 62304 §5 decomposition + safety classification)

Revision ID: t2u3v4w5x6y7
Revises: s0t1u2v3w4x5
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 't2u3v4w5x6y7'
down_revision = 's0t1u2v3w4x5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'software_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('item_type', sa.String(50), nullable=False, server_default='SUBSYSTEM'),
        sa.Column('safety_class', sa.String(1), nullable=False, server_default='A'),
        sa.Column('classification_justification', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['software_items.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_software_items_project_id', 'software_items', ['project_id'])
    op.create_index('ix_software_items_parent_id', 'software_items', ['parent_id'])

    op.create_table(
        'software_item_risk_links',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('software_item_id', sa.UUID(), nullable=False),
        sa.Column('risk_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['software_item_id'], ['software_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['risk_id'], ['risks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('software_item_id', 'risk_id', name='uq_si_risk'),
    )
    op.create_index('ix_si_risk_links_item', 'software_item_risk_links', ['software_item_id'])

    op.create_table(
        'software_item_requirement_links',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('software_item_id', sa.UUID(), nullable=False),
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['software_item_id'], ['software_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('software_item_id', 'requirement_id', name='uq_si_req'),
    )
    op.create_index('ix_si_req_links_item', 'software_item_requirement_links', ['software_item_id'])


def downgrade():
    op.drop_table('software_item_requirement_links')
    op.drop_table('software_item_risk_links')
    op.drop_table('software_items')
