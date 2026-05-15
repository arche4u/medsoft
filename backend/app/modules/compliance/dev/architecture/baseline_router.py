"""Architecture baseline endpoints (IEC 62304 §5.3 — versioned document).

Mirrors the SDP/SRS baseline pattern. The project-level Software Architecture
Document is versioned through DRAFT → IN_REVIEW → APPROVED → OBSOLETE with
prepared/reviewed/approved signoff. Approving a baseline snapshots every
component + interface + data-flow into immutable rows, mirrors to a
CMBaseline named "Architecture v{version}", and locks the live architecture
until a new draft is forked.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.approval_signoff import check_independence
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from app.modules.compliance.config.config_mgmt.model import CMBaseline, CMConfigItem, CMBaselineItem

from .constants import COMPONENT_TYPE_ORDER
from .model import (
    ArchitectureBaseline,
    ArchitectureBaselineComponent,
    ArchitectureBaselineInterface,
    SWComponent,
    SWInterface,
)
from .schema import (
    ArchitectureBaselineCreate,
    ArchitectureBaselineComponentRead,
    ArchitectureBaselineInterfaceRead,
    ArchitectureBaselineRead,
    ArchitectureBaselineSummary,
    ArchitectureBaselineStatusTransition,
    ArchitectureBaselineTransitionResult,
    ArchitectureLockState,
)

router = APIRouter(
    prefix="/architecture/baselines",
    tags=["architecture:baselines"],
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


def _summary(b: ArchitectureBaseline) -> ArchitectureBaselineSummary:
    return ArchitectureBaselineSummary(
        id=b.id, project_id=b.project_id, version=b.version, status=b.status,
        prepared_by=b.prepared_by, prepared_at=b.prepared_at,
        reviewed_by=b.reviewed_by, reviewed_at=b.reviewed_at,
        approved_by=b.approved_by, approved_at=b.approved_at,
        cm_baseline_id=b.cm_baseline_id,
        component_count=len(b.components) if b.components is not None else 0,
        interface_count=len(b.interfaces) if b.interfaces is not None else 0,
        created_at=b.created_at,
    )


async def _snapshot_architecture(db: AsyncSession, baseline: ArchitectureBaseline) -> tuple[int, int]:
    """Freeze every SWComponent + SWInterface (+ data flows summary) into
    immutable rows attached to this baseline. Returns (n_components, n_interfaces)."""
    components = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == baseline.project_id)
    )).scalars().all()
    comp_by_id = {c.id: c for c in components}
    for idx, c in enumerate(sorted(components, key=lambda x: x.name)):
        parent = comp_by_id.get(c.parent_id) if c.parent_id else None
        db.add(ArchitectureBaselineComponent(
            baseline_id=baseline.id,
            component_id=c.id,
            name=c.name,
            description=c.description,
            component_type=c.component_type,
            safety_class=c.safety_class,
            version=c.version,
            rationale=c.rationale,
            parent_name=parent.name if parent else None,
            sort_order=idx,
        ))

    interfaces = (await db.execute(
        select(SWInterface).where(SWInterface.project_id == baseline.project_id)
    )).scalars().all()
    for iface in interfaces:
        src = comp_by_id.get(iface.source_component_id)
        tgt = comp_by_id.get(iface.target_component_id)
        flows_lines = []
        for f in iface.data_flows:
            flows_lines.append(
                f"{f.data_name} | {f.data_type or '—'} | {f.frequency or '—'} "
                f"| {f.criticality} | {f.description or ''}"
            )
        db.add(ArchitectureBaselineInterface(
            baseline_id=baseline.id,
            interface_id=iface.id,
            name=iface.name,
            description=iface.description,
            interface_type=iface.interface_type,
            source_component_name=src.name if src else "?",
            target_component_name=tgt.name if tgt else "?",
            data_format=iface.data_format,
            communication_method=iface.communication_method,
            safety_relevant=iface.safety_relevant,
            data_flows_summary="\n".join(flows_lines) if flows_lines else None,
        ))

    return len(components), len(interfaces)


async def _mirror_to_cm(db: AsyncSession, baseline: ArchitectureBaseline) -> uuid.UUID:
    """Create a CMBaseline named 'Architecture v{version}' with one CMConfigItem
    per component (the component is the recognisable artifact for the audit
    log; interfaces and data flows live inside the baseline snapshot)."""
    cm = CMBaseline(
        project_id=baseline.project_id,
        name=f"Architecture v{baseline.version}",
        description=(
            f"Auto-mirror of approved Software Architecture Document "
            f"v{baseline.version} ({len(baseline.components)} component(s), "
            f"{len(baseline.interfaces)} interface(s))"
        ),
        is_released=True,
        created_by=baseline.approved_by,
    )
    db.add(cm)
    await db.flush()
    for item in baseline.components:
        ci = CMConfigItem(
            project_id=baseline.project_id,
            baseline_id=cm.id,
            name=item.name,
            item_type="COMPONENT",
            reference_id=f"{item.component_type}:{item.name}",
            version=f"{baseline.version} ({item.version})",
            status="RELEASED",
            description=item.description,
        )
        db.add(ci)
        await db.flush()
        db.add(CMBaselineItem(baseline_id=cm.id, config_item_id=ci.id))
    return cm.id


async def _obsolete_other_approved(db: AsyncSession, project_id: uuid.UUID, except_id: uuid.UUID) -> None:
    await db.execute(
        sql_update(ArchitectureBaseline)
        .where(
            ArchitectureBaseline.project_id == project_id,
            ArchitectureBaseline.id != except_id,
            ArchitectureBaseline.status == "APPROVED",
        )
        .values(status="OBSOLETE")
    )


# ── List / get / lock state ───────────────────────────────────────────────────

@router.get("/", response_model=List[ArchitectureBaselineSummary])
async def list_baselines(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(ArchitectureBaseline)
        .where(ArchitectureBaseline.project_id == project_id)
        .order_by(ArchitectureBaseline.created_at.desc())
    )).scalars().all()
    return [_summary(b) for b in rows]


@router.get("/lock-state", response_model=ArchitectureLockState)
async def get_lock_state(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from .lock import _open_draft, _locking_baseline
    locker = await _locking_baseline(db, project_id)
    draft = await _open_draft(db, project_id)
    return ArchitectureLockState(
        is_locked=locker is not None,
        locked_by_baseline_id=locker.id if locker else None,
        locked_by_version=locker.version if locker else None,
        has_open_draft=draft is not None,
        open_draft_id=draft.id if draft else None,
        open_draft_version=draft.version if draft else None,
        open_draft_status=draft.status if draft else None,
    )


async def _hydrate_live_components(
    db: AsyncSession, project_id: uuid.UUID, baseline_id: uuid.UUID,
) -> tuple[list[ArchitectureBaselineComponentRead], list[ArchitectureBaselineInterfaceRead]]:
    """Build snapshot-shaped views from live SWComponent/SWInterface rows.

    Used for DRAFT/IN_REVIEW baselines so the PDF and read API show what
    *will* be captured at approval. APPROVED baselines keep the frozen
    snapshot tables.
    """
    comps = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == project_id)
    )).scalars().all()
    by_id = {c.id: c for c in comps}

    def _sort_key(c: SWComponent) -> tuple[int, str]:
        return (COMPONENT_TYPE_ORDER.get(c.component_type, 99), c.name)

    comps_sorted = sorted(comps, key=_sort_key)
    comp_views: list[ArchitectureBaselineComponentRead] = []
    for i, c in enumerate(comps_sorted):
        parent_name = by_id[c.parent_id].name if c.parent_id and c.parent_id in by_id else None
        comp_views.append(ArchitectureBaselineComponentRead(
            id=c.id, baseline_id=baseline_id, component_id=c.id,
            name=c.name, description=c.description,
            component_type=c.component_type, safety_class=c.safety_class,
            version=c.version, rationale=c.rationale,
            parent_name=parent_name, sort_order=i,
        ))

    ifaces = (await db.execute(
        select(SWInterface).where(SWInterface.project_id == project_id)
        .order_by(SWInterface.created_at)
    )).scalars().all()
    iface_views: list[ArchitectureBaselineInterfaceRead] = []
    for i in ifaces:
        src_name = by_id[i.source_component_id].name if i.source_component_id in by_id else ""
        tgt_name = by_id[i.target_component_id].name if i.target_component_id in by_id else ""
        flows = i.data_flows
        summary = "\n".join(f"• {df.data_name} ({df.criticality}): {df.description or ''}" for df in flows) if flows else None
        iface_views.append(ArchitectureBaselineInterfaceRead(
            id=i.id, baseline_id=baseline_id, interface_id=i.id,
            name=i.name, description=i.description,
            interface_type=i.interface_type,
            source_component_name=src_name, target_component_name=tgt_name,
            data_format=i.data_format, communication_method=i.communication_method,
            safety_relevant=i.safety_relevant,
            data_flows_summary=summary,
        ))

    return comp_views, iface_views


@router.get("/{baseline_id}", response_model=ArchitectureBaselineRead)
async def get_baseline(baseline_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    b = await db.get(ArchitectureBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Architecture baseline not found")
    if b.status in ("DRAFT", "IN_REVIEW"):
        comp_views, iface_views = await _hydrate_live_components(db, b.project_id, b.id)
    else:
        comp_views = [ArchitectureBaselineComponentRead.model_validate(c) for c in b.components]
        iface_views = [ArchitectureBaselineInterfaceRead.model_validate(i) for i in b.interfaces]
    return ArchitectureBaselineRead(
        id=b.id, project_id=b.project_id,
        version=b.version, status=b.status,
        prepared_by=b.prepared_by, prepared_at=b.prepared_at,
        reviewed_by=b.reviewed_by, reviewed_at=b.reviewed_at,
        approved_by=b.approved_by, approved_at=b.approved_at,
        review_notes=b.review_notes, cm_baseline_id=b.cm_baseline_id,
        components=comp_views, interfaces=iface_views,
        created_at=b.created_at, updated_at=b.updated_at,
    )


# ── Create / fork / delete ────────────────────────────────────────────────────

@router.post("/", response_model=ArchitectureBaselineRead, status_code=201)
async def create_baseline(
    payload: ArchitectureBaselineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_ARCHITECTURE")),
):
    existing = (await db.execute(
        select(ArchitectureBaseline).where(
            ArchitectureBaseline.project_id == payload.project_id,
            ArchitectureBaseline.version == payload.version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Architecture baseline v{payload.version} already exists for this project")

    b = ArchitectureBaseline(
        project_id=payload.project_id,
        version=payload.version,
        status="DRAFT",
    )
    db.add(b)
    await db.flush()
    await audit(
        db, "architecture_baseline", b.id, AuditAction.CREATE, current_user.user_id,
        f"v{b.version}",
    )
    await db.commit()
    await db.refresh(b)
    return b


@router.post("/{baseline_id}/fork", response_model=ArchitectureBaselineRead, status_code=201)
async def fork_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_ARCHITECTURE")),
):
    source = await db.get(ArchitectureBaseline, baseline_id)
    if not source:
        raise HTTPException(404, "Architecture baseline not found")
    if source.status != "APPROVED":
        raise HTTPException(400, "Only APPROVED baselines can be forked")

    new_version = _next_version(source.version)
    existing = (await db.execute(
        select(ArchitectureBaseline).where(
            ArchitectureBaseline.project_id == source.project_id,
            ArchitectureBaseline.version == new_version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"v{new_version} already exists")

    fork = ArchitectureBaseline(
        project_id=source.project_id,
        version=new_version,
        status="DRAFT",
    )
    db.add(fork)
    await db.flush()
    await audit(
        db, "architecture_baseline", fork.id, AuditAction.CREATE, current_user.user_id,
        f"forked v{source.version} → v{new_version}",
    )
    await db.commit()
    await db.refresh(fork)
    return fork


@router.delete("/{baseline_id}", status_code=204)
async def delete_baseline(
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_ARCHITECTURE")),
):
    b = await db.get(ArchitectureBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Architecture baseline not found")
    if b.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT baselines can be deleted")
    await audit(
        db, "architecture_baseline", b.id, AuditAction.DELETE, current_user.user_id,
        f"v{b.version}",
    )
    await db.delete(b)
    await db.commit()


# ── Status transition (with signoff) ─────────────────────────────────────────

@router.put("/{baseline_id}/status", response_model=ArchitectureBaselineTransitionResult)
async def transition_baseline(
    baseline_id: uuid.UUID,
    payload: ArchitectureBaselineStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    b = await db.get(ArchitectureBaseline, baseline_id)
    if not b:
        raise HTTPException(404, "Architecture baseline not found")

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
        n_comp, n_iface = await _snapshot_architecture(db, b)
        if n_comp == 0:
            raise HTTPException(400, "Cannot approve an empty architecture — add at least one component first")
        await db.flush()
        await db.refresh(b)

        if not payload.reviewed_by:
            raise HTTPException(400, "reviewed_by is required to approve an architecture baseline")
        b.reviewed_by = payload.reviewed_by
        b.reviewed_at = now
        b.approved_by = payload.approved_by or (current_user.user_id and str(current_user.user_id))
        b.approved_at = now
        warning = check_independence(b.reviewed_by, b.approved_by)
        if warning:
            warnings.append(warning)
        # Mirror to CM
        cm_id = await _mirror_to_cm(db, b)
        b.cm_baseline_id = cm_id
        await _obsolete_other_approved(db, b.project_id, b.id)

    if payload.review_notes is not None:
        b.review_notes = payload.review_notes

    b.status = payload.status
    await audit(
        db, "architecture_baseline", b.id, AuditAction.UPDATE, current_user.user_id,
        f"status {prev} → {payload.status}",
    )
    await db.commit()
    await db.refresh(b)
    return ArchitectureBaselineTransitionResult(
        baseline=ArchitectureBaselineRead.model_validate(b),
        warnings=warnings,
    )
