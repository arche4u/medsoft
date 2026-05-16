"""IEC 81001-5-1 Vulnerability Intake — CRUD + escalation to §7 Risk."""
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
from .model import VulnerabilityReport
from .schema import (
    VulnerabilityCreate, VulnerabilityUpdate, VulnerabilityRead,
    VulnerabilityEscalate,
)

router = APIRouter(prefix="/vulnerabilities", tags=["cybersecurity"])


# ── Vulnerability CRUD ────────────────────────────────────────────────────────

@router.get("/", response_model=list[VulnerabilityRead])
async def list_vulnerabilities(
    project_id: uuid.UUID,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(VulnerabilityReport).where(VulnerabilityReport.project_id == project_id)
    if status:
        q = q.where(VulnerabilityReport.status == status)
    res = await db.execute(q.order_by(VulnerabilityReport.created_at.desc()))
    return res.scalars().all()


@router.get("/{vuln_id}", response_model=VulnerabilityRead)
async def get_vulnerability(vuln_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    v = await db.get(VulnerabilityReport, vuln_id)
    if not v:
        raise HTTPException(404, "Vulnerability not found")
    return v


@router.post("/", response_model=VulnerabilityRead, status_code=201)
async def create_vulnerability(
    body: VulnerabilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    v = VulnerabilityReport(**body.model_dump())
    db.add(v)
    await db.flush()
    await audit(db, "VulnerabilityReport", v.id, AuditAction.CREATE, current_user.user_id,
                f"{v.cve_id or '(internal)'}: {v.title}")
    await db.commit()
    await db.refresh(v)
    return v


@router.put("/{vuln_id}", response_model=VulnerabilityRead)
async def update_vulnerability(
    vuln_id: uuid.UUID, body: VulnerabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    v = await db.get(VulnerabilityReport, vuln_id)
    if not v:
        raise HTTPException(404, "Vulnerability not found")
    updates = body.model_dump(exclude_unset=True)
    # Mark `triaged_*` automatically when status moves out of NEW.
    if updates.get("status") and updates["status"] != "NEW" and not v.triaged_at:
        v.triaged_by_id = current_user.user_id
        v.triaged_at = datetime.now(timezone.utc)
    for k, val in updates.items():
        setattr(v, k, val)
    await audit(db, "VulnerabilityReport", v.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(v)
    return v


@router.delete("/{vuln_id}", status_code=204)
async def delete_vulnerability(
    vuln_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    v = await db.get(VulnerabilityReport, vuln_id)
    if not v:
        raise HTTPException(404, "Vulnerability not found")
    if v.escalated_risk_id:
        raise HTTPException(
            400,
            "Cannot delete a vulnerability that has been escalated to the §7 risk "
            "register. Delete or reclassify the linked Risk first.",
        )
    await audit(db, "VulnerabilityReport", v.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(v)
    await db.commit()


# ── Escalation to §7 Risk (risk_class=SECURITY) ──────────────────────────────

@router.post("/{vuln_id}/escalate", response_model=VulnerabilityRead)
async def escalate_vulnerability(
    vuln_id: uuid.UUID, body: VulnerabilityEscalate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    """Create a §7 Risk with risk_class=SECURITY linked to this vulnerability.

    The triager picks the target requirement (Risk.requirement_id is NOT NULL).
    The vulnerability's escalated_risk_id back-FK is set so the trail is
    bidirectional. Idempotent: re-running on an already-escalated row is a 400.
    """
    v = await db.get(VulnerabilityReport, vuln_id)
    if not v:
        raise HTTPException(404, "Vulnerability not found")
    if v.escalated_risk_id:
        raise HTTPException(400, "Vulnerability already escalated to a §7 Risk")

    req = await db.get(Requirement, body.requirement_id)
    if not req:
        raise HTTPException(400, "Target requirement not found")
    if req.project_id != v.project_id:
        raise HTTPException(400, "Target requirement belongs to a different project")

    hazard = f"Cybersecurity vulnerability: {v.cve_id or v.title}"
    risk = Risk(
        requirement_id=req.id,
        risk_class="SECURITY",
        hazard=hazard[:500],
        hazardous_situation=(body.hazardous_situation or v.description or v.title)[:500],
        severity=body.severity,
        probability=body.probability,
    )
    db.add(risk)
    await db.flush()
    v.escalated_risk_id = risk.id
    if not v.triaged_at:
        v.triaged_by_id = current_user.user_id
        v.triaged_at = datetime.now(timezone.utc)
    await audit(db, "Risk", risk.id, AuditAction.CREATE, current_user.user_id,
                f"Escalated from vulnerability {v.cve_id or v.title}")
    await audit(db, "VulnerabilityReport", v.id, AuditAction.UPDATE, current_user.user_id,
                f"Escalated → Risk {risk.id}")
    await db.commit()
    await db.refresh(v)
    return v
