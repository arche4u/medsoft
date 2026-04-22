import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.requirements.model import Requirement
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.testcases.model import TestCase
from app.modules.tracelinks.model import TraceLink
from app.modules.risks.model import Risk
from app.modules.validation.model import ValidationRecord
from app.modules.verification.model import TestExecution

from .model import DHFDocument
from .schema import DHFDocumentRead

router = APIRouter(prefix="/dhf", tags=["dhf"])


@router.post("/generate/{project_id}", response_model=DHFDocumentRead, status_code=201)
async def generate_dhf(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Collect all requirements
    requirements = (
        await db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )
    ).scalars().all()
    req_ids = [r.id for r in requirements]

    # Collect design elements
    design_elements = (
        await db.execute(
            select(DesignElement).where(DesignElement.project_id == project_id)
        )
    ).scalars().all()
    de_ids = [de.id for de in design_elements]

    # Collect test cases
    testcases = (
        await db.execute(
            select(TestCase).where(TestCase.project_id == project_id)
        )
    ).scalars().all()
    tc_ids = [tc.id for tc in testcases]

    # Collect trace links
    tracelinks = []
    if req_ids:
        tracelinks = (
            await db.execute(
                select(TraceLink).where(TraceLink.requirement_id.in_(req_ids))
            )
        ).scalars().all()

    # Collect risks
    risks = []
    if req_ids:
        risks = (
            await db.execute(
                select(Risk).where(Risk.requirement_id.in_(req_ids))
            )
        ).scalars().all()

    # Collect validation records
    validations = (
        await db.execute(
            select(ValidationRecord).where(ValidationRecord.project_id == project_id)
        )
    ).scalars().all()

    # Collect latest test executions
    executions = []
    for tc_id in tc_ids:
        latest = (
            await db.execute(
                select(TestExecution)
                .where(TestExecution.testcase_id == tc_id)
                .order_by(TestExecution.executed_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if latest:
            executions.append(latest)

    # Collect requirement-design links
    req_design_links = []
    if req_ids:
        req_design_links = (
            await db.execute(
                select(RequirementDesignLink).where(
                    RequirementDesignLink.requirement_id.in_(req_ids)
                )
            )
        ).scalars().all()

    # Build structured DHF content
    content = {
        "dhf_version": "1.0",
        "project_id": str(project_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_requirements": len(requirements),
            "total_design_elements": len(design_elements),
            "total_testcases": len(testcases),
            "total_risks": len(risks),
            "total_validations": len(validations),
            "total_executions": len(executions),
        },
        "requirements": [
            {
                "id": str(r.id),
                "readable_id": r.readable_id,
                "type": r.type,
                "title": r.title,
                "description": r.description,
                "parent_id": str(r.parent_id) if r.parent_id else None,
            }
            for r in requirements
        ],
        "design_elements": [
            {
                "id": str(de.id),
                "readable_id": de.readable_id,
                "type": de.type.value,
                "title": de.title,
                "description": de.description,
                "parent_id": str(de.parent_id) if de.parent_id else None,
                "diagram_source": de.diagram_source,
            }
            for de in design_elements
        ],
        "traceability": [
            {"requirement_id": str(tl.requirement_id), "testcase_id": str(tl.testcase_id)}
            for tl in tracelinks
        ],
        "requirement_design_links": [
            {
                "requirement_id": str(rdl.requirement_id),
                "design_element_id": str(rdl.design_element_id),
            }
            for rdl in req_design_links
        ],
        "testcases": [
            {"id": str(tc.id), "title": tc.title, "description": tc.description}
            for tc in testcases
        ],
        "test_results": [
            {
                "testcase_id": str(ex.testcase_id),
                "status": ex.status.value,
                "executed_at": ex.executed_at.isoformat(),
                "notes": ex.notes,
            }
            for ex in executions
        ],
        "risks": [
            {
                "id": str(r.id),
                "requirement_id": str(r.requirement_id),
                "hazard": r.hazard,
                "hazardous_situation": r.hazardous_situation,
                "harm": r.harm,
                "severity": r.severity,
                "probability": r.probability,
                "risk_level": r.risk_level,
            }
            for r in risks
        ],
        "validation_records": [
            {
                "id": str(v.id),
                "requirement_id": str(v.related_requirement_id),
                "description": v.description,
                "status": v.status.value,
            }
            for v in validations
        ],
    }

    doc = DHFDocument(
        project_id=project_id,
        name=f"DHF-{project_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        file_path=f"/dhf/{project_id}/dhf_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.json",
        content=json.dumps(content, indent=2),
        generated_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    await db.flush()
    await audit(db, "DHFDocument", doc.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents", response_model=list[DHFDocumentRead])
async def list_documents(
    project_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(DHFDocument).order_by(DHFDocument.generated_at.desc())
    if project_id:
        q = q.where(DHFDocument.project_id == project_id)
    return (await db.execute(q)).scalars().all()


@router.get("/documents/{doc_id}", response_model=DHFDocumentRead)
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = (await db.execute(select(DHFDocument).where(DHFDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "DHFDocument not found")
    return doc
