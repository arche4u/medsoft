"""§7 risk hardening — contribution probability + re-eval outcome + verified_by user

Adds:

  1. risk_contributions.probability_of_occurrence (Float, nullable)        — §7.1
     Estimated probability (0.0–1.0) that this software item / component
     contributes to the hazardous situation. Lets auditors see how heavily
     each contributor weighs against the hazard.

  2. risks.re_evaluation_outcome (String(40), nullable)                   — §7.4
     Disposition of the most recent re-evaluation pass:
     MITIGATED / ACCEPTED / TRANSFERRED / NEEDS_MORE_INFO. None until the
     first re-evaluation is recorded. Distinct from `status` — captures the
     auditor-visible disposition of the loop, not the lifecycle state.

  3. verification_evidences.verified_by_user_id (UUID FK users, nullable) — §7.3
     Which user account recorded this evidence (auto-set by the router
     from current_user.id). Distinct from `verified_by` (free-text name).

Revision ID: v8w9x0y1z2a3
Revises: s5t6u7v8w9x0
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "v8w9x0y1z2a3"
down_revision = "s5t6u7v8w9x0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. risk_contributions.probability_of_occurrence
    op.add_column(
        "risk_contributions",
        sa.Column("probability_of_occurrence", sa.Float(), nullable=True),
    )

    # 2. risks.re_evaluation_outcome
    op.add_column(
        "risks",
        sa.Column("re_evaluation_outcome", sa.String(40), nullable=True),
    )

    # 3. verification_evidences.verified_by_user_id
    op.add_column(
        "verification_evidences",
        sa.Column(
            "verified_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("verification_evidences", "verified_by_user_id")
    op.drop_column("risks", "re_evaluation_outcome")
    op.drop_column("risk_contributions", "probability_of_occurrence")
