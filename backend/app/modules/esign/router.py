import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user
from app.modules.auth.schema import TokenData
from app.modules.auth.security import verify_password
from app.modules.users.model import User
from app.modules.approval.model import Approval, ApprovalEntityType, ApprovalDecision

from .model import ElectronicSignature, ESignEntityType, ESignMeaning
from .schema import ESignCreate, ESignRead

router = APIRouter(prefix="/esign", tags=["esign"])

_ENTITY_TO_APPROVAL: dict[ESignEntityType, ApprovalEntityType] = {
    ESignEntityType.CHANGE_REQUEST: ApprovalEntityType.CHANGE,
    ESignEntityType.RELEASE: ApprovalEntityType.RELEASE,
}


@router.post("/sign", response_model=ESignRead, status_code=201)
async def sign(
    request: Request,
    body: ESignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    # Re-verify password for 21 CFR Part 11 compliance
    user = (
        await db.execute(select(User).where(User.id == current_user.user_id, User.is_active == True))  # noqa: E712
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(400, "Password verification failed — signature rejected")

    ip = request.client.host if request.client else "unknown"

    sig = ElectronicSignature(
        user_id=current_user.user_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        meaning=body.meaning,
        ip_address=ip,
        comments=body.comments,
    )
    db.add(sig)

    # For CHANGE_REQUEST and RELEASE: also create an Approval record
    if body.entity_type in _ENTITY_TO_APPROVAL and body.meaning in (ESignMeaning.APPROVAL, ESignMeaning.REVIEW):
        decision = (
            ApprovalDecision.APPROVED if body.meaning == ESignMeaning.APPROVAL
            else ApprovalDecision.REJECTED
        )
        approval = Approval(
            entity_type=_ENTITY_TO_APPROVAL[body.entity_type],
            entity_id=body.entity_id,
            approver_name=current_user.name,
            decision=decision,
            comments=body.comments,
        )
        db.add(approval)

    await db.flush()
    await audit(db, "ElectronicSignature", sig.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(sig)

    return ESignRead(
        id=sig.id,
        user_id=sig.user_id,
        entity_type=sig.entity_type,
        entity_id=sig.entity_id,
        meaning=sig.meaning,
        signed_at=sig.signed_at,
        ip_address=sig.ip_address,
        comments=sig.comments,
        signer_name=current_user.name,
        signer_email=current_user.email,
    )


@router.get("/signatures", response_model=list[ESignRead])
async def list_signatures(
    entity_type: ESignEntityType | None = None,
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = (
        select(ElectronicSignature)
        .options(selectinload(ElectronicSignature.user))
        .order_by(ElectronicSignature.signed_at.desc())
    )
    if entity_type:
        q = q.where(ElectronicSignature.entity_type == entity_type)
    if entity_id:
        q = q.where(ElectronicSignature.entity_id == entity_id)

    sigs = (await db.execute(q)).scalars().all()
    return [
        ESignRead(
            id=s.id, user_id=s.user_id, entity_type=s.entity_type,
            entity_id=s.entity_id, meaning=s.meaning, signed_at=s.signed_at,
            ip_address=s.ip_address, comments=s.comments,
            signer_name=s.user.name, signer_email=s.user.email,
        )
        for s in sigs
    ]
