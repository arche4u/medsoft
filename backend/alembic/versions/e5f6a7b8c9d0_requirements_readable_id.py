"""requirements: add readable_id with auto-generated sequence per project+type

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-21 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None

# Prefix mapping for built-in types; custom types use first 3 chars
_PREFIXES = {"USER": "URQ", "SYSTEM": "SYS", "SOFTWARE": "SWR"}


def _type_prefix(type_name: str) -> str:
    return _PREFIXES.get(type_name.upper(), type_name.upper()[:3])


def upgrade() -> None:
    # Add nullable first so we can backfill
    op.add_column("requirements", sa.Column("readable_id", sa.String(20), nullable=True))

    # Backfill: assign URQ-001, URQ-002 … per project+type using ROW_NUMBER
    op.execute("""
        UPDATE requirements r
        SET readable_id = (
            CASE r.type
                WHEN 'USER'     THEN 'URQ'
                WHEN 'SYSTEM'   THEN 'SYS'
                WHEN 'SOFTWARE' THEN 'SWR'
                ELSE UPPER(LEFT(r.type, 3))
            END
            || '-' ||
            LPAD(
                rn::text,
                3,
                '0'
            )
        )
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY project_id, type
                ORDER BY created_at, id
            ) AS rn
            FROM requirements
        ) sub
        WHERE r.id = sub.id
    """)

    # Now make it NOT NULL
    op.alter_column("requirements", "readable_id", nullable=False)

    # Unique per project
    op.create_unique_constraint(
        "uq_req_project_readable_id", "requirements", ["project_id", "readable_id"]
    )
    op.create_index("ix_req_readable_id", "requirements", ["readable_id"])


def downgrade() -> None:
    op.drop_index("ix_req_readable_id", "requirements")
    op.drop_constraint("uq_req_project_readable_id", "requirements", type_="unique")
    op.drop_column("requirements", "readable_id")
