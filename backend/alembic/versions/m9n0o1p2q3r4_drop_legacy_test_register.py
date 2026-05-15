"""Drop legacy Test Register — IEC 62304 deprecation

The legacy `testcases` / `tracelinks` / `test_executions` / `test_categories`
tables are removed: IEC 62304 has no "generic test case" concept; every test
belongs to a level (§5.5 unit / §5.6 integration / §5.7 system). The four
cross-module FK columns that pointed at `testcases.id`
(release_items.testcase_id, change_impacts.impacted_testcase_id,
sw_component_tc_links.testcase_id, risk_controls.testcase_id) are replaced by
`system_test_id` columns referencing `system_test_cases`.

Data preservation is intentionally not attempted — the user confirmed sample
data is disposable and `seed_all.py` reproduces a clean state. Dependent rows
in the four FK-carrying tables are cleared before the schema changes; the
re-seed re-creates them with the new schema.

Revision ID: m9n0o1p2q3r4
Revises: l3h4i5j6k7l8
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "m9n0o1p2q3r4"
down_revision = "l3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Clear rows in the four FK-carrying tables before mutating their schema.
    #    These get re-seeded after migration; existing testcase linkages would
    #    be invalid post-drop anyway.
    op.execute("DELETE FROM release_items")
    op.execute("DELETE FROM change_impacts")
    op.execute("DELETE FROM sw_component_tc_links")
    op.execute("DELETE FROM risk_controls")

    # 2. Replace testcase_id columns with system_test_id (FK → system_test_cases).

    # release_items
    op.drop_column("release_items", "testcase_id")
    op.add_column(
        "release_items",
        sa.Column(
            "system_test_id", UUID(as_uuid=True),
            sa.ForeignKey("system_test_cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # change_impacts
    op.drop_column("change_impacts", "impacted_testcase_id")
    op.add_column(
        "change_impacts",
        sa.Column(
            "impacted_system_test_id", UUID(as_uuid=True),
            sa.ForeignKey("system_test_cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # sw_component_tc_links (architecture component ↔ verification artifact)
    op.drop_column("sw_component_tc_links", "testcase_id")
    op.add_column(
        "sw_component_tc_links",
        sa.Column(
            "system_test_id", UUID(as_uuid=True),
            sa.ForeignKey("system_test_cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    # risk_controls (risk-control verification artifact)
    op.drop_column("risk_controls", "testcase_id")
    op.add_column(
        "risk_controls",
        sa.Column(
            "system_test_id", UUID(as_uuid=True),
            sa.ForeignKey("system_test_cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 3. Drop legacy tables in FK dependency order:
    #    tracelinks → testcases (FK) ; test_executions → testcases (FK)
    #    testcases → test_categories (FK).
    op.drop_table("tracelinks")
    op.drop_table("test_executions")
    op.drop_table("testcases")
    op.drop_table("test_categories")


def downgrade() -> None:
    # Forward-only. Restoring the legacy register would require re-creating
    # four tables, four FK columns, and (in production) data restoration from
    # backups — out of scope.
    raise NotImplementedError(
        "Test Register removal is forward-only. Restore from backup if needed."
    )
