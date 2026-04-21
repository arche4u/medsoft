import uuid
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
from app.modules.requirements.model import Requirement, RequirementType
from app.modules.design.model import DesignElement, DesignElementType
from app.modules.testcases.model import TestCase

from .model import ChangeRequest, ChangeImpact, ChangeRequestState, VALID_TRANSITIONS
from .schema import (
    ChangeRequestCreate,
    ChangeRequestRead,
    ChangeRequestDetail,
    ChangeRequestTransition,
    ChangeImpactCreate,
    ChangeImpactRead,
)

router = APIRouter(prefix="/change-control", tags=["change-control"])


@router.post("/requests", response_model=ChangeRequestRead, status_code=201)
async def create_change_request(
    body: ChangeRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    cr = ChangeRequest(
        project_id=body.project_id,
        title=body.title,
        description=body.description,
        status=ChangeRequestState.OPEN,
    )
    db.add(cr)
    await db.flush()
    await audit(db, "ChangeRequest", cr.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(cr)
    return cr


@router.get("/requests", response_model=list[ChangeRequestRead])
async def list_change_requests(
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(ChangeRequest).order_by(ChangeRequest.created_at.desc())
    if project_id:
        q = q.where(ChangeRequest.project_id == project_id)
    return (await db.execute(q)).scalars().all()


@router.get("/requests/{cr_id}", response_model=ChangeRequestDetail)
async def get_change_request(
    cr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = (
        select(ChangeRequest)
        .options(selectinload(ChangeRequest.impacts))
        .where(ChangeRequest.id == cr_id)
    )
    cr = (await db.execute(q)).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "ChangeRequest not found")
    return cr


@router.patch("/requests/{cr_id}/transition", response_model=ChangeRequestRead)
async def transition_change_request(
    cr_id: uuid.UUID,
    body: ChangeRequestTransition,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    cr = (await db.execute(select(ChangeRequest).where(ChangeRequest.id == cr_id))).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "ChangeRequest not found")

    allowed = VALID_TRANSITIONS.get(cr.status, set())
    if body.new_status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition from {cr.status} to {body.new_status}. "
            f"Allowed: {[s.value for s in allowed]}",
        )

    # Approve → enforce permission + electronic signature
    if body.new_status == ChangeRequestState.APPROVED:
        if "APPROVE_CHANGE_REQUEST" not in current_user.permissions:
            raise HTTPException(403, "Permission 'APPROVE_CHANGE_REQUEST' is required")

        esign = (
            await db.execute(
                select(ElectronicSignature).where(
                    ElectronicSignature.entity_type == ESignEntityType.CHANGE_REQUEST,
                    ElectronicSignature.entity_id == cr_id,
                    ElectronicSignature.meaning == ESignMeaning.APPROVAL,
                )
            )
        ).scalar_one_or_none()
        if not esign:
            raise HTTPException(
                400,
                "Electronic signature (APPROVAL) is required before approving this change request. "
                "Use POST /esign/sign to sign first.",
            )

    # Reject → enforce permission
    if body.new_status == ChangeRequestState.REJECTED:
        if "APPROVE_CHANGE_REQUEST" not in current_user.permissions:
            raise HTTPException(403, "Permission 'APPROVE_CHANGE_REQUEST' is required to reject")

    # Implement → enforce permission
    if body.new_status == ChangeRequestState.IMPLEMENTED:
        if "IMPLEMENT_CHANGE" not in current_user.permissions:
            raise HTTPException(403, "Permission 'IMPLEMENT_CHANGE' is required")

    # Moving to IMPACT_ANALYSIS auto-populates impacts if none exist
    if body.new_status == ChangeRequestState.IMPACT_ANALYSIS:
        existing = (
            await db.execute(
                select(ChangeImpact).where(ChangeImpact.change_request_id == cr_id).limit(1)
            )
        ).scalar_one_or_none()
        if not existing:
            await _auto_populate_impacts(db, cr)

    cr.status = body.new_status
    await audit(
        db, "ChangeRequest", cr.id, AuditAction.UPDATE,
        current_user.user_id,
        f"Status changed to {body.new_status.value}",
    )
    await db.commit()
    await db.refresh(cr)
    return cr


async def _auto_populate_impacts(db: AsyncSession, cr: ChangeRequest) -> None:
    reqs = (
        await db.execute(
            select(Requirement).where(
                Requirement.project_id == cr.project_id,
                Requirement.type == RequirementType.SOFTWARE,
            )
        )
    ).scalars().all()
    des = (
        await db.execute(
            select(DesignElement).where(
                DesignElement.project_id == cr.project_id,
                DesignElement.type == DesignElementType.DETAILED,
            )
        )
    ).scalars().all()
    tcs = (
        await db.execute(
            select(TestCase).where(TestCase.project_id == cr.project_id)
        )
    ).scalars().all()

    for req in reqs:
        db.add(ChangeImpact(
            change_request_id=cr.id,
            impacted_requirement_id=req.id,
            impact_description=f"SOFTWARE requirement may be affected: {req.title}",
        ))
    for de in des:
        db.add(ChangeImpact(
            change_request_id=cr.id,
            impacted_design_id=de.id,
            impact_description=f"Design element may be affected: {de.title}",
        ))
    for tc in tcs:
        db.add(ChangeImpact(
            change_request_id=cr.id,
            impacted_testcase_id=tc.id,
            impact_description=f"Test case may need re-execution: {tc.title}",
        ))


@router.post("/impacts", response_model=ChangeImpactRead, status_code=201)
async def add_impact(
    body: ChangeImpactCreate,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    cr = (
        await db.execute(select(ChangeRequest).where(ChangeRequest.id == body.change_request_id))
    ).scalar_one_or_none()
    if not cr:
        raise HTTPException(404, "ChangeRequest not found")
    impact = ChangeImpact(**body.model_dump())
    db.add(impact)
    await db.commit()
    await db.refresh(impact)
    return impact


@router.delete("/impacts/{impact_id}", status_code=204)
async def delete_impact(
    impact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    impact = (
        await db.execute(select(ChangeImpact).where(ChangeImpact.id == impact_id))
    ).scalar_one_or_none()
    if not impact:
        raise HTTPException(404, "ChangeImpact not found")
    await db.delete(impact)
    await db.commit()
