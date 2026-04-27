"""add expected_result to testcases and actual_result to test_executions

Revision ID: p6k7l8m9n0o1
Revises: o5j6k7l8m9n0
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'p6k7l8m9n0o1'
down_revision = 'o5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('testcases', sa.Column('expected_result', sa.Text(), nullable=True))
    op.add_column('test_executions', sa.Column('actual_result', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('test_executions', 'actual_result')
    op.drop_column('testcases', 'expected_result')
