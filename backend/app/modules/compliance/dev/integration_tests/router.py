from __future__ import annotations
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from .model import IntegrationTestCase, IntegrationTestResult, ITCRequirementLink, ITCRiskLink
from .schema import (
    IntegrationTestCaseCreate, IntegrationTestCaseUpdate, IntegrationTestCaseRead,
    ITCResultCreate, ITCResultRead,
    SetLinksPayload,
    InterfaceCoverageItem, ProjectCoverage, PerformanceMetrics,
)

router = APIRouter(prefix="/integration-tests", tags=["integration-tests"])


# ── helpers ───────────────────────────────────────────────────────────────────

async def _reload_test(db: AsyncSession, tc_id: uuid.UUID) -> IntegrationTestCase:
    """Re-select a test case after commit so its lazy='selectin' relationships
    are freshly loaded. db.refresh() expires relationships without reloading
    them, which then triggers MissingGreenlet on the sync access in _build_read()."""
    return (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == tc_id)
    )).scalar_one()


def _build_read(tc: IntegrationTestCase) -> IntegrationTestCaseRead:
    latest = tc.results[0].result if tc.results else None
    return IntegrationTestCaseRead(
        id=tc.id, project_id=tc.project_id,
        interface_id=tc.interface_id,
        source_component_id=tc.source_component_id,
        target_component_id=tc.target_component_id,
        name=tc.name, description=tc.description,
        test_type=tc.test_type, preconditions=tc.preconditions,
        test_steps=tc.test_steps, expected_result=tc.expected_result,
        safety_relevance=tc.safety_relevance,
        latency_threshold_ms=tc.latency_threshold_ms,
        results=[ITCResultRead.model_validate(r) for r in tc.results],
        latest_result=latest,
        requirement_ids=[str(r.requirement_id) for r in tc.requirement_links],
        risk_ids=[str(r.risk_id) for r in tc.risk_links],
        created_at=tc.created_at, updated_at=tc.updated_at,
    )


# ── test case CRUD ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[IntegrationTestCaseRead])
async def list_tests(
    project_id: str,
    interface_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(IntegrationTestCase).where(
        IntegrationTestCase.project_id == uuid.UUID(project_id)
    ).order_by(IntegrationTestCase.created_at)
    if interface_id:
        q = q.where(IntegrationTestCase.interface_id == uuid.UUID(interface_id))
    rows = (await db.execute(q)).scalars().all()
    return [_build_read(tc) for tc in rows]


@router.get("/{tc_id}", response_model=IntegrationTestCaseRead)
async def get_test(tc_id: str, db: AsyncSession = Depends(get_db)):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    return _build_read(tc)


@router.post("/", response_model=IntegrationTestCaseRead, status_code=201)
async def create_test(
    body: IntegrationTestCaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_INTEGRATION_TEST")),
):
    tc = IntegrationTestCase(**body.model_dump())
    db.add(tc)
    await db.flush()
    await audit(db, "integration_test_case", tc.id, AuditAction.CREATE, current_user.user_id,
                f"{tc.name} ({tc.test_type})")
    await db.commit()
    tc = await _reload_test(db, tc.id)
    return _build_read(tc)


@router.put("/{tc_id}", response_model=IntegrationTestCaseRead)
async def update_test(
    tc_id: str, body: IntegrationTestCaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_INTEGRATION_TEST")),
):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(tc, k, v)
    await audit(db, "integration_test_case", tc.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    tc = await _reload_test(db, tc.id)
    return _build_read(tc)


@router.delete("/{tc_id}", status_code=204)
async def delete_test(
    tc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_INTEGRATION_TEST")),
):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    await audit(db, "integration_test_case", tc.id, AuditAction.DELETE, current_user.user_id, tc.name)
    await db.delete(tc)
    await db.commit()


# ── results ───────────────────────────────────────────────────────────────────

@router.post("/{tc_id}/results", response_model=ITCResultRead, status_code=201)
async def record_result(
    tc_id: str, body: ITCResultCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("EXECUTE_TEST")),
):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    if body.result not in ("PASS", "FAIL"):
        raise HTTPException(400, "result must be PASS or FAIL")

    # validate latency threshold
    if body.latency_ms is not None and tc.latency_threshold_ms is not None:
        if body.latency_ms > tc.latency_threshold_ms and body.result == "PASS":
            raise HTTPException(
                400,
                f"Latency {body.latency_ms}ms exceeds threshold {tc.latency_threshold_ms}ms. "
                "Record as FAIL or adjust the threshold.",
            )

    result = IntegrationTestResult(test_case_id=tc.id, **body.model_dump())
    db.add(result)
    await db.flush()
    lat = f", {body.latency_ms}ms" if body.latency_ms is not None else ""
    await audit(db, "integration_test_result", result.id, AuditAction.CREATE, current_user.user_id,
                f"{tc.name}: {body.result}{lat}")
    await db.commit()
    await db.refresh(result)
    return ITCResultRead.model_validate(result)


# ── traceability ──────────────────────────────────────────────────────────────

@router.put("/{tc_id}/requirements", response_model=IntegrationTestCaseRead)
async def set_requirements(
    tc_id: str, body: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_INTEGRATION_TEST")),
):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    await db.execute(delete(ITCRequirementLink).where(ITCRequirementLink.itc_id == tc.id))
    for rid in body.ids:
        db.add(ITCRequirementLink(itc_id=tc.id, requirement_id=uuid.UUID(rid)))
    await audit(db, "integration_test_case", tc.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(body.ids)} requirement(s)")
    await db.commit()
    tc = await _reload_test(db, tc.id)
    return _build_read(tc)


@router.put("/{tc_id}/risks", response_model=IntegrationTestCaseRead)
async def set_risks(
    tc_id: str, body: SetLinksPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_INTEGRATION_TEST")),
):
    tc = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.id == uuid.UUID(tc_id))
    )).scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Integration test not found")
    await db.execute(delete(ITCRiskLink).where(ITCRiskLink.itc_id == tc.id))
    for rid in body.ids:
        db.add(ITCRiskLink(itc_id=tc.id, risk_id=uuid.UUID(rid)))
    await audit(db, "integration_test_case", tc.id, AuditAction.UPDATE, current_user.user_id,
                f"Linked {len(body.ids)} risk(s)")
    await db.commit()
    tc = await _reload_test(db, tc.id)
    return _build_read(tc)


# ── coverage ──────────────────────────────────────────────────────────────────

@router.get("/coverage/{project_id}", response_model=ProjectCoverage)
async def get_coverage(project_id: str, db: AsyncSession = Depends(get_db)):
    from app.modules.compliance.dev.architecture.model import SWInterface, SWComponent

    pid = uuid.UUID(project_id)

    # load all interfaces for the project (via its components)
    ifaces = (await db.execute(
        select(SWInterface).join(
            SWComponent, SWInterface.source_component_id == SWComponent.id
        ).where(SWComponent.project_id == pid)
    )).scalars().all()

    # load all test cases for the project
    tests = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.project_id == pid)
    )).scalars().all()

    # group tests by interface_id
    tests_by_iface: dict[str, list[IntegrationTestCase]] = {}
    for tc in tests:
        key = str(tc.interface_id) if tc.interface_id else "__none__"
        tests_by_iface.setdefault(key, []).append(tc)

    # load component names
    component_ids = set()
    for iface in ifaces:
        component_ids.add(iface.source_component_id)
        component_ids.add(iface.target_component_id)
    components = (await db.execute(
        select(SWComponent).where(SWComponent.id.in_(component_ids))
    )).scalars().all()
    comp_map = {str(c.id): c.name for c in components}

    coverage_items: list[InterfaceCoverageItem] = []
    block_reasons: list[str] = []

    for iface in ifaces:
        iface_tests = tests_by_iface.get(str(iface.id), [])
        has_pass = any(tc.results and tc.results[0].result == "PASS" for tc in iface_tests)
        has_error = any(tc.test_type == "ERROR_HANDLING" for tc in iface_tests)
        latest = None
        latency_ok = True

        for tc in iface_tests:
            if tc.results:
                if latest is None:
                    latest = tc.results[0].result
                if tc.latency_threshold_ms and tc.results:
                    r = tc.results[0]
                    if r.latency_ms and r.latency_ms > tc.latency_threshold_ms:
                        latency_ok = False

        is_covered = len(iface_tests) > 0
        gap = None

        if iface.safety_relevant:
            if not is_covered:
                gap = "No tests defined for safety-relevant interface"
                block_reasons.append(f"Interface '{iface.name}': no tests")
            elif not has_pass:
                gap = "No passing test result"
                block_reasons.append(f"Interface '{iface.name}': no PASS result")
            elif not has_error:
                gap = "No error handling test"
                block_reasons.append(f"Interface '{iface.name}': missing ERROR_HANDLING test")
            elif not latency_ok:
                gap = "Latency threshold breached"
                block_reasons.append(f"Interface '{iface.name}': latency threshold exceeded")
        else:
            if not is_covered:
                gap = "No tests defined"

        coverage_items.append(InterfaceCoverageItem(
            interface_id=str(iface.id),
            interface_name=iface.name,
            source_component=comp_map.get(str(iface.source_component_id), "Unknown"),
            target_component=comp_map.get(str(iface.target_component_id), "Unknown"),
            interface_type=str(iface.interface_type),
            safety_relevant=iface.safety_relevant,
            test_count=len(iface_tests),
            latest_result=latest,
            has_error_handling_test=has_error,
            has_pass=has_pass,
            latency_ok=latency_ok,
            is_covered=is_covered,
            coverage_gap=gap,
        ))

    total = len(ifaces)
    covered = sum(1 for i in coverage_items if i.is_covered)
    safety_uncovered = sum(1 for i in coverage_items if i.safety_relevant and not i.is_covered)

    all_results = [tc.results[0].result for tc in tests if tc.results]
    passed = all_results.count("PASS")
    failed = all_results.count("FAIL")
    not_run = sum(1 for tc in tests if not tc.results)
    pass_rate = passed / len(all_results) * 100 if all_results else 0.0

    # non-safety interfaces without tests also block release
    uncovered_any = [i for i in coverage_items if not i.is_covered]
    for i in uncovered_any:
        if not i.safety_relevant:
            block_reasons.append(f"Interface '{i.interface_name}': no tests defined")

    return ProjectCoverage(
        project_id=project_id,
        total_interfaces=total,
        covered_interfaces=covered,
        uncovered_interfaces=total - covered,
        coverage_pct=covered / total * 100 if total else 100.0,
        total_tests=len(tests),
        passed=passed,
        failed=failed,
        not_run=not_run,
        pass_rate=pass_rate,
        safety_relevant_uncovered=safety_uncovered,
        interfaces=coverage_items,
        release_blocked=len(block_reasons) > 0 or failed > 0,
        release_block_reasons=block_reasons + ([f"{failed} failed test(s)"] if failed > 0 else []),
    )


# ── performance metrics ───────────────────────────────────────────────────────

@router.get("/performance/{project_id}", response_model=List[PerformanceMetrics])
async def get_performance(project_id: str, db: AsyncSession = Depends(get_db)):
    pid = uuid.UUID(project_id)
    tests = (await db.execute(
        select(IntegrationTestCase).where(
            IntegrationTestCase.project_id == pid,
            IntegrationTestCase.latency_threshold_ms.isnot(None),
        )
    )).scalars().all()

    metrics = []
    for tc in tests:
        latencies = [r.latency_ms for r in tc.results if r.latency_ms is not None]
        di_results = [r.data_integrity_check for r in tc.results if r.data_integrity_check]
        di_pass = di_results.count("PASS")
        breaches = sum(1 for lat in latencies if tc.latency_threshold_ms and lat > tc.latency_threshold_ms)

        metrics.append(PerformanceMetrics(
            test_case_id=str(tc.id),
            test_case_name=tc.name,
            interface_id=str(tc.interface_id) if tc.interface_id else None,
            latency_threshold_ms=tc.latency_threshold_ms,
            executions=len(tc.results),
            avg_latency_ms=sum(latencies) / len(latencies) if latencies else None,
            max_latency_ms=max(latencies) if latencies else None,
            min_latency_ms=min(latencies) if latencies else None,
            threshold_breaches=breaches,
            data_integrity_pass_rate=di_pass / len(di_results) * 100 if di_results else None,
        ))

    return metrics
