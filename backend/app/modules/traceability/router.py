"""IEC 62304 V-model traceability tree.

The tree is built dynamically from the project's `requirement_categories`
parent_id chain — no hardcoded USER/SYSTEM/SOFTWARE assumptions. Any
project's category taxonomy is honoured:

- Root categories (no parent_id) form the top tier.
- Each child category nests under its parent.
- Leaf categories (no category points to them as parent) carry the design
  elements + system test cases attached to requirements of that type.
"""
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.requirements.model import Requirement, RequirementCategory
from app.modules.risks.model import Risk
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.system_testing.model import (
    SystemTestCase, SystemTestResult, STAdditionalReqLink,
)

router = APIRouter(prefix="/traceability", tags=["traceability"])


@router.get("/{project_id}")
async def get_traceability_tree(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # ── Categories: build the type hierarchy for this project ────────────────
    cats = (await db.execute(
        select(RequirementCategory).where(RequirementCategory.project_id == project_id)
    )).scalars().all()
    cat_by_id = {c.id: c for c in cats}
    cat_by_name = {c.name: c for c in cats}
    children_of: dict[uuid.UUID | None, list[RequirementCategory]] = {}
    for c in cats:
        children_of.setdefault(c.parent_id, []).append(c)
    for v in children_of.values():
        v.sort(key=lambda c: c.sort_order)
    parented = {c.parent_id for c in cats if c.parent_id is not None}
    leaf_names = {c.name for c in cats if c.id not in parented}

    # ── Requirements + risks ─────────────────────────────────────────────────
    reqs = (await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )).scalars().all()
    req_ids = [r.id for r in reqs]

    risks = (await db.execute(
        select(Risk).where(Risk.requirement_id.in_(req_ids))
    )).scalars().all() if req_ids else []
    risks_by_req: dict[uuid.UUID, list] = {}
    for risk in risks:
        risks_by_req.setdefault(risk.requirement_id, []).append({
            "id": str(risk.id), "hazard": risk.hazard, "harm": risk.harm,
            "severity": risk.severity, "probability": risk.probability, "risk_level": risk.risk_level,
        })

    # ── Design elements — attached at leaf-level requirements ────────────────
    leaf_req_ids = [r.id for r in reqs if r.type in leaf_names]

    design_links = (await db.execute(
        select(RequirementDesignLink).where(RequirementDesignLink.requirement_id.in_(leaf_req_ids))
    )).scalars().all() if leaf_req_ids else []
    de_ids = list({l.design_element_id for l in design_links})
    design_elements = (await db.execute(
        select(DesignElement).where(DesignElement.id.in_(de_ids))
    )).scalars().all() if de_ids else []
    de_by_id = {e.id: e for e in design_elements}
    design_by_req: dict[uuid.UUID, list] = {}
    for link in design_links:
        el = de_by_id.get(link.design_element_id)
        if el:
            design_by_req.setdefault(link.requirement_id, []).append({
                "id": str(el.id), "readable_id": el.readable_id, "title": el.title,
            })

    # ── §5.7 System tests — primary FK + additional req links ────────────────
    primary_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.requirement_id.in_(req_ids))
    )).scalars().all() if req_ids else []
    addl_links = (await db.execute(
        select(STAdditionalReqLink).where(STAdditionalReqLink.requirement_id.in_(req_ids))
    )).scalars().all() if req_ids else []
    all_tests = {t.id: t for t in primary_tests}
    addl_test_ids = {l.stc_id for l in addl_links} - set(all_tests.keys())
    if addl_test_ids:
        for t in (await db.execute(
            select(SystemTestCase).where(SystemTestCase.id.in_(addl_test_ids))
        )).scalars().all():
            all_tests[t.id] = t

    tests_by_req: dict[uuid.UUID, list[uuid.UUID]] = {}
    for t in primary_tests:
        if t.requirement_id is not None:
            tests_by_req.setdefault(t.requirement_id, []).append(t.id)
    for l in addl_links:
        if l.stc_id in all_tests:
            tests_by_req.setdefault(l.requirement_id, []).append(l.stc_id)

    latest_exec: dict[uuid.UUID, dict] = {}
    for st_id in all_tests:
        ex = (await db.execute(
            select(SystemTestResult)
            .where(SystemTestResult.test_case_id == st_id)
            .order_by(desc(SystemTestResult.execution_date))
            .limit(1)
        )).scalar_one_or_none()
        if ex:
            latest_exec[st_id] = {"status": ex.result, "executed_at": ex.execution_date.isoformat()}

    # ── Tree assembly ────────────────────────────────────────────────────────
    children_req: dict[uuid.UUID | None, list[Requirement]] = {}
    for r in reqs:
        children_req.setdefault(r.parent_id, []).append(r)

    def req_node(r: Requirement) -> dict:
        return {
            "id": str(r.id), "type": r.type, "title": r.title,
            "description": r.description, "risks": risks_by_req.get(r.id, []),
        }

    def tests_payload(req_id: uuid.UUID) -> list[dict]:
        out = []
        for st_id in tests_by_req.get(req_id, []):
            st = all_tests.get(st_id)
            if not st:
                continue
            out.append({
                "id": str(st_id),
                "name": st.name,
                "latest_execution": latest_exec.get(st_id),
            })
        return out

    def attach_children(node: dict, req: Requirement) -> None:
        own_cat = cat_by_name.get(req.type)
        if not own_cat:
            return
        for child_cat in children_of.get(own_cat.id, []):
            for child_req in (children_req.get(req.id) or []):
                if child_req.type != child_cat.name:
                    continue
                child_node = req_node(child_req)
                attach_children(child_node, child_req)
                if child_req.type in leaf_names:
                    child_node["design_elements"] = design_by_req.get(child_req.id, [])
                    child_node["system_tests"] = tests_payload(child_req.id)
                # Every requirement (leaf or not) may carry validation/system tests
                # via additional links — surface tests at every level.
                if "system_tests" not in child_node:
                    direct = tests_payload(child_req.id)
                    if direct:
                        child_node["system_tests"] = direct
                node.setdefault("children", []).append(child_node)

    root_cat_names = {c.name for c in cats if c.parent_id is None}
    tree: list[dict] = []
    for r in reqs:
        if r.type not in root_cat_names:
            continue
        if r.parent_id is not None:
            continue
        node = req_node(r)
        attach_children(node, r)
        if r.type in leaf_names:
            node["design_elements"] = design_by_req.get(r.id, [])
            node["system_tests"] = tests_payload(r.id)
        elif tests_payload(r.id):
            node["system_tests"] = tests_payload(r.id)
        node.setdefault("children", [])
        tree.append(node)

    _ = cat_by_id
    return tree
