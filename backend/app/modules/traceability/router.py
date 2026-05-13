"""IEC 62304 V-model traceability tree.

The tree is built dynamically from the project's `requirement_categories`
parent_id chain — no hardcoded USER/SYSTEM/SOFTWARE assumptions. Any
project's category taxonomy is honoured:

- Root categories (no parent_id) form the top tier.
- Each child category nests under its parent.
- Leaf categories (no category points to them as parent) carry the design
  elements + test cases + executions attached to requirements of that type.
"""
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.requirements.model import Requirement, RequirementCategory
from app.modules.risks.model import Risk
from app.modules.tracelinks.model import TraceLink
from app.modules.testcases.model import TestCase
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.verification.model import TestExecution

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

    # ── Design/test/execution links — attached at leaf-level requirements ────
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
                "id": str(el.id), "type": el.type.value, "title": el.title,
            })

    trace_links = (await db.execute(
        select(TraceLink).where(TraceLink.requirement_id.in_(leaf_req_ids))
    )).scalars().all() if leaf_req_ids else []
    tc_ids = list({l.testcase_id for l in trace_links})
    testcases = (await db.execute(
        select(TestCase).where(TestCase.id.in_(tc_ids))
    )).scalars().all() if tc_ids else []
    tc_by_id = {tc.id: tc for tc in testcases}
    tc_ids_by_req: dict[uuid.UUID, list] = {}
    for link in trace_links:
        tc_ids_by_req.setdefault(link.requirement_id, []).append(link.testcase_id)

    latest_exec: dict[uuid.UUID, dict] = {}
    for tc_id in tc_ids:
        ex = (await db.execute(
            select(TestExecution)
            .where(TestExecution.testcase_id == tc_id)
            .order_by(desc(TestExecution.executed_at))
            .limit(1)
        )).scalar_one_or_none()
        if ex:
            latest_exec[tc_id] = {"status": ex.status.value, "executed_at": ex.executed_at.isoformat()}

    # ── Tree assembly ────────────────────────────────────────────────────────
    # Requirements indexed by parent_id for fast lookup at each level.
    children_req: dict[uuid.UUID | None, list[Requirement]] = {}
    for r in reqs:
        children_req.setdefault(r.parent_id, []).append(r)

    def req_node(r: Requirement) -> dict:
        return {
            "id": str(r.id), "type": r.type, "title": r.title,
            "description": r.description, "risks": risks_by_req.get(r.id, []),
        }

    def attach_children(node: dict, req: Requirement) -> None:
        """For each downstream category under this requirement's category,
        find requirements of that downstream type whose parent_id == req.id."""
        own_cat = cat_by_name.get(req.type)
        if not own_cat:
            return
        for child_cat in children_of.get(own_cat.id, []):
            for child_req in (children_req.get(req.id) or []):
                if child_req.type != child_cat.name:
                    continue
                child_node = req_node(child_req)
                attach_children(child_node, child_req)
                # If this is a leaf-level requirement, attach design+tests.
                if child_req.type in leaf_names:
                    child_node["design_elements"] = design_by_req.get(child_req.id, [])
                    child_node["testcases"] = [
                        {
                            "id": str(tc_id),
                            "title": tc_by_id[tc_id].title if tc_id in tc_by_id else "?",
                            "latest_execution": latest_exec.get(tc_id),
                        }
                        for tc_id in tc_ids_by_req.get(child_req.id, [])
                    ]
                node.setdefault("children", []).append(child_node)

    # Top-level entries: roots of the requirements tree = requirements whose
    # category has no parent_id.
    root_cat_names = {c.name for c in cats if c.parent_id is None}
    tree: list[dict] = []
    for r in reqs:
        if r.type not in root_cat_names:
            continue
        if r.parent_id is not None:
            continue
        node = req_node(r)
        attach_children(node, r)
        # If a root category is also a leaf (single-tier project), attach
        # design + tests at the root too.
        if r.type in leaf_names:
            node["design_elements"] = design_by_req.get(r.id, [])
            node["testcases"] = [
                {
                    "id": str(tc_id),
                    "title": tc_by_id[tc_id].title if tc_id in tc_by_id else "?",
                    "latest_execution": latest_exec.get(tc_id),
                }
                for tc_id in tc_ids_by_req.get(r.id, [])
            ]
        node.setdefault("children", [])
        tree.append(node)

    # Silence unused-var warnings on cat_by_id (kept for future helpers).
    _ = cat_by_id
    return tree
