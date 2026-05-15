import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from .lock import assert_architecture_unlocked
from .constants import COMPONENT_TYPES, VALID_PARENTS, ROOT_COMPONENT_TYPES
from .model import (
    SWComponent, SWInterface, SWDataFlow,
    SWComponentReqLink, SWComponentRiskLink, SWComponentTCLink,
)
from .schema import (
    ComponentCreate, ComponentRead, ComponentUpdate, ComponentStatusTransition,
    ComponentTreeNode, ComponentTypeInfo, SetLinksPayload,
    InterfaceCreate, InterfaceRead, InterfaceUpdate,
    DataFlowCreate, DataFlowRead, DataFlowUpdate,
    ArchComplianceCheck, ArchComplianceStatus,
)

router = APIRouter(prefix="/architecture", tags=["architecture"])

# Component-type taxonomy (VALID_PARENTS, ROOT_COMPONENT_TYPES) is defined once
# in constants.py — see that module to change the SYSTEM→SUBSYSTEM→ITEM→UNIT chain.

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
        diagram_source=c.diagram_source,
        approved_by=c.approved_by, approved_at=c.approved_at,
        requirement_ids=[lnk.requirement_id for lnk in c.req_links],
        risk_ids=[lnk.risk_id for lnk in c.risk_links],
        system_test_ids=[lnk.system_test_id for lnk in c.tc_links],
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


@dataclass
class _ComplianceCtx:
    """Everything a compliance rule needs, precomputed once per component."""
    component: SWComponent
    req_count: int
    risk_count: int
    tc_count: int
    iface_count: int
    undescribed_iface_count: int
    safety_iface_count: int


# Declarative compliance rules (IEC 62304 §5.3.6 architecture verification).
# Each rule states which safety classes it applies to, whether it's required,
# whether failing it blocks RELEASE (every required failure blocks APPROVAL),
# whether it only applies once interfaces exist, and a pure check over the
# precomputed context. Retargeting/adding a rule = editing this list — no
# scattered `if safety_class in (...)` branches.
COMPLIANCE_RULES: list[dict] = [
    {
        "rule": "has_description", "label": "Component has description",
        "applies_to": {"A", "B", "C"}, "required": True, "blocks_release": False,
        "check": lambda x: (
            bool(x.component.description and x.component.description.strip()),
            "Description provided" if x.component.description
            else "Add a description to this component",
        ),
    },
    {
        "rule": "has_safety_class", "label": "Safety class assigned",
        "applies_to": {"A", "B", "C"}, "required": True, "blocks_release": False,
        "check": lambda x: (True, f"Safety Class {x.component.safety_class} assigned"),
    },
    {
        "rule": "has_interfaces", "label": "At least one interface defined",
        "applies_to": {"B", "C"}, "required": True, "blocks_release": True,
        "check": lambda x: (
            x.iface_count > 0,
            f"{x.iface_count} interface(s) defined" if x.iface_count > 0
            else "No interfaces — define at least one in the Interface Map",
        ),
    },
    {
        "rule": "interfaces_described", "label": "All interfaces have descriptions",
        "applies_to": {"B", "C"}, "required": True, "blocks_release": True,
        "requires_interfaces": True,
        "check": lambda x: (
            x.undescribed_iface_count == 0,
            "All interfaces described" if x.undescribed_iface_count == 0
            else f"{x.undescribed_iface_count} interface(s) missing description",
        ),
    },
    {
        "rule": "has_requirements", "label": "Requirements linked",
        "applies_to": {"B", "C"}, "required": True, "blocks_release": True,
        "check": lambda x: (
            x.req_count > 0,
            f"{x.req_count} requirement(s) linked" if x.req_count
            else "No requirements linked — trace this component to SOFTWARE requirements",
        ),
    },
    {
        "rule": "has_risks", "label": "Risks linked (ISO 14971)",
        "applies_to": {"B", "C"}, "required": True, "blocks_release": True,
        "check": lambda x: (
            x.risk_count > 0,
            f"{x.risk_count} risk(s) linked" if x.risk_count
            else "No risks linked — associate relevant hazards from the Risk Register",
        ),
    },
    {
        "rule": "has_system_tests", "label": "System tests linked (§5.7)",
        "applies_to": {"B", "C"}, "required": True, "blocks_release": True,
        "check": lambda x: (
            x.tc_count > 0,
            f"{x.tc_count} system test(s) linked" if x.tc_count
            else "No system tests linked — link §5.7 system tests",
        ),
    },
    {
        "rule": "safety_ifaces_flagged", "label": "Safety-relevant interfaces flagged",
        "applies_to": {"C"}, "required": True, "blocks_release": True,
        "requires_interfaces": True,
        "check": lambda x: (
            x.safety_iface_count > 0,
            f"{x.safety_iface_count} safety-relevant interface(s) flagged" if x.safety_iface_count > 0
            else "No interfaces marked safety-relevant — review and flag where applicable",
        ),
    },
    {
        "rule": "has_rationale", "label": "Classification rationale provided",
        "applies_to": {"C"}, "required": True, "blocks_release": False,
        "check": lambda x: (
            bool(x.component.rationale and x.component.rationale.strip()),
            "Rationale provided" if x.component.rationale
            else "Add a rationale explaining why Class C was assigned",
        ),
    },
]

_RELEASE_BLOCKING_RULES: set[str] = {r["rule"] for r in COMPLIANCE_RULES if r["blocks_release"]}


async def _run_compliance(
    db: AsyncSession, c: SWComponent
) -> ArchComplianceStatus:
    iface_count = await _interface_count(db, c.id)

    # Interface-derived counts — only queried when interfaces exist.
    undescribed = safety_ifaces = 0
    if iface_count > 0:
        undescribed = (await db.execute(
            select(func.count(SWInterface.id)).where(
                (SWInterface.source_component_id == c.id) |
                (SWInterface.target_component_id == c.id),
                SWInterface.description == None,
            )
        )).scalar_one()
        safety_ifaces = (await db.execute(
            select(func.count(SWInterface.id)).where(
                (SWInterface.source_component_id == c.id) |
                (SWInterface.target_component_id == c.id),
                SWInterface.safety_relevant == True,
            )
        )).scalar_one()

    ctx = _ComplianceCtx(
        component=c,
        req_count=len(c.req_links),
        risk_count=len(c.risk_links),
        tc_count=len(c.tc_links),
        iface_count=iface_count,
        undescribed_iface_count=undescribed,
        safety_iface_count=safety_ifaces,
    )

    checks: list[ArchComplianceCheck] = []
    for rule in COMPLIANCE_RULES:
        if c.safety_class not in rule["applies_to"]:
            continue
        if rule.get("requires_interfaces") and iface_count == 0:
            continue
        satisfied, detail = rule["check"](ctx)
        checks.append(ArchComplianceCheck(
            rule=rule["rule"], label=rule["label"],
            required=rule["required"], satisfied=satisfied, detail=detail,
        ))

    failed = {ch.rule for ch in checks if ch.required and not ch.satisfied}
    blocks: list[str] = []
    if failed:
        blocks.append("APPROVAL")
    if failed & _RELEASE_BLOCKING_RULES:
        blocks.append("RELEASE")

    return ArchComplianceStatus(
        component_id=c.id,
        safety_class=c.safety_class,
        is_compliant=len(failed) == 0,
        checks=checks,
        blocks=blocks,
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


@router.get("/component-types", response_model=list[ComponentTypeInfo])
async def list_component_types():
    """The IEC 62304 §5.3 component-type taxonomy (single source: constants.py).

    Defined before the `/{component_id}` route so the literal path isn't
    swallowed by the UUID path param.
    """
    return [ComponentTypeInfo(**t) for t in COMPONENT_TYPES]


@router.post("/", response_model=ComponentRead, status_code=201)
async def create_component(
    payload: ComponentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_ARCHITECTURE")),
):
    await assert_architecture_unlocked(db, payload.project_id)
    # §4.3 — safety class must be one of A/B/C. Component inherits the
    # classification of the parent SoftwareItem; until that FK exists, at
    # least guarantee the value is in the standard.
    if payload.safety_class not in ("A", "B", "C"):
        raise HTTPException(400, f"§4.3: safety_class must be A, B, or C (got '{payload.safety_class}')")
    # Hierarchy enforcement — taxonomy rules come from constants.py.
    is_root_type = payload.component_type in ROOT_COMPONENT_TYPES
    if is_root_type and payload.parent_id:
        raise HTTPException(400, f"{payload.component_type} is a root-level type and cannot have a parent")
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
                f"{' or '.join(sorted(allowed))} (got {parent.component_type})"
            )

    comp = SWComponent(**payload.model_dump())
    db.add(comp)
    await db.flush()
    await audit(db, "sw_component", comp.id, AuditAction.CREATE, current_user.user_id,
                f"{comp.name} [{comp.component_type}, Class {comp.safety_class}]")
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
            system_test_ids=[lnk.system_test_id for lnk in c.tc_links],
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
    component_id: uuid.UUID, payload: ComponentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    await assert_architecture_unlocked(db, c.project_id)
    _assert_editable(c)
    update_fields = payload.model_dump(exclude_unset=True)
    if "safety_class" in update_fields and update_fields["safety_class"] not in ("A", "B", "C"):
        raise HTTPException(400, f"§4.3: safety_class must be A, B, or C (got '{update_fields['safety_class']}')")
    for k, v in update_fields.items():
        setattr(c, k, v)
    await audit(db, "sw_component", c.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.delete("/{component_id}", status_code=204)
async def delete_component(
    component_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_ARCHITECTURE")),
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    await assert_architecture_unlocked(db, c.project_id)
    if c.status == "APPROVED":
        raise HTTPException(400, "Approved components cannot be deleted")
    await audit(db, "sw_component", c.id, AuditAction.DELETE, current_user.user_id, c.name)
    await db.delete(c)
    await db.commit()


# ── Status transition ─────────────────────────────────────────────────────────

@router.put("/{component_id}/status", response_model=ComponentRead)
async def transition_status(
    component_id: uuid.UUID, payload: ComponentStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
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

    prev_status = c.status
    c.status = payload.status
    await audit(db, "sw_component", c.id, AuditAction.UPDATE, current_user.user_id,
                f"Status: {prev_status} → {payload.status}")
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


# ── Traceability links ────────────────────────────────────────────────────────

@router.put("/{component_id}/requirements", response_model=ComponentRead)
async def set_requirements(
    component_id: uuid.UUID, payload: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.req_links):
        await db.delete(lnk)
    await db.flush()
    # Dedup defensively — payloads from rapid clicks / racey UIs could
    # otherwise trip the uq_swcomp_req unique constraint.
    for rid in dict.fromkeys(payload.ids):
        db.add(SWComponentReqLink(component_id=component_id, requirement_id=rid))
    await audit(db, "sw_component", c.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(set(payload.ids))} requirement(s)")
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.put("/{component_id}/risks", response_model=ComponentRead)
async def set_risks(
    component_id: uuid.UUID, payload: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.risk_links):
        await db.delete(lnk)
    await db.flush()
    for rid in dict.fromkeys(payload.ids):
        db.add(SWComponentRiskLink(component_id=component_id, risk_id=rid))
    await audit(db, "sw_component", c.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(set(payload.ids))} risk(s)")
    await db.commit()
    await db.refresh(c)
    return _to_read(c, await _interface_count(db, c.id))


@router.put("/{component_id}/system-tests", response_model=ComponentRead)
async def set_system_tests(
    component_id: uuid.UUID, payload: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    c = await db.get(SWComponent, component_id)
    if not c:
        raise HTTPException(404, "Component not found")
    _assert_editable(c)
    for lnk in list(c.tc_links):
        await db.delete(lnk)
    await db.flush()
    for tcid in dict.fromkeys(payload.ids):
        db.add(SWComponentTCLink(component_id=component_id, system_test_id=tcid))
    await audit(db, "sw_component", c.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(set(payload.ids))} system test(s)")
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
async def create_interface(
    payload: InterfaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_ARCHITECTURE")),
):
    await assert_architecture_unlocked(db, payload.project_id)
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
    await db.flush()
    await audit(db, "sw_interface", iface.id, AuditAction.CREATE, current_user.user_id, iface.name)
    await db.commit()
    await db.refresh(iface)
    return _iface_to_read(iface)


@router.put("/interfaces/{interface_id}", response_model=InterfaceRead)
async def update_interface(
    interface_id: uuid.UUID, payload: InterfaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    await assert_architecture_unlocked(db, iface.project_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(iface, k, v)
    await audit(db, "sw_interface", iface.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(iface)
    return _iface_to_read(iface)


@router.delete("/interfaces/{interface_id}", status_code=204)
async def delete_interface(
    interface_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_ARCHITECTURE")),
):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    await assert_architecture_unlocked(db, iface.project_id)
    await audit(db, "sw_interface", iface.id, AuditAction.DELETE, current_user.user_id, iface.name)
    await db.delete(iface)
    await db.commit()


# ── Data Flows ────────────────────────────────────────────────────────────────

@router.post("/interfaces/{interface_id}/dataflows", response_model=DataFlowRead, status_code=201)
async def add_dataflow(
    interface_id: uuid.UUID, payload: DataFlowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    iface = await db.get(SWInterface, interface_id)
    if not iface:
        raise HTTPException(404, "Interface not found")
    await assert_architecture_unlocked(db, iface.project_id)
    df = SWDataFlow(interface_id=interface_id, **payload.model_dump())
    db.add(df)
    await db.flush()
    await audit(db, "sw_dataflow", df.id, AuditAction.CREATE, current_user.user_id,
                f"{df.data_name} on interface {iface.name}")
    await db.commit()
    await db.refresh(df)
    return df


@router.put("/dataflows/{dataflow_id}", response_model=DataFlowRead)
async def update_dataflow(
    dataflow_id: uuid.UUID, payload: DataFlowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    df = await db.get(SWDataFlow, dataflow_id)
    if not df:
        raise HTTPException(404, "Data flow not found")
    iface = await db.get(SWInterface, df.interface_id)
    if iface:
        await assert_architecture_unlocked(db, iface.project_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(df, k, v)
    await audit(db, "sw_dataflow", df.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(df)
    return df


@router.delete("/dataflows/{dataflow_id}", status_code=204)
async def delete_dataflow(
    dataflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_ARCHITECTURE")),
):
    df = await db.get(SWDataFlow, dataflow_id)
    if not df:
        raise HTTPException(404, "Data flow not found")
    iface = await db.get(SWInterface, df.interface_id)
    if iface:
        await assert_architecture_unlocked(db, iface.project_id)
    await audit(db, "sw_dataflow", df.id, AuditAction.DELETE, current_user.user_id, df.data_name)
    await db.delete(df)
    await db.commit()
