"""§7 production cleanup — drop legacy mitigation + verification_notes

Two columns superseded by structured §7.2 / §7.3 tables:

  • risks.mitigation (String 1000) — pre-§7.2 free-text mitigation. Every
    risk now carries proper RiskControl rows; the free-text field has no
    structured semantics and isn't used by any §7 logic. Forward-only drop.

  • risk_controls.verification_notes (Text) — pre-§7.3 way to record
    verification. Now superseded by the structured VerificationEvidence
    sub-table (one row per piece of evidence with type / result / signoff /
    test FKs). The free-text field isn't read anywhere after §7 lands.
    Forward-only drop.

Sample data carrying either field is disposable (the user confirmed this
repeatedly during the production-migration round); the §7 seed populates
RiskControls + VerificationEvidence rows which is the audit-grade
equivalent.

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-05-15
"""
from alembic import op

revision = "q3r4s5t6u7v8"
down_revision = "p2q3r4s5t6u7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("risks", "mitigation")
    op.drop_column("risk_controls", "verification_notes")


def downgrade() -> None:
    # Forward-only — the columns held legacy free-text that's now in the
    # structured §7.2 / §7.3 tables. Restoring is out of scope.
    raise NotImplementedError(
        "Production cleanup of legacy mitigation / verification_notes is "
        "forward-only. Restore from backup if needed."
    )
