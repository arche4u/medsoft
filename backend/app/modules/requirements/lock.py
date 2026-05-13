"""SRS baseline lock helpers (IEC 62304 §5.2 — per-category semantics).

In the two-tier model, edits are gated *per category*. Editing a USER
requirement requires a USER category baseline in DRAFT/IN_REVIEW; SYSTEM and
SOFTWARE lock independently. The composite SRS doesn't lock anything
directly — it only assembles approved category baselines.

Bootstrap rule: a category with NO baselines at all is treated as unlocked
(so a new project's first requirements can be created freely).
"""
import uuid
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .model import RequirementCategoryBaseline
from .schema import RequirementsLockState, CategoryLockEntry


async def _category_open_draft(
    db: AsyncSession, project_id: uuid.UUID, category_name: str,
) -> RequirementCategoryBaseline | None:
    return (await db.execute(
        select(RequirementCategoryBaseline)
        .where(
            RequirementCategoryBaseline.project_id == project_id,
            RequirementCategoryBaseline.category_name == category_name,
            RequirementCategoryBaseline.status.in_(("DRAFT", "IN_REVIEW")),
        )
        .order_by(RequirementCategoryBaseline.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def _category_locker(
    db: AsyncSession, project_id: uuid.UUID, category_name: str,
) -> RequirementCategoryBaseline | None:
    """Return the APPROVED baseline locking this category (if any)."""
    if await _category_open_draft(db, project_id, category_name) is not None:
        return None
    return (await db.execute(
        select(RequirementCategoryBaseline)
        .where(
            RequirementCategoryBaseline.project_id == project_id,
            RequirementCategoryBaseline.category_name == category_name,
            RequirementCategoryBaseline.status == "APPROVED",
        )
        .order_by(RequirementCategoryBaseline.approved_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def is_category_locked(
    db: AsyncSession, project_id: uuid.UUID, category_name: str,
) -> bool:
    return (await _category_locker(db, project_id, category_name)) is not None


def _bump(version: str) -> str:
    try:
        major, minor = version.split(".", 1)
        return f"{major}.{int(minor) + 1}"
    except (ValueError, IndexError):
        return f"{version}.1"


async def assert_category_unlocked(
    db: AsyncSession, project_id: uuid.UUID, category_name: str,
) -> None:
    """Raise 400 if requirements of this category are locked by an APPROVED baseline."""
    locker = await _category_locker(db, project_id, category_name)
    if locker is not None:
        raise HTTPException(
            400,
            f"{category_name} requirements are locked by approved baseline v{locker.version}. "
            f"Fork {category_name} to v{_bump(locker.version)} to make changes.",
        )


async def assert_unlocked_for_requirement(
    db: AsyncSession, project_id: uuid.UUID, requirement_type: str,
) -> None:
    """Convenience wrapper — same as assert_category_unlocked, but takes the
    requirement's `type` field."""
    await assert_category_unlocked(db, project_id, requirement_type.upper())


async def locking_state(
    db: AsyncSession, project_id: uuid.UUID,
) -> RequirementsLockState:
    """Build the per-category lock state for the entire project (used by the UI bar)."""
    cats = (await db.execute(
        select(RequirementCategoryBaseline.category_name)
        .where(RequirementCategoryBaseline.project_id == project_id)
        .distinct()
    )).scalars().all()

    entries: list[CategoryLockEntry] = []
    for cat_name in cats:
        locker = await _category_locker(db, project_id, cat_name)
        draft = await _category_open_draft(db, project_id, cat_name)
        entries.append(CategoryLockEntry(
            category_name=cat_name,
            is_locked=locker is not None,
            locked_by_baseline_id=locker.id if locker else None,
            locked_by_version=locker.version if locker else None,
            has_open_draft=draft is not None,
            open_draft_id=draft.id if draft else None,
            open_draft_version=draft.version if draft else None,
            open_draft_status=draft.status if draft else None,
        ))

    return RequirementsLockState(categories=entries)
