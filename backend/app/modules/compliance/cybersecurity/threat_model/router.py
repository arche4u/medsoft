"""IEC 81001-5-1 Threat Model — CRUD endpoints.

Threat models are versioned + status-tracked. Threats live in nested CRUD
under a parent model. Once a model is APPROVED, threats become read-only
(matching the pattern used by SDP / Architecture Baselines).
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from .model import ThreatModel, Threat
from .schema import (
    ThreatModelCreate, ThreatModelUpdate, ThreatModelRead,
    ThreatCreate, ThreatUpdate, ThreatRead,
)

router = APIRouter(prefix="/threat-model", tags=["cybersecurity"])


def _assert_editable(tm: ThreatModel) -> None:
    """APPROVED / OBSOLETE models are read-only; fork to a new version to edit."""
    if tm.status not in ("DRAFT", "IN_REVIEW"):
        raise HTTPException(
            400,
            f"Threat model v{tm.version} is {tm.status} and cannot be edited. "
            f"Create a new version (fork) to record new threats.",
        )


# ── ThreatModel CRUD ──────────────────────────────────────────────────────────

@router.get("/models", response_model=list[ThreatModelRead])
async def list_models(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ThreatModel).where(ThreatModel.project_id == project_id)
        .order_by(ThreatModel.created_at.desc())
    )
    return res.scalars().all()


@router.get("/models/{model_id}", response_model=ThreatModelRead)
async def get_model(model_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tm = await db.get(ThreatModel, model_id)
    if not tm:
        raise HTTPException(404, "Threat model not found")
    return tm


@router.post("/models", response_model=ThreatModelRead, status_code=201)
async def create_model(
    body: ThreatModelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    tm = ThreatModel(**body.model_dump())
    db.add(tm)
    await db.flush()
    await audit(db, "ThreatModel", tm.id, AuditAction.CREATE, current_user.user_id,
                f"{tm.name} v{tm.version}")
    await db.commit()
    await db.refresh(tm)
    return tm


@router.put("/models/{model_id}", response_model=ThreatModelRead)
async def update_model(
    model_id: uuid.UUID, body: ThreatModelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    tm = await db.get(ThreatModel, model_id)
    if not tm:
        raise HTTPException(404, "Threat model not found")
    # Status transitions are allowed on update; other edits require editable state.
    updates = body.model_dump(exclude_unset=True)
    if any(k != "status" for k in updates):
        _assert_editable(tm)
    new_status = updates.get("status")
    if new_status == "APPROVED" and tm.status != "APPROVED":
        tm.approved_by_id = current_user.user_id
        tm.approved_at = datetime.now(timezone.utc)
    for k, v in updates.items():
        setattr(tm, k, v)
    await audit(db, "ThreatModel", tm.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(tm)
    return tm


@router.delete("/models/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    tm = await db.get(ThreatModel, model_id)
    if not tm:
        raise HTTPException(404, "Threat model not found")
    if tm.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT threat models can be deleted")
    await audit(db, "ThreatModel", tm.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(tm)
    await db.commit()


# ── Threat CRUD (scoped to a parent model) ────────────────────────────────────

@router.post("/models/{model_id}/threats", response_model=ThreatRead, status_code=201)
async def add_threat(
    model_id: uuid.UUID, body: ThreatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    tm = await db.get(ThreatModel, model_id)
    if not tm:
        raise HTTPException(404, "Threat model not found")
    _assert_editable(tm)
    t = Threat(threat_model_id=tm.id, **body.model_dump())
    db.add(t)
    await db.flush()
    await audit(db, "Threat", t.id, AuditAction.CREATE, current_user.user_id,
                f"{t.category}: {t.title}")
    await db.commit()
    await db.refresh(t)
    return t


@router.put("/threats/{threat_id}", response_model=ThreatRead)
async def update_threat(
    threat_id: uuid.UUID, body: ThreatUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    t = await db.get(Threat, threat_id)
    if not t:
        raise HTTPException(404, "Threat not found")
    tm = await db.get(ThreatModel, t.threat_model_id)
    if tm:
        _assert_editable(tm)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await audit(db, "Threat", t.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/threats/{threat_id}", status_code=204)
async def delete_threat(
    threat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    t = await db.get(Threat, threat_id)
    if not t:
        raise HTTPException(404, "Threat not found")
    tm = await db.get(ThreatModel, t.threat_model_id)
    if tm:
        _assert_editable(tm)
    await audit(db, "Threat", t.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(t)
    await db.commit()
