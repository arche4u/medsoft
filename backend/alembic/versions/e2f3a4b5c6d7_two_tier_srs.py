"""Two-tier SRS: per-category baselines + composite manifest

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-05-08 19:00:00

Schema:
- Adds `requirement_category_baselines` and `requirement_category_baseline_items`
  for per-category versioning + signoff.
- Adds `requirements_baseline_components` join (composite SRS → category
  baseline pins).

Data migration:
- For every existing `requirements_baselines` row, splits its items by `type`
  into one or more `requirement_category_baselines` rows (copying the
  composite's signoff and version) and links them via
  `requirements_baseline_components`. Live composite rows + the legacy
  `requirements_baseline_items` table are kept untouched for back-compat.
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Schema ──────────────────────────────────────────────────────────
    op.create_table(
        'requirement_category_baselines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category_name', sa.String(50), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='DRAFT'),
        sa.Column('review_notes', sa.Text(), nullable=True),
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
        sa.UniqueConstraint('project_id', 'category_name', 'version', name='uq_catbaseline_proj_cat_version'),
    )

    op.create_table(
        'requirement_category_baseline_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requirement_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('readable_id', sa.String(20), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('parent_readable_id', sa.String(20), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['baseline_id'], ['requirement_category_baselines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirements.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_catbaseline_items_baseline', 'requirement_category_baseline_items', ['baseline_id'])

    op.create_table(
        'requirements_baseline_components',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('composite_baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category_baseline_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['composite_baseline_id'], ['requirements_baselines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_baseline_id'], ['requirement_category_baselines.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('composite_baseline_id', 'category_baseline_id', name='uq_baseline_component'),
    )

    # ── 2. Data migration ──────────────────────────────────────────────────
    # For each existing composite baseline: split items by type → create one
    # category baseline per type → link via components.
    conn = op.get_bind()
    composites = conn.execute(sa.text("""
        SELECT id, project_id, version, status, review_notes,
               prepared_by, prepared_at, reviewed_by, reviewed_at,
               approved_by, approved_at, cm_baseline_id
        FROM requirements_baselines
    """)).fetchall()

    for c in composites:
        items = conn.execute(sa.text("""
            SELECT id, requirement_id, readable_id, type, title, description, parent_readable_id
            FROM requirements_baseline_items
            WHERE baseline_id = :bid
        """), {"bid": c.id}).fetchall()
        if not items:
            continue
        # Group items by type
        by_type: dict[str, list] = {}
        for it in items:
            by_type.setdefault(it.type, []).append(it)

        for cat_name, cat_items in by_type.items():
            cat_baseline_id = uuid.uuid4()
            # Copy the composite's signoff trail to the new category baseline.
            conn.execute(sa.text("""
                INSERT INTO requirement_category_baselines
                  (id, project_id, category_name, version, status, review_notes,
                   prepared_by, prepared_at, reviewed_by, reviewed_at,
                   approved_by, approved_at, created_at, updated_at)
                VALUES
                  (:id, :pid, :cat, :ver, :status, :notes,
                   :pby, :pat, :rby, :rat, :aby, :aat, NOW(), NOW())
            """), {
                "id": cat_baseline_id, "pid": c.project_id,
                "cat": cat_name, "ver": c.version, "status": c.status,
                "notes": c.review_notes,
                "pby": c.prepared_by, "pat": c.prepared_at,
                "rby": c.reviewed_by, "rat": c.reviewed_at,
                "aby": c.approved_by, "aat": c.approved_at,
            })
            for it in cat_items:
                conn.execute(sa.text("""
                    INSERT INTO requirement_category_baseline_items
                      (id, baseline_id, requirement_id, readable_id, type, title, description, parent_readable_id)
                    VALUES
                      (:id, :bid, :rid, :readable, :type, :title, :desc, :parent)
                """), {
                    "id": uuid.uuid4(), "bid": cat_baseline_id,
                    "rid": it.requirement_id,
                    "readable": it.readable_id, "type": it.type,
                    "title": it.title, "desc": it.description,
                    "parent": it.parent_readable_id,
                })
            # Link composite → new category baseline
            conn.execute(sa.text("""
                INSERT INTO requirements_baseline_components
                  (id, composite_baseline_id, category_baseline_id)
                VALUES (:id, :cid, :catid)
            """), {
                "id": uuid.uuid4(), "cid": c.id, "catid": cat_baseline_id,
            })


def downgrade() -> None:
    op.drop_table('requirements_baseline_components')
    op.drop_index('ix_catbaseline_items_baseline', table_name='requirement_category_baseline_items')
    op.drop_table('requirement_category_baseline_items')
    op.drop_table('requirement_category_baselines')
