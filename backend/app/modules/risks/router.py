import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.requirements.model import Requirement
from .model import Risk, RiskCategory, RiskControl, ResidualRisk, SoftwareSafetyProfile, _compute_level
from .schema import (
    RiskCreate, RiskRead, RiskUpdate, RiskStatusUpdate,
    RiskCategoryCreate, RiskCategoryRead, RiskCategoryUpdate,
    RiskControlCreate, RiskControlRead, RiskControlUpdate,
    ResidualRiskUpsert, ResidualRiskRead,
    RiskDashboard, HeatmapCell,
    SafetyProfileCreate, SafetyProfileRead, SafetyProfileUpdate,
)

router = APIRouter(prefix="/risks", tags=["risks"])


# ── Risk Categories ───────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[RiskCategoryRead])
async def list_risk_categories(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    cats = (await db.execute(
        select(RiskCategory)
        .where(RiskCategory.project_id == project_id)
        .order_by(RiskCategory.sort_order, RiskCategory.name)
    )).scalars().all()
    return cats


@router.post("/categories", response_model=RiskCategoryRead, status_code=201)
async def create_risk_category(body: RiskCategoryCreate, db: AsyncSession = Depends(get_db)):
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
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=RiskCategoryRead)
async def update_risk_category(
    category_id: uuid.UUID, body: RiskCategoryUpdate, db: AsyncSession = Depends(get_db)
):
    cat = (await db.execute(
        select(RiskCategory).where(RiskCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_risk_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    cat = (await db.execute(
        select(RiskCategory).where(RiskCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.is_builtin:
        raise HTTPException(400, "Built-in risk categories cannot be deleted")
    await db.delete(cat)
    await db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard/{project_id}", response_model=RiskDashboard)
async def get_risk_dashboard(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
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
async def get_safety_profile(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == project_id)
    )
    return result.scalar_one_or_none()


@router.post("/safety-profile", response_model=SafetyProfileRead, status_code=201)
async def create_safety_profile(payload: SafetyProfileCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == payload.project_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail="Safety profile already exists for this project. Use PUT to update.")
    profile = SoftwareSafetyProfile(**payload.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/safety-profile/{project_id}", response_model=SafetyProfileRead)
async def update_safety_profile(
    project_id: uuid.UUID, payload: SafetyProfileUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == project_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, detail="Safety profile not found. Use POST to create.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(profile, k, v)
    await db.commit()
    await db.refresh(profile)
    return profile


# ── Risks CRUD ────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[RiskRead])
async def list_risks(
    requirement_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Risk)
    if requirement_id:
        q = q.where(Risk.requirement_id == requirement_id)
    elif project_id:
        req_ids = (await db.execute(
            select(Requirement.id).where(Requirement.project_id == project_id)
        )).scalars().all()
        q = q.where(Risk.requirement_id.in_(req_ids))
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=RiskRead, status_code=201)
async def create_risk(payload: RiskCreate, db: AsyncSession = Depends(get_db)):
    risk = Risk(
        **payload.model_dump(),
        risk_level=_compute_level(payload.severity, payload.probability),
        status="OPEN",
    )
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    return risk


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    return risk


@router.put("/{risk_id}", response_model=RiskRead)
async def update_risk(risk_id: uuid.UUID, payload: RiskUpdate, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(risk, k, v)
    risk.risk_level = _compute_level(risk.severity, risk.probability)
    await db.commit()
    await db.refresh(risk)
    return risk


@router.put("/{risk_id}/status", response_model=RiskRead)
async def update_risk_status(
    risk_id: uuid.UUID, payload: RiskStatusUpdate, db: AsyncSession = Depends(get_db)
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
    await db.commit()
    await db.refresh(risk)
    return risk


@router.delete("/{risk_id}", status_code=204)
async def delete_risk(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    await db.delete(risk)
    await db.commit()


# ── Risk Controls ─────────────────────────────────────────────────────────────

@router.get("/{risk_id}/controls", response_model=list[RiskControlRead])
async def list_controls(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    controls = (await db.execute(
        select(RiskControl).where(RiskControl.risk_id == risk_id)
        .order_by(RiskControl.created_at)
    )).scalars().all()
    return controls


@router.post("/{risk_id}/controls", response_model=RiskControlRead, status_code=201)
async def create_control(
    risk_id: uuid.UUID, payload: RiskControlCreate, db: AsyncSession = Depends(get_db)
):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, "Risk not found")

    control = RiskControl(risk_id=risk_id, **payload.model_dump())
    db.add(control)

    # Auto-advance status to IN_CONTROL if still OPEN
    if risk.status == "OPEN":
        risk.status = "IN_CONTROL"

    await db.commit()
    await db.refresh(control)
    return control


@router.put("/controls/{control_id}", response_model=RiskControlRead)
async def update_control(
    control_id: uuid.UUID, payload: RiskControlUpdate, db: AsyncSession = Depends(get_db)
):
    control = await db.get(RiskControl, control_id)
    if not control:
        raise HTTPException(404, "Risk control not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(control, k, v)
    await db.commit()
    await db.refresh(control)
    return control


@router.delete("/controls/{control_id}", status_code=204)
async def delete_control(control_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    control = await db.get(RiskControl, control_id)
    if not control:
        raise HTTPException(404, "Risk control not found")
    risk_id = control.risk_id
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

    await db.commit()


# ── Residual Risk ─────────────────────────────────────────────────────────────

@router.get("/{risk_id}/residual", response_model=ResidualRiskRead | None)
async def get_residual(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ResidualRisk).where(ResidualRisk.risk_id == risk_id)
    )
    return result.scalar_one_or_none()


@router.put("/{risk_id}/residual", response_model=ResidualRiskRead)
async def upsert_residual(
    risk_id: uuid.UUID, payload: ResidualRiskUpsert, db: AsyncSession = Depends(get_db)
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

    # Auto-advance risk status to ACCEPTED when residual risk is accepted
    if payload.is_accepted and risk.status not in ("ACCEPTED", "CLOSED"):
        risk.status = "ACCEPTED"
        risk.re_evaluation_required = False

    await db.commit()
    await db.refresh(residual)
    return residual
