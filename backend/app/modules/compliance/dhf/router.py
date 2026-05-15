import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.compliance.dev.requirements.model import Requirement
from app.modules.compliance.dev.design.model import DesignElement, RequirementDesignLink
from app.modules.compliance.risk.risks.model import Risk
from app.modules.compliance.dev.validation.model import ValidationRecord
from app.modules.compliance.dev.sdp.model import SoftwareDevelopmentPlan
# Phase 6+ modules — extending the DHF to cover §4.3 through §9 (TODO A4).
from app.modules.compliance.dev.software_items.model import SoftwareItem, SoftwareItemRequirementLink, SoftwareItemRiskLink
from app.modules.compliance.dev.architecture.model import SWComponent, SWInterface, ArchitectureBaseline
from app.modules.compliance.dev.units.model import SoftwareUnit, CodeArtifact, UnitTestCase, UnitTestResult, UnitRequirementLink
from app.modules.compliance.dev.integration_tests.model import IntegrationTestCase, IntegrationTestResult, ITCRequirementLink
from app.modules.compliance.dev.system_testing.model import (
    SystemTestCase, SystemTestResult, STAdditionalReqLink,
    ReleaseArtifact, ReleaseChecklistItem, ReleaseSnapshot,
)
from app.modules.compliance.release.model import Release, ReleaseItem
from app.modules.compliance.plans.model import Plan, PlanSection
from app.modules.compliance.problems.capa.model import ProblemReport, RootCause, CAPA, CAPAVerification, ProblemLink
from app.modules.compliance.config.config_mgmt.model import CMConfigItem, CMBaseline
from app.modules.platform.esign.model import ElectronicSignature, ESignEntityType

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
async def generate_dhf(
    project_id: uuid.UUID,
    release_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate a DHF for a project. Optionally bind it to a specific release
    (the document captures the project's state at the moment of generation —
    most usefully done at release time, hence the optional release_id input.)"""
    bound_release = None
    if release_id is not None:
        bound_release = (await db.execute(
            select(Release).where(Release.id == release_id)
        )).scalar_one_or_none()
        if not bound_release:
            raise HTTPException(404, "Release not found")
        if bound_release.project_id != project_id:
            raise HTTPException(400, "release_id does not belong to this project")

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

    # ── §4.3 software items (safety classification tree) ──────────────────────
    software_items = (await db.execute(
        select(SoftwareItem).where(SoftwareItem.project_id == project_id)
    )).scalars().all()

    # ── §5.3 architecture (components, interfaces, approved baseline) ─────────
    components = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == project_id)
    )).scalars().all()
    interfaces = (await db.execute(
        select(SWInterface).where(SWInterface.project_id == project_id)
    )).scalars().all()
    arch_baseline = (await db.execute(
        select(ArchitectureBaseline).where(
            ArchitectureBaseline.project_id == project_id,
            ArchitectureBaseline.status == "APPROVED",
        ).order_by(ArchitectureBaseline.approved_at.desc()).limit(1)
    )).scalar_one_or_none()

    # ── §5.5 software units (+ code artifacts, unit tests, results) ──────────
    units = (await db.execute(
        select(SoftwareUnit).where(SoftwareUnit.project_id == project_id)
    )).scalars().all()
    unit_ids = [u.id for u in units]
    code_artifacts = []
    unit_tcs = []
    unit_results = []
    unit_req_links = []
    if unit_ids:
        code_artifacts = (await db.execute(
            select(CodeArtifact).where(CodeArtifact.unit_id.in_(unit_ids))
        )).scalars().all()
        unit_tcs = (await db.execute(
            select(UnitTestCase).where(UnitTestCase.unit_id.in_(unit_ids))
        )).scalars().all()
        unit_req_links = (await db.execute(
            select(UnitRequirementLink).where(UnitRequirementLink.unit_id.in_(unit_ids))
        )).scalars().all()
        if unit_tcs:
            unit_results = (await db.execute(
                select(UnitTestResult).where(
                    UnitTestResult.test_case_id.in_([tc.id for tc in unit_tcs])
                )
            )).scalars().all()

    # ── §5.6 integration tests + results ──────────────────────────────────────
    integration_tests = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.project_id == project_id)
    )).scalars().all()
    itc_results = []
    if integration_tests:
        itc_results = (await db.execute(
            select(IntegrationTestResult).where(
                IntegrationTestResult.test_case_id.in_([t.id for t in integration_tests])
            )
        )).scalars().all()

    # ── §5.7 system tests + results ───────────────────────────────────────────
    system_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.project_id == project_id)
    )).scalars().all()
    stc_results = []
    if system_tests:
        stc_results = (await db.execute(
            select(SystemTestResult).where(
                SystemTestResult.test_case_id.in_([t.id for t in system_tests])
            )
        )).scalars().all()

    # ── §5.8 releases (+ items, snapshots, artifacts, checklist) ──────────────
    releases = (await db.execute(
        select(Release).where(Release.project_id == project_id)
    )).scalars().all()
    rel_ids = [r.id for r in releases]
    release_items = release_snapshots = release_artifacts = release_checklist = []
    if rel_ids:
        release_items = (await db.execute(
            select(ReleaseItem).where(ReleaseItem.release_id.in_(rel_ids))
        )).scalars().all()
        release_snapshots = (await db.execute(
            select(ReleaseSnapshot).where(ReleaseSnapshot.release_id.in_(rel_ids))
        )).scalars().all()
        release_artifacts = (await db.execute(
            select(ReleaseArtifact).where(ReleaseArtifact.release_id.in_(rel_ids))
        )).scalars().all()
        release_checklist = (await db.execute(
            select(ReleaseChecklistItem).where(ReleaseChecklistItem.release_id.in_(rel_ids))
        )).scalars().all()

    # ── §6 / §7 / §8.1 / §9 plans (sections inline) ──────────────────────────
    plans = (await db.execute(
        select(Plan).where(Plan.project_id == project_id)
    )).scalars().all()

    # ── §8 configuration management (items + baselines) ──────────────────────
    cm_items = (await db.execute(
        select(CMConfigItem).where(CMConfigItem.project_id == project_id)
    )).scalars().all()
    cm_baselines = (await db.execute(
        select(CMBaseline).where(CMBaseline.project_id == project_id)
    )).scalars().all()

    # ── §9 CAPA — problem reports + root causes + actions + verifications ────
    problem_reports = (await db.execute(
        select(ProblemReport).where(ProblemReport.project_id == project_id)
    )).scalars().all()

    # ── Cross-cutting: electronic signatures on this project's releases ──────
    esignatures = []
    if rel_ids:
        esignatures = (await db.execute(
            select(ElectronicSignature).where(
                ElectronicSignature.entity_type == ESignEntityType.RELEASE,
                ElectronicSignature.entity_id.in_(rel_ids),
            )
        )).scalars().all()

    # ── Pre-compute the traceability matrix ──────────────────────────────────
    # FDA 21 CFR 820.30 / EU MDR / IEC 62304 §5.2.6 require a traceability
    # matrix. For each SOFTWARE requirement, list every downstream verification
    # artifact (design elements, test cases, system/integration/unit tests,
    # risks, validation records) so auditors can see coverage at a glance.
    def _ids_for(model_list, attr_name):
        return [getattr(x, attr_name) for x in model_list]

    rdl_by_req = {}
    for rdl in req_design_links:
        rdl_by_req.setdefault(rdl.requirement_id, []).append(str(rdl.design_element_id))
    risks_by_req = {}
    for r in risks:
        risks_by_req.setdefault(r.requirement_id, []).append(str(r.id))
    val_by_req = {}
    for v in validations:
        val_by_req.setdefault(v.related_requirement_id, []).append(str(v.id))
    stc_by_req = {}
    for tc in system_tests:
        if tc.requirement_id:
            stc_by_req.setdefault(tc.requirement_id, []).append(str(tc.id))
        for link in tc.additional_req_links:
            stc_by_req.setdefault(link.requirement_id, []).append(str(tc.id))
    itc_by_req = {}
    for tc in integration_tests:
        for link in tc.requirement_links:
            itc_by_req.setdefault(link.requirement_id, []).append(str(tc.id))
    unit_by_req = {}
    for link in unit_req_links:
        unit_by_req.setdefault(link.requirement_id, []).append(str(link.unit_id))

    traceability_matrix = [
        {
            "requirement_id": str(r.id),
            "readable_id": r.readable_id,
            "type": r.type,
            "title": r.title,
            "design_element_ids": rdl_by_req.get(r.id, []),
            "system_test_ids":    stc_by_req.get(r.id, []),
            "integration_test_ids": itc_by_req.get(r.id, []),
            "software_unit_ids":  unit_by_req.get(r.id, []),
            "risk_ids":           risks_by_req.get(r.id, []),
            "validation_ids":     val_by_req.get(r.id, []),
        }
        for r in requirements
    ]

    # Build structured DHF content
    content = {
        "dhf_version": "2.0",
        "project_id": str(project_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        # When generated at release time, the DHF is bound to that release —
        # auditors can trace this DHF revision to its release version.
        "bound_release": {
            "id": str(bound_release.id),
            "version": bound_release.version,
            "status": bound_release.status.value,
        } if bound_release else None,
        "summary": {
            # Phase 0–5
            "total_requirements": len(requirements),
            "total_design_elements": len(design_elements),
            "total_risks": len(risks),
            "total_validations": len(validations),
            "sdp_present": sdp is not None,
            # Phase 6+ — IEC 62304 §4.3 through §9
            "total_software_items": len(software_items),
            "total_architecture_components": len(components),
            "total_architecture_interfaces": len(interfaces),
            "architecture_baseline_approved": arch_baseline is not None,
            "total_software_units": len(units),
            "total_integration_tests": len(integration_tests),
            "total_system_tests": len(system_tests),
            "total_releases": len(releases),
            "total_release_snapshots": len(release_snapshots),
            "total_plans": len(plans),
            "total_cm_config_items": len(cm_items),
            "total_cm_baselines": len(cm_baselines),
            "total_problem_reports": len(problem_reports),
            "total_capas": sum(len(pr.capas) for pr in problem_reports),
            "total_esignatures": len(esignatures),
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
        "requirement_design_links": [
            {
                "requirement_id": str(rdl.requirement_id),
                "design_element_id": str(rdl.design_element_id),
            }
            for rdl in req_design_links
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
        # ── §5.2.6 / §820.30 — traceability matrix (auditor view) ────────────
        "traceability_matrix": traceability_matrix,
        # ── §4.3 software safety classification ──────────────────────────────
        "software_items": [
            {
                "id": str(si.id),
                "parent_id": str(si.parent_id) if si.parent_id else None,
                "name": si.name,
                "description": si.description,
                "item_type": si.item_type,
                "safety_class": si.safety_class,
                "classification_justification": si.classification_justification,
                "status": si.status,
                "requirement_ids": [str(l.requirement_id) for l in si.requirement_links],
                "risk_ids": [str(l.risk_id) for l in si.risk_links],
            }
            for si in software_items
        ],
        # ── §5.3 architecture ─────────────────────────────────────────────────
        "architecture": {
            "approved_baseline": {
                "id": str(arch_baseline.id),
                "version": arch_baseline.version,
                "status": arch_baseline.status,
                "approved_by": arch_baseline.approved_by,
                "approved_at": arch_baseline.approved_at.isoformat() if arch_baseline.approved_at else None,
            } if arch_baseline else None,
            "components": [
                {
                    "id": str(c.id),
                    "parent_id": str(c.parent_id) if c.parent_id else None,
                    "name": c.name, "description": c.description,
                    "component_type": str(c.component_type),
                    "safety_class": c.safety_class,
                    "status": str(c.status), "version": c.version,
                    "rationale": c.rationale,
                }
                for c in components
            ],
            "interfaces": [
                {
                    "id": str(i.id),
                    "source_component_id": str(i.source_component_id),
                    "target_component_id": str(i.target_component_id),
                    "name": i.name, "description": i.description,
                    "interface_type": i.interface_type,
                    "data_format": i.data_format,
                    "communication_method": i.communication_method,
                    "safety_relevant": i.safety_relevant,
                }
                for i in interfaces
            ],
        },
        # ── §5.5 software units + implementation evidence + verification ──────
        "software_units": [
            {
                "id": str(u.id), "component_id": str(u.component_id) if u.component_id else None,
                "name": u.name, "description": u.description,
                "programming_language": u.programming_language,
                "repository_url": u.repository_url, "file_path": u.file_path,
                "safety_class": u.safety_class, "status": u.status,
                "artifact_count": sum(1 for a in code_artifacts if a.unit_id == u.id),
                "test_count": sum(1 for tc in unit_tcs if tc.unit_id == u.id),
            }
            for u in units
        ],
        "code_artifacts": [
            {
                "id": str(a.id), "unit_id": str(a.unit_id),
                "repository": a.repository, "branch": a.branch,
                "commit_id": a.commit_id, "file_path": a.file_path,
                "version_tag": a.version_tag,
            }
            for a in code_artifacts
        ],
        "unit_test_cases": [
            {
                "id": str(tc.id), "unit_id": str(tc.unit_id),
                "name": tc.name, "test_type": tc.test_type,
                "expected_result": tc.expected_result,
                "latest_result": (sorted(
                    [r for r in unit_results if r.test_case_id == tc.id],
                    key=lambda r: r.execution_date, reverse=True,
                )[0].result if any(r.test_case_id == tc.id for r in unit_results) else None),
            }
            for tc in unit_tcs
        ],
        # ── §5.6 integration tests ────────────────────────────────────────────
        "integration_tests": [
            {
                "id": str(tc.id),
                "interface_id": str(tc.interface_id) if tc.interface_id else None,
                "name": tc.name, "test_type": tc.test_type,
                "safety_relevance": tc.safety_relevance,
                "latency_threshold_ms": tc.latency_threshold_ms,
                "latest_result": (sorted(
                    [r for r in itc_results if r.test_case_id == tc.id],
                    key=lambda r: r.execution_date, reverse=True,
                )[0].result if any(r.test_case_id == tc.id for r in itc_results) else None),
            }
            for tc in integration_tests
        ],
        # ── §5.7 system tests ─────────────────────────────────────────────────
        "system_tests": [
            {
                "id": str(tc.id),
                "requirement_id": str(tc.requirement_id) if tc.requirement_id else None,
                "name": tc.name, "test_type": tc.test_type,
                "safety_relevance": tc.safety_relevance,
                "latest_result": (sorted(
                    [r for r in stc_results if r.test_case_id == tc.id],
                    key=lambda r: r.execution_date, reverse=True,
                )[0].result if any(r.test_case_id == tc.id for r in stc_results) else None),
            }
            for tc in system_tests
        ],
        # ── §5.8 releases + configuration baseline + artifacts ───────────────
        "releases": [
            {
                "id": str(rel.id), "version": rel.version, "status": str(rel.status),
                "item_count": sum(1 for ri in release_items if ri.release_id == rel.id),
                "has_snapshot": any(s.release_id == rel.id for s in release_snapshots),
                "artifact_count": sum(1 for a in release_artifacts if a.release_id == rel.id),
            }
            for rel in releases
        ],
        "release_artifacts": [
            {
                "id": str(a.id), "release_id": str(a.release_id),
                "artifact_type": a.artifact_type, "reference_id": a.reference_id,
                "version": a.version, "label": a.label,
            }
            for a in release_artifacts
        ],
        # ── §6/§7/§8/§9 plans (signed-off planning documents) ────────────────
        "plans": [
            {
                "id": str(p.id), "plan_type": p.plan_type, "iec_clause": p.iec_clause,
                "version": p.version, "status": p.status, "safety_class": p.safety_class,
                "title": p.title, "description": p.description,
                "approved_by": p.approved_by,
                "approved_at": p.approved_at.isoformat() if p.approved_at else None,
                "section_count": len(p.sections),
            }
            for p in plans
        ],
        # ── §8 configuration management ───────────────────────────────────────
        "config_management": {
            "items": [
                {
                    "id": str(ci.id), "name": ci.name, "version": ci.version,
                    "type": str(ci.item_type) if hasattr(ci, "item_type") else None,
                }
                for ci in cm_items
            ],
            "baselines": [
                {
                    "id": str(b.id), "name": b.name,
                    "created_at": b.created_at.isoformat() if getattr(b, "created_at", None) else None,
                }
                for b in cm_baselines
            ],
        },
        # ── §9 CAPA — problem resolution ──────────────────────────────────────
        "problem_reports": [
            {
                "id": str(pr.id), "title": pr.title, "description": pr.description,
                "source": pr.source, "severity": pr.severity, "status": pr.status,
                "reported_by": pr.reported_by,
                "root_causes": [
                    {"type": rc.root_cause_type, "description": rc.description,
                     "identified_by": rc.identified_by}
                    for rc in pr.root_causes
                ],
                "capas": [
                    {
                        "id": str(c.id), "action_type": c.action_type,
                        "description": c.description, "assigned_to": c.assigned_to,
                        "status": c.status,
                        "verifications": [
                            {"method": v.verification_method, "result": v.result,
                             "verified_by": v.verified_by, "notes": v.notes}
                            for v in c.verifications
                        ],
                    }
                    for c in pr.capas
                ],
            }
            for pr in problem_reports
        ],
        # ── 21 CFR Part 11 / ISO 13485 audit trail — release sign-offs ───────
        "electronic_signatures": [
            {
                "id": str(s.id), "entity_type": str(s.entity_type),
                "entity_id": str(s.entity_id), "meaning": str(s.meaning),
                "user_id": str(s.user_id),
                "signed_at": s.signed_at.isoformat() if s.signed_at else None,
                "ip_address": s.ip_address, "comments": s.comments,
            }
            for s in esignatures
        ],
    }

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    # Name reflects the bound release version when present — easier for
    # auditors to identify which release a given DHF revision documents.
    name_tag = f"rel-{bound_release.version}-{ts}" if bound_release else f"{project_id}-{ts}"
    doc = DHFDocument(
        project_id=project_id,
        name=f"DHF-{name_tag}",
        file_path=f"/dhf/{project_id}/dhf_{name_tag}.json",
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
