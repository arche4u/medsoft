from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from .model import (
    SystemTestCase, SystemTestResult,
    STAdditionalReqLink, STRiskLink,
    ReleaseArtifact, ReleaseChecklistItem, ReleaseSnapshot,
)
from .schema import (
    SystemTestCaseCreate, SystemTestCaseUpdate, SystemTestCaseRead,
    STResultCreate, STResultRead,
    SetLinksPayload,
    RequirementCoverageItem, ProjectTestCoverage,
    ReleaseArtifactCreate, ReleaseArtifactRead,
    ChecklistItemCreate, ChecklistItemUpdate, ChecklistItemRead,
    ReleaseGateResult, ReleaseReadiness, ReleaseSnapshotRead,
)

router = APIRouter(prefix="/system-testing", tags=["system-testing"])

# ── Default checklist items seeded per release ────────────────────────────────

DEFAULT_CHECKLIST = [
    ("SDP approved", "PLANNING", 1),
    ("All requirements documented", "REQUIREMENTS", 2),
    ("All requirements have system tests", "REQUIREMENTS", 3),
    ("All system tests passed", "TESTING", 4),
    ("All integration tests passed", "TESTING", 5),
    ("All Class C units verified", "TESTING", 6),
    ("Risk assessment complete", "RISK", 7),
    ("All HIGH risks resolved", "RISK", 8),
    ("Architecture documented", "DESIGN", 9),
    ("Traceability matrix complete", "TRACEABILITY", 10),
    ("Electronic signature obtained", "APPROVAL", 11),
    ("Release notes prepared", "RELEASE", 12),
]


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_read(tc: SystemTestCase) -> SystemTestCaseRead:
    latest = tc.results[0].result if tc.results else None
    return SystemTestCaseRead(
        id=tc.id, project_id=tc.project_id, requirement_id=tc.requirement_id,
        name=tc.name, description=tc.description, test_type=tc.test_type,
        preconditions=tc.preconditions, test_steps=tc.test_steps,
        expected_result=tc.expected_result, safety_relevance=tc.safety_relevance,
        results=[STResultRead.model_validate(r) for r in tc.results],
        latest_result=latest,
        additional_requirement_ids=[str(r.requirement_id) for r in tc.additional_req_links],
        risk_ids=[str(r.risk_id) for r in tc.risk_links],
        created_at=tc.created_at, updated_at=tc.updated_at,
    )


# ── system test CRUD ──────────────────────────────────────────────────────────

@router.get("/", response_model=List[SystemTestCaseRead])
async def list_tests(
    project_id: str, requirement_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(SystemTestCase).where(
        SystemTestCase.project_id == uuid.UUID(project_id)
    ).order_by(SystemTestCase.created_at)
    if requirement_id:
        q = q.where(SystemTestCase.requirement_id == uuid.UUID(requirement_id))
    rows = (await db.execute(q)).scalars().all()
    return [_build_read(tc) for tc in rows]


@router.get("/{tc_id}", response_model=SystemTestCaseRead)
async def get_test(tc_id: str, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    return _build_read(tc)


@router.post("/", response_model=SystemTestCaseRead, status_code=201)
async def create_test(body: SystemTestCaseCreate, db: AsyncSession = Depends(get_db)):
    tc = SystemTestCase(**body.model_dump())
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return _build_read(tc)


@router.put("/{tc_id}", response_model=SystemTestCaseRead)
async def update_test(tc_id: str, body: SystemTestCaseUpdate, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(tc, k, v)
    await db.commit()
    await db.refresh(tc)
    return _build_read(tc)


@router.delete("/{tc_id}", status_code=204)
async def delete_test(tc_id: str, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    await db.delete(tc)
    await db.commit()


# ── results ───────────────────────────────────────────────────────────────────

@router.post("/{tc_id}/results", response_model=STResultRead, status_code=201)
async def record_result(tc_id: str, body: STResultCreate, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    if body.result not in ("PASS", "FAIL"):
        raise HTTPException(400, "result must be PASS or FAIL")
    r = SystemTestResult(test_case_id=tc.id, **body.model_dump())
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return STResultRead.model_validate(r)


# ── traceability ──────────────────────────────────────────────────────────────

@router.put("/{tc_id}/requirements", response_model=SystemTestCaseRead)
async def set_requirements(tc_id: str, body: SetLinksPayload, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    await db.execute(delete(STAdditionalReqLink).where(STAdditionalReqLink.stc_id == tc.id))
    for rid in body.ids:
        db.add(STAdditionalReqLink(stc_id=tc.id, requirement_id=uuid.UUID(rid)))
    await db.commit()
    await db.refresh(tc)
    return _build_read(tc)


@router.put("/{tc_id}/risks", response_model=SystemTestCaseRead)
async def set_risks(tc_id: str, body: SetLinksPayload, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "System test not found")
    await db.execute(delete(STRiskLink).where(STRiskLink.stc_id == tc.id))
    for rid in body.ids:
        db.add(STRiskLink(stc_id=tc.id, risk_id=uuid.UUID(rid)))
    await db.commit()
    await db.refresh(tc)
    return _build_read(tc)


# ── requirement coverage ──────────────────────────────────────────────────────

@router.get("/coverage/{project_id}", response_model=ProjectTestCoverage)
async def get_coverage(project_id: str, db: AsyncSession = Depends(get_db)):
    from app.modules.requirements.model import Requirement

    pid = uuid.UUID(project_id)
    reqs = (await db.execute(
        select(Requirement).where(Requirement.project_id == pid).order_by(Requirement.created_at)
    )).scalars().all()

    tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.project_id == pid)
    )).scalars().all()

    # map requirement_id → list of tests (primary + additional)
    tests_by_req: dict[str, list[SystemTestCase]] = {}
    for tc in tests:
        if tc.requirement_id:
            tests_by_req.setdefault(str(tc.requirement_id), []).append(tc)
        for link in tc.additional_req_links:
            tests_by_req.setdefault(str(link.requirement_id), []).append(tc)

    block_reasons: list[str] = []
    coverage_items: list[RequirementCoverageItem] = []

    for req in reqs:
        req_tests = tests_by_req.get(str(req.id), [])
        is_covered = len(req_tests) > 0
        latest = None
        has_pass = False
        for tc in req_tests:
            if tc.results:
                lr = tc.results[0].result
                if latest is None:
                    latest = lr
                if lr == "PASS":
                    has_pass = True

        if not is_covered:
            block_reasons.append(f"{req.readable_id} '{req.title[:40]}': no system test")
        elif not has_pass:
            block_reasons.append(f"{req.readable_id}: no passing test result")

        coverage_items.append(RequirementCoverageItem(
            requirement_id=str(req.id),
            readable_id=req.readable_id or "",
            title=req.title,
            req_type=req.type,
            test_count=len(req_tests),
            latest_result=latest,
            is_covered=is_covered,
            has_pass=has_pass,
        ))

    total = len(reqs)
    covered = sum(1 for i in coverage_items if i.is_covered)
    all_results = [tc.results[0].result for tc in tests if tc.results]
    passed = all_results.count("PASS")
    failed = all_results.count("FAIL")
    not_run = sum(1 for tc in tests if not tc.results)

    if failed > 0:
        block_reasons.append(f"{failed} system test(s) failed")

    return ProjectTestCoverage(
        project_id=project_id,
        total_requirements=total,
        covered_requirements=covered,
        uncovered_requirements=total - covered,
        coverage_pct=covered / total * 100 if total else 100.0,
        total_tests=len(tests),
        passed=passed,
        failed=failed,
        not_run=not_run,
        pass_rate=passed / len(all_results) * 100 if all_results else 0.0,
        requirements=coverage_items,
        release_blocked=len(block_reasons) > 0,
        release_block_reasons=block_reasons,
    )


# ── Release management ─────────────────────────────────────────────────────────

@router.get("/release/{release_id}/readiness", response_model=ReleaseReadiness)
async def get_readiness(release_id: str, db: AsyncSession = Depends(get_db)):
    from app.modules.release.model import Release
    rel = (await db.execute(
        select(Release).where(Release.id == uuid.UUID(release_id))
    )).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")
    return await _compute_readiness(str(rel.id), str(rel.project_id), db)


async def _compute_readiness(release_id: str, project_id: str, db: AsyncSession) -> ReleaseReadiness:
    pid = uuid.UUID(project_id)
    gates: list[ReleaseGateResult] = []

    def gate(key: str, label: str, passed: bool, detail: str, blocking: bool = True) -> None:
        gates.append(ReleaseGateResult(gate=key, label=label, passed=passed, detail=detail, blocking=blocking))

    # 1 — SDP approved
    from app.modules.sdp.model import SoftwareDevelopmentPlan
    sdp = (await db.execute(
        select(SoftwareDevelopmentPlan).where(
            SoftwareDevelopmentPlan.project_id == pid,
            SoftwareDevelopmentPlan.status == "APPROVED",
        ).limit(1)
    )).scalar_one_or_none()
    gate("sdp", "Approved SDP exists", sdp is not None,
         "SDP approved" if sdp else "No approved SDP found")

    # 2 — System test coverage
    cov = await get_coverage(project_id, db)
    gate("sys_coverage", "All requirements have system tests",
         cov.uncovered_requirements == 0,
         f"{cov.covered_requirements}/{cov.total_requirements} requirements covered")

    # 3 — No failed system tests
    gate("sys_pass", "No failed system tests",
         cov.failed == 0,
         f"{cov.failed} failed system test(s)" if cov.failed else "All system tests passing")

    # 4 — Integration test coverage
    from app.modules.integration_tests.router import get_coverage as itc_cov
    itc = await itc_cov(project_id, db)
    gate("itc_coverage", "All interfaces have integration tests",
         itc.uncovered_interfaces == 0,
         f"{itc.covered_interfaces}/{itc.total_interfaces} interfaces covered")
    gate("itc_pass", "No failed integration tests",
         itc.failed == 0,
         f"{itc.failed} failed integration test(s)" if itc.failed else "All integration tests passing")

    # 5 — Class C unit verification
    from app.modules.units.model import SoftwareUnit
    unverified_c = (await db.execute(
        select(SoftwareUnit).where(
            SoftwareUnit.project_id == pid,
            SoftwareUnit.safety_class == "C",
            SoftwareUnit.status != "VERIFIED",
        )
    )).scalars().all()
    gate("unit_c", "All Class C units verified",
         len(unverified_c) == 0,
         f"{len(unverified_c)} Class C unit(s) not verified" if unverified_c else "All Class C units verified")

    # 6 — No unresolved HIGH risks
    from app.modules.risks.model import Risk
    open_high = (await db.execute(
        select(Risk).where(
            Risk.project_id == pid,
            Risk.risk_level == "HIGH",
            Risk.status != "RESOLVED",
        )
    )).scalars().all()
    gate("high_risks", "No unresolved HIGH risks",
         len(open_high) == 0,
         f"{len(open_high)} unresolved HIGH risk(s)" if open_high else "No unresolved HIGH risks")

    # 7 — Release checklist complete
    checklist = (await db.execute(
        select(ReleaseChecklistItem).where(
            ReleaseChecklistItem.release_id == uuid.UUID(release_id),
            ReleaseChecklistItem.status == "PENDING",
        )
    )).scalars().all()
    gate("checklist", "Release checklist complete",
         len(checklist) == 0,
         f"{len(checklist)} checklist item(s) pending" if checklist else "Checklist complete", blocking=False)

    blocking = [g.label for g in gates if g.blocking and not g.passed]
    return ReleaseReadiness(
        release_id=release_id, project_id=project_id,
        is_ready=len(blocking) == 0,
        gates=gates, blocking_failures=blocking,
    )


# ── Checklist management ──────────────────────────────────────────────────────

@router.get("/release/{release_id}/checklist", response_model=List[ChecklistItemRead])
async def get_checklist(release_id: str, db: AsyncSession = Depends(get_db)):
    items = (await db.execute(
        select(ReleaseChecklistItem)
        .where(ReleaseChecklistItem.release_id == uuid.UUID(release_id))
        .order_by(ReleaseChecklistItem.sort_order)
    )).scalars().all()

    if not items:
        # seed default checklist on first access
        for name, cat, order in DEFAULT_CHECKLIST:
            db.add(ReleaseChecklistItem(
                release_id=uuid.UUID(release_id), item_name=name,
                category=cat, sort_order=order, is_auto=True,
            ))
        await db.commit()
        items = (await db.execute(
            select(ReleaseChecklistItem)
            .where(ReleaseChecklistItem.release_id == uuid.UUID(release_id))
            .order_by(ReleaseChecklistItem.sort_order)
        )).scalars().all()

    return [ChecklistItemRead.model_validate(i) for i in items]


@router.post("/release/{release_id}/checklist", response_model=ChecklistItemRead, status_code=201)
async def add_checklist_item(release_id: str, body: ChecklistItemCreate, db: AsyncSession = Depends(get_db)):
    item = ReleaseChecklistItem(release_id=uuid.UUID(release_id), **body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return ChecklistItemRead.model_validate(item)


@router.put("/checklist/{item_id}", response_model=ChecklistItemRead)
async def update_checklist_item(item_id: str, body: ChecklistItemUpdate, db: AsyncSession = Depends(get_db)):
    item = (await db.execute(
        select(ReleaseChecklistItem).where(ReleaseChecklistItem.id == uuid.UUID(item_id))
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Checklist item not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return ChecklistItemRead.model_validate(item)


# ── Release artifacts ─────────────────────────────────────────────────────────

@router.get("/release/{release_id}/artifacts", response_model=List[ReleaseArtifactRead])
async def list_artifacts(release_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ReleaseArtifact).where(ReleaseArtifact.release_id == uuid.UUID(release_id))
    )).scalars().all()
    return [ReleaseArtifactRead.model_validate(r) for r in rows]


@router.post("/release/{release_id}/artifacts", response_model=ReleaseArtifactRead, status_code=201)
async def add_artifact(release_id: str, body: ReleaseArtifactCreate, db: AsyncSession = Depends(get_db)):
    art = ReleaseArtifact(release_id=uuid.UUID(release_id), **body.model_dump())
    db.add(art)
    await db.commit()
    await db.refresh(art)
    return ReleaseArtifactRead.model_validate(art)


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(artifact_id: str, db: AsyncSession = Depends(get_db)):
    art = (await db.execute(
        select(ReleaseArtifact).where(ReleaseArtifact.id == uuid.UUID(artifact_id))
    )).scalar_one_or_none()
    if not art:
        raise HTTPException(404, "Artifact not found")
    await db.delete(art)
    await db.commit()


# ── Traceability snapshot ─────────────────────────────────────────────────────

@router.post("/release/{release_id}/snapshot", response_model=ReleaseSnapshotRead)
async def capture_snapshot(release_id: str, db: AsyncSession = Depends(get_db)):
    from app.modules.release.model import Release
    from app.modules.requirements.model import Requirement
    from app.modules.risks.model import Risk
    from app.modules.units.model import SoftwareUnit
    from app.modules.architecture.model import SWComponent, SWInterface

    rel = (await db.execute(
        select(Release).where(Release.id == uuid.UUID(release_id))
    )).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")

    pid = rel.project_id
    reqs = (await db.execute(select(Requirement).where(Requirement.project_id == pid))).scalars().all()
    risks = (await db.execute(select(Risk).where(Risk.project_id == pid))).scalars().all()
    units = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.project_id == pid))).scalars().all()
    components_q = (await db.execute(select(SWComponent).where(SWComponent.project_id == pid))).scalars().all()
    sys_tests = (await db.execute(select(SystemTestCase).where(SystemTestCase.project_id == pid))).scalars().all()

    snapshot = {
        "release_version": rel.version,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "requirements": [
            {"id": str(r.id), "readable_id": r.readable_id, "type": r.type, "title": r.title}
            for r in reqs
        ],
        "risks": [
            {"id": str(r.id), "hazard": r.hazard, "risk_level": r.risk_level, "status": r.status}
            for r in risks
        ],
        "software_units": [
            {"id": str(u.id), "name": u.name, "safety_class": u.safety_class, "status": u.status}
            for u in units
        ],
        "architecture_components": [
            {"id": str(c.id), "name": c.name, "component_type": str(c.component_type), "safety_class": c.safety_class, "status": str(c.status)}
            for c in components_q
        ],
        "system_tests": [
            {"id": str(tc.id), "name": tc.name, "type": tc.test_type,
             "latest_result": tc.results[0].result if tc.results else None}
            for tc in sys_tests
        ],
        "counts": {
            "requirements": len(reqs),
            "risks": len(risks),
            "units": len(units),
            "system_tests": len(sys_tests),
        },
    }

    # upsert snapshot
    existing = (await db.execute(
        select(ReleaseSnapshot).where(ReleaseSnapshot.release_id == uuid.UUID(release_id))
    )).scalar_one_or_none()

    if existing:
        existing.snapshot_json = json.dumps(snapshot)
        existing.captured_at = datetime.now(timezone.utc)
    else:
        existing = ReleaseSnapshot(
            release_id=uuid.UUID(release_id),
            snapshot_json=json.dumps(snapshot),
        )
        db.add(existing)

    await db.commit()
    await db.refresh(existing)
    return ReleaseSnapshotRead(
        release_id=release_id,
        captured_at=existing.captured_at,
        snapshot=snapshot,
    )


@router.get("/release/{release_id}/snapshot", response_model=ReleaseSnapshotRead)
async def get_snapshot(release_id: str, db: AsyncSession = Depends(get_db)):
    snap = (await db.execute(
        select(ReleaseSnapshot).where(ReleaseSnapshot.release_id == uuid.UUID(release_id))
    )).scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "No snapshot captured yet. POST to /snapshot first.")
    return ReleaseSnapshotRead(
        release_id=release_id,
        captured_at=snap.captured_at,
        snapshot=json.loads(snap.snapshot_json),
    )
