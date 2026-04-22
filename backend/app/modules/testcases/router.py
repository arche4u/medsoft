import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import TestCase, TestCategory
from .schema import TestCaseCreate, TestCaseRead, TestCaseUpdate, TestCategoryCreate, TestCategoryRead, TestCategoryUpdate

router = APIRouter(prefix="/testcases", tags=["testcases"])

_BUILTIN_TEST_CATEGORIES = [
    {"name": "UNIT",        "label": "Unit Tests",        "color": "#1565c0", "sort_order": 0},
    {"name": "INTEGRATION", "label": "Integration Tests", "color": "#6a1b9a", "sort_order": 1},
    {"name": "SYSTEM",      "label": "System Tests",      "color": "#1b5e20", "sort_order": 2},
]


async def _ensure_test_builtins(db: AsyncSession, project_id: uuid.UUID) -> None:
    for bc in _BUILTIN_TEST_CATEGORIES:
        stmt = pg_insert(TestCategory).values(
            id=uuid.uuid4(), project_id=project_id,
            name=bc["name"], label=bc["label"], color=bc["color"],
            sort_order=bc["sort_order"], is_builtin=True,
        ).on_conflict_do_nothing(constraint="uq_test_category_project_name")
        await db.execute(stmt)


# ── Test Category endpoints ───────────────────────────────────────────────────

@router.get("/categories", response_model=list[TestCategoryRead])
async def list_test_categories(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _ensure_test_builtins(db, project_id)
    await db.commit()
    cats = (await db.execute(
        select(TestCategory)
        .where(TestCategory.project_id == project_id)
        .order_by(TestCategory.sort_order, TestCategory.name)
    )).scalars().all()
    return cats


@router.post("/categories", response_model=TestCategoryRead, status_code=201)
async def create_test_category(body: TestCategoryCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(TestCategory).where(
            TestCategory.project_id == body.project_id,
            TestCategory.name == body.name,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"A category named '{body.name}' already exists for this project")
    max_order = (await db.execute(
        select(TestCategory.sort_order)
        .where(TestCategory.project_id == body.project_id)
        .order_by(TestCategory.sort_order.desc()).limit(1)
    )).scalar_one_or_none() or 2
    cat = TestCategory(project_id=body.project_id, name=body.name, label=body.label,
                       color=body.color, is_builtin=False, sort_order=max_order + 1)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=TestCategoryRead)
async def update_test_category(
    category_id: uuid.UUID, body: TestCategoryUpdate, db: AsyncSession = Depends(get_db)
):
    cat = (await db.execute(
        select(TestCategory).where(TestCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_test_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    cat = (await db.execute(
        select(TestCategory).where(TestCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.is_builtin:
        raise HTTPException(400, "Built-in test categories cannot be deleted")
    await db.delete(cat)
    await db.commit()


async def _next_tc_id(db: AsyncSession, project_id: uuid.UUID) -> str:
    rows = (await db.execute(
        select(TestCase.readable_id).where(
            TestCase.project_id == project_id,
            TestCase.readable_id.like("TC-%"),
        )
    )).scalars().all()
    max_n = 0
    for rid in rows:
        try:
            n = int(rid.split("-", 1)[1])
            if n > max_n:
                max_n = n
        except (ValueError, IndexError):
            pass
    return f"TC-{max_n + 1:03d}"


@router.get("/", response_model=list[TestCaseRead])
async def list_testcases(project_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    q = select(TestCase)
    if project_id:
        q = q.where(TestCase.project_id == project_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=TestCaseRead, status_code=201)
async def create_testcase(payload: TestCaseCreate, db: AsyncSession = Depends(get_db)):
    rid = await _next_tc_id(db, payload.project_id)
    tc = TestCase(**payload.model_dump(), readable_id=rid)
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
