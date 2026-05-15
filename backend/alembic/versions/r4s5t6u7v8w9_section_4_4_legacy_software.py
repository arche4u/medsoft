"""§4.4 Legacy Software — close the IEC 62304 §1–§7 coverage gap

IEC 62304 §4.4 covers software systems that weren't developed under this
standard. The manufacturer must:
  (a) Continuously monitor for incidents arising from use
  (b) Use the standard to assess the impact of changes
  (c) Make a risk-based decision regarding the application of the
      standard to the legacy software
  (d) Document the rationale for the decision

This migration:
  • software_items.is_legacy (bool, default false) — flag for §4.4 items
  • software_items.legacy_assessment (text) — narrative satisfying §4.4(d)

The companion LEGACY_SOFTWARE plan template lives in
compliance/plans/defaults.py and provides the manufacturer's §4.4 process
document. Together these close the §4.4 implementation gap so the IEC
62304 §1–§7 coverage table is fully ticked.

Revision ID: r4s5t6u7v8w9
Revises: q3r4s5t6u7v8
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "r4s5t6u7v8w9"
down_revision = "q3r4s5t6u7v8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "software_items",
        sa.Column("is_legacy", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "software_items",
        sa.Column("legacy_assessment", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("software_items", "legacy_assessment")
    op.drop_column("software_items", "is_legacy")
