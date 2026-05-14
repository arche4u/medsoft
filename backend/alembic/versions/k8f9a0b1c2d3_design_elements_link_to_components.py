"""§5.4 design elements link to §5.3 components; drop type/category redundancy

Revision ID: k8f9a0b1c2d3
Revises: j7e8f9a0b1c2
Create Date: 2026-05-14 12:00:00

Design elements become pure IEC 62304 §5.4 detailed-design artifacts attached
to a §5.3 SWComponent. The old ARCHITECTURE/DETAILED `type` tier and the
unused `design_categories` folder system are removed (both redundant with the
§5.3 architecture module). Existing rows have no component mapping, so design
data is wiped here — the seed re-creates it linked to components.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'k8f9a0b1c2d3'
down_revision = 'j7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Old design elements have no §5.3 component mapping — wipe and re-seed.
    op.execute("DELETE FROM requirement_design_links")
    op.execute("DELETE FROM design_elements")

    # Link every design element to a §5.3 architecture component.
    op.add_column(
        'design_elements',
        sa.Column(
            'component_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('sw_components.id', ondelete='CASCADE'),
            nullable=False,
        ),
    )

    # Drop the redundant ARCHITECTURE/DETAILED tier and the unused category system.
    op.drop_column('design_elements', 'type')
    op.drop_column('design_elements', 'category_id')
    op.drop_table('design_categories')
    op.execute("DROP TYPE designelementtype")


def downgrade() -> None:
    op.execute("CREATE TYPE designelementtype AS ENUM ('ARCHITECTURE', 'DETAILED')")
    op.create_table(
        'design_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('color', sa.String(20), nullable=False, server_default='#546e7a'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='99'),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'name', name='uq_design_category_project_name'),
    )
    op.add_column(
        'design_elements',
        sa.Column(
            'category_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('design_categories.id', ondelete='SET NULL'), nullable=True,
        ),
    )
    op.add_column(
        'design_elements',
        sa.Column(
            'type',
            postgresql.ENUM('ARCHITECTURE', 'DETAILED', name='designelementtype', create_type=False),
            nullable=True,
        ),
    )
    op.drop_column('design_elements', 'component_id')
