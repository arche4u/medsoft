import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.compliance.dev.requirements.model import Requirement
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import get_current_user, require_permission
from app.modules.platform.auth.schema import TokenData
from .model import (
    Risk, RiskCategory, RiskControl, ResidualRisk, SoftwareSafetyProfile,
    RiskContribution, VerificationEvidence, _compute_level,
)
from .schema import (
    RiskCreate, RiskRead, RiskUpdate, RiskStatusUpdate,
    RiskCategoryCreate, RiskCategoryRead, RiskCategoryUpdate,
    RiskControlCreate, RiskControlRead, RiskControlUpdate,
    ResidualRiskUpsert, ResidualRiskRead,
    RiskDashboard, HeatmapCell,
    SafetyProfileCreate, SafetyProfileRead, SafetyProfileUpdate,
    RiskContributionCreate, RiskContributionRead,
    VerificationEvidenceCreate, VerificationEvidenceRead,
    RiskReEvaluate,
)

router = APIRouter(prefix="/risks", tags=["risks"])


# ── Risk Categories ───────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[RiskCategoryRead])
async def list_risk_categories(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    cats = (await db.execute(
        select(RiskCategory)
        .where(RiskCategory.project_id == project_id)
        .order_by(RiskCategory.sort_order, RiskCategory.name)
    )).scalars().all()
    return cats


@router.post("/categories", response_model=RiskCategoryRead, status_code=201)
async def create_risk_category(
    body: RiskCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    existing = (await db.execute(
        select(RiskCategory).where(
            RiskCategory.project_id == body.project_id,
            RiskCategory.name == body.name,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"A category named '{body.name}' already exists for this project")
    max_order = (await db.execute(
        select(RiskCategory.sort_order)
        .where(RiskCategory.project_id == body.project_id)
        .order_by(RiskCategory.sort_order.desc()).limit(1)
    )).scalar_one_or_none() or 0
    cat = RiskCategory(project_id=body.project_id, name=body.name, label=body.label,
                       color=body.color, is_builtin=False, sort_order=max_order + 1)
    db.add(cat)
    await db.flush()
    await audit(db, "RiskCategory", cat.id, AuditAction.CREATE, current_user.user_id, cat.name)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=RiskCategoryRead)
async def update_risk_category(
    category_id: uuid.UUID,
    body: RiskCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    cat = (await db.execute(
        select(RiskCategory).where(RiskCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await audit(db, "RiskCategory", cat.id, AuditAction.UPDATE, current_user.user_id, cat.name)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_risk_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_RISK")),
):
    cat = (await db.execute(
        select(RiskCategory).where(RiskCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.is_builtin:
        raise HTTPException(400, "Built-in risk categories cannot be deleted")
    cat_name = cat.name
    cat_id = cat.id
    await db.delete(cat)
    await audit(db, "RiskCategory", cat_id, AuditAction.DELETE, current_user.user_id, cat_name)
    await db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard/{project_id}", response_model=RiskDashboard)
async def get_risk_dashboard(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    req_ids = (await db.execute(
        select(Requirement.id).where(Requirement.project_id == project_id)
    )).scalars().all()

    risks = (await db.execute(
        select(Risk).where(Risk.requirement_id.in_(req_ids))
    )).scalars().all()

    by_level: dict[str, int] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    by_status: dict[str, int] = {}
    re_eval = 0
    heatmap_map: dict[tuple[int, int], int] = {}

    for r in risks:
        by_level[r.risk_level] = by_level.get(r.risk_level, 0) + 1
        by_status[r.status] = by_status.get(r.status, 0) + 1
        if r.re_evaluation_required:
            re_eval += 1
        key = (r.severity, r.probability)
        heatmap_map[key] = heatmap_map.get(key, 0) + 1

    heatmap = [HeatmapCell(severity=s, probability=p, count=c) for (s, p), c in heatmap_map.items()]

    risk_ids = [r.id for r in risks]
    controls_total = 0
    controls_verified = 0
    if risk_ids:
        controls = (await db.execute(
            select(RiskControl).where(RiskControl.risk_id.in_(risk_ids))
        )).scalars().all()
        controls_total = len(controls)
        controls_verified = sum(1 for c in controls if c.implementation_status == "VERIFIED")

    residual_accepted = 0
    if risk_ids:
        residuals = (await db.execute(
            select(ResidualRisk).where(
                ResidualRisk.risk_id.in_(risk_ids),
                ResidualRisk.is_accepted == True,
            )
        )).scalars().all()
        residual_accepted = len(residuals)

    return RiskDashboard(
        total=len(risks),
        by_level=by_level,
        by_status=by_status,
        re_evaluation_count=re_eval,
        heatmap=heatmap,
        controls_total=controls_total,
        controls_verified=controls_verified,
        residual_accepted=residual_accepted,
    )


# ── Safety Profile ─────────────────────────────────────────────────────────────

@router.get("/safety-profile/{project_id}", response_model=SafetyProfileRead | None)
async def get_safety_profile(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    result = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == project_id)
    )
    return result.scalar_one_or_none()


@router.post("/safety-profile", response_model=SafetyProfileRead, status_code=201)
async def create_safety_profile(
    payload: SafetyProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    existing = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == payload.project_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail="Safety profile already exists for this project. Use PUT to update.")
    profile = SoftwareSafetyProfile(**payload.model_dump())
    db.add(profile)
    await db.flush()
    await audit(
        db, "SoftwareSafetyProfile", profile.id, AuditAction.CREATE,
        current_user.user_id, f"class={profile.iec62304_class}",
    )
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/safety-profile/{project_id}", response_model=SafetyProfileRead)
async def update_safety_profile(
    project_id: uuid.UUID,
    payload: SafetyProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    result = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == project_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, detail="Safety profile not found. Use POST to create.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(profile, k, v)
    await audit(
        db, "SoftwareSafetyProfile", profile.id, AuditAction.UPDATE,
        current_user.user_id, f"class={profile.iec62304_class}",
    )
    await db.commit()
    await db.refresh(profile)
    return profile


# ── Risks CRUD ────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[RiskRead])
async def list_risks(
    requirement_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    risk_class: str | None = None,
    needs_reevaluation: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(Risk)
    if requirement_id:
        q = q.where(Risk.requirement_id == requirement_id)
    elif project_id:
        req_ids = (await db.execute(
            select(Requirement.id).where(Requirement.project_id == project_id)
        )).scalars().all()
        q = q.where(Risk.requirement_id.in_(req_ids))
    if risk_class:
        q = q.where(Risk.risk_class == risk_class)
    if needs_reevaluation is not None:
        q = q.where(Risk.re_evaluation_required == needs_reevaluation)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=RiskRead, status_code=201)
async def create_risk(
    payload: RiskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RISK")),
):
    risk = Risk(
        **payload.model_dump(),
        risk_level=_compute_level(payload.severity, payload.probability),
        status="OPEN",
    )
    db.add(risk)
    await db.flush()
    await audit(
        db, "Risk", risk.id, AuditAction.CREATE, current_user.user_id,
        f"{risk.risk_class} / S{risk.severity}xP{risk.probability}={risk.risk_level}",
    )
    await db.commit()
    await db.refresh(risk)
    return risk


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(
    risk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    return risk


@router.put("/{risk_id}", response_model=RiskRead)
async def update_risk(
    risk_id: uuid.UUID,
    payload: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(risk, k, v)
    risk.risk_level = _compute_level(risk.severity, risk.probability)
    await audit(
        db, "Risk", risk.id, AuditAction.UPDATE, current_user.user_id,
        f"S{risk.severity}xP{risk.probability}={risk.risk_level}",
    )
    await db.commit()
    await db.refresh(risk)
    return risk


@router.put("/{risk_id}/status", response_model=RiskRead)
async def update_risk_status(
    risk_id: uuid.UUID,
    payload: RiskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")

    new_status = payload.status

    # Validation rules (ISO 14971)
    if new_status == "CLOSED":
        if not risk.controls:
            raise HTTPException(400, "Cannot close: risk must have at least one control measure")
        unverified = [c for c in risk.controls if c.implementation_status != "VERIFIED"]
        if unverified:
            raise HTTPException(400, f"Cannot close: {len(unverified)} control(s) not yet verified")

    if new_status == "ACCEPTED":
        if not risk.residual_risk:
            raise HTTPException(400, "Cannot accept: residual risk must be evaluated first")
        if not risk.residual_risk.rationale:
            raise HTTPException(400, "Cannot accept: residual risk rationale is required")

    if new_status == "IN_CONTROL" and not risk.controls:
        raise HTTPException(400, "Cannot set IN_CONTROL: add at least one risk control first")

    # Clear re-evaluation flag when status is explicitly set
    if new_status not in ("RE_EVALUATION_REQUIRED",):
        risk.re_evaluation_required = False

    risk.status = new_status
    await audit(
        db, "Risk", risk.id, AuditAction.UPDATE, current_user.user_id,
        f"status -> {new_status}",
    )
    await db.commit()
    await db.refresh(risk)
    return risk


@router.delete("/{risk_id}", status_code=204)
async def delete_risk(
    risk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_RISK")),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    risk_id_val = risk.id
    await db.delete(risk)
    await audit(db, "Risk", risk_id_val, AuditAction.DELETE, current_user.user_id, None)
    await db.commit()


# ── Risk Controls ─────────────────────────────────────────────────────────────

@router.get("/{risk_id}/controls", response_model=list[RiskControlRead])
async def list_controls(
    risk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    controls = (await db.execute(
        select(RiskControl).where(RiskControl.risk_id == risk_id)
        .order_by(RiskControl.created_at)
    )).scalars().all()
    return controls


@router.post("/{risk_id}/controls", response_model=RiskControlRead, status_code=201)
async def create_control(
    risk_id: uuid.UUID,
    payload: RiskControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, "Risk not found")

    control = RiskControl(risk_id=risk_id, **payload.model_dump())
    db.add(control)

    # Auto-advance status to IN_CONTROL if still OPEN
    if risk.status == "OPEN":
        risk.status = "IN_CONTROL"

    await db.flush()
    await audit(
        db, "RiskControl", control.id, AuditAction.CREATE, current_user.user_id,
        f"risk={risk_id} type={control.control_type}",
    )
    await db.commit()
    await db.refresh(control)
    return control


@router.put("/controls/{control_id}", response_model=RiskControlRead)
async def update_control(
    control_id: uuid.UUID,
    payload: RiskControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    control = await db.get(RiskControl, control_id)
    if not control:
        raise HTTPException(404, "Risk control not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(control, k, v)
    await audit(
        db, "RiskControl", control.id, AuditAction.UPDATE, current_user.user_id,
        f"status={control.implementation_status}",
    )
    await db.commit()
    await db.refresh(control)
    return control


@router.delete("/controls/{control_id}", status_code=204)
async def delete_control(
    control_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    control = await db.get(RiskControl, control_id)
    if not control:
        raise HTTPException(404, "Risk control not found")
    risk_id = control.risk_id
    ctrl_id_val = control.id
    await db.delete(control)
    await db.flush()

    # Revert to OPEN if no controls remain
    remaining = (await db.execute(
        select(func.count(RiskControl.id)).where(RiskControl.risk_id == risk_id)
    )).scalar_one()
    if remaining == 0:
        risk = await db.get(Risk, risk_id)
        if risk and risk.status == "IN_CONTROL":
            risk.status = "OPEN"

    await audit(
        db, "RiskControl", ctrl_id_val, AuditAction.DELETE, current_user.user_id,
        f"risk={risk_id}",
    )
    await db.commit()


# ── Residual Risk ─────────────────────────────────────────────────────────────

@router.get("/{risk_id}/residual", response_model=ResidualRiskRead | None)
async def get_residual(
    risk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    result = await db.execute(
        select(ResidualRisk).where(ResidualRisk.risk_id == risk_id)
    )
    return result.scalar_one_or_none()


@router.put("/{risk_id}/residual", response_model=ResidualRiskRead)
async def upsert_residual(
    risk_id: uuid.UUID,
    payload: ResidualRiskUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, "Risk not found")

    existing = (await db.execute(
        select(ResidualRisk).where(ResidualRisk.risk_id == risk_id)
    )).scalar_one_or_none()

    level = _compute_level(payload.severity, payload.probability)
    accepted_at = datetime.now(timezone.utc) if payload.is_accepted else None

    if existing:
        existing.severity = payload.severity
        existing.probability = payload.probability
        existing.risk_level = level
        existing.rationale = payload.rationale
        existing.is_accepted = payload.is_accepted
        existing.accepted_by = payload.accepted_by if payload.is_accepted else None
        existing.accepted_at = accepted_at
        residual = existing
        action = AuditAction.UPDATE
    else:
        residual = ResidualRisk(
            risk_id=risk_id,
            severity=payload.severity,
            probability=payload.probability,
            risk_level=level,
            rationale=payload.rationale,
            is_accepted=payload.is_accepted,
            accepted_by=payload.accepted_by if payload.is_accepted else None,
            accepted_at=accepted_at,
        )
        db.add(residual)
        action = AuditAction.CREATE

    # Auto-advance risk status to ACCEPTED when residual risk is accepted
    if payload.is_accepted and risk.status not in ("ACCEPTED", "CLOSED"):
        risk.status = "ACCEPTED"
        risk.re_evaluation_required = False

    await db.flush()
    await audit(
        db, "ResidualRisk", residual.id, action, current_user.user_id,
        f"risk={risk_id} accepted={payload.is_accepted} level={level}",
    )
    await db.commit()
    await db.refresh(residual)
    return residual


# ============================================================================
# §7.1 — Risk contributions (software item / component → hazard analysis)
# ============================================================================

@router.get("/{risk_id}/contributions", response_model=list[RiskContributionRead])
async def list_contributions(
    risk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    return (await db.execute(
        select(RiskContribution).where(RiskContribution.risk_id == risk_id)
    )).scalars().all()


@router.post("/{risk_id}/contributions", response_model=RiskContributionRead, status_code=201)
async def add_contribution(
    risk_id: uuid.UUID,
    body: RiskContributionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    if not await db.get(Risk, risk_id):
        raise HTTPException(404, "Risk not found")
    if (body.software_item_id is None) == (body.component_id is None):
        raise HTTPException(400, "Set exactly one of software_item_id or component_id")
    contrib = RiskContribution(risk_id=risk_id, **body.model_dump())
    db.add(contrib)
    try:
        await db.flush()
        await audit(
            db, "RiskContribution", contrib.id, AuditAction.CREATE, current_user.user_id,
            f"risk={risk_id}",
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(409, f"Contribution already exists or invalid FK: {e}")
    await db.refresh(contrib)
    return contrib


@router.delete("/contributions/{contribution_id}", status_code=204)
async def delete_contribution(
    contribution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    c = await db.get(RiskContribution, contribution_id)
    if not c:
        raise HTTPException(404, "Contribution not found")
    risk_id = c.risk_id
    contrib_id_val = c.id
    await db.delete(c)
    await audit(
        db, "RiskContribution", contrib_id_val, AuditAction.DELETE, current_user.user_id,
        f"risk={risk_id}",
    )
    await db.commit()


# ============================================================================
# §7.3 — Verification of risk control measures (closed-loop evidence)
# ============================================================================

@router.get("/controls/{control_id}/evidence", response_model=list[VerificationEvidenceRead])
async def list_evidence(
    control_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    return (await db.execute(
        select(VerificationEvidence)
        .where(VerificationEvidence.control_id == control_id)
        .order_by(VerificationEvidence.verified_at.desc())
    )).scalars().all()


@router.post("/controls/{control_id}/evidence", response_model=VerificationEvidenceRead, status_code=201)
async def add_evidence(
    control_id: uuid.UUID,
    body: VerificationEvidenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    control = await db.get(RiskControl, control_id)
    if not control:
        raise HTTPException(404, "Control not found")

    # Sanity: at least one of the FK / external_reference must be present
    # for SYSTEM_TEST / INTEGRATION_TEST / UNIT_TEST / EXTERNAL_REF types.
    has_ref = any([body.system_test_id, body.integration_test_id,
                   body.unit_test_id, body.external_reference])
    needs_ref = body.evidence_type in ("SYSTEM_TEST", "INTEGRATION_TEST",
                                       "UNIT_TEST", "EXTERNAL_REF")
    if needs_ref and not has_ref:
        raise HTTPException(
            400,
            f"evidence_type={body.evidence_type} requires a reference "
            "(test FK or external_reference)",
        )

    ev = VerificationEvidence(control_id=control_id, **body.model_dump())
    db.add(ev)
    await db.flush()

    # §7.3 auto-VERIFY: control flips to VERIFIED when ≥1 PASS evidence
    # row exists. FAIL evidence rolls it back to IMPLEMENTED if it was
    # previously VERIFIED — auditor can see the failed evidence inline.
    if body.result == "PASS":
        control.implementation_status = "VERIFIED"
    elif body.result == "FAIL" and control.implementation_status == "VERIFIED":
        control.implementation_status = "IMPLEMENTED"

    await audit(
        db, "VerificationEvidence", ev.id, AuditAction.CREATE, current_user.user_id,
        f"control={control_id} {body.evidence_type} {body.result}",
    )
    await db.commit()
    await db.refresh(ev)
    return ev


@router.delete("/evidence/{evidence_id}", status_code=204)
async def delete_evidence(
    evidence_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    ev = await db.get(VerificationEvidence, evidence_id)
    if not ev:
        raise HTTPException(404, "Evidence not found")
    control_id = ev.control_id
    ev_id_val = ev.id
    await db.delete(ev)
    await db.flush()
    # Recompute control status: still VERIFIED only if ≥1 PASS evidence
    # remains. Otherwise drop to IMPLEMENTED.
    has_pass = (await db.execute(
        select(func.count(VerificationEvidence.id)).where(
            VerificationEvidence.control_id == control_id,
            VerificationEvidence.result == "PASS",
        )
    )).scalar_one()
    control = await db.get(RiskControl, control_id)
    if control and control.implementation_status == "VERIFIED" and has_pass == 0:
        control.implementation_status = "IMPLEMENTED"
    await audit(
        db, "VerificationEvidence", ev_id_val, AuditAction.DELETE, current_user.user_id,
        f"control={control_id}",
    )
    await db.commit()


# ============================================================================
# §7.4 — Risk re-evaluation (record outcome) + inbox
# ============================================================================

@router.get("/needs-reevaluation/{project_id}", response_model=list[RiskRead])
async def list_needs_reevaluation(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    """Inbox of risks flagged for §7.4 re-evaluation (typically by a CR
    against released software, a feedback safety assessment, or a linked
    requirement edit)."""
    req_ids = (await db.execute(
        select(Requirement.id).where(Requirement.project_id == project_id)
    )).scalars().all()
    if not req_ids:
        return []
    return (await db.execute(
        select(Risk).where(
            Risk.requirement_id.in_(req_ids),
            Risk.re_evaluation_required == True,
        )
    )).scalars().all()


@router.post("/{risk_id}/re-evaluate", response_model=RiskRead)
async def record_reevaluation(
    risk_id: uuid.UUID,
    body: RiskReEvaluate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_RISK")),
):
    """Record the outcome of a §7.4 re-evaluation. Clears the re_evaluation_
    required flag, captures the audit fields, and (optionally) updates the
    severity/probability and the lifecycle status."""
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, "Risk not found")
    now = datetime.now(timezone.utc)
    risk.evaluation_notes = (
        (risk.evaluation_notes + "\n\n— " + now.strftime("%Y-%m-%d") + " —\n" + body.notes)
        if risk.evaluation_notes else body.notes
    )
    risk.last_re_evaluated_at = now
    risk.last_re_evaluated_by = body.re_evaluated_by
    risk.re_evaluation_required = False
    # Triggered_at + reason stay in place as the historical record of the
    # most recent trigger; cleared at next trigger.
    if body.severity is not None or body.probability is not None:
        sev = body.severity or risk.severity
        prob = body.probability or risk.probability
        risk.severity = sev
        risk.probability = prob
        risk.risk_level = _compute_level(sev, prob)
    if body.new_status:
        risk.status = body.new_status
    await audit(
        db, "Risk", risk.id, AuditAction.UPDATE, current_user.user_id,
        f"re-evaluated -> S{risk.severity}xP{risk.probability}={risk.risk_level} status={risk.status}",
    )
    await db.commit()
    await db.refresh(risk)
    return risk


# ============================================================================
# §7.4 trigger helper — used by other modules (change_control, feedback, …)
# ============================================================================

async def trigger_risk_reevaluation(
    db: AsyncSession, risk_ids: list[uuid.UUID], reason: str,
) -> int:
    """Mark each risk in risk_ids as needing §7.4 re-evaluation. Returns
    the count of risks actually flagged (rows where re_evaluation_required
    was previously False — repeated triggers don't reset the timestamp).

    Callers from outside this module:
      - change_control.router on CR APPROVED with modifies_released_software
      - feedback.router on /evaluate with safety_impact_assessment
      - requirements.router on requirement update (light-weight trigger)
    """
    if not risk_ids:
        return 0
    rows = (await db.execute(
        select(Risk).where(Risk.id.in_(risk_ids))
    )).scalars().all()
    now = datetime.now(timezone.utc)
    n = 0
    for r in rows:
        if not r.re_evaluation_required:
            n += 1
        r.re_evaluation_required = True
        r.re_evaluation_reason = reason
        r.re_evaluation_triggered_at = now
        if r.status == "ACCEPTED":
            r.status = "RE_EVALUATION_REQUIRED"
    # Caller is responsible for db.commit() — they're usually inside a
    # larger transaction (e.g. the CR APPROVED transition).
    return n

