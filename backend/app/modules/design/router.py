import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.requirements.model import Requirement
from sqlalchemy.dialects.postgresql import insert as pg_insert
from .model import DesignCategory, DesignElement, DesignElementType, RequirementDesignLink
from .schema import (
    DesignCategoryCreate, DesignCategoryRead, DesignCategoryUpdate,
    DesignElementCreate, DesignElementRead, DesignElementUpdate,
    RequirementDesignLinkCreate, RequirementDesignLinkRead,
)

router = APIRouter(prefix="/design", tags=["design"])

_BUILTIN_DESIGN_CATEGORIES = [
    {"name": "ARCHITECTURE", "label": "Architecture",    "color": "#4e342e", "sort_order": 0},
    {"name": "DETAILED",     "label": "Detailed Design", "color": "#6d4c41", "sort_order": 1},
]


async def _ensure_design_builtins(db: AsyncSession, project_id: uuid.UUID) -> None:
    for bc in _BUILTIN_DESIGN_CATEGORIES:
        stmt = pg_insert(DesignCategory).values(
            id=uuid.uuid4(), project_id=project_id,
            name=bc["name"], label=bc["label"], color=bc["color"],
            sort_order=bc["sort_order"], is_builtin=True,
        ).on_conflict_do_nothing(constraint="uq_design_category_project_name")
        await db.execute(stmt)


# ── Design Category endpoints ─────────────────────────────────────────────────

@router.get("/categories", response_model=list[DesignCategoryRead])
async def list_design_categories(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _ensure_design_builtins(db, project_id)
    await db.commit()
    cats = (await db.execute(
        select(DesignCategory)
        .where(DesignCategory.project_id == project_id)
        .order_by(DesignCategory.sort_order, DesignCategory.name)
    )).scalars().all()
    return cats


@router.post("/categories", response_model=DesignCategoryRead, status_code=201)
async def create_design_category(body: DesignCategoryCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(DesignCategory).where(
            DesignCategory.project_id == body.project_id,
            DesignCategory.name == body.name,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"A category named '{body.name}' already exists for this project")
    max_order = (await db.execute(
        select(DesignCategory.sort_order)
        .where(DesignCategory.project_id == body.project_id)
        .order_by(DesignCategory.sort_order.desc()).limit(1)
    )).scalar_one_or_none() or 1
    cat = DesignCategory(project_id=body.project_id, name=body.name, label=body.label,
                         color=body.color, is_builtin=False, sort_order=max_order + 1)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=DesignCategoryRead)
async def update_design_category(
    category_id: uuid.UUID, body: DesignCategoryUpdate, db: AsyncSession = Depends(get_db)
):
    cat = (await db.execute(
        select(DesignCategory).where(DesignCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_design_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    cat = (await db.execute(
        select(DesignCategory).where(DesignCategory.id == category_id)
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.is_builtin:
        raise HTTPException(400, "Built-in design categories cannot be deleted")
    await db.delete(cat)
    await db.commit()

_PREFIX = {
    DesignElementType.ARCHITECTURE: "ARC",
    DesignElementType.DETAILED: "DET",
}


async def _next_design_id(db: AsyncSession, project_id: uuid.UUID, el_type: DesignElementType) -> str:
    prefix = _PREFIX[el_type]
    rows = (await db.execute(
        select(DesignElement.readable_id).where(
            DesignElement.project_id == project_id,
            DesignElement.readable_id.like(f"{prefix}-%"),
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
    return f"{prefix}-{max_n + 1:03d}"


async def _validate_design_hierarchy(db: AsyncSession, el_type: DesignElementType, parent_id: uuid.UUID | None):
    if el_type == DesignElementType.ARCHITECTURE:
        return
    parent = await db.get(DesignElement, parent_id)
    if not parent:
        raise HTTPException(400, detail=f"Parent design element {parent_id} not found")
    if parent.type != DesignElementType.ARCHITECTURE:
        raise HTTPException(400, detail="DETAILED element must have an ARCHITECTURE parent")


# ── Design Elements ──────────────────────────────────────────────────────────

@router.get("/elements", response_model=list[DesignElementRead])
async def list_elements(project_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    q = select(DesignElement)
    if project_id:
        q = q.where(DesignElement.project_id == project_id)
    return (await db.execute(q)).scalars().all()


@router.post("/elements", response_model=DesignElementRead, status_code=201)
async def create_element(payload: DesignElementCreate, db: AsyncSession = Depends(get_db)):
    await _validate_design_hierarchy(db, payload.type, payload.parent_id)
    rid = await _next_design_id(db, payload.project_id, payload.type)
    el = DesignElement(**payload.model_dump(), readable_id=rid)
    db.add(el)
    await db.flush()
    await audit(db, "design_element", el.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(el)
    return el


@router.get("/elements/{el_id}", response_model=DesignElementRead)
async def get_element(el_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    el = await db.get(DesignElement, el_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    return el


@router.put("/elements/{el_id}", response_model=DesignElementRead)
async def update_element(el_id: uuid.UUID, payload: DesignElementUpdate, db: AsyncSession = Depends(get_db)):
    el = await db.get(DesignElement, el_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(el, k, v)
    await audit(db, "design_element", el.id, AuditAction.UPDATE)
    await db.commit()
    await db.refresh(el)
    return el


@router.delete("/elements/{el_id}", status_code=204)
async def delete_element(el_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    el = await db.get(DesignElement, el_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    await audit(db, "design_element", el.id, AuditAction.DELETE)
    await db.delete(el)
    await db.commit()


# ── Requirement → Design Links ────────────────────────────────────────────────

@router.get("/links", response_model=list[RequirementDesignLinkRead])
async def list_links(
    requirement_id: uuid.UUID | None = None,
    design_element_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(RequirementDesignLink)
    if requirement_id:
        q = q.where(RequirementDesignLink.requirement_id == requirement_id)
    if design_element_id:
        q = q.where(RequirementDesignLink.design_element_id == design_element_id)
    return (await db.execute(q)).scalars().all()


@router.post("/links", response_model=RequirementDesignLinkRead, status_code=201)
async def create_link(payload: RequirementDesignLinkCreate, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, payload.requirement_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    link = RequirementDesignLink(**payload.model_dump())
    db.add(link)
    await db.flush()
    await audit(db, "requirement_design_link", link.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=204)
async def delete_link(link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    link = await db.get(RequirementDesignLink, link_id)
    if not link:
        raise HTTPException(404, detail="Link not found")
    await audit(db, "requirement_design_link", link.id, AuditAction.DELETE)
    await db.delete(link)
    await db.commit()
