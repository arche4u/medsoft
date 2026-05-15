import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.schema import TokenData
from app.modules.esign.model import ElectronicSignature, ESignEntityType, ESignMeaning
from app.modules.training.model import TrainingRecord
from app.modules.system_testing.model import SystemTestResult

from .model import Release, ReleaseItem, ReleaseStatus, VALID_RELEASE_TRANSITIONS
from .schema import (
    ReleaseCreate,
    ReleaseRead,
    ReleaseDetail,
    ReleaseTransition,
    ReleaseItemCreate,
    ReleaseItemRead,
    ReadinessCheck,
)

router = APIRouter(prefix="/release", tags=["release"])


@router.post("/releases", response_model=ReleaseRead, status_code=201)
async def create_release(
    body: ReleaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RELEASE")),
):
    rel = Release(
        project_id=body.project_id,
        version=body.version,
        status=ReleaseStatus.DRAFT,
    )
    db.add(rel)
    await db.flush()
    await audit(db, "Release", rel.id, AuditAction.CREATE, current_user.user_id, f"v{rel.version}")
    await db.commit()
    await db.refresh(rel)
    return rel


@router.get("/releases", response_model=list[ReleaseRead])
async def list_releases(
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(Release).order_by(Release.created_at.desc())
    if project_id:
        q = q.where(Release.project_id == project_id)
    return (await db.execute(q)).scalars().all()


@router.get("/releases/{release_id}", response_model=ReleaseDetail)
async def get_release(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = (
        select(Release)
        .options(selectinload(Release.items))
        .where(Release.id == release_id)
    )
    rel = (await db.execute(q)).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")
    return rel


@router.patch("/releases/{release_id}/transition", response_model=ReleaseRead)
async def transition_release(
    release_id: uuid.UUID,
    body: ReleaseTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    rel = (await db.execute(select(Release).where(Release.id == release_id))).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")

    allowed = VALID_RELEASE_TRANSITIONS.get(rel.status, set())
    if body.new_status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition from {rel.status} to {body.new_status}. "
            f"Allowed: {[s.value for s in allowed]}",
        )

    # APPROVED → enforce permission + electronic signature
    if body.new_status == ReleaseStatus.APPROVED:
        if "APPROVE_RELEASE" not in current_user.permissions:
            raise HTTPException(403, "Permission 'APPROVE_RELEASE' is required")

        esign = (
            await db.execute(
                select(ElectronicSignature).where(
                    ElectronicSignature.entity_type == ESignEntityType.RELEASE,
                    ElectronicSignature.entity_id == release_id,
                    ElectronicSignature.meaning == ESignMeaning.APPROVAL,
                )
            )
        ).scalar_one_or_none()
        if not esign:
            raise HTTPException(
                400,
                "Electronic signature (APPROVAL) required before approving this release. "
                "Use POST /esign/sign to sign first.",
            )

    # RELEASED → enforce permission + approved SDP + training + readiness
    if body.new_status == ReleaseStatus.RELEASED:
        if "PUBLISH_RELEASE" not in current_user.permissions:
            raise HTTPException(403, "Permission 'PUBLISH_RELEASE' is required")

        # SDP check — project must have an approved SDP (IEC 62304 §5.1)
        from app.modules.sdp.model import SoftwareDevelopmentPlan
        approved_sdp = (await db.execute(
            select(SoftwareDevelopmentPlan).where(
                SoftwareDevelopmentPlan.project_id == rel.project_id,
                SoftwareDevelopmentPlan.status == "APPROVED",
            ).limit(1)
        )).scalar_one_or_none()
        if not approved_sdp:
            raise HTTPException(
                400,
                "Cannot release: no approved Software Development Plan (SDP) found for this project. "
                "Create and approve an SDP under Design → Software Development Plan.",
            )

        # Training check — user must have at least one valid training record
        valid_training = (
            await db.execute(
                select(TrainingRecord).where(
                    TrainingRecord.user_id == current_user.user_id,
                    TrainingRecord.valid_until >= datetime.now(timezone.utc),
                ).limit(1)
            )
        ).scalar_one_or_none()
        if not valid_training:
            raise HTTPException(
                400,
                "A valid training record is required to publish a release. "
                "Contact your administrator to add training records.",
            )

        # System test readiness gate (IEC 62304 §5.8)
        from app.modules.system_testing.router import _compute_readiness
        sys_readiness = await _compute_readiness(str(release_id), str(rel.project_id), db)
        if not sys_readiness.is_ready:
            reasons = "; ".join(sys_readiness.blocking_failures[:3])
            raise HTTPException(
                400,
                f"Release blocked by system testing/compliance gates: {reasons}. "
                "Check Testing → System Testing for details.",
            )

        # CAPA release gate — no unverified or open CAPAs
        from app.modules.capa.router import capa_release_check as _capa_check
        capa_chk = await _capa_check(str(rel.project_id), db)
        if capa_chk.is_blocked:
            reasons = "; ".join(capa_chk.block_reasons[:3])
            raise HTTPException(
                400,
                f"Release blocked by CAPA issues: {reasons}. "
                "Resolve all CAPAs under CAPA → Problem Resolution.",
            )

        # Configuration management gate (IEC 62304 §8)
        from app.modules.config_mgmt.router import release_check as _cm_check
        cm_check = await _cm_check(str(rel.project_id), db)
        if cm_check.is_blocked:
            reasons = "; ".join(cm_check.block_reasons[:3])
            raise HTTPException(
                400,
                f"Release blocked by configuration management issues: {reasons}. "
                "Check Configuration Management for details.",
            )

        # Integration test coverage gate (IEC 62304 §5.7)
        from app.modules.integration_tests.router import get_coverage as _itc_coverage
        itc_cov = await _itc_coverage(str(rel.project_id), db)
        if itc_cov.release_blocked and itc_cov.total_interfaces > 0:
            reasons = "; ".join(itc_cov.release_block_reasons[:3])
            raise HTTPException(
                400,
                f"Release blocked by integration testing gaps: {reasons}. "
                "Resolve all issues under Testing → Integration Tests.",
            )

        readiness = await _check_readiness(rel.id, db)
        if not readiness.ready:
            raise HTTPException(
                400,
                f"Release blocked: {len(readiness.not_passed)} system test(s) do not have PASS status. "
                f"Pass rate: {readiness.passed}/{readiness.total_system_tests}",
            )

    rel.status = body.new_status
    await audit(
        db, "Release", rel.id, AuditAction.UPDATE,
        current_user.user_id,
        f"Status changed to {body.new_status.value}",
    )
    await db.commit()
    await db.refresh(rel)
    return rel


@router.get("/releases/{release_id}/readiness", response_model=ReadinessCheck)
async def get_readiness(
    release_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    rel = (await db.execute(select(Release).where(Release.id == release_id))).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")
    return await _check_readiness(release_id, db)


async def _check_readiness(release_id: uuid.UUID, db: AsyncSession) -> ReadinessCheck:
    items = (
        await db.execute(
            select(ReleaseItem).where(
                ReleaseItem.release_id == release_id,
                ReleaseItem.system_test_id.isnot(None),
            )
        )
    ).scalars().all()

    st_ids = [item.system_test_id for item in items]
    if not st_ids:
        return ReadinessCheck(ready=True, total_system_tests=0, passed=0, not_passed=[])

    not_passed: list[uuid.UUID] = []
    passed_count = 0
    for st_id in st_ids:
        latest = (
            await db.execute(
                select(SystemTestResult)
                .where(SystemTestResult.test_case_id == st_id)
                .order_by(SystemTestResult.execution_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if latest and latest.result == "PASS":
            passed_count += 1
        else:
            not_passed.append(st_id)

    return ReadinessCheck(
        ready=len(not_passed) == 0,
        total_system_tests=len(st_ids),
        passed=passed_count,
        not_passed=not_passed,
    )


@router.post("/items", response_model=ReleaseItemRead, status_code=201)
async def add_release_item(
    body: ReleaseItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RELEASE")),
):
    rel = (await db.execute(select(Release).where(Release.id == body.release_id))).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")
    if rel.status != ReleaseStatus.DRAFT:
        raise HTTPException(400, "Items can only be added to DRAFT releases")
    item = ReleaseItem(**body.model_dump())
    db.add(item)
    await db.flush()
    await audit(db, "ReleaseItem", item.id, AuditAction.CREATE, current_user.user_id,
                f"Release v{rel.version}")
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_release_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_RELEASE")),
):
    item = (await db.execute(select(ReleaseItem).where(ReleaseItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "ReleaseItem not found")
    rel = (await db.execute(select(Release).where(Release.id == item.release_id))).scalar_one_or_none()
    if rel and rel.status != ReleaseStatus.DRAFT:
        raise HTTPException(400, "Items can only be removed from DRAFT releases")
    await audit(db, "ReleaseItem", item.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(item)
    await db.commit()
