import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.requirements.model import Requirement
from .model import ValidationRecord
from .schema import ValidationRecordCreate, ValidationRecordRead, ValidationRecordUpdate

router = APIRouter(prefix="/validation", tags=["validation"])


@router.get("/records", response_model=list[ValidationRecordRead])
async def list_records(project_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    q = select(ValidationRecord)
    if project_id:
        q = q.where(ValidationRecord.project_id == project_id)
    return (await db.execute(q)).scalars().all()


@router.post("/records", response_model=ValidationRecordRead, status_code=201)
async def create_record(payload: ValidationRecordCreate, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, payload.related_requirement_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    if req.type != "USER":
        raise HTTPException(400, detail="Validation records must link to USER requirements")
    record = ValidationRecord(**payload.model_dump())
    db.add(record)
    await db.flush()
    await audit(db, "validation_record", record.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/records/{record_id}", response_model=ValidationRecordRead)
async def get_record(record_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    record = await db.get(ValidationRecord, record_id)
    if not record:
        raise HTTPException(404, detail="Validation record not found")
    return record


@router.put("/records/{record_id}", response_model=ValidationRecordRead)
async def update_record(record_id: uuid.UUID, payload: ValidationRecordUpdate, db: AsyncSession = Depends(get_db)):
    record = await db.get(ValidationRecord, record_id)
    if not record:
        raise HTTPException(404, detail="Validation record not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    await audit(db, "validation_record", record.id, AuditAction.UPDATE)
    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/records/{record_id}", status_code=204)
async def delete_record(record_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    record = await db.get(ValidationRecord, record_id)
    if not record:
        raise HTTPException(404, detail="Validation record not found")
    await audit(db, "validation_record", record.id, AuditAction.DELETE)
    await db.delete(record)
    await db.commit()
