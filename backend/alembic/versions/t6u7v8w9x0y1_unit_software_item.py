"""§5.5 SoftwareUnit ↔ §4.3 SoftwareItem direct FK

Revision ID: t6u7v8w9x0y1
Revises: l3h4i5j6k7l8
Create Date: 2026-05-15 10:00:00

Adds an optional `software_item_id` column to `software_units` so a unit can
declare the §4.3 SoftwareItem it directly verifies. Without this link, the
§4.3 compliance rollup can only see units indirectly (via a Requirement that
itself happens to be linked to the item); this leaves unit coverage invisible
whenever a unit tests something not yet routed through a Requirement.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 't6u7v8w9x0y1'
down_revision = 'l3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'software_units',
        sa.Column(
            'software_item_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('software_items.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('software_units', 'software_item_id')
