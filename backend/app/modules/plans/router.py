import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.approval_signoff import check_independence
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user
from app.modules.auth.schema import TokenData

from .model import Plan, PlanSection
from .schema import (
    PlanCreate, PlanRead, PlanSummary, PlanUpdate, PlanStatusTransition, PlanTransitionResult,
    PlanSectionCreate, PlanSectionRead, PlanSectionUpdate,
    PlanComplianceCheck, PlanComplianceStatus, PlanTypeInfo,
)
from .defaults import PLAN_TYPES, custom_plan_sections

router = APIRouter(prefix="/plans", tags=["plans"])

# ── Status transition rules ───────────────────────────────────────────────────
VALID_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT":     {"IN_REVIEW"},
    "IN_REVIEW": {"APPROVED", "DRAFT"},
    "APPROVED":  {"OBSOLETE"},
    "OBSOLETE":  set(),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_editable(plan: Plan) -> None:
    if plan.status not in ("DRAFT", "IN_REVIEW"):
        raise HTTPException(
            400,
            f"{plan.title} v{plan.version} is {plan.status} and cannot be edited. "
            f"Use /fork to create a new version.",
        )


def _next_version(current: str) -> str:
    """Increment minor version: '1.0' → '1.1', '2.3' → '2.4'."""
    try:
        parts = current.split(".")
        if len(parts) == 2:
            return f"{parts[0]}.{int(parts[1]) + 1}"
        return f"{current}.1"
    except (ValueError, IndexError):
        return f"{current}.1"


# ── Plan-type catalog ─────────────────────────────────────────────────────────
# Declared before /{plan_id} so the literal path isn't swallowed by the UUID param.

@router.get("/types", response_model=list[PlanTypeInfo])
async def list_plan_types():
    """The built-in IEC 62304 plan types (Maintenance §6.1, Risk Management §7,
    Configuration Management §8.1, Problem Resolution §9). Custom plan types are
    created ad hoc via POST / with a non-catalog `plan_type`."""
    return [
        PlanTypeInfo(key=t["key"], label=t["label"], iec_clause=t["iec_clause"], description=t["description"])
        for t in PLAN_TYPES.values()
    ]


# ── Plan CRUD ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[PlanSummary])
async def list_plans(
    project_id: uuid.UUID,
    plan_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """All plan versions for a project, newest first. Optionally filter to one
    plan_type (used by the per-type workspace page)."""
    q = select(Plan).where(Plan.project_id == project_id)
    if plan_type:
        q = q.where(Plan.plan_type == plan_type)
    q = q.order_by(Plan.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router.post("/", response_model=PlanRead, status_code=201)
async def create_plan(
    payload: PlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Create a new plan version and seed its default sections. Built-in plan
    types default their title/iec_clause/sections from the catalog; custom
    plan types require a `title` and get a single placeholder section."""
    builtin = PLAN_TYPES.get(payload.plan_type)
    if builtin:
        title = payload.title or builtin["label"]
        iec_clause = payload.iec_clause or builtin["iec_clause"]
        seed_sections = builtin["sections"]
    else:
        if not (payload.title or "").strip():
            raise HTTPException(400, "A custom plan type requires a title")
        title = payload.title.strip()
        iec_clause = payload.iec_clause
        seed_sections = custom_plan_sections(title)

    plan = Plan(
        project_id=payload.project_id,
        plan_type=payload.plan_type,
        iec_clause=iec_clause,
        version=payload.version,
        safety_class=payload.safety_class,
        title=title,
        description=payload.description,
        created_by=payload.created_by,
    )
    db.add(plan)
    await db.flush()
    # `required` is a template-only marker (mandatory audit evidence); the
    # PlanSection table doesn't carry it, so strip it before constructing rows.
    section_columns = {"section_number", "section_name", "content", "sort_order"}
    for s in seed_sections:
        db.add(PlanSection(
            plan_id=plan.id,
            **{k: v for k, v in s.items() if k in section_columns},
        ))
    await audit(db, "plan", plan.id, AuditAction.CREATE, current_user.user_id, f"{title} v{plan.version}")
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanRead)
async def get_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return plan


@router.put("/{plan_id}", response_model=PlanRead)
async def update_plan(
    plan_id: uuid.UUID,
    payload: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    _assert_editable(plan)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(plan, k, v)
    await audit(db, "plan", plan.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan.status == "APPROVED":
        raise HTTPException(400, "Approved plans cannot be deleted — set to OBSOLETE instead")
    await audit(db, "plan", plan.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(plan)
    await db.commit()


# ── Fork (create new version) ─────────────────────────────────────────────────

@router.post("/{plan_id}/fork", response_model=PlanRead, status_code=201)
async def fork_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Create a new DRAFT version from an existing plan, copying all sections.
    Used when an APPROVED plan needs revision."""
    source = await db.get(Plan, plan_id)
    if not source:
        raise HTTPException(404, "Plan not found")

    new_version = _next_version(source.version)
    existing = (await db.execute(
        select(Plan).where(
            Plan.project_id == source.project_id,
            Plan.plan_type == source.plan_type,
            Plan.version == new_version,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"{source.title} version {new_version} already exists for this project")

    fork = Plan(
        project_id=source.project_id,
        plan_type=source.plan_type,
        iec_clause=source.iec_clause,
        version=new_version,
        status="DRAFT",
        safety_class=source.safety_class,
        title=source.title,
        description=source.description,
        created_by=source.created_by,
    )
    db.add(fork)
    await db.flush()
    for s in source.sections:
        db.add(PlanSection(
            plan_id=fork.id,
            section_number=s.section_number,
            section_name=s.section_name,
            content=s.content,
            sort_order=s.sort_order,
        ))
    await audit(db, "plan", fork.id, AuditAction.CREATE, current_user.user_id, f"Forked from v{source.version}")
    await db.commit()
    await db.refresh(fork)
    return fork


# ── Status transition ─────────────────────────────────────────────────────────

@router.put("/{plan_id}/status", response_model=PlanTransitionResult)
async def transition_status(
    plan_id: uuid.UUID,
    payload: PlanStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")

    allowed = VALID_TRANSITIONS.get(plan.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition from {plan.status} to {payload.status}. Allowed: {sorted(allowed)}",
        )

    warnings: list[str] = []
    now = datetime.now(timezone.utc)

    # DRAFT → IN_REVIEW: capture "Prepared by"
    if payload.status == "IN_REVIEW":
        plan.prepared_by = payload.prepared_by or plan.prepared_by or (current_user.user_id and str(current_user.user_id))
        plan.prepared_at = plan.prepared_at or now

    # IN_REVIEW → APPROVED: gate on readiness, capture "Reviewed by" + "Approved by"
    if payload.status == "APPROVED":
        compliance = _check_approval_readiness(plan)
        if not compliance.is_ready_for_approval:
            failed = [c.label for c in compliance.checks if not c.satisfied]
            raise HTTPException(400, f"Cannot approve: {'; '.join(failed)}")
        if not payload.reviewed_by:
            raise HTTPException(400, "reviewed_by is required to approve a plan")
        plan.reviewed_by = payload.reviewed_by
        plan.reviewed_at = now
        plan.approved_by = payload.approved_by or (current_user.user_id and str(current_user.user_id))
        plan.approved_at = now
        warning = check_independence(plan.reviewed_by, plan.approved_by)
        if warning:
            warnings.append(warning)

        # Obsolete any other APPROVED plan of the SAME type for this project.
        await db.execute(
            update(Plan)
            .where(
                Plan.project_id == plan.project_id,
                Plan.plan_type == plan.plan_type,
                Plan.id != plan_id,
                Plan.status == "APPROVED",
            )
            .values(status="OBSOLETE")
        )

    if payload.review_notes is not None:
        plan.review_notes = payload.review_notes

    prev_status = plan.status
    plan.status = payload.status
    await audit(db, "plan", plan.id, AuditAction.UPDATE, current_user.user_id, f"Status: {prev_status} → {payload.status}")
    await db.commit()
    await db.refresh(plan)
    return PlanTransitionResult(plan=PlanRead.model_validate(plan), warnings=warnings)


# ── Compliance / approval readiness ──────────────────────────────────────────

def _check_approval_readiness(plan: Plan) -> PlanComplianceStatus:
    checks: list[PlanComplianceCheck] = []

    checks.append(PlanComplianceCheck(
        rule="has_sections",
        label="At least one section exists",
        satisfied=len(plan.sections) > 0,
        detail=f"{len(plan.sections)} section(s) defined",
    ))

    content_missing = [s.section_name for s in plan.sections if not (s.content or "").strip()]
    checks.append(PlanComplianceCheck(
        rule="sections_have_content",
        label="All sections have content",
        satisfied=len(content_missing) == 0,
        detail="All sections populated" if not content_missing
               else f"Empty sections: {', '.join(content_missing[:3])}{'…' if len(content_missing) > 3 else ''}",
    ))

    checks.append(PlanComplianceCheck(
        rule="has_approver",
        label="Approved-by name provided",
        satisfied=bool(plan.approved_by or plan.review_notes),
        detail="Approver name or review notes present" if (plan.approved_by or plan.review_notes)
               else "Set approved_by in the approval request",
    ))

    return PlanComplianceStatus(
        plan_id=plan.id,
        is_ready_for_approval=all(c.satisfied for c in checks),
        checks=checks,
    )


@router.get("/{plan_id}/compliance", response_model=PlanComplianceStatus)
async def get_compliance(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return _check_approval_readiness(plan)


# ── Sections ──────────────────────────────────────────────────────────────────

@router.post("/{plan_id}/sections", response_model=PlanSectionRead, status_code=201)
async def add_section(
    plan_id: uuid.UUID,
    payload: PlanSectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    _assert_editable(plan)
    section = PlanSection(plan_id=plan_id, **payload.model_dump())
    db.add(section)
    await db.flush()
    await audit(db, "plan_section", section.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(section)
    return section


@router.put("/sections/{section_id}", response_model=PlanSectionRead)
async def update_section(
    section_id: uuid.UUID,
    payload: PlanSectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    section = await db.get(PlanSection, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    plan = await db.get(Plan, section.plan_id)
    if plan:
        _assert_editable(plan)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(section, k, v)
    await audit(db, "plan_section", section.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=204)
async def delete_section(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    section = await db.get(PlanSection, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    plan = await db.get(Plan, section.plan_id)
    if plan:
        _assert_editable(plan)
    await audit(db, "plan_section", section.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(section)
    await db.commit()
