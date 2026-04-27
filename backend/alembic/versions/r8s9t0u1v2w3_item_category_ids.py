"""add category_id to design_elements, testcases, risks

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('design_elements',
        sa.Column('category_id', UUID(as_uuid=True),
                  sa.ForeignKey('design_categories.id', ondelete='SET NULL'),
                  nullable=True))

    op.add_column('testcases',
        sa.Column('category_id', UUID(as_uuid=True),
                  sa.ForeignKey('test_categories.id', ondelete='SET NULL'),
                  nullable=True))

    op.add_column('risks',
        sa.Column('category_id', UUID(as_uuid=True),
                  sa.ForeignKey('risk_categories.id', ondelete='SET NULL'),
                  nullable=True))


def downgrade() -> None:
    op.drop_column('risks', 'category_id')
    op.drop_column('testcases', 'category_id')
    op.drop_column('design_elements', 'category_id')
