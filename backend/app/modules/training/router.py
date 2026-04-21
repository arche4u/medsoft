import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.schema import TokenData

from .model import TrainingRecord
from .schema import TrainingRecordCreate, TrainingRecordRead

router = APIRouter(prefix="/training", tags=["training"])


def _to_read(r: TrainingRecord) -> TrainingRecordRead:
    now = datetime.now(timezone.utc)
    return TrainingRecordRead(
        id=r.id,
        user_id=r.user_id,
        training_name=r.training_name,
        description=r.description,
        completed_at=r.completed_at,
        valid_until=r.valid_until,
        is_valid=r.valid_until >= now,
    )


@router.post("/records", response_model=TrainingRecordRead, status_code=201)
async def create_record(
    body: TrainingRecordCreate,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    rec = TrainingRecord(**body.model_dump())
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return _to_read(rec)


@router.get("/records", response_model=list[TrainingRecordRead])
async def list_records(
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    # Non-admins can only see their own records
    if "MANAGE_USERS" not in current_user.permissions:
        user_id = current_user.user_id

    q = select(TrainingRecord).order_by(TrainingRecord.valid_until.desc())
    if user_id:
        q = q.where(TrainingRecord.user_id == user_id)
    records = (await db.execute(q)).scalars().all()
    return [_to_read(r) for r in records]


@router.delete("/records/{record_id}", status_code=204)
async def delete_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    rec = (await db.execute(select(TrainingRecord).where(TrainingRecord.id == record_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Training record not found")
    await db.delete(rec)
    await db.commit()
