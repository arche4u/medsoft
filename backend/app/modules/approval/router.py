import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction

from .model import Approval, ApprovalEntityType
from .schema import ApprovalCreate, ApprovalRead

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.post("", response_model=ApprovalRead, status_code=201)
async def create_approval(body: ApprovalCreate, db: AsyncSession = Depends(get_db)):
    approval = Approval(**body.model_dump())
    db.add(approval)
    await db.flush()
    await audit(db, f"Approval:{body.entity_type.value}", approval.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(approval)
    return approval


@router.get("", response_model=list[ApprovalRead])
async def list_approvals(
    entity_type: ApprovalEntityType | None = None,
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Approval).order_by(Approval.timestamp.desc())
    if entity_type:
        q = q.where(Approval.entity_type == entity_type)
    if entity_id:
        q = q.where(Approval.entity_id == entity_id)
    return (await db.execute(q)).scalars().all()
