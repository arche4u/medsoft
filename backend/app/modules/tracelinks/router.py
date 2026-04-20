import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import TraceLink
from .schema import TraceLinkCreate, TraceLinkRead

router = APIRouter(prefix="/tracelinks", tags=["tracelinks"])


@router.get("/", response_model=list[TraceLinkRead])
async def list_tracelinks(
    requirement_id: uuid.UUID | None = None,
    testcase_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(TraceLink)
    if requirement_id:
        q = q.where(TraceLink.requirement_id == requirement_id)
    if testcase_id:
        q = q.where(TraceLink.testcase_id == testcase_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=TraceLinkRead, status_code=201)
async def create_tracelink(payload: TraceLinkCreate, db: AsyncSession = Depends(get_db)):
    link = TraceLink(**payload.model_dump())
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.get("/{link_id}", response_model=TraceLinkRead)
async def get_tracelink(link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    link = await db.get(TraceLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="TraceLink not found")
    return link


@router.delete("/{link_id}", status_code=204)
async def delete_tracelink(link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    link = await db.get(TraceLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="TraceLink not found")
    await db.delete(link)
    await db.commit()
