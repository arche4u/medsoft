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
from app.modules.verification.model import TestExecution, ExecutionStatus

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
    current_user: TokenData = Depends(get_current_user),
):
    rel = Release(
        project_id=body.project_id,
        version=body.version,
        status=ReleaseStatus.DRAFT,
    )
    db.add(rel)
    await db.flush()
    await audit(db, "Release", rel.id, AuditAction.CREATE, current_user.user_id)
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

    # RELEASED → enforce permission + training + readiness
    if body.new_status == ReleaseStatus.RELEASED:
        if "PUBLISH_RELEASE" not in current_user.permissions:
            raise HTTPException(403, "Permission 'PUBLISH_RELEASE' is required")

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

        readiness = await _check_readiness(rel.id, db)
        if not readiness.ready:
            raise HTTPException(
                400,
                f"Release blocked: {len(readiness.not_passed)} test case(s) do not have PASS status. "
                f"Pass rate: {readiness.passed}/{readiness.total_testcases}",
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
                ReleaseItem.testcase_id.isnot(None),
            )
        )
    ).scalars().all()

    tc_ids = [item.testcase_id for item in items]
    if not tc_ids:
        return ReadinessCheck(ready=True, total_testcases=0, passed=0, not_passed=[])

    not_passed = []
    passed_count = 0
    for tc_id in tc_ids:
        latest = (
            await db.execute(
                select(TestExecution)
                .where(TestExecution.testcase_id == tc_id)
                .order_by(TestExecution.executed_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if latest and latest.status == ExecutionStatus.PASS:
            passed_count += 1
        else:
            not_passed.append(tc_id)

    return ReadinessCheck(
        ready=len(not_passed) == 0,
        total_testcases=len(tc_ids),
        passed=passed_count,
        not_passed=not_passed,
    )


@router.post("/items", response_model=ReleaseItemRead, status_code=201)
async def add_release_item(
    body: ReleaseItemCreate,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    rel = (await db.execute(select(Release).where(Release.id == body.release_id))).scalar_one_or_none()
    if not rel:
        raise HTTPException(404, "Release not found")
    if rel.status != ReleaseStatus.DRAFT:
        raise HTTPException(400, "Items can only be added to DRAFT releases")
    item = ReleaseItem(**body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_release_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    item = (await db.execute(select(ReleaseItem).where(ReleaseItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "ReleaseItem not found")
    rel = (await db.execute(select(Release).where(Release.id == item.release_id))).scalar_one_or_none()
    if rel and rel.status != ReleaseStatus.DRAFT:
        raise HTTPException(400, "Items can only be removed from DRAFT releases")
    await db.delete(item)
    await db.commit()
