import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.compliance.dev.requirements.model import Requirement
from app.modules.compliance.dev.design.model import DesignElement, RequirementDesignLink
from app.modules.compliance.dev.system_testing.model import (
    SystemTestCase, SystemTestResult, STAdditionalReqLink,
)

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

    # §5.7 System tests linked to any req in scope (primary FK + additional links)
    primary_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.requirement_id.in_(scope_ids))
    )).scalars().all()
    addl_links = (await db.execute(
        select(STAdditionalReqLink).where(STAdditionalReqLink.requirement_id.in_(scope_ids))
    )).scalars().all()
    addl_test_ids = {l.stc_id for l in addl_links} - {t.id for t in primary_tests}
    addl_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id.in_(addl_test_ids))
    )).scalars().all() if addl_test_ids else []
    system_tests = list(primary_tests) + list(addl_tests)

    # Latest execution per system test
    latest_execs = []
    for st in system_tests:
        ex = (await db.execute(
            select(SystemTestResult)
            .where(SystemTestResult.test_case_id == st.id)
            .order_by(desc(SystemTestResult.execution_date))
            .limit(1)
        )).scalar_one_or_none()
        latest_execs.append({
            "system_test_id": str(st.id),
            "system_test_name": st.name,
            "status": ex.result if ex else None,
            "executed_at": ex.execution_date.isoformat() if ex else None,
        })

    return {
        "requirement": {
            "id": str(req.id),
            "type": req.type,
            "title": req.title,
            "description": req.description,
        },
        "children_requirements": [
            {"id": str(r.id), "type": r.type, "title": r.title}
            for r in children + grandchildren
        ],
        "linked_design_elements": [
            {"id": str(e.id), "readable_id": e.readable_id, "title": e.title, "description": e.description}
            for e in design_elements
        ],
        "linked_system_tests": [
            {"id": str(st.id), "name": st.name}
            for st in system_tests
        ],
        "latest_executions": latest_execs,
    }
