import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import get_current_user, require_permission, require_permission
from app.modules.platform.auth.schema import TokenData

from .model import SoftwareDevelopmentPlan, SDPSection, SDPLifecyclePhase, SDPProjectRole
from .schema import (
    SDPCreate, SDPRead, SDPSummary, SDPUpdate, SDPStatusTransition, SDPTransitionResult,
    SDPSectionCreate, SDPSectionRead, SDPSectionUpdate,
    SDPPhaseCreate, SDPPhaseRead, SDPPhaseUpdate,
    SDPRoleCreate, SDPRoleRead, SDPRoleUpdate,
    SDPComplianceCheck, SDPComplianceStatus,
)
from .defaults import build_sections, PHASES, ROLES
from app.core.approval_signoff import check_independence

router = APIRouter(prefix="/sdp", tags=["sdp"])

# ── Status transition rules ───────────────────────────────────────────────────
VALID_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT":     {"IN_REVIEW"},
    "IN_REVIEW": {"APPROVED", "DRAFT"},
    "APPROVED":  {"OBSOLETE"},
    "OBSOLETE":  set(),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_editable(sdp: SoftwareDevelopmentPlan) -> None:
    if sdp.status not in ("DRAFT", "IN_REVIEW"):
        raise HTTPException(400, f"SDP v{sdp.version} is {sdp.status} and cannot be edited. Use /fork to create a new version.")


def _next_version(current: str) -> str:
    """Increment minor version: '1.0' → '1.1', '2.3' → '2.4'."""
    try:
        parts = current.split(".")
        if len(parts) == 2:
            return f"{parts[0]}.{int(parts[1]) + 1}"
        return f"{current}.1"
    except (ValueError, IndexError):
        return f"{current}.1"


async def _seed_defaults(db: AsyncSession, sdp: SoftwareDevelopmentPlan) -> None:
    """Populate sections, phases, and roles from IEC 62304-aligned defaults."""
    safety_class = sdp.safety_class

    for s in build_sections(sdp.lifecycle_model):
        db.add(SDPSection(sdp_id=sdp.id, **s))

    for p in PHASES:
        if safety_class in p["required_for_class"]:
            db.add(SDPLifecyclePhase(sdp_id=sdp.id, **p))

    for r in ROLES:
        if safety_class in r["required_for_class"]:
            db.add(SDPProjectRole(sdp_id=sdp.id, **r))


# ── SDP CRUD ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[SDPSummary])
async def list_sdps(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return all SDP versions for a project, newest first."""
    result = await db.execute(
        select(SoftwareDevelopmentPlan)
        .where(SoftwareDevelopmentPlan.project_id == project_id)
        .order_by(SoftwareDevelopmentPlan.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=SDPRead, status_code=201)
async def create_sdp(
    payload: SDPCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_SDP")),
):
    """Create a new SDP version and seed default content."""
    sdp = SoftwareDevelopmentPlan(**payload.model_dump())
    db.add(sdp)
    await db.flush()
    await _seed_defaults(db, sdp)
    await audit(db, "sdp", sdp.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(sdp)
    return sdp


@router.get("/active/{project_id}", response_model=SDPRead | None)
async def get_active_sdp(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return the current APPROVED SDP for a project (used by enforcement checks)."""
    result = await db.execute(
        select(SoftwareDevelopmentPlan).where(
            SoftwareDevelopmentPlan.project_id == project_id,
            SoftwareDevelopmentPlan.status == "APPROVED",
        ).order_by(SoftwareDevelopmentPlan.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/{sdp_id}", response_model=SDPRead)
async def get_sdp(sdp_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    return sdp


@router.put("/{sdp_id}", response_model=SDPRead)
async def update_sdp(
    sdp_id: uuid.UUID,
    payload: SDPUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    _assert_editable(sdp)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(sdp, k, v)
    await audit(db, "sdp", sdp.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(sdp)
    return sdp


@router.delete("/{sdp_id}", status_code=204)
async def delete_sdp(
    sdp_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    if sdp.status == "APPROVED":
        raise HTTPException(400, "Approved SDPs cannot be deleted — set to OBSOLETE instead")
    await audit(db, "sdp", sdp.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(sdp)
    await db.commit()


# ── Fork (create new version) ─────────────────────────────────────────────────

@router.post("/{sdp_id}/fork", response_model=SDPRead, status_code=201)
async def fork_sdp(
    sdp_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_SDP")),
):
    """
    Create a new DRAFT version based on an existing SDP.
    Copies all sections, phases, and roles.
    Used when needing to revise an APPROVED SDP.
    """
    source = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not source:
        raise HTTPException(404, "SDP not found")

    new_version = _next_version(source.version)

    # Check version doesn't already exist
    existing = (await db.execute(
        select(SoftwareDevelopmentPlan).where(
            SoftwareDevelopmentPlan.project_id == source.project_id,
            SoftwareDevelopmentPlan.version == new_version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"SDP version {new_version} already exists for this project")

    fork = SoftwareDevelopmentPlan(
        project_id=source.project_id,
        version=new_version,
        status="DRAFT",
        lifecycle_model=source.lifecycle_model,
        safety_class=source.safety_class,
        title=source.title,
        description=source.description,
        created_by=source.created_by,
    )
    db.add(fork)
    await db.flush()

    # Copy sections
    for s in source.sections:
        db.add(SDPSection(
            sdp_id=fork.id,
            section_number=s.section_number,
            section_name=s.section_name,
            content=s.content,
            sort_order=s.sort_order,
        ))

    # Copy phases
    for p in source.phases:
        db.add(SDPLifecyclePhase(
            sdp_id=fork.id,
            phase_name=p.phase_name,
            phase_order=p.phase_order,
            entry_criteria=p.entry_criteria,
            exit_criteria=p.exit_criteria,
            activities=p.activities,
            required_for_class=p.required_for_class,
        ))

    # Copy roles
    for r in source.roles:
        db.add(SDPProjectRole(
            sdp_id=fork.id,
            role_name=r.role_name,
            responsibilities=r.responsibilities,
            required_for_class=r.required_for_class,
            sort_order=r.sort_order,
        ))

    await audit(db, "sdp", fork.id, AuditAction.CREATE, current_user.user_id, f"Forked from v{source.version}")
    await db.commit()
    await db.refresh(fork)
    return fork


# ── Status transition ─────────────────────────────────────────────────────────

@router.put("/{sdp_id}/status", response_model=SDPTransitionResult)
async def transition_status(
    sdp_id: uuid.UUID,
    payload: SDPStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("APPROVE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")

    allowed = VALID_TRANSITIONS.get(sdp.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition from {sdp.status} to {payload.status}. "
            f"Allowed: {list(allowed)}",
        )

    warnings: list[str] = []
    now = datetime.now(timezone.utc)

    # DRAFT → IN_REVIEW: capture "Prepared by"
    if payload.status == "IN_REVIEW":
        sdp.prepared_by = payload.prepared_by or sdp.prepared_by or (current_user.user_id and str(current_user.user_id))
        sdp.prepared_at = sdp.prepared_at or now

    # IN_REVIEW → APPROVED: capture "Reviewed by" + "Approved by"
    if payload.status == "APPROVED":
        compliance = await _check_approval_readiness(sdp)
        if not compliance.is_ready_for_approval:
            failed = [c.label for c in compliance.checks if not c.satisfied]
            raise HTTPException(400, f"Cannot approve: {'; '.join(failed)}")
        if not payload.reviewed_by:
            raise HTTPException(400, "reviewed_by is required to approve an SDP")
        sdp.reviewed_by = payload.reviewed_by
        sdp.reviewed_at = now
        sdp.approved_by = payload.approved_by or (current_user.user_id and str(current_user.user_id))
        sdp.approved_at = now
        warning = check_independence(sdp.reviewed_by, sdp.approved_by)
        if warning:
            warnings.append(warning)

        # Obsolete all other approved SDPs for this project
        await db.execute(
            update(SoftwareDevelopmentPlan)
            .where(
                SoftwareDevelopmentPlan.project_id == sdp.project_id,
                SoftwareDevelopmentPlan.id != sdp_id,
                SoftwareDevelopmentPlan.status == "APPROVED",
            )
            .values(status="OBSOLETE")
        )

    if payload.review_notes is not None:
        sdp.review_notes = payload.review_notes

    prev_status = sdp.status
    sdp.status = payload.status
    await audit(db, "sdp", sdp.id, AuditAction.UPDATE, current_user.user_id, f"Status: {prev_status} → {payload.status}")
    await db.commit()
    await db.refresh(sdp)
    return SDPTransitionResult(sdp=SDPRead.model_validate(sdp), warnings=warnings)


# ── Compliance / approval readiness ──────────────────────────────────────────

async def _check_approval_readiness(sdp: SoftwareDevelopmentPlan) -> SDPComplianceStatus:
    checks: list[SDPComplianceCheck] = []

    checks.append(SDPComplianceCheck(
        rule="has_sections",
        label="At least one section exists",
        satisfied=len(sdp.sections) > 0,
        detail=f"{len(sdp.sections)} section(s) defined",
    ))

    content_missing = [s.section_name for s in sdp.sections if not (s.content or "").strip()]
    checks.append(SDPComplianceCheck(
        rule="sections_have_content",
        label="All sections have content",
        satisfied=len(content_missing) == 0,
        detail="All sections populated" if not content_missing
               else f"Empty sections: {', '.join(content_missing[:3])}{'…' if len(content_missing) > 3 else ''}",
    ))

    checks.append(SDPComplianceCheck(
        rule="has_phases",
        label="Lifecycle phases defined",
        satisfied=len(sdp.phases) > 0,
        detail=f"{len(sdp.phases)} phase(s) defined",
    ))

    phases_missing_criteria = [
        p.phase_name for p in sdp.phases
        if not (p.entry_criteria or "").strip() or not (p.exit_criteria or "").strip()
    ]
    checks.append(SDPComplianceCheck(
        rule="phases_have_criteria",
        label="All phases have entry and exit criteria",
        satisfied=len(phases_missing_criteria) == 0,
        detail="All phases have criteria" if not phases_missing_criteria
               else f"Missing criteria: {', '.join(phases_missing_criteria[:3])}",
    ))

    checks.append(SDPComplianceCheck(
        rule="has_roles",
        label="Project roles defined",
        satisfied=len(sdp.roles) > 0,
        detail=f"{len(sdp.roles)} role(s) defined",
    ))

    checks.append(SDPComplianceCheck(
        rule="has_approver",
        label="Approved-by name provided",
        satisfied=bool(sdp.approved_by or sdp.review_notes),
        detail="Approver name or review notes present" if (sdp.approved_by or sdp.review_notes)
               else "Set approved_by in the approval request",
    ))

    return SDPComplianceStatus(
        sdp_id=sdp.id,
        is_ready_for_approval=all(c.satisfied for c in checks),
        checks=checks,
    )


@router.get("/{sdp_id}/compliance", response_model=SDPComplianceStatus)
async def get_compliance(sdp_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    return await _check_approval_readiness(sdp)


# ── Sections ──────────────────────────────────────────────────────────────────

@router.post("/{sdp_id}/sections", response_model=SDPSectionRead, status_code=201)
async def add_section(
    sdp_id: uuid.UUID,
    payload: SDPSectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    _assert_editable(sdp)
    section = SDPSection(sdp_id=sdp_id, **payload.model_dump())
    db.add(section)
    await db.flush()
    await audit(db, "sdp_section", section.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(section)
    return section


@router.put("/sections/{section_id}", response_model=SDPSectionRead)
async def update_section(
    section_id: uuid.UUID,
    payload: SDPSectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    section = await db.get(SDPSection, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    sdp = await db.get(SoftwareDevelopmentPlan, section.sdp_id)
    if sdp:
        _assert_editable(sdp)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(section, k, v)
    await audit(db, "sdp_section", section.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=204)
async def delete_section(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    section = await db.get(SDPSection, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    sdp = await db.get(SoftwareDevelopmentPlan, section.sdp_id)
    if sdp:
        _assert_editable(sdp)
    await audit(db, "sdp_section", section.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(section)
    await db.commit()


# ── Lifecycle phases ──────────────────────────────────────────────────────────

@router.post("/{sdp_id}/phases", response_model=SDPPhaseRead, status_code=201)
async def add_phase(
    sdp_id: uuid.UUID,
    payload: SDPPhaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    _assert_editable(sdp)
    phase = SDPLifecyclePhase(sdp_id=sdp_id, **payload.model_dump())
    db.add(phase)
    await db.flush()
    await audit(db, "sdp_phase", phase.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.put("/phases/{phase_id}", response_model=SDPPhaseRead)
async def update_phase(
    phase_id: uuid.UUID,
    payload: SDPPhaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    phase = await db.get(SDPLifecyclePhase, phase_id)
    if not phase:
        raise HTTPException(404, "Phase not found")
    sdp = await db.get(SoftwareDevelopmentPlan, phase.sdp_id)
    if sdp:
        _assert_editable(sdp)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(phase, k, v)
    await audit(db, "sdp_phase", phase.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.delete("/phases/{phase_id}", status_code=204)
async def delete_phase(
    phase_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    phase = await db.get(SDPLifecyclePhase, phase_id)
    if not phase:
        raise HTTPException(404, "Phase not found")
    sdp = await db.get(SoftwareDevelopmentPlan, phase.sdp_id)
    if sdp:
        _assert_editable(sdp)
    await audit(db, "sdp_phase", phase.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(phase)
    await db.commit()


# ── Project roles ─────────────────────────────────────────────────────────────

@router.post("/{sdp_id}/roles", response_model=SDPRoleRead, status_code=201)
async def add_role(
    sdp_id: uuid.UUID,
    payload: SDPRoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    sdp = await db.get(SoftwareDevelopmentPlan, sdp_id)
    if not sdp:
        raise HTTPException(404, "SDP not found")
    _assert_editable(sdp)
    role = SDPProjectRole(sdp_id=sdp_id, **payload.model_dump())
    db.add(role)
    await db.flush()
    await audit(db, "sdp_role", role.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(role)
    return role


@router.put("/roles/{role_id}", response_model=SDPRoleRead)
async def update_role(
    role_id: uuid.UUID,
    payload: SDPRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    role = await db.get(SDPProjectRole, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    sdp = await db.get(SoftwareDevelopmentPlan, role.sdp_id)
    if sdp:
        _assert_editable(sdp)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(role, k, v)
    await audit(db, "sdp_role", role.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SDP")),
):
    role = await db.get(SDPProjectRole, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    sdp = await db.get(SoftwareDevelopmentPlan, role.sdp_id)
    if sdp:
        _assert_editable(sdp)
    await audit(db, "sdp_role", role.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(role)
    await db.commit()
