"""phase3: change control, approvals, release management, DHF

Revision ID: e6a17d4b8c23
Revises: c4e83b2d9f51
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "e6a17d4b8c23"
down_revision: Union[str, None] = "c4e83b2d9f51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # change_requests
    op.create_table(
        "change_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "status",
            sa.Enum("OPEN", "IMPACT_ANALYSIS", "APPROVED", "REJECTED", "IMPLEMENTED", name="changerequeststate"),
            nullable=False,
            server_default="OPEN",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # change_impacts
    op.create_table(
        "change_impacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("change_request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("change_requests.id"), nullable=False),
        sa.Column("impacted_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("requirements.id"), nullable=True),
        sa.Column("impacted_design_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("design_elements.id"), nullable=True),
        sa.Column("impacted_testcase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("testcases.id"), nullable=True),
        sa.Column("impact_description", sa.Text, nullable=True),
    )

    # approvals
    op.create_table(
        "approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "entity_type",
            sa.Enum("CHANGE", "RELEASE", name="approvalentitytype"),
            nullable=False,
        ),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("approver_name", sa.String(255), nullable=False),
        sa.Column(
            "decision",
            sa.Enum("APPROVED", "REJECTED", name="approvaldecision"),
            nullable=False,
        ),
        sa.Column("comments", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # releases
    op.create_table(
        "releases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "UNDER_REVIEW", "APPROVED", "RELEASED", name="releasestatus"),
            nullable=False,
            server_default="DRAFT",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # release_items
    op.create_table(
        "release_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("release_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("releases.id"), nullable=False),
        sa.Column("requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("requirements.id"), nullable=True),
        sa.Column("testcase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("testcases.id"), nullable=True),
        sa.Column("design_element_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("design_elements.id"), nullable=True),
    )

    # dhf_documents
    op.create_table(
        "dhf_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("content", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("dhf_documents")
    op.drop_table("release_items")
    op.drop_table("releases")
    op.drop_table("approvals")
    op.drop_table("change_impacts")
    op.drop_table("change_requests")

    op.execute("DROP TYPE IF EXISTS changerequeststate")
    op.execute("DROP TYPE IF EXISTS approvalentitytype")
    op.execute("DROP TYPE IF EXISTS approvaldecision")
    op.execute("DROP TYPE IF EXISTS releasestatus")
