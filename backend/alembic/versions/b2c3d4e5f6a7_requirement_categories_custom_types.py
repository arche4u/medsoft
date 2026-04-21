"""requirement_categories: custom requirement types per project

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-21 00:00:00.000000
"""
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1 ── Create requirement_categories table
    op.create_table(
        "requirement_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#546e7a"),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="99"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        sa.UniqueConstraint("project_id", "name", name="uq_req_category_project_name"),
    )

    # 2 ── Convert requirements.type from PostgreSQL enum → VARCHAR
    op.execute("ALTER TABLE requirements ALTER COLUMN type TYPE VARCHAR(50) USING type::text")

    # 3 ── Drop the old enum type now that no column references it
    op.execute("DROP TYPE IF EXISTS requirementtype")

    # 4 ── Seed built-in categories for all existing projects
    op.execute("""
        INSERT INTO requirement_categories (id, project_id, name, label, color, is_builtin, sort_order)
        SELECT gen_random_uuid(), p.id, 'USER', 'User Requirements', '#1565c0', true, 0
        FROM projects p
        ON CONFLICT (project_id, name) DO NOTHING
    """)
    op.execute("""
        INSERT INTO requirement_categories (id, project_id, name, label, color, is_builtin, sort_order)
        SELECT gen_random_uuid(), p.id, 'SYSTEM', 'System Requirements', '#6a1b9a', true, 1
        FROM projects p
        ON CONFLICT (project_id, name) DO NOTHING
    """)
    op.execute("""
        INSERT INTO requirement_categories (id, project_id, name, label, color, is_builtin, sort_order)
        SELECT gen_random_uuid(), p.id, 'SOFTWARE', 'Software Requirements', '#1b5e20', true, 2
        FROM projects p
        ON CONFLICT (project_id, name) DO NOTHING
    """)


def downgrade() -> None:
    # Recreate the enum (only safe if no custom types were added)
    op.execute("CREATE TYPE requirementtype AS ENUM ('USER', 'SYSTEM', 'SOFTWARE')")
    op.execute(
        "ALTER TABLE requirements ALTER COLUMN type TYPE requirementtype "
        "USING type::requirementtype"
    )
    op.drop_table("requirement_categories")
