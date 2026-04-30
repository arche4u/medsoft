"""problem resolution CAPA and maintenance module

Revision ID: b9c0d1e2f3a4
Revises: z8a9b0c1d2e3
Create Date: 2026-04-30 14:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b9c0d1e2f3a4'
down_revision = 'z8a9b0c1d2e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'problem_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='MEDIUM'),
        sa.Column('status', sa.String(30), nullable=False, server_default='OPEN'),
        sa.Column('related_release_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('reported_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_release_id'], ['releases.id'], ondelete='SET NULL'),
    )

    op.create_table(
        'problem_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('problem_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('linked_type', sa.String(50), nullable=False),
        sa.Column('linked_id', sa.String(255), nullable=False),
        sa.Column('linked_name', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['problem_id'], ['problem_reports.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'root_causes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('problem_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('root_cause_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('identified_by', sa.String(200), nullable=True),
        sa.Column('identified_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['problem_id'], ['problem_reports.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'capas',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('problem_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', sa.String(20), nullable=False, server_default='CORRECTIVE'),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('assigned_to', sa.String(200), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='OPEN'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['problem_id'], ['problem_reports.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'capa_verifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('capa_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('verification_method', sa.String(100), nullable=True),
        sa.Column('result', sa.String(10), nullable=False, server_default='PASS'),
        sa.Column('evidence_link', sa.String(500), nullable=True),
        sa.Column('verified_by', sa.String(200), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['capa_id'], ['capas.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'maintenance_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('related_release_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('change_request_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('update_type', sa.String(50), nullable=False, server_default='PATCH'),
        sa.Column('deployed_version', sa.String(100), nullable=True),
        sa.Column('deployment_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_release_id'], ['releases.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['change_request_id'], ['cm_change_requests.id'], ondelete='SET NULL'),
    )


def downgrade() -> None:
    op.drop_table('maintenance_records')
    op.drop_table('capa_verifications')
    op.drop_table('capas')
    op.drop_table('root_causes')
    op.drop_table('problem_links')
    op.drop_table('problem_reports')
