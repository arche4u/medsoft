import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import Risk, _compute_level
from .schema import RiskCreate, RiskRead, RiskUpdate

router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("/", response_model=list[RiskRead])
async def list_risks(
    requirement_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Risk)
    if requirement_id:
        q = q.where(Risk.requirement_id == requirement_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=RiskRead, status_code=201)
async def create_risk(payload: RiskCreate, db: AsyncSession = Depends(get_db)):
    risk = Risk(
        **payload.model_dump(),
        risk_level=_compute_level(payload.severity, payload.probability),
    )
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    return risk


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    return risk


@router.put("/{risk_id}", response_model=RiskRead)
async def update_risk(risk_id: uuid.UUID, payload: RiskUpdate, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(risk, k, v)
    risk.risk_level = _compute_level(risk.severity, risk.probability)
    await db.commit()
    await db.refresh(risk)
    return risk


@router.delete("/{risk_id}", status_code=204)
async def delete_risk(risk_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    risk = await db.get(Risk, risk_id)
    if not risk:
        raise HTTPException(404, detail="Risk not found")
    await db.delete(risk)
    await db.commit()
