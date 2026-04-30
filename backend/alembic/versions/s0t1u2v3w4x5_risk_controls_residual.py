"""ISO 14971: add risk controls, residual risks, risk status fields

Revision ID: s0t1u2v3w4x5
Revises: r8s9t0u1v2w3
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 's0t1u2v3w4x5'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend risks table ──────────────────────────────────────────────────
    op.add_column('risks', sa.Column('title', sa.String(500), nullable=True))
    op.add_column('risks', sa.Column('status', sa.String(30), nullable=False, server_default='OPEN'))
    op.add_column('risks', sa.Column('evaluation_notes', sa.Text(), nullable=True))
    op.add_column('risks', sa.Column('re_evaluation_required', sa.Boolean(), nullable=False, server_default='false'))

    # ── Risk Controls ────────────────────────────────────────────────────────
    op.create_table(
        'risk_controls',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('risk_id', UUID(as_uuid=True),
                  sa.ForeignKey('risks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('control_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('requirement_id', UUID(as_uuid=True),
                  sa.ForeignKey('requirements.id', ondelete='SET NULL'), nullable=True),
        sa.Column('testcase_id', UUID(as_uuid=True),
                  sa.ForeignKey('testcases.id', ondelete='SET NULL'), nullable=True),
        sa.Column('implementation_status', sa.String(20), nullable=False, server_default='PROPOSED'),
        sa.Column('verification_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_risk_controls_risk_id', 'risk_controls', ['risk_id'])
    op.create_index('ix_risk_controls_requirement_id', 'risk_controls', ['requirement_id'])
    op.create_index('ix_risk_controls_testcase_id', 'risk_controls', ['testcase_id'])

    # ── Residual Risks ───────────────────────────────────────────────────────
    op.create_table(
        'residual_risks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('risk_id', UUID(as_uuid=True),
                  sa.ForeignKey('risks.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('probability', sa.Integer(), nullable=False),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('is_accepted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('accepted_by', sa.String(200), nullable=True),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_residual_risks_risk_id', 'residual_risks', ['risk_id'])


def downgrade() -> None:
    op.drop_table('residual_risks')
    op.drop_table('risk_controls')
    op.drop_column('risks', 're_evaluation_required')
    op.drop_column('risks', 'evaluation_notes')
    op.drop_column('risks', 'status')
    op.drop_column('risks', 'title')
