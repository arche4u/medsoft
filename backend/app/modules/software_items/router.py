import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import require_permission
from app.modules.auth.schema import TokenData
from .model import SoftwareItem, SoftwareItemRiskLink, SoftwareItemRequirementLink
from .schema import (
    SoftwareItemCreate, SoftwareItemRead, SoftwareItemUpdate,
    LinkRisksPayload, LinkRequirementsPayload,
    ComplianceCheck, ComplianceStatus, StatusTransition,
)

router = APIRouter(prefix="/software-items", tags=["software-items"])


# ── Helpers ───────────────────────────────────────────────────────────────────

_CLASS_RANK = {"A": 1, "B": 2, "C": 3}


def _validate_classification(
    safety_class: str, justification: str | None, parent: SoftwareItem | None,
) -> None:
    """IEC 62304 §4.3 — a software item inherits its parent's safety class.
    It may carry a *lower* class only with a documented rationale (the
    segregation justification). Equal or higher classes need no justification;
    root items (the software system itself) are unconstrained."""
    if parent is None:
        return
    if _CLASS_RANK[safety_class] < _CLASS_RANK[parent.safety_class]:
        if not (justification or "").strip():
            raise HTTPException(
                400,
                f"Class {safety_class} is lower than parent '{parent.name}' "
                f"(Class {parent.safety_class}). IEC 62304 §4.3 requires a "
                f"classification justification documenting the segregation rationale.",
            )


def _suggest_class(risks: list) -> tuple[str, str]:
    """Derive the minimum required safety class from linked risks."""
    if not risks:
        return "A", "No linked hazards — Class A permitted (IEC 62304 §4.3)"
    max_severity = max(r.severity for r in risks)
    any_high = any(r.risk_level == "HIGH" for r in risks)
    if any_high or max_severity >= 4:
        return "C", f"Linked risk has severity {max_severity} (serious harm) — Class C required"
    if max_severity >= 2:
        return "B", f"Linked risk has severity {max_severity} (non-serious injury) — Class B required"
    return "A", f"All linked risks have severity {max_severity} — Class A permitted"


async def _run_compliance(
    db: AsyncSession,
    item: SoftwareItem,
    risks: list,
    req_ids: list[uuid.UUID],
) -> ComplianceStatus:
    from app.modules.risks.model import RiskControl
    from app.modules.architecture.model import SWComponent
    from app.modules.system_testing.model import SystemTestCase, STAdditionalReqLink
    from app.modules.units.model import SoftwareUnit, UnitTestCase, UnitRequirementLink
    from app.modules.integration_tests.model import IntegrationTestCase, ITCRequirementLink

    safety_class = item.safety_class
    checks: list[ComplianceCheck] = []

    # ── Rule 1: §5.3 architecture component exists (Class B & C) ─────────────
    arch_required = safety_class in ("B", "C")
    if arch_required:
        arch_count = (await db.execute(
            select(func.count(SWComponent.id)).where(
                SWComponent.project_id == item.project_id,
            )
        )).scalar_one()
        checks.append(ComplianceCheck(
            rule="architecture_required",
            label="Software architecture defined (§5.3)",
            required=True,
            satisfied=arch_count > 0,
            detail=f"{arch_count} architecture component(s) defined" if arch_count > 0
                   else "No architecture components — define them in SW Architecture",
        ))

    # ── Rule 2: §5.7 System tests linked to requirements (Class B & C) ───────
    tests_required = safety_class in ("B", "C")
    if tests_required:
        st_count = 0
        if req_ids:
            primary = (await db.execute(
                select(func.count(SystemTestCase.id)).where(SystemTestCase.requirement_id.in_(req_ids))
            )).scalar_one()
            addl = (await db.execute(
                select(func.count(STAdditionalReqLink.stc_id)).where(
                    STAdditionalReqLink.requirement_id.in_(req_ids)
                )
            )).scalar_one()
            st_count = primary + addl
        checks.append(ComplianceCheck(
            rule="tests_required",
            label="System tests linked to requirements (§5.7)",
            required=True,
            satisfied=st_count > 0,
            detail=f"{st_count} system test(s) linked" if st_count > 0
                   else "No system tests linked — add tests under Testing → System Testing",
        ))

    # ── Rule 3: §5.5 Unit tests — Class C only ────────────────────────────────
    unit_required = safety_class == "C"
    if unit_required:
        unit_test_count = 0
        if req_ids:
            unit_test_count = (await db.execute(
                select(func.count(UnitTestCase.id))
                .join(SoftwareUnit, SoftwareUnit.id == UnitTestCase.unit_id)
                .join(UnitRequirementLink, UnitRequirementLink.unit_id == SoftwareUnit.id)
                .where(UnitRequirementLink.requirement_id.in_(req_ids))
            )).scalar_one()
        checks.append(ComplianceCheck(
            rule="unit_tests_required",
            label="Unit tests exist (§5.5)",
            required=True,
            satisfied=unit_test_count > 0,
            detail=f"{unit_test_count} unit test(s) found" if unit_test_count > 0
                   else "No unit tests — add software units and unit tests under Verification → Unit Verification",
        ))

    # ── Rule 4: §5.6 Integration tests — Class C only ─────────────────────────
    if unit_required:
        integ_count = 0
        if req_ids:
            integ_count = (await db.execute(
                select(func.count(IntegrationTestCase.id))
                .join(ITCRequirementLink, ITCRequirementLink.itc_id == IntegrationTestCase.id)
                .where(ITCRequirementLink.requirement_id.in_(req_ids))
            )).scalar_one()
        checks.append(ComplianceCheck(
            rule="integration_tests_required",
            label="Integration tests exist (§5.6)",
            required=True,
            satisfied=integ_count > 0,
            detail=f"{integ_count} integration test(s) found" if integ_count > 0
                   else "No integration tests — add tests under Verification → Integration Tests",
        ))

    # ── Rule 5: All risk controls verified (Class B & C) ─────────────────────
    controls_required = safety_class in ("B", "C")
    if controls_required and risks:
        risk_ids = [r.id for r in risks]
        unverified = (await db.execute(
            select(func.count(RiskControl.id)).where(
                RiskControl.risk_id.in_(risk_ids),
                RiskControl.implementation_status != "VERIFIED",
            )
        )).scalar_one()
        total_controls = (await db.execute(
            select(func.count(RiskControl.id)).where(RiskControl.risk_id.in_(risk_ids))
        )).scalar_one()
        checks.append(ComplianceCheck(
            rule="risk_controls_verified",
            label="All risk controls verified",
            required=True,
            satisfied=unverified == 0 and total_controls > 0,
            detail=f"{total_controls - unverified}/{total_controls} controls verified"
                   if total_controls > 0 else "No risk controls defined — add controls to linked risks",
        ))
    elif controls_required and not risks:
        checks.append(ComplianceCheck(
            rule="risk_controls_verified",
            label="All risk controls verified",
            required=False,
            satisfied=True,
            detail="No linked risks — no controls required",
        ))

    # ── Rule 6: Residual risk accepted (Class C only) ─────────────────────────
    residual_required = safety_class == "C"
    if residual_required and risks:
        from app.modules.risks.model import ResidualRisk
        risk_ids = [r.id for r in risks]
        accepted = (await db.execute(
            select(func.count(ResidualRisk.id)).where(
                ResidualRisk.risk_id.in_(risk_ids),
                ResidualRisk.is_accepted == True,
            )
        )).scalar_one()
        checks.append(ComplianceCheck(
            rule="residual_risk_accepted",
            label="Residual risk evaluated and accepted",
            required=True,
            satisfied=accepted == len(risks),
            detail=f"{accepted}/{len(risks)} residual risks accepted",
        ))

    # ── Derive blocks ─────────────────────────────────────────────────────────
    failed = [c for c in checks if c.required and not c.satisfied]
    blocks: list[str] = []
    failed_rules = {c.rule for c in failed}

    if "architecture_required" in failed_rules:
        blocks.append("DESIGN_COMPLETE")
    if failed_rules & {"tests_required", "unit_tests_required", "integration_tests_required",
                       "risk_controls_verified", "residual_risk_accepted"}:
        blocks.append("RELEASE")
    if failed_rules & {"risk_controls_verified", "residual_risk_accepted"}:
        if "DESIGN_COMPLETE" not in blocks:
            blocks.append("DESIGN_COMPLETE")

    suggested_class, suggestion_reason = _suggest_class(risks)
    is_compliant = len(failed) == 0

    return ComplianceStatus(
        item_id=item.id,
        safety_class=safety_class,
        is_compliant=is_compliant,
        checks=checks,
        blocks=list(set(blocks)),
        suggested_class=suggested_class,
        suggestion_reason=suggestion_reason,
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[SoftwareItemRead])
async def list_items(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    items = (await db.execute(
        select(SoftwareItem)
        .where(SoftwareItem.project_id == project_id)
        .order_by(SoftwareItem.item_type, SoftwareItem.name)
    )).scalars().all()
    return [_to_read(i) for i in items]


@router.post("/", response_model=SoftwareItemRead, status_code=201)
async def create_item(
    payload: SoftwareItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_SOFTWARE_ITEM")),
):
    parent = None
    if payload.parent_id:
        parent = await db.get(SoftwareItem, payload.parent_id)
        if not parent or parent.project_id != payload.project_id:
            raise HTTPException(400, "Parent item not found in this project")

    # IEC 62304 §4.3 — inherit the parent's class when none is given; a root
    # item (the software system) defaults to Class C (safest assumption).
    safety_class = payload.safety_class or (parent.safety_class if parent else "C")
    _validate_classification(safety_class, payload.classification_justification, parent)

    data = payload.model_dump()
    data["safety_class"] = safety_class
    item = SoftwareItem(**data)
    db.add(item)
    await db.flush()
    await audit(db, "software_item", item.id, AuditAction.CREATE, current_user.user_id,
                f"{item.name} (Class {item.safety_class})")
    await db.commit()
    await db.refresh(item)
    return _to_read(item)


@router.get("/{item_id}", response_model=SoftwareItemRead)
async def get_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")
    return _to_read(item)


@router.put("/{item_id}", response_model=SoftwareItemRead)
async def update_item(
    item_id: uuid.UUID, payload: SoftwareItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_ITEM")),
):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")

    data = payload.model_dump(exclude_unset=True)

    # IEC 62304 §4.3 — re-validate classification whenever the class or the
    # parent changes. Resolve the *effective* parent + class + justification
    # after this update, then apply the inheritance rule.
    if "safety_class" in data or "parent_id" in data:
        new_parent_id = data["parent_id"] if "parent_id" in data else item.parent_id
        if new_parent_id == item_id:
            raise HTTPException(400, "An item cannot be its own parent")
        parent = None
        if new_parent_id:
            parent = await db.get(SoftwareItem, new_parent_id)
            if not parent or parent.project_id != item.project_id:
                raise HTTPException(400, "Parent item not found in this project")
        new_class = data.get("safety_class") or item.safety_class
        new_just = data.get("classification_justification", item.classification_justification)
        _validate_classification(new_class, new_just, parent)

    for k, v in data.items():
        setattr(item, k, v)
    await audit(db, "software_item", item.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(item)
    return _to_read(item)


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_SOFTWARE_ITEM")),
):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")
    await audit(db, "software_item", item.id, AuditAction.DELETE, current_user.user_id, item.name)
    await db.delete(item)
    await db.commit()


# ── Status transition (with compliance gate) ──────────────────────────────────

@router.put("/{item_id}/status", response_model=SoftwareItemRead)
async def transition_status(
    item_id: uuid.UUID, payload: StatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_ITEM")),
):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")

    new_status = payload.status
    prev_status = item.status

    # Gate APPROVED: must have compliance passing
    if new_status == "APPROVED":
        risk_ids = [lnk.risk_id for lnk in item.risk_links]
        req_ids = [lnk.requirement_id for lnk in item.requirement_links]

        risks = []
        if risk_ids:
            from app.modules.risks.model import Risk
            risks = (await db.execute(select(Risk).where(Risk.id.in_(risk_ids)))).scalars().all()

        compliance = await _run_compliance(db, item, risks, req_ids)
        if not compliance.is_compliant:
            failed = [c.label for c in compliance.checks if c.required and not c.satisfied]
            raise HTTPException(400, f"Cannot approve: compliance failures — {'; '.join(failed)}")

    item.status = new_status
    await audit(db, "software_item", item.id, AuditAction.UPDATE, current_user.user_id,
                f"Status: {prev_status} → {new_status}")
    await db.commit()
    await db.refresh(item)
    return _to_read(item)


# ── Hazard (risk) links ───────────────────────────────────────────────────────

@router.put("/{item_id}/risks", response_model=SoftwareItemRead)
async def set_risk_links(
    item_id: uuid.UUID, payload: LinkRisksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_ITEM")),
):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")

    # Replace all links with the new set
    for lnk in list(item.risk_links):
        await db.delete(lnk)
    await db.flush()

    for rid in payload.risk_ids:
        db.add(SoftwareItemRiskLink(software_item_id=item_id, risk_id=rid))

    await audit(db, "software_item", item.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(payload.risk_ids)} risk(s)")
    await db.commit()
    await db.refresh(item)
    return _to_read(item)


# ── Requirement links ─────────────────────────────────────────────────────────

@router.put("/{item_id}/requirements", response_model=SoftwareItemRead)
async def set_requirement_links(
    item_id: uuid.UUID, payload: LinkRequirementsPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_ITEM")),
):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")

    for lnk in list(item.requirement_links):
        await db.delete(lnk)
    await db.flush()

    for req_id in payload.requirement_ids:
        db.add(SoftwareItemRequirementLink(software_item_id=item_id, requirement_id=req_id))

    await audit(db, "software_item", item.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(payload.requirement_ids)} requirement(s)")
    await db.commit()
    await db.refresh(item)
    return _to_read(item)


# ── Compliance check ──────────────────────────────────────────────────────────

@router.get("/{item_id}/compliance", response_model=ComplianceStatus)
async def get_compliance(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    item = await db.get(SoftwareItem, item_id)
    if not item:
        raise HTTPException(404, "Software item not found")

    risk_ids = [lnk.risk_id for lnk in item.risk_links]
    req_ids = [lnk.requirement_id for lnk in item.requirement_links]

    risks = []
    if risk_ids:
        from app.modules.risks.model import Risk
        risks = (await db.execute(select(Risk).where(Risk.id.in_(risk_ids)))).scalars().all()

    return await _run_compliance(db, item, risks, req_ids)


# ── Serialiser ────────────────────────────────────────────────────────────────

def _to_read(item: SoftwareItem) -> SoftwareItemRead:
    return SoftwareItemRead(
        id=item.id,
        project_id=item.project_id,
        parent_id=item.parent_id,
        name=item.name,
        description=item.description,
        item_type=item.item_type,
        safety_class=item.safety_class,
        classification_justification=item.classification_justification,
        status=item.status,
        risk_ids=[lnk.risk_id for lnk in item.risk_links],
        requirement_ids=[lnk.requirement_id for lnk in item.requirement_links],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )
