import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.requirements.model import Requirement
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.tracelinks.model import TraceLink
from app.modules.testcases.model import TestCase
from app.modules.verification.model import TestExecution

router = APIRouter(prefix="/impact-analysis", tags=["impact"])


@router.get("/{requirement_id}")
async def impact_analysis(requirement_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, requirement_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")

    # Direct children in requirement hierarchy
    children = (await db.execute(
        select(Requirement).where(Requirement.parent_id == requirement_id)
    )).scalars().all()

    # All requirement IDs in scope: this + children + grandchildren
    scope_ids = [requirement_id] + [c.id for c in children]
    grandchildren = (await db.execute(
        select(Requirement).where(Requirement.parent_id.in_([c.id for c in children]))
    )).scalars().all() if children else []
    scope_ids += [gc.id for gc in grandchildren]

    # Design elements linked to any requirement in scope
    design_links = (await db.execute(
        select(RequirementDesignLink).where(RequirementDesignLink.requirement_id.in_(scope_ids))
    )).scalars().all()

    design_el_ids = list({l.design_element_id for l in design_links})
    design_elements = (await db.execute(
        select(DesignElement).where(DesignElement.id.in_(design_el_ids))
    )).scalars().all() if design_el_ids else []

    # Test cases linked via tracelinks to any req in scope
    trace_links = (await db.execute(
        select(TraceLink).where(TraceLink.requirement_id.in_(scope_ids))
    )).scalars().all()

    tc_ids = list({l.testcase_id for l in trace_links})
    testcases = (await db.execute(
        select(TestCase).where(TestCase.id.in_(tc_ids))
    )).scalars().all() if tc_ids else []

    # Latest execution per test case
    latest_execs = []
    for tc in testcases:
        ex = (await db.execute(
            select(TestExecution)
            .where(TestExecution.testcase_id == tc.id)
            .order_by(desc(TestExecution.executed_at))
            .limit(1)
        )).scalar_one_or_none()
        latest_execs.append({
            "testcase_id": str(tc.id),
            "testcase_title": tc.title,
            "status": ex.status.value if ex else None,
            "executed_at": ex.executed_at.isoformat() if ex else None,
        })

    return {
        "requirement": {
            "id": str(req.id),
            "type": req.type.value,
            "title": req.title,
            "description": req.description,
        },
        "children_requirements": [
            {"id": str(r.id), "type": r.type.value, "title": r.title}
            for r in children + grandchildren
        ],
        "linked_design_elements": [
            {"id": str(e.id), "type": e.type.value, "title": e.title, "description": e.description}
            for e in design_elements
        ],
        "linked_testcases": [
            {"id": str(tc.id), "title": tc.title}
            for tc in testcases
        ],
        "latest_executions": latest_execs,
    }
