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
from .model import ProblemReport, ProblemLink, RootCause, CAPA, CAPAVerification, MaintenanceRecord
from .schema import (
    ProblemReportRead, ProblemReportCreate, ProblemReportUpdate, ProblemStatusTransition,
    ProblemLinkRead, ProblemLinkCreate,
    RootCauseRead, RootCauseCreate,
    CAPARead, CAPACreate, CAPAUpdate,
    CAPAVerificationRead, CAPAVerificationCreate,
    MaintenanceRecordRead, MaintenanceRecordCreate, MaintenanceRecordUpdate,
    CAPAReleaseCheck,
)

router = APIRouter(prefix="/capa", tags=["capa"])

VALID_PROBLEM_TRANSITIONS: dict[str, list[str]] = {
    "OPEN": ["INVESTIGATING"],
    "INVESTIGATING": ["RESOLVED", "OPEN"],
    "RESOLVED": ["CLOSED", "INVESTIGATING"],
    "CLOSED": [],
}

VALID_CAPA_TRANSITIONS: dict[str, list[str]] = {
    "OPEN": ["IN_PROGRESS"],
    "IN_PROGRESS": ["COMPLETED", "OPEN"],
    "COMPLETED": ["VERIFIED", "IN_PROGRESS"],
    "VERIFIED": [],
}


def _problem_read(p: ProblemReport) -> ProblemReportRead:
    return ProblemReportRead.model_validate(p)


# ── Problem Reports ───────────────────────────────────────────────────────────

@router.get("/problems", response_model=List[ProblemReportRead])
async def list_problems(
    project_id: str,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(ProblemReport).where(ProblemReport.project_id == uuid.UUID(project_id)).order_by(ProblemReport.created_at.desc())
    if status:
        q = q.where(ProblemReport.status == status)
    if severity:
        q = q.where(ProblemReport.severity == severity)
    rows = (await db.execute(q)).scalars().all()
    return [_problem_read(p) for p in rows]


@router.get("/problems/{problem_id}", response_model=ProblemReportRead)
async def get_problem(
    problem_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    return _problem_read(p)


@router.post("/problems", response_model=ProblemReportRead, status_code=201)
async def create_problem(
    body: ProblemReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_PROBLEM_REPORT")),
):
    p = ProblemReport(**body.model_dump())
    db.add(p)
    await db.flush()
    await audit(db, "ProblemReport", p.id, AuditAction.CREATE, current_user.user_id, f"{p.severity} {p.title}")
    await db.commit()
    await db.refresh(p)
    return _problem_read(p)


@router.put("/problems/{problem_id}", response_model=ProblemReportRead)
async def update_problem(
    problem_id: str,
    body: ProblemReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    if p.status == "CLOSED":
        raise HTTPException(400, "Closed problems cannot be edited")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    await audit(db, "ProblemReport", p.id, AuditAction.UPDATE, current_user.user_id, p.title)
    await db.commit()
    await db.refresh(p)
    return _problem_read(p)


@router.put("/problems/{problem_id}/status", response_model=ProblemReportRead)
async def transition_problem(
    problem_id: str,
    body: ProblemStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    allowed = VALID_PROBLEM_TRANSITIONS.get(p.status, [])
    if body.status not in allowed:
        raise HTTPException(400, f"Cannot transition from {p.status} to {body.status}. Allowed: {allowed}")

    if body.status == "CLOSED":
        if not p.root_causes:
            raise HTTPException(400, "Root cause must be identified before closing a problem")
        if not p.capas:
            raise HTTPException(400, "At least one CAPA must be defined before closing a problem")
        unverified = [c for c in p.capas if c.status != "VERIFIED"]
        if unverified:
            raise HTTPException(400, f"{len(unverified)} CAPA(s) not yet VERIFIED. All CAPAs must be verified before closing.")

    p.status = body.status
    await audit(db, "ProblemReport", p.id, AuditAction.UPDATE, current_user.user_id, f"status -> {body.status}")
    await db.commit()
    await db.refresh(p)
    return _problem_read(p)


@router.delete("/problems/{problem_id}", status_code=204)
async def delete_problem(
    problem_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_PROBLEM_REPORT")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    if p.status not in ("OPEN",):
        raise HTTPException(400, "Only OPEN problems can be deleted")
    p_id_val = p.id
    p_title = p.title
    await db.delete(p)
    await audit(db, "ProblemReport", p_id_val, AuditAction.DELETE, current_user.user_id, p_title)
    await db.commit()


# ── Problem Links ─────────────────────────────────────────────────────────────

@router.post("/problems/{problem_id}/links", response_model=ProblemLinkRead, status_code=201)
async def add_link(
    problem_id: str,
    body: ProblemLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    link = ProblemLink(problem_id=p.id, **body.model_dump())
    db.add(link)
    await db.flush()
    await audit(db, "ProblemLink", link.id, AuditAction.CREATE, current_user.user_id, f"problem={p.id} {body.linked_type}:{body.linked_id}")
    await db.commit()
    await db.refresh(link)
    return ProblemLinkRead.model_validate(link)


@router.delete("/links/{link_id}", status_code=204)
async def delete_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    link = (await db.execute(select(ProblemLink).where(ProblemLink.id == uuid.UUID(link_id)))).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link not found")
    link_id_val = link.id
    problem_id = link.problem_id
    await db.delete(link)
    await audit(db, "ProblemLink", link_id_val, AuditAction.DELETE, current_user.user_id, f"problem={problem_id}")
    await db.commit()


# ── Root Causes ───────────────────────────────────────────────────────────────

@router.post("/problems/{problem_id}/root-causes", response_model=RootCauseRead, status_code=201)
async def add_root_cause(
    problem_id: str,
    body: RootCauseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    if p.status == "CLOSED":
        raise HTTPException(400, "Cannot modify a closed problem")
    rc = RootCause(problem_id=p.id, **body.model_dump())
    db.add(rc)
    await db.flush()
    await audit(db, "RootCause", rc.id, AuditAction.CREATE, current_user.user_id, f"problem={p.id}")
    await db.commit()
    await db.refresh(rc)
    return RootCauseRead.model_validate(rc)


@router.delete("/root-causes/{rc_id}", status_code=204)
async def delete_root_cause(
    rc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    rc = (await db.execute(select(RootCause).where(RootCause.id == uuid.UUID(rc_id)))).scalar_one_or_none()
    if not rc:
        raise HTTPException(404, "Root cause not found")
    rc_id_val = rc.id
    problem_id = rc.problem_id
    await db.delete(rc)
    await audit(db, "RootCause", rc_id_val, AuditAction.DELETE, current_user.user_id, f"problem={problem_id}")
    await db.commit()


# ── CAPAs ─────────────────────────────────────────────────────────────────────

@router.post("/problems/{problem_id}/capas", response_model=CAPARead, status_code=201)
async def create_capa(
    problem_id: str,
    body: CAPACreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_CAPA")),
):
    p = (await db.execute(select(ProblemReport).where(ProblemReport.id == uuid.UUID(problem_id)))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Problem report not found")
    if p.status == "CLOSED":
        raise HTTPException(400, "Cannot add CAPA to a closed problem")
    capa = CAPA(problem_id=p.id, **body.model_dump())
    db.add(capa)
    await db.flush()
    await audit(db, "CAPA", capa.id, AuditAction.CREATE, current_user.user_id, f"problem={p.id} {capa.action_type}")
    await db.commit()
    await db.refresh(capa)
    return CAPARead.model_validate(capa)


@router.put("/capas/{capa_id}", response_model=CAPARead)
async def update_capa(
    capa_id: str,
    body: CAPAUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_CAPA")),
):
    capa = (await db.execute(select(CAPA).where(CAPA.id == uuid.UUID(capa_id)))).scalar_one_or_none()
    if not capa:
        raise HTTPException(404, "CAPA not found")
    if capa.status == "VERIFIED":
        raise HTTPException(400, "Verified CAPAs cannot be modified")
    if "status" in body.model_dump(exclude_none=True):
        allowed = VALID_CAPA_TRANSITIONS.get(capa.status, [])
        if body.status and body.status not in allowed:
            raise HTTPException(400, f"Cannot transition CAPA from {capa.status} to {body.status}. Allowed: {allowed}")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(capa, k, v)
    await audit(db, "CAPA", capa.id, AuditAction.UPDATE, current_user.user_id, f"status={capa.status}")
    await db.commit()
    await db.refresh(capa)
    return CAPARead.model_validate(capa)


@router.delete("/capas/{capa_id}", status_code=204)
async def delete_capa(
    capa_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_CAPA")),
):
    capa = (await db.execute(select(CAPA).where(CAPA.id == uuid.UUID(capa_id)))).scalar_one_or_none()
    if not capa:
        raise HTTPException(404, "CAPA not found")
    if capa.status not in ("OPEN",):
        raise HTTPException(400, "Only OPEN CAPAs can be deleted")
    capa_id_val = capa.id
    await db.delete(capa)
    await audit(db, "CAPA", capa_id_val, AuditAction.DELETE, current_user.user_id, None)
    await db.commit()


# ── CAPA Verifications ────────────────────────────────────────────────────────

@router.post("/capas/{capa_id}/verifications", response_model=CAPAVerificationRead, status_code=201)
async def add_verification(
    capa_id: str,
    body: CAPAVerificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("VERIFY_CAPA")),
):
    capa = (await db.execute(select(CAPA).where(CAPA.id == uuid.UUID(capa_id)))).scalar_one_or_none()
    if not capa:
        raise HTTPException(404, "CAPA not found")
    if capa.status not in ("COMPLETED", "VERIFIED"):
        raise HTTPException(400, "CAPA must be COMPLETED before adding a verification")
    v = CAPAVerification(capa_id=capa.id, **body.model_dump())
    db.add(v)
    # auto-advance status if PASS
    if body.result == "PASS":
        capa.status = "VERIFIED"
    await db.flush()
    await audit(db, "CAPAVerification", v.id, AuditAction.CREATE, current_user.user_id, f"capa={capa.id} {body.result}")
    await db.commit()
    await db.refresh(v)
    return CAPAVerificationRead.model_validate(v)


@router.delete("/verifications/{v_id}", status_code=204)
async def delete_verification(
    v_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("VERIFY_CAPA")),
):
    v = (await db.execute(select(CAPAVerification).where(CAPAVerification.id == uuid.UUID(v_id)))).scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Verification not found")
    v_id_val = v.id
    capa_id = v.capa_id
    await db.delete(v)
    await audit(db, "CAPAVerification", v_id_val, AuditAction.DELETE, current_user.user_id, f"capa={capa_id}")
    await db.commit()


# ── Maintenance Records ───────────────────────────────────────────────────────

@router.get("/maintenance", response_model=List[MaintenanceRecordRead])
async def list_maintenance(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    rows = (await db.execute(
        select(MaintenanceRecord).where(MaintenanceRecord.project_id == uuid.UUID(project_id)).order_by(MaintenanceRecord.created_at.desc())
    )).scalars().all()
    return [MaintenanceRecordRead.model_validate(r) for r in rows]


@router.post("/maintenance", response_model=MaintenanceRecordRead, status_code=201)
async def create_maintenance(
    body: MaintenanceRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    rec = MaintenanceRecord(**body.model_dump())
    db.add(rec)
    await db.flush()
    await audit(db, "MaintenanceRecord", rec.id, AuditAction.CREATE, current_user.user_id, None)
    await db.commit()
    await db.refresh(rec)
    return MaintenanceRecordRead.model_validate(rec)


@router.put("/maintenance/{rec_id}", response_model=MaintenanceRecordRead)
async def update_maintenance(
    rec_id: str,
    body: MaintenanceRecordUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    rec = (await db.execute(select(MaintenanceRecord).where(MaintenanceRecord.id == uuid.UUID(rec_id)))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Maintenance record not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(rec, k, v)
    await audit(db, "MaintenanceRecord", rec.id, AuditAction.UPDATE, current_user.user_id, None)
    await db.commit()
    await db.refresh(rec)
    return MaintenanceRecordRead.model_validate(rec)


@router.delete("/maintenance/{rec_id}", status_code=204)
async def delete_maintenance(
    rec_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_PROBLEM_REPORT")),
):
    rec = (await db.execute(select(MaintenanceRecord).where(MaintenanceRecord.id == uuid.UUID(rec_id)))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Maintenance record not found")
    rec_id_val = rec.id
    await db.delete(rec)
    await audit(db, "MaintenanceRecord", rec_id_val, AuditAction.DELETE, current_user.user_id, None)
    await db.commit()


# ── Release gate ──────────────────────────────────────────────────────────────

@router.get("/release-check/{project_id}", response_model=CAPAReleaseCheck)
async def capa_release_check(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    pid = uuid.UUID(project_id)
    reasons: list[str] = []

    problems = (await db.execute(
        select(ProblemReport).where(ProblemReport.project_id == pid)
    )).scalars().all()

    # unresolved CRITICAL severity problems
    unresolved_critical = [p for p in problems if p.severity == "CRITICAL" and p.status not in ("RESOLVED", "CLOSED")]
    has_critical = len(unresolved_critical) > 0
    if has_critical:
        reasons.append(f"{len(unresolved_critical)} unresolved CRITICAL problem(s)")

    # open CAPAs (not yet verified) across all problems
    all_capas: list[CAPA] = []
    for p in problems:
        all_capas.extend(p.capas)

    open_capas = [c for c in all_capas if c.status in ("OPEN", "IN_PROGRESS")]
    has_open = len(open_capas) > 0
    if has_open:
        reasons.append(f"{len(open_capas)} CAPA(s) still open/in-progress")

    unverified_capas = [c for c in all_capas if c.status == "COMPLETED"]
    has_unverified = len(unverified_capas) > 0
    if has_unverified:
        reasons.append(f"{len(unverified_capas)} CAPA(s) completed but not verified")

    return CAPAReleaseCheck(
        has_open_capas=has_open,
        has_unverified_capas=has_unverified,
        has_unresolved_critical=has_critical,
        is_blocked=len(reasons) > 0,
        block_reasons=reasons,
    )
