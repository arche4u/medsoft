"""fix FK cascade deletes to prevent async lazy-load errors

Revision ID: a1b2c3d4e5f6
Revises: f7b83c2e1d46
Create Date: 2026-04-21 00:00:00.000000
"""
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f7b83c2e1d46"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # requirements.project_id → projects.id
    op.drop_constraint("requirements_project_id_fkey", "requirements", type_="foreignkey")
    op.create_foreign_key(
        "requirements_project_id_fkey", "requirements", "projects",
        ["project_id"], ["id"], ondelete="CASCADE",
    )

    # testcases.project_id → projects.id
    op.drop_constraint("testcases_project_id_fkey", "testcases", type_="foreignkey")
    op.create_foreign_key(
        "testcases_project_id_fkey", "testcases", "projects",
        ["project_id"], ["id"], ondelete="CASCADE",
    )

    # risks.requirement_id → requirements.id
    op.drop_constraint("risks_requirement_id_fkey", "risks", type_="foreignkey")
    op.create_foreign_key(
        "risks_requirement_id_fkey", "risks", "requirements",
        ["requirement_id"], ["id"], ondelete="CASCADE",
    )

    # tracelinks.requirement_id → requirements.id
    op.drop_constraint("tracelinks_requirement_id_fkey", "tracelinks", type_="foreignkey")
    op.create_foreign_key(
        "tracelinks_requirement_id_fkey", "tracelinks", "requirements",
        ["requirement_id"], ["id"], ondelete="CASCADE",
    )

    # tracelinks.testcase_id → testcases.id
    op.drop_constraint("tracelinks_testcase_id_fkey", "tracelinks", type_="foreignkey")
    op.create_foreign_key(
        "tracelinks_testcase_id_fkey", "tracelinks", "testcases",
        ["testcase_id"], ["id"], ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("tracelinks_testcase_id_fkey", "tracelinks", type_="foreignkey")
    op.create_foreign_key(
        "tracelinks_testcase_id_fkey", "tracelinks", "testcases",
        ["testcase_id"], ["id"],
    )

    op.drop_constraint("tracelinks_requirement_id_fkey", "tracelinks", type_="foreignkey")
    op.create_foreign_key(
        "tracelinks_requirement_id_fkey", "tracelinks", "requirements",
        ["requirement_id"], ["id"],
    )

    op.drop_constraint("risks_requirement_id_fkey", "risks", type_="foreignkey")
    op.create_foreign_key(
        "risks_requirement_id_fkey", "risks", "requirements",
        ["requirement_id"], ["id"],
    )

    op.drop_constraint("testcases_project_id_fkey", "testcases", type_="foreignkey")
    op.create_foreign_key(
        "testcases_project_id_fkey", "testcases", "projects",
        ["project_id"], ["id"],
    )

    op.drop_constraint("requirements_project_id_fkey", "requirements", type_="foreignkey")
    op.create_foreign_key(
        "requirements_project_id_fkey", "requirements", "projects",
        ["project_id"], ["id"],
    )
