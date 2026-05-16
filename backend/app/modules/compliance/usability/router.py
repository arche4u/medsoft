"""IEC 62366-1 Usability Engineering File — CRUD + escalation.

Three nested entities:
  - UsabilityFile (one per project, versioned)
    - UseScenario (n per file)
      - UseError (n per scenario, optionally escalated to §7 Risk)

Standard CRUD with RBAC + audit. APPROVED files are read-only — fork
to a new version to record additions. Use Errors escalate to a §7 Risk
with risk_class=USABILITY (the unified register's open-vocab `risk_class`
field already accepts new values without a schema change).
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
from app.modules.compliance.risk.risks.model import Risk
from app.modules.compliance.dev.requirements.model import Requirement
from .model import UsabilityFile, UseScenario, UseError
from .schema import (
    UsabilityFileCreate, UsabilityFileUpdate, UsabilityFileRead,
    UseScenarioCreate, UseScenarioUpdate, UseScenarioRead,
    UseErrorCreate, UseErrorUpdate, UseErrorRead, UseErrorEscalate,
)

router = APIRouter(prefix="/usability", tags=["usability"])


def _assert_editable(f: UsabilityFile) -> None:
    if f.status not in ("DRAFT", "IN_REVIEW"):
        raise HTTPException(
            400,
            f"Usability File v{f.version} is {f.status} and read-only. "
            f"Fork to a new version to record additions.",
        )


# ── UsabilityFile CRUD ────────────────────────────────────────────────────────

@router.get("/files", response_model=list[UsabilityFileRead])
async def list_files(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(UsabilityFile).where(UsabilityFile.project_id == project_id)
        .order_by(UsabilityFile.created_at.desc())
    )
    return res.scalars().all()


@router.get("/files/{file_id}", response_model=UsabilityFileRead)
async def get_file(file_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    f = await db.get(UsabilityFile, file_id)
    if not f:
        raise HTTPException(404, "Usability File not found")
    return f


@router.post("/files", response_model=UsabilityFileRead, status_code=201)
async def create_file(
    body: UsabilityFileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    f = UsabilityFile(**body.model_dump())
    db.add(f)
    await db.flush()
    await audit(db, "UsabilityFile", f.id, AuditAction.CREATE, current_user.user_id,
                f"{f.name} v{f.version}")
    await db.commit()
    await db.refresh(f)
    return f


@router.put("/files/{file_id}", response_model=UsabilityFileRead)
async def update_file(
    file_id: uuid.UUID, body: UsabilityFileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    f = await db.get(UsabilityFile, file_id)
    if not f:
        raise HTTPException(404, "Usability File not found")
    updates = body.model_dump(exclude_unset=True)
    # Status changes are allowed on APPROVED files (to OBSOLETE); other edits
    # require an editable file.
    if any(k != "status" for k in updates):
        _assert_editable(f)
    new_status = updates.get("status")
    if new_status == "APPROVED" and f.status != "APPROVED":
        f.approved_by_id = current_user.user_id
        f.approved_at = datetime.now(timezone.utc)
    for k, v in updates.items():
        setattr(f, k, v)
    await audit(db, "UsabilityFile", f.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(f)
    return f


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    f = await db.get(UsabilityFile, file_id)
    if not f:
        raise HTTPException(404, "Usability File not found")
    if f.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT Usability Files can be deleted")
    await audit(db, "UsabilityFile", f.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(f)
    await db.commit()


# ── UseScenario CRUD ──────────────────────────────────────────────────────────

@router.post("/files/{file_id}/scenarios", response_model=UseScenarioRead, status_code=201)
async def add_scenario(
    file_id: uuid.UUID, body: UseScenarioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    f = await db.get(UsabilityFile, file_id)
    if not f:
        raise HTTPException(404, "Usability File not found")
    _assert_editable(f)
    s = UseScenario(usability_file_id=f.id, **body.model_dump())
    db.add(s)
    await db.flush()
    await audit(db, "UseScenario", s.id, AuditAction.CREATE, current_user.user_id, s.name)
    await db.commit()
    await db.refresh(s)
    return s


@router.put("/scenarios/{scenario_id}", response_model=UseScenarioRead)
async def update_scenario(
    scenario_id: uuid.UUID, body: UseScenarioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    s = await db.get(UseScenario, scenario_id)
    if not s:
        raise HTTPException(404, "Use Scenario not found")
    f = await db.get(UsabilityFile, s.usability_file_id)
    if f:
        _assert_editable(f)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    await audit(db, "UseScenario", s.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(s)
    return s


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    s = await db.get(UseScenario, scenario_id)
    if not s:
        raise HTTPException(404, "Use Scenario not found")
    f = await db.get(UsabilityFile, s.usability_file_id)
    if f:
        _assert_editable(f)
    await audit(db, "UseScenario", s.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(s)
    await db.commit()


# ── UseError CRUD + escalation ────────────────────────────────────────────────

@router.post("/scenarios/{scenario_id}/errors", response_model=UseErrorRead, status_code=201)
async def add_use_error(
    scenario_id: uuid.UUID, body: UseErrorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    s = await db.get(UseScenario, scenario_id)
    if not s:
        raise HTTPException(404, "Use Scenario not found")
    f = await db.get(UsabilityFile, s.usability_file_id)
    if f:
        _assert_editable(f)
    e = UseError(scenario_id=s.id, **body.model_dump())
    db.add(e)
    await db.flush()
    await audit(db, "UseError", e.id, AuditAction.CREATE, current_user.user_id, e.description)
    await db.commit()
    await db.refresh(e)
    return e


@router.put("/errors/{error_id}", response_model=UseErrorRead)
async def update_use_error(
    error_id: uuid.UUID, body: UseErrorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    e = await db.get(UseError, error_id)
    if not e:
        raise HTTPException(404, "Use Error not found")
    s = await db.get(UseScenario, e.scenario_id)
    if s:
        f = await db.get(UsabilityFile, s.usability_file_id)
        if f:
            _assert_editable(f)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    await audit(db, "UseError", e.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(e)
    return e


@router.delete("/errors/{error_id}", status_code=204)
async def delete_use_error(
    error_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    e = await db.get(UseError, error_id)
    if not e:
        raise HTTPException(404, "Use Error not found")
    s = await db.get(UseScenario, e.scenario_id)
    if s:
        f = await db.get(UsabilityFile, s.usability_file_id)
        if f:
            _assert_editable(f)
    await audit(db, "UseError", e.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(e)
    await db.commit()


@router.post("/errors/{error_id}/escalate", response_model=UseErrorRead)
async def escalate_use_error(
    error_id: uuid.UUID, body: UseErrorEscalate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    """Create a §7 Risk with risk_class=USABILITY linked to this use error.

    Mirrors the vulnerability escalation pattern: triager picks the target
    requirement, severity/probability use the 1-5 scale, the back-FK is set
    so auditors can walk Use Error ↔ Risk in both directions.
    """
    e = await db.get(UseError, error_id)
    if not e:
        raise HTTPException(404, "Use Error not found")
    if e.escalated_risk_id:
        raise HTTPException(400, "Use Error already escalated to a §7 Risk")
    s = await db.get(UseScenario, e.scenario_id)
    f = await db.get(UsabilityFile, s.usability_file_id) if s else None
    if not f:
        raise HTTPException(400, "Parent usability file resolution failed")

    req = await db.get(Requirement, body.requirement_id)
    if not req:
        raise HTTPException(400, "Target requirement not found")
    if req.project_id != f.project_id:
        raise HTTPException(400, "Target requirement belongs to a different project")

    risk = Risk(
        requirement_id=req.id,
        risk_class="USABILITY",
        hazard=f"Use error: {e.description}"[:500],
        hazardous_situation=(body.hazardous_situation or e.potential_harm or e.description)[:500],
        severity=body.severity,
        probability=body.probability,
    )
    db.add(risk)
    await db.flush()
    e.escalated_risk_id = risk.id
    await audit(db, "Risk", risk.id, AuditAction.CREATE, current_user.user_id,
                f"Escalated from use error: {e.description}")
    await audit(db, "UseError", e.id, AuditAction.UPDATE, current_user.user_id,
                f"Escalated → Risk {risk.id}")
    await db.commit()
    await db.refresh(e)
    return e
