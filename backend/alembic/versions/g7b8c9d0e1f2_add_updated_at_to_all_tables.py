"""add updated_at to all TimestampMixin tables

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'g7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None

TABLES = [
    "change_requests",
    "design_elements",
    "projects",
    "releases",
    "requirements",
    "testcases",
    "users",
    "validation_records",
]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ))


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, 'updated_at')
