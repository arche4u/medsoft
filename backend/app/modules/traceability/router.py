import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.requirements.model import Requirement
from app.modules.risks.model import Risk
from app.modules.tracelinks.model import TraceLink
from app.modules.testcases.model import TestCase
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.verification.model import TestExecution

router = APIRouter(prefix="/traceability", tags=["traceability"])


@router.get("/{project_id}")
async def get_traceability_tree(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # ── Fetch all base data ───────────────────────────────────────────────────
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

    # ── Design elements linked to SOFTWARE requirements ───────────────────────
    sw_ids = [r.id for r in reqs if r.type == "SOFTWARE"]

    design_links = (await db.execute(
        select(RequirementDesignLink).where(RequirementDesignLink.requirement_id.in_(sw_ids))
    )).scalars().all() if sw_ids else []

    design_el_ids = list({l.design_element_id for l in design_links})
    design_elements = (await db.execute(
        select(DesignElement).where(DesignElement.id.in_(design_el_ids))
    )).scalars().all() if design_el_ids else []

    de_by_id = {e.id: e for e in design_elements}
    design_by_req: dict[uuid.UUID, list] = {}
    for link in design_links:
        el = de_by_id.get(link.design_element_id)
        if el:
            design_by_req.setdefault(link.requirement_id, []).append({
                "id": str(el.id), "type": el.type.value, "title": el.title,
            })

    # ── Test cases linked via trace links ─────────────────────────────────────
    trace_links = (await db.execute(
        select(TraceLink).where(TraceLink.requirement_id.in_(sw_ids))
    )).scalars().all() if sw_ids else []

    tc_ids = list({l.testcase_id for l in trace_links})
    testcases = (await db.execute(
        select(TestCase).where(TestCase.id.in_(tc_ids))
    )).scalars().all() if tc_ids else []

    tc_by_id = {tc.id: tc for tc in testcases}
    tc_ids_by_req: dict[uuid.UUID, list] = {}
    for link in trace_links:
        tc_ids_by_req.setdefault(link.requirement_id, []).append(link.testcase_id)

    # ── Latest execution per test case ────────────────────────────────────────
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

    # ── Build V-model tree ────────────────────────────────────────────────────
    def req_node(r: Requirement) -> dict:
        return {
            "id": str(r.id), "type": r.type, "title": r.title,
            "description": r.description, "risks": risks_by_req.get(r.id, []),
        }

    user_reqs = [r for r in reqs if r.type == "USER"]
    sys_reqs  = [r for r in reqs if r.type == "SYSTEM"]
    sw_reqs   = [r for r in reqs if r.type == "SOFTWARE"]

    tree = []
    for user in user_reqs:
        node = req_node(user)
        node["children"] = []
        for sys in [s for s in sys_reqs if s.parent_id == user.id]:
            sys_node = req_node(sys)
            sys_node["children"] = []
            for sw in [s for s in sw_reqs if s.parent_id == sys.id]:
                sw_node = req_node(sw)
                sw_node["design_elements"] = design_by_req.get(sw.id, [])
                sw_node["testcases"] = [
                    {
                        "id": str(tc_id),
                        "title": tc_by_id[tc_id].title if tc_id in tc_by_id else "?",
                        "latest_execution": latest_exec.get(tc_id),
                    }
                    for tc_id in tc_ids_by_req.get(sw.id, [])
                ]
                sys_node["children"].append(sw_node)
            node["children"].append(sys_node)
        tree.append(node)

    return tree
