"""Per-category SRS baseline endpoints (IEC 62304 §5.2 — two-tier model).

Each requirement category (USER / SYSTEM / SOFTWARE / custom) has its own
versioned baseline lifecycle: DRAFT → IN_REVIEW → APPROVED → OBSOLETE.
Departments/teams owning each category move at their own cadence and apply
their own prepared/reviewed/approved signoff. The composite SRS (see
`baseline_router.py`) bundles approved category baselines into a release
manifest.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.approval_signoff import check_independence
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user
from app.modules.auth.schema import TokenData

from .model import (
    Requirement,
    RequirementCategoryBaseline,
    RequirementCategoryBaselineItem,
)
from .schema import (
    RequirementCategoryBaselineCreate,
    RequirementCategoryBaselineRead,
    RequirementCategoryBaselineSummary,
    RequirementCategoryBaselineStatusTransition,
    RequirementCategoryBaselineTransitionResult,
)

router = APIRouter(
    prefix="/requirements/category-baselines",
    tags=["requirements:category-baselines"],
)


VALID_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT":     {"IN_REVIEW"},
    "IN_REVIEW": {"APPROVED", "DRAFT"},
    "APPROVED":  {"OBSOLETE"},
    "OBSOLETE":  set(),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _next_version(current: str) -> str:
    try:
        major, minor = current.split(".", 1)
        return f"{major}.{int(minor) + 1}"
    except (ValueError, IndexError):
        return f"{current}.1"


def _summary(b: RequirementCategoryBaseline) -> RequirementCategoryBaselineSummary:
    return RequirementCategoryBaselineSummary(
        id=b.id, project_id=b.project_id,
        category_name=b.category_name, version=b.version, status=b.status,
        prepared_by=b.prepared_by, prepared_at=b.prepared_at,
        reviewed_by=b.reviewed_by, reviewed_at=b.reviewed_at,
        approved_by=b.approved_by, approved_at=b.approved_at,
        item_count=len(b.items) if b.items is not None else 0,
        created_at=b.created_at,
    )


async def _snapshot_category_requirements(
    db: AsyncSession, baseline: RequirementCategoryBaseline,
) -> int:
    """Copy current requirements of this category into the baseline as frozen items.

    Parent linkage is preserved as `parent_readable_id` so cross-category
    parents (e.g., a SOFTWARE req parented to a SYSTEM req) still resolve
    when the composite is re-aggregated.
    """
    # Pull all requirements in this project so we can resolve parent_readable_id
    # for cross-category links, then filter to this category's rows.
    all_reqs = (await db.execute(
        select(Requirement).where(Requirement.project_id == baseline.project_id)
    )).scalars().all()
    by_id = {r.id: r for r in all_reqs}
    in_category = [r for r in all_reqs if r.type == baseline.category_name]

    for r in in_category:
        parent = by_id.get(r.parent_id) if r.parent_id else None
        db.add(RequirementCategoryBaselineItem(
            baseline_id=baseline.id,
            requirement_id=r.id,
            readable_id=r.readable_id,
            type=r.type,
            title=r.title,
            description=r.description,
            parent_readable_id=parent.readable_id if parent else None,
        ))
    return len(in_category)


async def _obsolete_other_approved(
    db: AsyncSession,
    project_id: uuid.UUID,
    category_name: str,
    except_id: uuid.UUID,
) -> None:
    """Only one APPROVED baseline at a time per (project, category)."""
    await db.execute(
        sql_update(RequirementCategoryBaseline)
        .where(
            RequirementCategoryBaseline.project_id == project_id,
            RequirementCategoryBaseline.category_name == category_name,
            RequirementCategoryBaseline.id != except_id,
            RequirementCategoryBaseline.status == "APPROVED",
        )
        .values(status="OBSOLETE")
    )


# ── List / get ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[RequirementCategoryBaselineSummary])
async def list_category_baselines(
    project_id: uuid.UUID,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(RequirementCategoryBaseline)
        .where(RequirementCategoryBaseline.project_id == project_id)
        .order_by(
            RequirementCategoryBaseline.category_name,
            RequirementCategoryBaseline.created_at.desc(),
        )
    )
    if category:
        q = q.where(RequirementCategoryBaseline.category_name == category.upper())
    rows = (await db.execute(q)).scalars().all()
    return [_summary(b) for b in rows]


@router.get("/{baseline_id}", response_model=RequirementCategoryBaselineRead)
async def get_category_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(RequirementCategoryBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Category baseline not found")
    return b


# ── Create / fork / delete ────────────────────────────────────────────────────

@router.post("/", response_model=RequirementCategoryBaselineRead, status_code=201)
async def create_category_baseline(
    payload: RequirementCategoryBaselineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    cat_name = payload.category_name.upper()
    existing = (await db.execute(
        select(RequirementCategoryBaseline).where(
            RequirementCategoryBaseline.project_id == payload.project_id,
            RequirementCategoryBaseline.category_name == cat_name,
            RequirementCategoryBaseline.version == payload.version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"{cat_name} baseline v{payload.version} already exists")

    b = RequirementCategoryBaseline(
        project_id=payload.project_id,
        category_name=cat_name,
        version=payload.version,
        status="DRAFT",
    )
    db.add(b)
    await db.flush()
    await audit(
        db, "requirement_category_baseline", b.id, AuditAction.CREATE,
        current_user.user_id, f"{cat_name} v{b.version}",
    )
    await db.commit()
    await db.refresh(b)
    return b


@router.post("/{baseline_id}/fork", response_model=RequirementCategoryBaselineRead, status_code=201)
async def fork_category_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Fork an APPROVED category baseline → new DRAFT, unlocking that category's
    requirements for editing."""
    source = await db.get(RequirementCategoryBaseline, baseline_id)
    if not source:
        raise HTTPException(404, "Category baseline not found")
    if source.status != "APPROVED":
        raise HTTPException(400, "Only APPROVED baselines can be forked")

    new_version = _next_version(source.version)
    existing = (await db.execute(
        select(RequirementCategoryBaseline).where(
            RequirementCategoryBaseline.project_id == source.project_id,
            RequirementCategoryBaseline.category_name == source.category_name,
            RequirementCategoryBaseline.version == new_version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"v{new_version} already exists for {source.category_name}")

    fork = RequirementCategoryBaseline(
        project_id=source.project_id,
        category_name=source.category_name,
        version=new_version,
        status="DRAFT",
    )
    db.add(fork)
    await db.flush()
    await audit(
        db, "requirement_category_baseline", fork.id, AuditAction.CREATE,
        current_user.user_id,
        f"forked {source.category_name} v{source.version} → v{new_version}",
    )
    await db.commit()
    await db.refresh(fork)
    return fork


@router.delete("/{baseline_id}", status_code=204)
async def delete_category_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    b = await db.get(RequirementCategoryBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Category baseline not found")
    if b.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT baselines can be deleted")
    await audit(
        db, "requirement_category_baseline", b.id, AuditAction.DELETE,
        current_user.user_id, f"{b.category_name} v{b.version}",
    )
    await db.delete(b)
    await db.commit()


# ── Status transition (with prepared/reviewed/approved signoff) ───────────────

@router.put("/{baseline_id}/status", response_model=RequirementCategoryBaselineTransitionResult)
async def transition_category_baseline(
    baseline_id: uuid.UUID,
    payload: RequirementCategoryBaselineStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    b = await db.get(RequirementCategoryBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Category baseline not found")

    allowed = VALID_TRANSITIONS.get(b.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition from {b.status} to {payload.status}. Allowed: {sorted(allowed)}",
        )

    prev = b.status
    warnings: list[str] = []
    now = datetime.now(timezone.utc)

    if payload.status == "IN_REVIEW":
        b.prepared_by = payload.prepared_by or b.prepared_by or (current_user.user_id and str(current_user.user_id))
        b.prepared_at = b.prepared_at or now

    if payload.status == "APPROVED":
        count = await _snapshot_category_requirements(db, b)
        if count == 0:
            raise HTTPException(
                400,
                f"Cannot approve {b.category_name} v{b.version} — no requirements of this type to freeze",
            )
        await db.flush()
        await db.refresh(b)
        if not payload.reviewed_by:
            raise HTTPException(400, "reviewed_by is required to approve a category baseline")
        b.reviewed_by = payload.reviewed_by
        b.reviewed_at = now
        b.approved_by = payload.approved_by or (current_user.user_id and str(current_user.user_id))
        b.approved_at = now
        warning = check_independence(b.reviewed_by, b.approved_by)
        if warning:
            warnings.append(warning)
        await _obsolete_other_approved(db, b.project_id, b.category_name, b.id)

    if payload.review_notes is not None:
        b.review_notes = payload.review_notes

    b.status = payload.status
    await audit(
        db, "requirement_category_baseline", b.id, AuditAction.UPDATE,
        current_user.user_id,
        f"{b.category_name} status {prev} → {payload.status}",
    )
    await db.commit()
    await db.refresh(b)
    return RequirementCategoryBaselineTransitionResult(
        baseline=RequirementCategoryBaselineRead.model_validate(b),
        warnings=warnings,
    )
