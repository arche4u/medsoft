import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from .model import TestExecution
from .schema import TestExecutionCreate, TestExecutionRead

router = APIRouter(prefix="/verification", tags=["verification"])


@router.get("/executions", response_model=list[TestExecutionRead])
async def list_executions(testcase_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    q = select(TestExecution).order_by(desc(TestExecution.executed_at))
    if testcase_id:
        q = q.where(TestExecution.testcase_id == testcase_id)
    return (await db.execute(q)).scalars().all()


@router.get("/executions/latest", response_model=TestExecutionRead | None)
async def latest_execution(testcase_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestExecution)
        .where(TestExecution.testcase_id == testcase_id)
        .order_by(desc(TestExecution.executed_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/executions", response_model=TestExecutionRead, status_code=201)
async def execute_test(payload: TestExecutionCreate, db: AsyncSession = Depends(get_db)):
    execution = TestExecution(**payload.model_dump())
    db.add(execution)
    await db.flush()
    await audit(db, "test_execution", execution.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(execution)
    return execution


@router.get("/executions/{exec_id}", response_model=TestExecutionRead)
async def get_execution(exec_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    ex = await db.get(TestExecution, exec_id)
    if not ex:
        raise HTTPException(404, detail="Execution not found")
    return ex
