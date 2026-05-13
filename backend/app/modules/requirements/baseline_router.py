"""Composite SRS baseline endpoints (IEC 62304 §5.2 — two-tier model).

A composite SRS is the *release manifest*: it bundles a specific combination
of approved per-category baselines (USER@v1.0 + SYSTEM@v0.9 + SOFTWARE@v1.1)
and goes through its own DRAFT → IN_REVIEW → APPROVED → OBSOLETE workflow.

Composites do not store requirement snapshots directly — those live on the
per-category baselines (see `category_baseline_router.py`). The composite
just pins which category versions are part of this release. Approving a
composite requires every referenced category baseline to already be APPROVED.

When approved, the composite auto-mirrors to a `CMBaseline` named
"SRS v{version}" so it shows up as a release artifact in Configuration
Management. Per-category baselines stay internal to Requirements.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.approval_signoff import check_independence
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user
from app.modules.auth.schema import TokenData
from app.modules.config_mgmt.model import CMBaseline, CMConfigItem, CMBaselineItem

from .lock import locking_state
from .model import (
    RequirementCategoryBaseline,
    RequirementsBaseline,
    RequirementsBaselineComponent,
)
from .schema import (
    CompositeBaselineCreate,
    CompositeBaselineRead,
    CompositeBaselineSummary,
    CompositeBaselineComponentsUpdate,
    CompositeBaselineStatusTransition,
    CompositeBaselineTransitionResult,
    RequirementsLockState,
    RequirementsBaselineComponentRead,
    RequirementCategoryBaselineSummary,
)

router = APIRouter(prefix="/requirements/baselines", tags=["requirements:baselines"])


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


def _summary(b: RequirementsBaseline) -> CompositeBaselineSummary:
    return CompositeBaselineSummary(
        id=b.id, project_id=b.project_id, version=b.version, status=b.status,
        prepared_by=b.prepared_by, prepared_at=b.prepared_at,
        reviewed_by=b.reviewed_by, reviewed_at=b.reviewed_at,
        approved_by=b.approved_by, approved_at=b.approved_at,
        cm_baseline_id=b.cm_baseline_id,
        component_count=len(b.components) if b.components is not None else 0,
        created_at=b.created_at,
    )


def _detail(b: RequirementsBaseline) -> CompositeBaselineRead:
    components = [
        RequirementsBaselineComponentRead(
            id=c.id,
            composite_baseline_id=c.composite_baseline_id,
            category_baseline_id=c.category_baseline_id,
            category_baseline=RequirementCategoryBaselineSummary(
                id=c.category_baseline.id,
                project_id=c.category_baseline.project_id,
                category_name=c.category_baseline.category_name,
                version=c.category_baseline.version,
                status=c.category_baseline.status,
                prepared_by=c.category_baseline.prepared_by,
                prepared_at=c.category_baseline.prepared_at,
                reviewed_by=c.category_baseline.reviewed_by,
                reviewed_at=c.category_baseline.reviewed_at,
                approved_by=c.category_baseline.approved_by,
                approved_at=c.category_baseline.approved_at,
                item_count=len(c.category_baseline.items) if c.category_baseline.items else 0,
                created_at=c.category_baseline.created_at,
            ),
        )
        for c in b.components
    ]
    return CompositeBaselineRead(
        id=b.id, project_id=b.project_id, version=b.version, status=b.status,
        prepared_by=b.prepared_by, prepared_at=b.prepared_at,
        reviewed_by=b.reviewed_by, reviewed_at=b.reviewed_at,
        approved_by=b.approved_by, approved_at=b.approved_at,
        review_notes=b.review_notes, cm_baseline_id=b.cm_baseline_id,
        components=components,
        created_at=b.created_at, updated_at=b.updated_at,
    )


async def _validate_components(
    db: AsyncSession,
    project_id: uuid.UUID,
    category_baseline_ids: list[uuid.UUID],
) -> list[RequirementCategoryBaseline]:
    """Confirm every requested category baseline exists, belongs to the
    project, and that no two pin the same category."""
    if not category_baseline_ids:
        return []
    rows = (await db.execute(
        select(RequirementCategoryBaseline)
        .where(RequirementCategoryBaseline.id.in_(category_baseline_ids))
    )).scalars().all()
    found_ids = {r.id for r in rows}
    missing = set(category_baseline_ids) - found_ids
    if missing:
        raise HTTPException(404, f"Category baseline(s) not found: {sorted(str(m) for m in missing)}")
    for r in rows:
        if r.project_id != project_id:
            raise HTTPException(400, f"Category baseline {r.id} belongs to a different project")
    seen_categories: set[str] = set()
    for r in rows:
        if r.category_name in seen_categories:
            raise HTTPException(400, f"Two category baselines pin the same category '{r.category_name}'")
        seen_categories.add(r.category_name)
    return rows


async def _mirror_to_cm(
    db: AsyncSession, composite: RequirementsBaseline,
) -> uuid.UUID:
    """Create a CMBaseline named 'SRS v{version}' bundling all requirements
    from the composite's components.

    Per the design: only composites mirror to CM (per-category baselines stay
    internal to the Requirements module).
    """
    cm = CMBaseline(
        project_id=composite.project_id,
        name=f"SRS v{composite.version}",
        description=(
            f"Auto-mirror of approved Software Requirements Specification "
            f"v{composite.version} (composite of {len(composite.components)} category baseline(s))"
        ),
        is_released=True,
        created_by=composite.approved_by,
    )
    db.add(cm)
    await db.flush()

    # One CMConfigItem per requirement across all component categories.
    for component in composite.components:
        cat = component.category_baseline
        for item in cat.items:
            ci = CMConfigItem(
                project_id=composite.project_id,
                baseline_id=cm.id,
                name=item.title,
                item_type="REQUIREMENT",
                reference_id=item.readable_id,
                version=f"{composite.version} ({cat.category_name}@{cat.version})",
                status="RELEASED",
                description=item.description,
            )
            db.add(ci)
            await db.flush()
            db.add(CMBaselineItem(baseline_id=cm.id, config_item_id=ci.id))

    return cm.id


async def _obsolete_other_approved(
    db: AsyncSession, project_id: uuid.UUID, except_id: uuid.UUID,
) -> None:
    """Only one APPROVED composite at a time per project."""
    await db.execute(
        sql_update(RequirementsBaseline)
        .where(
            RequirementsBaseline.project_id == project_id,
            RequirementsBaseline.id != except_id,
            RequirementsBaseline.status == "APPROVED",
        )
        .values(status="OBSOLETE")
    )


# ── List / get / lock state ───────────────────────────────────────────────────

@router.get("/", response_model=List[CompositeBaselineSummary])
async def list_composite_baselines(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(RequirementsBaseline)
        .where(RequirementsBaseline.project_id == project_id)
        .order_by(RequirementsBaseline.created_at.desc())
    )).scalars().all()
    return [_summary(b) for b in rows]


@router.get("/lock-state", response_model=RequirementsLockState)
async def get_lock_state(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return per-category lock state for the project.

    See `lock.py` for the rule: a category is locked when it has no
    DRAFT/IN_REVIEW baseline and at least one APPROVED one. Categories with
    no baseline at all are unlocked (bootstrap mode).
    """
    return await locking_state(db, project_id)


@router.get("/{baseline_id}", response_model=CompositeBaselineRead)
async def get_composite_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    b = (await db.execute(
        select(RequirementsBaseline)
        .options(selectinload(RequirementsBaseline.components)
                 .selectinload(RequirementsBaselineComponent.category_baseline)
                 .selectinload(RequirementCategoryBaseline.items))
        .where(RequirementsBaseline.id == baseline_id)
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Composite baseline not found")
    return _detail(b)


# ── Create / fork / delete ────────────────────────────────────────────────────

@router.post("/", response_model=CompositeBaselineRead, status_code=201)
async def create_composite_baseline(
    payload: CompositeBaselineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    existing = (await db.execute(
        select(RequirementsBaseline).where(
            RequirementsBaseline.project_id == payload.project_id,
            RequirementsBaseline.version == payload.version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Composite SRS v{payload.version} already exists for this project")

    cats = await _validate_components(db, payload.project_id, payload.category_baseline_ids)

    composite = RequirementsBaseline(
        project_id=payload.project_id,
        version=payload.version,
        status="DRAFT",
    )
    db.add(composite)
    await db.flush()
    for cat in cats:
        db.add(RequirementsBaselineComponent(
            composite_baseline_id=composite.id,
            category_baseline_id=cat.id,
        ))
    await audit(
        db, "requirements_baseline", composite.id, AuditAction.CREATE,
        current_user.user_id,
        f"composite v{composite.version} pinning {len(cats)} category(ies)",
    )
    await db.commit()

    # Reload with relationships eagerly populated for the response
    return await get_composite_baseline(composite.id, db)


@router.put("/{baseline_id}/components", response_model=CompositeBaselineRead)
async def update_composite_components(
    baseline_id: uuid.UUID,
    payload: CompositeBaselineComponentsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Re-pin the manifest. Allowed only while the composite is in DRAFT.

    The frontend is expected to gate this behind a confirmation modal so the
    user knows that re-pinning the manifest does *not* edit any underlying
    category baseline's requirements — it just changes which version is part
    of this release."""
    b = await db.get(RequirementsBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Composite baseline not found")
    if b.status != "DRAFT":
        raise HTTPException(400, "Composite components can only be edited while the baseline is in DRAFT")

    cats = await _validate_components(db, b.project_id, payload.category_baseline_ids)

    # Replace existing component pins (delete then re-insert; small N).
    existing_components = (await db.execute(
        select(RequirementsBaselineComponent)
        .where(RequirementsBaselineComponent.composite_baseline_id == b.id)
    )).scalars().all()
    for ec in existing_components:
        await db.delete(ec)
    await db.flush()
    for cat in cats:
        db.add(RequirementsBaselineComponent(
            composite_baseline_id=b.id,
            category_baseline_id=cat.id,
        ))
    await audit(
        db, "requirements_baseline", b.id, AuditAction.UPDATE,
        current_user.user_id,
        f"manifest re-pinned to {len(cats)} category(ies)",
    )
    await db.commit()
    return await get_composite_baseline(b.id, db)


@router.post("/{baseline_id}/fork", response_model=CompositeBaselineRead, status_code=201)
async def fork_composite_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Fork an APPROVED composite → new DRAFT (copies the same component pins
    so the fork starts from a known good manifest)."""
    source = (await db.execute(
        select(RequirementsBaseline)
        .options(selectinload(RequirementsBaseline.components))
        .where(RequirementsBaseline.id == baseline_id)
    )).scalar_one_or_none()
    if not source:
        raise HTTPException(404, "Composite baseline not found")
    if source.status != "APPROVED":
        raise HTTPException(400, "Only APPROVED composites can be forked")

    new_version = _next_version(source.version)
    existing = (await db.execute(
        select(RequirementsBaseline).where(
            RequirementsBaseline.project_id == source.project_id,
            RequirementsBaseline.version == new_version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"v{new_version} already exists")

    fork = RequirementsBaseline(
        project_id=source.project_id,
        version=new_version,
        status="DRAFT",
    )
    db.add(fork)
    await db.flush()
    for c in source.components:
        db.add(RequirementsBaselineComponent(
            composite_baseline_id=fork.id,
            category_baseline_id=c.category_baseline_id,
        ))
    await audit(
        db, "requirements_baseline", fork.id, AuditAction.CREATE,
        current_user.user_id,
        f"forked composite v{source.version} → v{new_version}",
    )
    await db.commit()
    return await get_composite_baseline(fork.id, db)


@router.delete("/{baseline_id}", status_code=204)
async def delete_composite_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    b = await db.get(RequirementsBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Composite baseline not found")
    if b.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT composites can be deleted")
    await audit(
        db, "requirements_baseline", b.id, AuditAction.DELETE,
        current_user.user_id, f"v{b.version}",
    )
    await db.delete(b)
    await db.commit()


# ── Status transition (manifest must be fully APPROVED to APPROVE) ────────────

@router.put("/{baseline_id}/status", response_model=CompositeBaselineTransitionResult)
async def transition_composite_baseline(
    baseline_id: uuid.UUID,
    payload: CompositeBaselineStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    b = (await db.execute(
        select(RequirementsBaseline)
        .options(selectinload(RequirementsBaseline.components)
                 .selectinload(RequirementsBaselineComponent.category_baseline))
        .where(RequirementsBaseline.id == baseline_id)
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Composite baseline not found")

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
        # Reject if any pinned category baseline is not APPROVED.
        if not b.components:
            raise HTTPException(400, "Cannot approve an empty composite — pin at least one category baseline first")
        not_approved = [
            f"{c.category_baseline.category_name}@v{c.category_baseline.version} ({c.category_baseline.status})"
            for c in b.components if c.category_baseline.status != "APPROVED"
        ]
        if not_approved:
            raise HTTPException(
                400,
                "All pinned category baselines must be APPROVED first. Pending: " + ", ".join(not_approved),
            )
        if not payload.reviewed_by:
            raise HTTPException(400, "reviewed_by is required to approve a composite SRS")
        b.reviewed_by = payload.reviewed_by
        b.reviewed_at = now
        b.approved_by = payload.approved_by or (current_user.user_id and str(current_user.user_id))
        b.approved_at = now
        warning = check_independence(b.reviewed_by, b.approved_by)
        if warning:
            warnings.append(warning)
        # Mirror to CM (release artifact).
        cm_id = await _mirror_to_cm(db, b)
        b.cm_baseline_id = cm_id
        # Demote any other APPROVED composite for this project.
        await _obsolete_other_approved(db, b.project_id, b.id)

    if payload.review_notes is not None:
        b.review_notes = payload.review_notes

    b.status = payload.status
    await audit(
        db, "requirements_baseline", b.id, AuditAction.UPDATE,
        current_user.user_id,
        f"composite v{b.version} status {prev} → {payload.status}",
    )
    await db.commit()

    detail = await get_composite_baseline(b.id, db)
    return CompositeBaselineTransitionResult(composite=detail, warnings=warnings)
