import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import TestCase
from .schema import TestCaseCreate, TestCaseRead, TestCaseUpdate

router = APIRouter(prefix="/testcases", tags=["testcases"])


@router.get("/", response_model=list[TestCaseRead])
async def list_testcases(project_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    q = select(TestCase)
    if project_id:
        q = q.where(TestCase.project_id == project_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=TestCaseRead, status_code=201)
async def create_testcase(payload: TestCaseCreate, db: AsyncSession = Depends(get_db)):
    tc = TestCase(**payload.model_dump())
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc


@router.get("/{tc_id}", response_model=TestCaseRead)
async def get_testcase(tc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="TestCase not found")
    return tc


@router.put("/{tc_id}", response_model=TestCaseRead)
async def update_testcase(tc_id: uuid.UUID, payload: TestCaseUpdate, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="TestCase not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tc, k, v)
    await db.commit()
    await db.refresh(tc)
    return tc


@router.delete("/{tc_id}", status_code=204)
async def delete_testcase(tc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="TestCase not found")
    await db.delete(tc)
    await db.commit()
