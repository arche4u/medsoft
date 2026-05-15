from __future__ import annotations
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import get_current_user, require_permission
from app.modules.platform.auth.schema import TokenData
from .model import CMBaseline, CMConfigItem, CMBaselineItem, CMChangeRequest, CMChangeImpact, CMVersionHistory
from .schema import (
    ConfigItemCreate, ConfigItemUpdate, ConfigItemNewVersion, ConfigItemRead,
    BaselineCreate, BaselineRead, BaselineItemRead,
    ChangeRequestCreate, ChangeRequestUpdate, ChangeRequestStatusTransition, ChangeRequestRead,
    ChangeImpactCreate, ChangeImpactUpdate, ChangeImpactRead,
    VersionHistoryRead, CMReleaseCheck,
)

router = APIRouter(prefix="/config-mgmt", tags=["config-mgmt"])

VALID_STATUS_TRANSITIONS: dict[str, list[str]] = {
    "OPEN": ["IN_REVIEW", "REJECTED"],
    "IN_REVIEW": ["APPROVED", "REJECTED", "OPEN"],
    "APPROVED": ["IMPLEMENTED", "REJECTED"],
    "IMPLEMENTED": ["CLOSED"],
    "REJECTED": ["OPEN"],
    "CLOSED": [],
}

# ── Config items ──────────────────────────────────────────────────────────────

def _build_ci_read(ci: CMConfigItem) -> ConfigItemRead:
    return ConfigItemRead(
        id=ci.id, project_id=ci.project_id, baseline_id=ci.baseline_id,
        name=ci.name, item_type=ci.item_type, reference_id=ci.reference_id,
        version=ci.version, status=ci.status, description=ci.description,
        version_history=[VersionHistoryRead.model_validate(h) for h in ci.version_history],
        created_at=ci.created_at, updated_at=ci.updated_at,
    )


@router.get("/items", response_model=List[ConfigItemRead])
async def list_items(
    project_id: str,
    item_type: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(CMConfigItem).where(CMConfigItem.project_id == uuid.UUID(project_id)).order_by(CMConfigItem.item_type, CMConfigItem.name)
    if item_type:
        q = q.where(CMConfigItem.item_type == item_type)
    if status:
        q = q.where(CMConfigItem.status == status)
    rows = (await db.execute(q)).scalars().all()
    return [_build_ci_read(ci) for ci in rows]


@router.get("/items/{item_id}", response_model=ConfigItemRead)
async def get_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    ci = (await db.execute(select(CMConfigItem).where(CMConfigItem.id == uuid.UUID(item_id)))).scalar_one_or_none()
    if not ci:
        raise HTTPException(404, "Config item not found")
    return _build_ci_read(ci)


@router.post("/items", response_model=ConfigItemRead, status_code=201)
async def create_item(
    body: ConfigItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CONFIG_ITEM")),
):
    ci = CMConfigItem(**body.model_dump())
    db.add(ci)
    await db.flush()
    db.add(CMVersionHistory(config_item_id=ci.id, version=ci.version, change_summary="Initial version"))
    await audit(db, "CMConfigItem", ci.id, AuditAction.CREATE, current_user.user_id, f"{ci.item_type} {ci.name} v{ci.version}")
    await db.commit()
    await db.refresh(ci)
    return _build_ci_read(ci)


@router.put("/items/{item_id}", response_model=ConfigItemRead)
async def update_item(
    item_id: str,
    body: ConfigItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_CONFIG_ITEM")),
):
    ci = (await db.execute(select(CMConfigItem).where(CMConfigItem.id == uuid.UUID(item_id)))).scalar_one_or_none()
    if not ci:
        raise HTTPException(404, "Config item not found")
    if ci.status == "RELEASED":
        raise HTTPException(400, "Released items cannot be modified. Create a new version instead.")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ci, k, v)
    await audit(db, "CMConfigItem", ci.id, AuditAction.UPDATE, current_user.user_id, f"{ci.name} v{ci.version}")
    await db.commit()
    await db.refresh(ci)
    return _build_ci_read(ci)


@router.post("/items/{item_id}/new-version", response_model=ConfigItemRead)
async def create_new_version(
    item_id: str,
    body: ConfigItemNewVersion,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_CONFIG_ITEM")),
):
    ci = (await db.execute(select(CMConfigItem).where(CMConfigItem.id == uuid.UUID(item_id)))).scalar_one_or_none()
    if not ci:
        raise HTTPException(404, "Config item not found")
    ci.version = body.version
    ci.status = "DRAFT"
    db.add(CMVersionHistory(
        config_item_id=ci.id, version=body.version,
        change_summary=body.change_summary,
        changed_by=body.changed_by,
        change_request_id=body.change_request_id,
    ))
    await audit(db, "CMConfigItem", ci.id, AuditAction.UPDATE, current_user.user_id, f"new version {body.version}")
    await db.commit()
    await db.refresh(ci)
    return _build_ci_read(ci)


@router.put("/items/{item_id}/status", response_model=ConfigItemRead)
async def set_item_status(
    item_id: str,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_CONFIG_ITEM")),
):
    valid = ["DRAFT", "APPROVED", "RELEASED", "OBSOLETE"]
    if status not in valid:
        raise HTTPException(400, f"Status must be one of: {valid}")
    ci = (await db.execute(select(CMConfigItem).where(CMConfigItem.id == uuid.UUID(item_id)))).scalar_one_or_none()
    if not ci:
        raise HTTPException(404, "Config item not found")
    if ci.status == "RELEASED" and status not in ("OBSOLETE",):
        raise HTTPException(400, "Released items can only be moved to Obsolete")
    ci.status = status
    await audit(db, "CMConfigItem", ci.id, AuditAction.UPDATE, current_user.user_id, f"status -> {status}")
    await db.commit()
    await db.refresh(ci)
    return _build_ci_read(ci)


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_CONFIG_ITEM")),
):
    ci = (await db.execute(select(CMConfigItem).where(CMConfigItem.id == uuid.UUID(item_id)))).scalar_one_or_none()
    if not ci:
        raise HTTPException(404, "Config item not found")
    if ci.status == "RELEASED":
        raise HTTPException(400, "Released items cannot be deleted")
    ci_id_val = ci.id
    ci_name = ci.name
    await db.delete(ci)
    await audit(db, "CMConfigItem", ci_id_val, AuditAction.DELETE, current_user.user_id, ci_name)
    await db.commit()


# ── Baselines ─────────────────────────────────────────────────────────────────

def _build_baseline_read(bl: CMBaseline) -> BaselineRead:
    bi_reads = []
    for bi in bl.items:
        ci = bi.config_item
        bi_reads.append(BaselineItemRead(
            id=bi.id, baseline_id=bi.baseline_id, config_item_id=bi.config_item_id,
            config_item_name=ci.name, config_item_type=ci.item_type,
            config_item_version=ci.version, config_item_status=ci.status,
        ))
    return BaselineRead(
        id=bl.id, project_id=bl.project_id, name=bl.name, description=bl.description,
        is_released=bl.is_released, created_by=bl.created_by, created_at=bl.created_at,
        item_count=len(bl.items), items=bi_reads,
    )


@router.get("/baselines", response_model=List[BaselineRead])
async def list_baselines(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    rows = (await db.execute(
        select(CMBaseline).where(CMBaseline.project_id == uuid.UUID(project_id)).order_by(CMBaseline.created_at.desc())
    )).scalars().all()
    return [_build_baseline_read(bl) for bl in rows]


@router.get("/baselines/{baseline_id}", response_model=BaselineRead)
async def get_baseline(
    baseline_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    bl = (await db.execute(select(CMBaseline).where(CMBaseline.id == uuid.UUID(baseline_id)))).scalar_one_or_none()
    if not bl:
        raise HTTPException(404, "Baseline not found")
    return _build_baseline_read(bl)


@router.post("/baselines", response_model=BaselineRead, status_code=201)
async def create_baseline(
    body: BaselineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_BASELINE")),
):
    bl = CMBaseline(
        project_id=body.project_id, name=body.name,
        description=body.description, created_by=body.created_by,
    )
    db.add(bl)
    await db.flush()
    for ci_id in body.config_item_ids:
        db.add(CMBaselineItem(baseline_id=bl.id, config_item_id=uuid.UUID(ci_id)))
    await audit(db, "CMBaseline", bl.id, AuditAction.CREATE, current_user.user_id, f"{bl.name} ({len(body.config_item_ids)} items)")
    await db.commit()
    await db.refresh(bl)
    return _build_baseline_read(bl)


@router.post("/baselines/{baseline_id}/items/{item_id}", response_model=BaselineRead)
async def add_item_to_baseline(
    baseline_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_BASELINE")),
):
    bl = (await db.execute(select(CMBaseline).where(CMBaseline.id == uuid.UUID(baseline_id)))).scalar_one_or_none()
    if not bl:
        raise HTTPException(404, "Baseline not found")
    if bl.is_released:
        raise HTTPException(400, "Cannot modify a released baseline")
    db.add(CMBaselineItem(baseline_id=bl.id, config_item_id=uuid.UUID(item_id)))
    await audit(db, "CMBaseline", bl.id, AuditAction.UPDATE, current_user.user_id, f"add item {item_id}")
    await db.commit()
    await db.refresh(bl)
    return _build_baseline_read(bl)


@router.delete("/baselines/{baseline_id}/items/{item_id}", response_model=BaselineRead)
async def remove_item_from_baseline(
    baseline_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_BASELINE")),
):
    bl = (await db.execute(select(CMBaseline).where(CMBaseline.id == uuid.UUID(baseline_id)))).scalar_one_or_none()
    if not bl or bl.is_released:
        raise HTTPException(400, "Baseline not found or is released")
    bi = (await db.execute(
        select(CMBaselineItem).where(
            CMBaselineItem.baseline_id == bl.id,
            CMBaselineItem.config_item_id == uuid.UUID(item_id),
        )
    )).scalar_one_or_none()
    if bi:
        await db.delete(bi)
        await audit(db, "CMBaseline", bl.id, AuditAction.UPDATE, current_user.user_id, f"remove item {item_id}")
        await db.commit()
        await db.refresh(bl)
    return _build_baseline_read(bl)


@router.post("/baselines/{baseline_id}/release", response_model=BaselineRead)
async def release_baseline(
    baseline_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("RELEASE_BASELINE")),
):
    bl = (await db.execute(select(CMBaseline).where(CMBaseline.id == uuid.UUID(baseline_id)))).scalar_one_or_none()
    if not bl:
        raise HTTPException(404, "Baseline not found")
    if bl.is_released:
        raise HTTPException(400, "Baseline is already released")
    if not bl.items:
        raise HTTPException(400, "Cannot release an empty baseline")
    bl.is_released = True
    # mark all included config items as RELEASED
    for bi in bl.items:
        ci = bi.config_item
        ci.status = "RELEASED"
        ci.baseline_id = bl.id
    await audit(db, "CMBaseline", bl.id, AuditAction.UPDATE, current_user.user_id, f"released ({len(bl.items)} items locked)")
    await db.commit()
    await db.refresh(bl)
    return _build_baseline_read(bl)


# ── Change requests ───────────────────────────────────────────────────────────

def _build_cr_read(cr: CMChangeRequest) -> ChangeRequestRead:
    return ChangeRequestRead(
        id=cr.id, project_id=cr.project_id, title=cr.title, description=cr.description,
        change_type=cr.change_type, priority=cr.priority, status=cr.status,
        created_by=cr.created_by, resolution_notes=cr.resolution_notes,
        impacts=[ChangeImpactRead.model_validate(i) for i in cr.impacts],
        created_at=cr.created_at, updated_at=cr.updated_at,
    )


@router.get("/changes", response_model=List[ChangeRequestRead])
async def list_changes(
    project_id: str,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(CMChangeRequest).where(
        CMChangeRequest.project_id == uuid.UUID(project_id)
    ).order_by(CMChangeRequest.created_at.desc())
    if status:
        q = q.where(CMChangeRequest.status == status)
    if priority:
        q = q.where(CMChangeRequest.priority == priority)
    rows = (await db.execute(q)).scalars().all()
    return [_build_cr_read(cr) for cr in rows]


@router.get("/changes/{cr_id}", response_model=ChangeRequestRead)
async def get_change(
    cr_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    cr = (await db.execute(select(CMChangeRequest).where(CMChangeRequest.id == uuid.UUID(cr_id)))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "Change request not found")
    return _build_cr_read(cr)


@router.post("/changes", response_model=ChangeRequestRead, status_code=201)
async def create_change(
    body: ChangeRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    cr = CMChangeRequest(**body.model_dump())
    db.add(cr)
    await db.flush()
    await audit(db, "CMChangeRequest", cr.id, AuditAction.CREATE, current_user.user_id, f"{cr.change_type}/{cr.priority} {cr.title}")
    await db.commit()
    await db.refresh(cr)
    return _build_cr_read(cr)


@router.put("/changes/{cr_id}", response_model=ChangeRequestRead)
async def update_change(
    cr_id: str,
    body: ChangeRequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    cr = (await db.execute(select(CMChangeRequest).where(CMChangeRequest.id == uuid.UUID(cr_id)))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status in ("CLOSED", "REJECTED"):
        raise HTTPException(400, f"Cannot edit a {cr.status} change request")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cr, k, v)
    await audit(db, "CMChangeRequest", cr.id, AuditAction.UPDATE, current_user.user_id, cr.title)
    await db.commit()
    await db.refresh(cr)
    return _build_cr_read(cr)


@router.put("/changes/{cr_id}/status", response_model=ChangeRequestRead)
async def transition_change(
    cr_id: str,
    body: ChangeRequestStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("APPROVE_CHANGE_REQUEST")),
):
    cr = (await db.execute(select(CMChangeRequest).where(CMChangeRequest.id == uuid.UUID(cr_id)))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "Change request not found")
    allowed = VALID_STATUS_TRANSITIONS.get(cr.status, [])
    if body.status not in allowed:
        raise HTTPException(400, f"Cannot transition from {cr.status} to {body.status}. Allowed: {allowed}")
    if body.status == "APPROVED":
        if not cr.impacts:
            raise HTTPException(400, "Impact analysis required before approving a change request")
    cr.status = body.status
    if body.resolution_notes:
        cr.resolution_notes = body.resolution_notes
    await audit(db, "CMChangeRequest", cr.id, AuditAction.UPDATE, current_user.user_id, f"status -> {body.status}")
    await db.commit()
    await db.refresh(cr)
    return _build_cr_read(cr)


@router.delete("/changes/{cr_id}", status_code=204)
async def delete_change(
    cr_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    cr = (await db.execute(select(CMChangeRequest).where(CMChangeRequest.id == uuid.UUID(cr_id)))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status not in ("OPEN", "REJECTED", "CLOSED"):
        raise HTTPException(400, "Only OPEN, REJECTED, or CLOSED changes can be deleted")
    cr_id_val = cr.id
    cr_title = cr.title
    await db.delete(cr)
    await audit(db, "CMChangeRequest", cr_id_val, AuditAction.DELETE, current_user.user_id, cr_title)
    await db.commit()


# ── Impact analysis ───────────────────────────────────────────────────────────

@router.post("/changes/{cr_id}/impacts", response_model=ChangeImpactRead, status_code=201)
async def add_impact(
    cr_id: str,
    body: ChangeImpactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    cr = (await db.execute(select(CMChangeRequest).where(CMChangeRequest.id == uuid.UUID(cr_id)))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status in ("CLOSED", "REJECTED"):
        raise HTTPException(400, "Cannot add impacts to a closed/rejected change request")
    impact = CMChangeImpact(change_request_id=cr.id, **body.model_dump())
    db.add(impact)
    await db.flush()
    await audit(db, "CMChangeImpact", impact.id, AuditAction.CREATE, current_user.user_id, f"cr={cr.id}")
    await db.commit()
    await db.refresh(impact)
    return ChangeImpactRead.model_validate(impact)


@router.put("/impacts/{impact_id}", response_model=ChangeImpactRead)
async def update_impact(
    impact_id: str,
    body: ChangeImpactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    impact = (await db.execute(select(CMChangeImpact).where(CMChangeImpact.id == uuid.UUID(impact_id)))).scalar_one_or_none()
    if not impact:
        raise HTTPException(404, "Impact not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(impact, k, v)
    await audit(db, "CMChangeImpact", impact.id, AuditAction.UPDATE, current_user.user_id, None)
    await db.commit()
    await db.refresh(impact)
    return ChangeImpactRead.model_validate(impact)


@router.delete("/impacts/{impact_id}", status_code=204)
async def delete_impact(
    impact_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CHANGE_REQUEST")),
):
    impact = (await db.execute(select(CMChangeImpact).where(CMChangeImpact.id == uuid.UUID(impact_id)))).scalar_one_or_none()
    if not impact:
        raise HTTPException(404, "Impact not found")
    impact_id_val = impact.id
    await db.delete(impact)
    await audit(db, "CMChangeImpact", impact_id_val, AuditAction.DELETE, current_user.user_id, None)
    await db.commit()


# ── Release gate ──────────────────────────────────────────────────────────────

@router.get("/release-check/{project_id}", response_model=CMReleaseCheck)
async def release_check(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    pid = uuid.UUID(project_id)
    reasons: list[str] = []

    open_critical = (await db.execute(
        select(CMChangeRequest).where(
            CMChangeRequest.project_id == pid,
            CMChangeRequest.priority == "CRITICAL",
            CMChangeRequest.status.in_(["OPEN", "IN_REVIEW", "APPROVED"]),
        )
    )).scalars().all()

    has_open_critical = len(open_critical) > 0
    if has_open_critical:
        reasons.append(f"{len(open_critical)} open CRITICAL change request(s)")

    # approved changes without complete impact analysis
    approved = (await db.execute(
        select(CMChangeRequest).where(
            CMChangeRequest.project_id == pid,
            CMChangeRequest.status == "APPROVED",
        )
    )).scalars().all()

    incomplete_impact = [cr for cr in approved if not cr.impacts]
    has_incomplete = len(incomplete_impact) > 0
    if has_incomplete:
        reasons.append(f"{len(incomplete_impact)} approved change(s) missing impact analysis")

    # pending revalidation
    all_changes = (await db.execute(
        select(CMChangeRequest).where(CMChangeRequest.project_id == pid)
    )).scalars().all()

    pending_reval = sum(
        1 for cr in all_changes
        for impact in cr.impacts
        if impact.revalidation_required and impact.revalidation_status == "PENDING"
    )
    has_pending_reval = pending_reval > 0
    if has_pending_reval:
        reasons.append(f"{pending_reval} item(s) pending re-validation")

    return CMReleaseCheck(
        has_open_critical=has_open_critical,
        has_incomplete_impact=has_incomplete,
        has_pending_revalidation=has_pending_reval,
        is_blocked=len(reasons) > 0,
        block_reasons=reasons,
    )
