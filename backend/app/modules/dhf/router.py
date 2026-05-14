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
from app.modules.sdp.model import SoftwareDevelopmentPlan

from .model import DHFDocument
from .schema import DHFDocumentRead

router = APIRouter(prefix="/dhf", tags=["dhf"])


# ── Per-module serializers ────────────────────────────────────────────────────
# Each helper turns a single module's data into the JSON shape embedded in DHF.
# Keep them small and module-scoped so adding new modules (units, architecture,
# system_testing, capa, config_mgmt) is a copy-paste of this pattern.

def _serialize_sdp(sdp: SoftwareDevelopmentPlan | None) -> dict | None:
    """IEC 62304 §5.1 — embed the project's APPROVED SDP into the DHF."""
    if sdp is None:
        return None
    return {
        "id": str(sdp.id),
        "version": sdp.version,
        "status": sdp.status,
        "lifecycle_model": sdp.lifecycle_model,
        "safety_class": sdp.safety_class,
        "title": sdp.title,
        "description": sdp.description,
        "approved_by": sdp.approved_by,
        "approved_at": sdp.approved_at.isoformat() if sdp.approved_at else None,
        "sections": [
            {"section_number": s.section_number, "section_name": s.section_name,
             "content": s.content, "sort_order": s.sort_order}
            for s in sorted(sdp.sections, key=lambda x: x.sort_order)
        ],
        "phases": [
            {"phase_name": p.phase_name, "phase_order": p.phase_order,
             "entry_criteria": p.entry_criteria, "exit_criteria": p.exit_criteria,
             "activities": p.activities, "required_for_class": p.required_for_class}
            for p in sorted(sdp.phases, key=lambda x: x.phase_order)
        ],
        "roles": [
            {"role_name": r.role_name, "responsibilities": r.responsibilities,
             "required_for_class": r.required_for_class, "sort_order": r.sort_order}
            for r in sorted(sdp.roles, key=lambda x: x.sort_order)
        ],
    }


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

    # Collect active SDP (IEC 62304 §5.1) — most recent APPROVED plan for project
    sdp = (
        await db.execute(
            select(SoftwareDevelopmentPlan)
            .where(
                SoftwareDevelopmentPlan.project_id == project_id,
                SoftwareDevelopmentPlan.status == "APPROVED",
            )
            .order_by(SoftwareDevelopmentPlan.approved_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    # Build structured DHF content
    content = {
        "dhf_version": "1.1",
        "project_id": str(project_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_requirements": len(requirements),
            "total_design_elements": len(design_elements),
            "total_testcases": len(testcases),
            "total_risks": len(risks),
            "total_validations": len(validations),
            "total_executions": len(executions),
            "sdp_present": sdp is not None,
        },
        "sdp": _serialize_sdp(sdp),
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
                # §5.4 detailed design now belongs to a §5.3 component (the old
                # ARCHITECTURE/DETAILED `type` tier was dropped in k8f9a0b1c2d3).
                "component_id": str(de.component_id) if de.component_id else None,
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
