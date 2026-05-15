"""Two-tier SRS seed helper for demo data.

Mirrors the live workflow: for each requirement category present in the
project, create an APPROVED `RequirementCategoryBaseline` with frozen items
and per-stage signoff. Then bundle those into one APPROVED composite SRS
manifest, mirrored to a CMBaseline.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.config.config_mgmt.model import CMBaseline, CMConfigItem, CMBaselineItem

from .category_baseline_router import _snapshot_category_requirements
from .model import (
    Requirement,
    RequirementCategoryBaseline,
    RequirementsBaseline,
    RequirementsBaselineComponent,
)


async def seed_approved_srs(
    db: AsyncSession,
    *,
    project_id,
    version: str = "1.0",
    approved_by: str = "Quality Manager (seeded)",
) -> RequirementsBaseline:
    """Seed approved per-category baselines + composite SRS for a project.

    Creates one APPROVED `RequirementCategoryBaseline` per requirement type
    present in the project (USER/SYSTEM/SOFTWARE/custom), assembles them into
    a composite `RequirementsBaseline` v{version}, and creates the matching
    CMBaseline mirror. Caller is responsible for the surrounding commit.
    """
    now = datetime.now(timezone.utc)

    # ── Per-category baselines (one per distinct requirement type) ─────────
    types = (await db.execute(
        select(Requirement.type).where(Requirement.project_id == project_id).distinct()
    )).scalars().all()

    category_baselines: list[RequirementCategoryBaseline] = []
    for t in types:
        cat_b = RequirementCategoryBaseline(
            project_id=project_id,
            category_name=t,
            version=version,
            status="APPROVED",
            prepared_by="Requirements Engineer (seeded)",
            prepared_at=now,
            reviewed_by="Technical Reviewer (seeded)",
            reviewed_at=now,
            approved_by=approved_by,
            approved_at=now,
        )
        db.add(cat_b)
        await db.flush()
        await _snapshot_category_requirements(db, cat_b)
        category_baselines.append(cat_b)

    await db.flush()

    # ── Composite SRS manifest ─────────────────────────────────────────────
    composite = RequirementsBaseline(
        project_id=project_id,
        version=version,
        status="APPROVED",
        prepared_by="Project Lead (seeded)",
        prepared_at=now,
        reviewed_by="QA Lead (seeded)",
        reviewed_at=now,
        approved_by=approved_by,
        approved_at=now,
    )
    db.add(composite)
    await db.flush()
    for cb in category_baselines:
        db.add(RequirementsBaselineComponent(
            composite_baseline_id=composite.id,
            category_baseline_id=cb.id,
        ))
    await db.flush()
    await db.refresh(composite)

    # ── CM mirror (composite-only) ─────────────────────────────────────────
    cm = CMBaseline(
        project_id=project_id,
        name=f"SRS v{version}",
        description=f"Auto-mirror of approved Software Requirements Specification v{version} (seeded)",
        is_released=True,
        created_by=approved_by,
    )
    db.add(cm)
    await db.flush()

    for cb in category_baselines:
        for item in cb.items:
            ci = CMConfigItem(
                project_id=project_id,
                baseline_id=cm.id,
                name=item.title,
                item_type="REQUIREMENT",
                reference_id=item.readable_id,
                version=f"{version} ({cb.category_name}@{cb.version})",
                status="RELEASED",
                description=item.description,
            )
            db.add(ci)
            await db.flush()
            db.add(CMBaselineItem(baseline_id=cm.id, config_item_id=ci.id))

    composite.cm_baseline_id = cm.id
    await db.flush()
    return composite
