from __future__ import annotations
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from .model import SoftwareUnit, CodeArtifact, UnitTestCase, UnitTestResult, UnitRequirementLink, UnitRiskLink
from .schema import (
    SoftwareUnitCreate, SoftwareUnitUpdate, SoftwareUnitRead,
    CodeArtifactCreate, CodeArtifactUpdate, CodeArtifactRead,
    UnitTestCaseCreate, UnitTestCaseUpdate, UnitTestCaseRead,
    UnitTestResultCreate, UnitTestResultRead,
    SetLinksPayload, UnitStatusTransition,
    UnitCompliance, UnitComplianceCheck, UnitCoverageMetrics,
)

router = APIRouter(prefix="/units", tags=["units"])

MIN_COVERAGE_CLASS_C = 80.0


# ── helpers ──────────────────────────────────────────────────────────────────

async def _reload_unit(db: AsyncSession, unit_id: uuid.UUID) -> SoftwareUnit:
    """Re-select a unit after commit so its lazy='selectin' relationships are
    freshly loaded. db.refresh() expires relationships without reloading them,
    which then triggers a MissingGreenlet error on the sync access inside
    _build_unit_read()."""
    return (await db.execute(
        select(SoftwareUnit).where(SoftwareUnit.id == unit_id)
    )).scalar_one()


async def _reload_testcase(db: AsyncSession, tc_id: uuid.UUID) -> UnitTestCase:
    """Re-select a test case after commit (see _reload_unit) so tc.results is
    freshly loaded for the response builder."""
    return (await db.execute(
        select(UnitTestCase).where(UnitTestCase.id == tc_id)
    )).scalar_one()


def _build_unit_read(unit: SoftwareUnit) -> SoftwareUnitRead:
    tc_reads = []
    for tc in unit.test_cases:
        latest = tc.results[0].result if tc.results else None
        tc_reads.append(UnitTestCaseRead(
            id=tc.id, unit_id=tc.unit_id, name=tc.name,
            description=tc.description, test_type=tc.test_type,
            expected_result=tc.expected_result,
            results=[UnitTestResultRead.model_validate(r) for r in tc.results],
            latest_result=latest,
            created_at=tc.created_at, updated_at=tc.updated_at,
        ))
    return SoftwareUnitRead(
        id=unit.id, project_id=unit.project_id, component_id=unit.component_id,
        name=unit.name, description=unit.description,
        programming_language=unit.programming_language,
        repository_url=unit.repository_url, file_path=unit.file_path,
        safety_class=unit.safety_class, status=unit.status,
        artifacts=[CodeArtifactRead.model_validate(a) for a in unit.artifacts],
        test_cases=tc_reads,
        requirement_ids=[str(r.requirement_id) for r in unit.requirement_links],
        risk_ids=[str(r.risk_id) for r in unit.risk_links],
        created_at=unit.created_at, updated_at=unit.updated_at,
    )


def _run_compliance(unit: SoftwareUnit) -> UnitCompliance:
    cls = unit.safety_class
    checks: list[UnitComplianceCheck] = []
    blocks: list[str] = []

    def add(rule: str, label: str, required: bool, satisfied: bool, detail: str) -> None:
        checks.append(UnitComplianceCheck(rule=rule, label=label, required=required, satisfied=satisfied, detail=detail))
        if required and not satisfied:
            blocks.append(label)

    has_code = len(unit.artifacts) > 0
    add("has_code", "Code artifact linked", cls in ("B", "C"), has_code,
        f"{len(unit.artifacts)} artifact(s) linked" if has_code else "No code artifact linked")

    has_tests = len(unit.test_cases) > 0
    add("has_tests", "Unit tests defined", cls in ("B", "C"), has_tests,
        f"{len(unit.test_cases)} test case(s)" if has_tests else "No unit tests defined")

    executed_cases = [tc for tc in unit.test_cases if tc.results]
    all_executed = len(unit.test_cases) > 0 and len(executed_cases) == len(unit.test_cases)
    add("all_executed", "All test cases executed", cls in ("B", "C"), all_executed,
        f"{len(executed_cases)}/{len(unit.test_cases)} executed" if unit.test_cases else "No tests to execute")

    passed_cases = [tc for tc in executed_cases if tc.results[0].result == "PASS"]
    all_pass = all_executed and len(passed_cases) == len(executed_cases)
    add("all_pass", "All tests passing", cls in ("B", "C"), all_pass,
        f"{len(passed_cases)}/{len(executed_cases)} passing" if executed_cases else "No results yet")

    # coverage — only required for Class C
    coverages = [tc.results[0].coverage_percentage for tc in executed_cases if tc.results[0].coverage_percentage is not None]
    avg_cov = sum(coverages) / len(coverages) if coverages else None
    cov_ok = avg_cov is not None and avg_cov >= MIN_COVERAGE_CLASS_C
    add("coverage", f"Coverage ≥ {MIN_COVERAGE_CLASS_C}%", cls == "C", cov_ok,
        f"{avg_cov:.1f}% average" if avg_cov is not None else "No coverage data")

    has_reqs = len(unit.requirement_links) > 0
    add("has_requirements", "Linked to requirements", cls in ("B", "C"), has_reqs,
        f"{len(unit.requirement_links)} requirement(s) linked" if has_reqs else "No requirements linked")

    is_compliant = len(blocks) == 0
    return UnitCompliance(unit_id=str(unit.id), safety_class=cls, is_compliant=is_compliant, checks=checks, blocks=blocks)


# ── units CRUD ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[SoftwareUnitRead])
async def list_units(project_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(SoftwareUnit).where(SoftwareUnit.project_id == uuid.UUID(project_id))
        .order_by(SoftwareUnit.created_at)
    )).scalars().all()
    return [_build_unit_read(u) for u in rows]


@router.get("/{unit_id}", response_model=SoftwareUnitRead)
async def get_unit(unit_id: str, db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    return _build_unit_read(unit)


@router.post("/", response_model=SoftwareUnitRead, status_code=201)
async def create_unit(
    body: SoftwareUnitCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_SOFTWARE_UNIT")),
):
    unit = SoftwareUnit(**body.model_dump())
    db.add(unit)
    await db.flush()
    await audit(db, "software_unit", unit.id, AuditAction.CREATE, current_user.user_id,
                f"{unit.name} (Class {unit.safety_class})")
    await db.commit()
    unit = await _reload_unit(db, unit.id)
    return _build_unit_read(unit)


@router.put("/{unit_id}", response_model=SoftwareUnitRead)
async def update_unit(
    unit_id: str, body: SoftwareUnitUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(unit, k, v)
    await audit(db, "software_unit", unit.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    unit = await _reload_unit(db, unit.id)
    return _build_unit_read(unit)


@router.delete("/{unit_id}", status_code=204)
async def delete_unit(
    unit_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    await audit(db, "software_unit", unit.id, AuditAction.DELETE, current_user.user_id, unit.name)
    await db.delete(unit)
    await db.commit()


# ── status transitions ────────────────────────────────────────────────────────

@router.put("/{unit_id}/status", response_model=SoftwareUnitRead)
async def transition_status(
    unit_id: str, body: UnitStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")

    new_status = body.status
    if new_status == "IMPLEMENTED":
        if not unit.artifacts:
            raise HTTPException(400, "Cannot mark as Implemented: no code artifact linked")
    elif new_status == "VERIFIED":
        compliance = _run_compliance(unit)
        if not compliance.is_compliant:
            raise HTTPException(400, f"Cannot mark as Verified: {'; '.join(compliance.blocks)}")
        # Additionally check all tests pass regardless of class
        for tc in unit.test_cases:
            if not tc.results:
                raise HTTPException(400, f"Test case '{tc.name}' has no execution results")
            if tc.results[0].result != "PASS":
                raise HTTPException(400, f"Test case '{tc.name}' is not PASS")

    prev_status = unit.status
    unit.status = new_status
    await audit(db, "software_unit", unit.id, AuditAction.UPDATE, current_user.user_id,
                f"Status: {prev_status} → {new_status}")
    await db.commit()
    unit = await _reload_unit(db, unit.id)
    return _build_unit_read(unit)


# ── compliance ────────────────────────────────────────────────────────────────

@router.get("/{unit_id}/compliance", response_model=UnitCompliance)
async def get_compliance(unit_id: str, db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    return _run_compliance(unit)


# ── coverage metrics ──────────────────────────────────────────────────────────

@router.get("/{unit_id}/coverage", response_model=UnitCoverageMetrics)
async def get_coverage(unit_id: str, db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")

    total = len(unit.test_cases)
    executed = [tc for tc in unit.test_cases if tc.results]
    passed = [tc for tc in executed if tc.results[0].result == "PASS"]
    failed = [tc for tc in executed if tc.results[0].result == "FAIL"]
    not_run = total - len(executed)
    coverages = [tc.results[0].coverage_percentage for tc in executed if tc.results[0].coverage_percentage is not None]
    avg_cov = sum(coverages) / len(coverages) if coverages else None
    min_cov = min(coverages) if coverages else None
    pass_rate = len(passed) / len(executed) * 100 if executed else 0.0

    return UnitCoverageMetrics(
        unit_id=unit_id, total_test_cases=total,
        executed=len(executed), passed=len(passed), failed=len(failed), not_run=not_run,
        avg_coverage=avg_cov, min_coverage=min_cov, pass_rate=pass_rate,
    )


# ── traceability links ────────────────────────────────────────────────────────

@router.put("/{unit_id}/requirements", response_model=SoftwareUnitRead)
async def set_requirements(
    unit_id: str, body: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    await db.execute(delete(UnitRequirementLink).where(UnitRequirementLink.unit_id == unit.id))
    for rid in body.ids:
        db.add(UnitRequirementLink(unit_id=unit.id, requirement_id=uuid.UUID(rid)))
    await audit(db, "software_unit", unit.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(body.ids)} requirement(s)")
    await db.commit()
    unit = await _reload_unit(db, unit.id)
    return _build_unit_read(unit)


@router.put("/{unit_id}/risks", response_model=SoftwareUnitRead)
async def set_risks(
    unit_id: str, body: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    await db.execute(delete(UnitRiskLink).where(UnitRiskLink.unit_id == unit.id))
    for rid in body.ids:
        db.add(UnitRiskLink(unit_id=unit.id, risk_id=uuid.UUID(rid)))
    await audit(db, "software_unit", unit.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(body.ids)} risk(s)")
    await db.commit()
    unit = await _reload_unit(db, unit.id)
    return _build_unit_read(unit)


# ── code artifacts ────────────────────────────────────────────────────────────

@router.post("/{unit_id}/artifacts", response_model=CodeArtifactRead, status_code=201)
async def add_artifact(
    unit_id: str, body: CodeArtifactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    artifact = CodeArtifact(unit_id=unit.id, **body.model_dump())
    db.add(artifact)
    await db.flush()
    await audit(db, "code_artifact", artifact.id, AuditAction.CREATE, current_user.user_id,
                f"{artifact.repository}{(' @ ' + artifact.commit_id) if artifact.commit_id else ''}")
    await db.commit()
    await db.refresh(artifact)
    return CodeArtifactRead.model_validate(artifact)


@router.put("/artifacts/{artifact_id}", response_model=CodeArtifactRead)
async def update_artifact(
    artifact_id: str, body: CodeArtifactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    artifact = (await db.execute(select(CodeArtifact).where(CodeArtifact.id == uuid.UUID(artifact_id)))).scalar_one_or_none()
    if not artifact:
        raise HTTPException(404, "Artifact not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(artifact, k, v)
    await audit(db, "code_artifact", artifact.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(artifact)
    return CodeArtifactRead.model_validate(artifact)


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    artifact_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    artifact = (await db.execute(select(CodeArtifact).where(CodeArtifact.id == uuid.UUID(artifact_id)))).scalar_one_or_none()
    if not artifact:
        raise HTTPException(404, "Artifact not found")
    await audit(db, "code_artifact", artifact.id, AuditAction.DELETE, current_user.user_id, artifact.repository)
    await db.delete(artifact)
    await db.commit()


# ── unit test cases ───────────────────────────────────────────────────────────

@router.post("/{unit_id}/testcases", response_model=UnitTestCaseRead, status_code=201)
async def add_testcase(
    unit_id: str, body: UnitTestCaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    unit = (await db.execute(select(SoftwareUnit).where(SoftwareUnit.id == uuid.UUID(unit_id)))).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Unit not found")
    tc = UnitTestCase(unit_id=unit.id, **body.model_dump())
    db.add(tc)
    await db.flush()
    await audit(db, "unit_test_case", tc.id, AuditAction.CREATE, current_user.user_id,
                f"{tc.name} ({tc.test_type})")
    await db.commit()
    tc = await _reload_testcase(db, tc.id)
    latest = tc.results[0].result if tc.results else None
    return UnitTestCaseRead(
        id=tc.id, unit_id=tc.unit_id, name=tc.name, description=tc.description,
        test_type=tc.test_type, expected_result=tc.expected_result,
        results=[], latest_result=latest, created_at=tc.created_at, updated_at=tc.updated_at,
    )


@router.put("/testcases/{tc_id}", response_model=UnitTestCaseRead)
async def update_testcase(
    tc_id: str, body: UnitTestCaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    tc = (await db.execute(select(UnitTestCase).where(UnitTestCase.id == uuid.UUID(tc_id)))).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Test case not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(tc, k, v)
    await audit(db, "unit_test_case", tc.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    tc = await _reload_testcase(db, tc.id)
    latest = tc.results[0].result if tc.results else None
    return UnitTestCaseRead(
        id=tc.id, unit_id=tc.unit_id, name=tc.name, description=tc.description,
        test_type=tc.test_type, expected_result=tc.expected_result,
        results=[UnitTestResultRead.model_validate(r) for r in tc.results],
        latest_result=latest, created_at=tc.created_at, updated_at=tc.updated_at,
    )


@router.delete("/testcases/{tc_id}", status_code=204)
async def delete_testcase(
    tc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_SOFTWARE_UNIT")),
):
    tc = (await db.execute(select(UnitTestCase).where(UnitTestCase.id == uuid.UUID(tc_id)))).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Test case not found")
    await audit(db, "unit_test_case", tc.id, AuditAction.DELETE, current_user.user_id, tc.name)
    await db.delete(tc)
    await db.commit()


# ── test results ──────────────────────────────────────────────────────────────

@router.post("/testcases/{tc_id}/results", response_model=UnitTestResultRead, status_code=201)
async def record_result(
    tc_id: str, body: UnitTestResultCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("EXECUTE_TEST")),
):
    tc = (await db.execute(select(UnitTestCase).where(UnitTestCase.id == uuid.UUID(tc_id)))).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Test case not found")
    if body.result not in ("PASS", "FAIL"):
        raise HTTPException(400, "Result must be PASS or FAIL")
    result = UnitTestResult(test_case_id=tc.id, **body.model_dump())
    db.add(result)
    await db.flush()
    cov = f", coverage {body.coverage_percentage}%" if body.coverage_percentage is not None else ""
    await audit(db, "unit_test_result", result.id, AuditAction.CREATE, current_user.user_id,
                f"{tc.name}: {body.result}{cov}")
    await db.commit()
    await db.refresh(result)
    return UnitTestResultRead.model_validate(result)
