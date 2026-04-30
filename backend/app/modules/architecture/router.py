import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import (
    SWComponent, SWInterface, SWDataFlow,
    SWComponentReqLink, SWComponentRiskLink, SWComponentTCLink,
)
from .schema import (
    ComponentCreate, ComponentRead, ComponentUpdate, ComponentStatusTransition,
    ComponentTreeNode, SetLinksPayload,
    InterfaceCreate, InterfaceRead, InterfaceUpdate,
    DataFlowCreate, DataFlowRead, DataFlowUpdate,
    ArchComplianceCheck, ArchComplianceStatus,
)

router = APIRouter(prefix="/architecture", tags=["architecture"])

# ── Valid parent types per component type ─────────────────────────────────────
VALID_PARENTS: dict[str, set[str]] = {
    "SYSTEM":    set(),                          # no parent allowed
    "SUBSYSTEM": {"SYSTEM"},
    "ITEM":      {"SUBSYSTEM"},
    "UNIT":      {"ITEM", "SUBSYSTEM"},
}

VALID_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT":  {"REVIEW"},
    "REVIEW": {"APPROVED", "DRAFT"},
    "APPROVED": set(),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_editable(c: SWComponent) -> None:
    if c.status == "APPROVED":
        raise HTTPException(400, f"Component '{c.name}' is APPROVED and cannot be edited. Fork to create a new version.")


def _to_read(c: SWComponent, iface_count: int = 0) -> ComponentRead:
    return ComponentRead(
        id=c.id, project_id=c.project_id, parent_id=c.parent_id,
        name=c.name, description=c.description,
        component_type=c.component_type, safety_class=c.safety_class,
        status=c.status, version=c.version, rationale=c.rationale,
        approved_by=c.approved_by, approved_at=c.approved_at,
        requirement_ids=[lnk.requirement_id for lnk in c.req_links],
        risk_ids=[lnk.risk_id for lnk in c.risk_links],
        testcase_ids=[lnk.testcase_id for lnk in c.tc_links],
        interface_count=iface_count,
        created_at=c.created_at, updated_at=c.updated_at,
    )


def _iface_to_read(i: SWInterface) -> InterfaceRead:
    return InterfaceRead(
        id=i.id, project_id=i.project_id,
        source_component_id=i.source_component_id,
        target_component_id=i.target_component_id,
        source_component_name=i.source.name if i.source else "",
        target_component_name=i.target.name if i.target else "",
        interface_type=i.interface_type, name=i.name,
        description=i.description, data_format=i.data_format,
        communication_method=i.communication_method,
        safety_relevant=i.safety_relevant,
        data_flows=i.data_flows,
        created_at=i.created_at, updated_at=i.updated_at,
    )


async def _interface_count(db: AsyncSession, component_id: uuid.UUID) -> int:
    n = (await db.execute(
        select(func.count(SWInterface.id)).where(
            (SWInterface.source_component_id == component_id) |
            (SWInterface.target_component_id == component_id)
        )
    )).scalar_one()
    return n


async def _run_compliance(
    db: AsyncSession, c: SWComponent
) -> ArchComplianceStatus:
    safety_class = c.safety_class
    checks: list[ArchComplianceCheck] = []
    req_ids = [lnk.requirement_id for lnk in c.req_links]
    risk_ids = [lnk.risk_id for lnk in c.risk_links]
    tc_ids = [lnk.testcase_id for lnk in c.tc_links]
    iface_count = await _interface_count(db, c.id)

    # ── Rule 1: Must have description ────────────────────────────
    checks.append(ArchComplianceCheck(
        rule="has_description", label="Component has description",
        required=True, satisfied=bool(c.description and c.description.strip()),
        detail="Description provided" if c.description else "Add a description to this component",
    ))

    # ── Rule 2: Must have safety class explicitly set ─────────────
    checks.append(ArchComplianceCheck(
        rule="has_safety_class", label="Safety class assigned",
        required=True, satisfied=True,
        detail=f"Safety Class {safety_class} assigned",
    ))

    # ── Rule 3: Class B & C — must have at least one interface ────
    if safety_class in ("B", "C"):
        checks.append(ArchComplianceCheck(
            rule="has_interfaces", label="At least one interface defined",
            required=True, satisfied=iface_count > 0,
            detail=f"{iface_count} interface(s) defined" if iface_count > 0
                   else "No interfaces — define at least one in the Interface Map",
        ))

    # ── Rule 4: Class B & C — interfaces must have descriptions ───
    if safety_class in ("B", "C") and iface_count > 0:
        undescribed = (await db.execute(
            select(func.count(SWInterface.id)).where(
                (SWInterface.source_component_id == c.id) |
                (SWInterface.target_component_id == c.id),
                SWInterface.description == None,
            )
        )).scalar_one()
        checks.append(ArchComplianceCheck(
            rule="interfaces_described", label="All interfaces have descriptions",
            required=True, satisfied=undescribed == 0,
            detail="All interfaces described" if undescribed == 0
                   else f"{undescribed} interface(s) missing description",
        ))

    # ── Rule 5: Class B & C — must link requirements ──────────────
    if safety_class in ("B", "C"):
        checks.append(ArchComplianceCheck(
            rule="has_requirements", label="Requirements linked",
            required=True, satisfied=len(req_ids) > 0,
            detail=f"{len(req_ids)} requirement(s) linked" if req_ids
                   else "No requirements linked — trace this component to SOFTWARE requirements",
        ))

    # ── Rule 6: Class B & C — must link risks ─────────────────────
    if safety_class in ("B", "C"):
        checks.append(ArchComplianceCheck(
            rule="has_risks", label="Risks linked (ISO 14971)",
            required=True, satisfied=len(risk_ids) > 0,
            detail=f"{len(risk_ids)} risk(s) linked" if risk_ids
                   else "No risks linked — associate relevant hazards from the Risk Register",
        ))

    # ── Rule 7: Class B & C — must link test cases ────────────────
    if safety_class in ("B", "C"):
        checks.append(ArchComplianceCheck(
            rule="has_testcases", label="Test cases linked",
            required=True, satisfied=len(tc_ids) > 0,
            detail=f"{len(tc_ids)} test case(s) linked" if tc_ids
                   else "No test cases linked — link integration/system tests",
        ))

    # ── Rule 8: Class C — safety-critical interfaces must be flagged
    if safety_class == "C" and iface_count > 0:
        safety_ifaces = (await db.execute(
            select(func.count(SWInterface.id)).where(
                (SWInterface.source_component_id == c.id) |
                (SWInterface.target_component_id == c.id),
                SWInterface.safety_relevant == True,
            )
        )).scalar_one()
        checks.append(ArchComplianceCheck(
            rule="safety_ifaces_flagged",
            label="Safety-relevant interfaces flagged",
            required=True, satisfied=safety_ifaces > 0,
            detail=f"{safety_ifaces} safety-relevant interface(s) flagged" if safety_ifaces > 0
                   else "No interfaces marked safety-relevant — review and flag where applicable",
        ))

    # ── Rule 9: Class C — rationale for classification ────────────
    if safety_class == "C":
        checks.append(ArchComplianceCheck(
            rule="has_rationale", label="Classification rationale provided",
            required=True, satisfied=bool(c.rationale and c.rationale.strip()),
            detail="Rationale provided" if c.rationale
                   else "Add a rationale explaining why Class C was assigned",
        ))

    failed = {ch.rule for ch in checks if ch.required and not ch.satisfied}
    blocks: list[str] = []
    if failed:
        blocks.append("APPROVAL")
    if failed & {"has_interfaces", "has_requirements", "has_risks", "has_testcases",
                 "safety_ifaces_flagged", "interfaces_described"}:
        blocks.append("RELEASE")

    return ArchComplianceStatus(
        component_id=c.id,
        safety_class=safety_class,
        is_compliant=len(failed) == 0,
        checks=checks,
        blocks=list(set(blocks)),
    )


# ── Component CRUD ─────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ComponentRead])
async def list_components(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    comps = (await db.execute(
        select(SWComponent)
        .where(SWComponent.project_id == project_id)
        .order_by(SWComponent.component_type, SWComponent.name)
    )).scalars().all()
    result = []
    for c in comps:
        ic = await _interface_count(db, c.id)
        result.append(_to_read(c, ic))
    return result


@router.post("/", response_model=ComponentRead, status_code=201)
async def create_component(payload: ComponentCreate, db: AsyncSession = Depends(get_db)):
    # Hierarchy enforcement
    if payload.component_type == "SYSTEM" and payload.parent_id:
        raise HTTPException(400, "SYSTEM components cannot have a parent")
    if payload.parent_id:
        parent = await db.get(SWComponent, payload.parent_id)
        if not parent:
            raise HTTPException(400, "Parent component not found")
        if parent.project_id != payload.project_id:
            raise HTTPException(400, "Parent belongs to a different project")
        allowed = VALID_PARENTS.get(payload.component_type, set())
        if parent.component_type not in allowed:
            raise HTTPException(
                400,
                f"{payload.component_type} must have a parent of type "
                f"{' or '.join(allowed)} (got {parent.component_type})"
            )
    elif payload.component_type != "SYSTEM":
        # Non-SYSTEM without parent is allowed (orphan subsystem etc.) but warn-worthy
        pass

    comp = SWComponent(**payload.model_dump())
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return _to_read(comp, 0)


@router.get("/tree/{project_id}", response_model=list[ComponentTreeNode])
async def get_tree(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return full hierarchical tree with compliance flags."""
    all_comps = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == project_id)
    )).scalars().all()

    iface_counts: dict[uuid.UUID, int] = {}
    for c in all_comps:
        iface_counts[c.id] = await _interface_count(db, c.id)

    comp_map = {c.id: c for c in all_comps}

    def _is_compliant(c: SWComponent) -> bool:
        sc = c.safety_class
        if not c.description:
            return False
        if sc in ("B", "C") and iface_counts.get(c.id, 0) == 0:
            return False
        if sc in ("B", "C") and not c.req_links:
            return False
        if sc in ("B", "C") and not c.risk_links:
            return False
        if sc in ("B", "C") and not c.tc_links:
            return False
        return True

    def _build_node(c: SWComponent) -> ComponentTreeNode:
        children_comps = [x for x in all_comps if x.parent_id == c.id]
        return ComponentTreeNode(
            id=c.id, name=c.name, component_type=c.component_type,
            safety_class=c.safety_class, status=c.status, version=c.version,
            description=c.description,
            requirement_ids=[lnk.requirement_id for lnk in c.req_links],
            risk_ids=[lnk.risk_id for lnk in c.risk_links],
            testcase_ids=[lnk.testcase_id for lnk in c.tc_links],
            interface_count=iface_counts.get(c.id, 0),
            is_compliant=_is_compliant(c),
            children=[_build_node(ch) for ch in sorted(children_comps, key=lambda x: x.name)],
        )

    roots = [c for c in all_comps if not c.parent_id]
    roots.sort(key=lambda c: c.name)
    return [_build_node(r) for r in roots]


@router.get("/{component_id}", response_model=ComponentRead)
async def get_component(component_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    return _to_read(c, await _interface_count(db, c.id))


@router.put("/{component_id}", response_model=ComponentRead)
async def update_component(
    component_id: uuid.UUID, payload: ComponentUpdate, db: AsyncSession = Depends(get_db)
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.delete("/{component_id}", status_code=204)
async def delete_component(component_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    if c.status == "APPROVED":
        raise HTTPException(400, "Approved components cannot be deleted")
    await db.delete(c)
    await db.commit()


# ── Status transition ─────────────────────────────────────────────────────────

@router.put("/{component_id}/status", response_model=ComponentRead)
async def transition_status(
    component_id: uuid.UUID, payload: ComponentStatusTransition, db: AsyncSession = Depends(get_db)
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    allowed = VALID_TRANSITIONS.get(c.status, set())
    if payload.status not in allowed:
        raise HTTPException(400, f"Cannot transition {c.status} → {payload.status}. Allowed: {list(allowed)}")

    if payload.status == "APPROVED":
        compliance = await _run_compliance(db, c)
        if not compliance.is_compliant:
            failed = [ch.label for ch in compliance.checks if ch.required and not ch.satisfied]
            raise HTTPException(400, f"Cannot approve: {'; '.join(failed)}")
        c.approved_by = payload.approved_by
        c.approved_at = datetime.now(timezone.utc)

    c.status = payload.status
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


# ── Traceability links ────────────────────────────────────────────────────────

@router.put("/{component_id}/requirements", response_model=ComponentRead)
async def set_requirements(
    component_id: uuid.UUID, payload: SetLinksPayload, db: AsyncSession = Depends(get_db)
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.req_links):
        await db.delete(lnk)
    await db.flush()
    for rid in payload.ids:
        db.add(SWComponentReqLink(component_id=component_id, requirement_id=rid))
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.put("/{component_id}/risks", response_model=ComponentRead)
async def set_risks(
    component_id: uuid.UUID, payload: SetLinksPayload, db: AsyncSession = Depends(get_db)
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.risk_links):
        await db.delete(lnk)
    await db.flush()
    for rid in payload.ids:
        db.add(SWComponentRiskLink(component_id=component_id, risk_id=rid))
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.put("/{component_id}/testcases", response_model=ComponentRead)
async def set_testcases(
    component_id: uuid.UUID, payload: SetLinksPayload, db: AsyncSession = Depends(get_db)
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.tc_links):
        await db.delete(lnk)
    await db.flush()
    for tcid in payload.ids:
        db.add(SWComponentTCLink(component_id=component_id, testcase_id=tcid))
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


# ── Compliance ────────────────────────────────────────────────────────────────

@router.get("/{component_id}/compliance", response_model=ArchComplianceStatus)
async def get_compliance(component_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    return await _run_compliance(db, c)


# ── Interfaces CRUD ───────────────────────────────────────────────────────────

@router.get("/interfaces/{project_id}", response_model=list[InterfaceRead])
async def list_interfaces(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    ifaces = (await db.execute(
        select(SWInterface).where(SWInterface.project_id == project_id)
        .order_by(SWInterface.created_at)
    )).scalars().all()
    return [_iface_to_read(i) for i in ifaces]


@router.post("/interfaces", response_model=InterfaceRead, status_code=201)
async def create_interface(payload: InterfaceCreate, db: AsyncSession = Depends(get_db)):
    if payload.source_component_id == payload.target_component_id:
        raise HTTPException(400, "Source and target components must be different")
    src = await db.get(SWComponent, payload.source_component_id)
    tgt = await db.get(SWComponent, payload.target_component_id)
    if not src or not tgt:
        raise HTTPException(400, "Source or target component not found")
    if src.status == "APPROVED" and tgt.status == "APPROVED":
        raise HTTPException(400, "Both components are APPROVED — fork one to add interfaces")

    iface = SWInterface(**payload.model_dump())
    db.add(iface)
    await db.commit()
    await db.refresh(iface)
    return _iface_to_read(iface)


@router.put("/interfaces/{interface_id}", response_model=InterfaceRead)
async def update_interface(
    interface_id: uuid.UUID, payload: InterfaceUpdate, db: AsyncSession = Depends(get_db)
):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(iface, k, v)
    await db.commit()
    await db.refresh(iface)
    return _iface_to_read(iface)


@router.delete("/interfaces/{interface_id}", status_code=204)
async def delete_interface(interface_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    await db.delete(iface)
    await db.commit()


# ── Data Flows ────────────────────────────────────────────────────────────────

@router.post("/interfaces/{interface_id}/dataflows", response_model=DataFlowRead, status_code=201)
async def add_dataflow(
    interface_id: uuid.UUID, payload: DataFlowCreate, db: AsyncSession = Depends(get_db)
):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    df = SWDataFlow(interface_id=interface_id, **payload.model_dump())
    db.add(df)
    await db.commit()
    await db.refresh(df)
    return df


@router.put("/dataflows/{dataflow_id}", response_model=DataFlowRead)
async def update_dataflow(
    dataflow_id: uuid.UUID, payload: DataFlowUpdate, db: AsyncSession = Depends(get_db)
):
    df = await db.get(SWDataFlow, dataflow_id)
    if not df:
        raise HTTPException(404, "Data flow not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(df, k, v)
    await db.commit()
    await db.refresh(df)
    return df


@router.delete("/dataflows/{dataflow_id}", status_code=204)
async def delete_dataflow(dataflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    df = await db.get(SWDataFlow, dataflow_id)
    if not df:
        raise HTTPException(404, "Data flow not found")
    await db.delete(df)
    await db.commit()
