"""§4.4 project-level declaration on SoftwareSafetyProfile

Adds two fields so each project carries an explicit §4.4 statement:

  software_safety_profiles.has_legacy_software (bool, default false)
    True when the project contains software systems that weren't developed
    under IEC 62304. Gates the per-item SoftwareItem.is_legacy flag in the
    UI and gates the LEGACY_SOFTWARE plan template's applicability.

  software_safety_profiles.legacy_software_statement (text)
    Free-text statement satisfying §4.4(d) — typically declares "no legacy
    software in this project" when has_legacy_software=False, or describes
    the legacy-software situation when True. Auditors see one explicit
    project-level statement instead of inferring from per-item flags.

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "s5t6u7v8w9x0"
down_revision = "r4s5t6u7v8w9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "software_safety_profiles",
        sa.Column("has_legacy_software", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "software_safety_profiles",
        sa.Column("legacy_software_statement", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("software_safety_profiles", "legacy_software_statement")
    op.drop_column("software_safety_profiles", "has_legacy_software")
