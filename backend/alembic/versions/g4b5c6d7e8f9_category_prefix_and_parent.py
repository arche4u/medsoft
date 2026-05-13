"""Make requirement-category metadata fully dynamic

Revision ID: g4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-05-12 11:00:00

E6 cleanup: stop hardcoding USER/SYSTEM/SOFTWARE behaviour in code and let
the `requirement_categories` table own everything dynamic about a category.

- Adds `readable_id_prefix` (String 10). Used by `_next_readable_id` to
  generate human-friendly IDs (URQ-001, SYS-001, SWR-001 for builtins;
  whatever the user picks for custom categories — REG-001 etc.).
- Backfills the three seeded builtins with their canonical prefixes.
- Wires the hierarchy chain on the category itself: SYSTEM.parent_id = USER
  per project; SOFTWARE.parent_id = SYSTEM per project. With this in place,
  `_validate_hierarchy` walks `RequirementCategory.parent_id` instead of
  comparing names — custom categories can declare their own parent type.
"""
from alembic import op
import sqlalchemy as sa

revision = 'g4b5c6d7e8f9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'requirement_categories',
        sa.Column('readable_id_prefix', sa.String(10), nullable=True),
    )

    # Backfill canonical prefixes for the three seeded builtins. asyncpg's
    # prepared-statement driver rejects multi-statement strings, so each
    # UPDATE goes through its own op.execute.
    op.execute("UPDATE requirement_categories SET readable_id_prefix = 'URQ' WHERE name = 'USER'")
    op.execute("UPDATE requirement_categories SET readable_id_prefix = 'SYS' WHERE name = 'SYSTEM'")
    op.execute("UPDATE requirement_categories SET readable_id_prefix = 'SWR' WHERE name = 'SOFTWARE'")

    # Wire the parent chain so SYSTEM hangs under USER and SOFTWARE under
    # SYSTEM. Done per project so each project's category tree is self-
    # contained.
    op.execute("""
        UPDATE requirement_categories AS sys
        SET    parent_id = usr.id
        FROM   requirement_categories AS usr
        WHERE  sys.name = 'SYSTEM'
          AND  usr.name = 'USER'
          AND  sys.project_id = usr.project_id
          AND  sys.parent_id IS NULL
    """)
    op.execute("""
        UPDATE requirement_categories AS sw
        SET    parent_id = sys.id
        FROM   requirement_categories AS sys
        WHERE  sw.name = 'SOFTWARE'
          AND  sys.name = 'SYSTEM'
          AND  sw.project_id = sys.project_id
          AND  sw.parent_id IS NULL
    """)


def downgrade() -> None:
    # Drop the column; parent_id chain is data and we leave it in place.
    op.drop_column('requirement_categories', 'readable_id_prefix')
