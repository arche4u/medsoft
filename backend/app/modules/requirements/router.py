import io
import uuid
import openpyxl
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import Requirement, RequirementCategory, BUILTIN_TYPES
from .schema import (
    RequirementCategoryCreate, RequirementCategoryRead,
    RequirementCreate, RequirementRead, RequirementUpdate, UploadSummary,
)

router = APIRouter(prefix="/requirements", tags=["requirements"])

# ── Default category definitions seeded per new project ─────────────────────

_BUILTIN_CATEGORIES = [
    {"name": "USER",     "label": "User Requirements",     "color": "#1565c0", "sort_order": 0},
    {"name": "SYSTEM",   "label": "System Requirements",   "color": "#6a1b9a", "sort_order": 1},
    {"name": "SOFTWARE", "label": "Software Requirements", "color": "#1b5e20", "sort_order": 2},
]


async def _ensure_builtins(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Create built-in categories for a project if they don't exist yet."""
    for bc in _BUILTIN_CATEGORIES:
        existing = (
            await db.execute(
                select(RequirementCategory).where(
                    RequirementCategory.project_id == project_id,
                    RequirementCategory.name == bc["name"],
                )
            )
        ).scalar_one_or_none()
        if not existing:
            db.add(RequirementCategory(
                project_id=project_id,
                name=bc["name"],
                label=bc["label"],
                color=bc["color"],
                is_builtin=True,
                sort_order=bc["sort_order"],
            ))


# ── Hierarchy enforcement ─────────────────────────────────────────────────────
# Only rule: USER requirements must have no parent (enforced in schema).
# All other types (SYSTEM, SOFTWARE, custom) may optionally have any parent.

async def _validate_hierarchy(db: AsyncSession, req_type: str, parent_id: uuid.UUID | None) -> None:
    if parent_id is None:
        return   # standalone — always allowed for non-USER types
    parent = await db.get(Requirement, parent_id)
    if not parent:
        raise HTTPException(400, detail=f"Parent requirement {parent_id} not found")


# ── Category endpoints ────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[RequirementCategoryRead])
async def list_categories(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_builtins(db, project_id)
    await db.commit()
    cats = (
        await db.execute(
            select(RequirementCategory)
            .where(RequirementCategory.project_id == project_id)
            .order_by(RequirementCategory.sort_order, RequirementCategory.name)
        )
    ).scalars().all()
    return cats


@router.post("/categories", response_model=RequirementCategoryRead, status_code=201)
async def create_category(
    body: RequirementCategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    if body.name in BUILTIN_TYPES:
        raise HTTPException(400, f"'{body.name}' is a built-in type and cannot be created as custom")

    existing = (
        await db.execute(
            select(RequirementCategory).where(
                RequirementCategory.project_id == body.project_id,
                RequirementCategory.name == body.name,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"A category named '{body.name}' already exists for this project")

    # Validate parent belongs to same project
    if body.parent_id:
        parent_cat = (
            await db.execute(
                select(RequirementCategory).where(
                    RequirementCategory.id == body.parent_id,
                    RequirementCategory.project_id == body.project_id,
                )
            )
        ).scalar_one_or_none()
        if not parent_cat:
            raise HTTPException(400, "Parent category not found in this project")

    max_order = (
        await db.execute(
            select(RequirementCategory.sort_order)
            .where(RequirementCategory.project_id == body.project_id)
            .order_by(RequirementCategory.sort_order.desc())
            .limit(1)
        )
    ).scalar_one_or_none() or 2

    cat = RequirementCategory(
        project_id=body.project_id,
        name=body.name,
        label=body.label,
        color=body.color,
        is_builtin=False,
        sort_order=max_order + 1,
        parent_id=body.parent_id,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    cat = (
        await db.execute(select(RequirementCategory).where(RequirementCategory.id == category_id))
    ).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.is_builtin:
        raise HTTPException(400, "Built-in categories cannot be deleted")

    # Check no requirements use this type
    in_use = (
        await db.execute(
            select(Requirement).where(
                Requirement.project_id == cat.project_id,
                Requirement.type == cat.name,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if in_use:
        raise HTTPException(
            400,
            f"Cannot delete '{cat.label}': {cat.name} requirements still exist for this project",
        )
    await db.delete(cat)
    await db.commit()


# ── Requirement endpoints ─────────────────────────────────────────────────────

@router.get("/", response_model=list[RequirementRead])
async def list_requirements(
    project_id: uuid.UUID | None = None,
    type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Requirement)
    if project_id:
        q = q.where(Requirement.project_id == project_id)
    if type:
        q = q.where(Requirement.type == type.upper())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=RequirementRead, status_code=201)
async def create_requirement(payload: RequirementCreate, db: AsyncSession = Depends(get_db)):
    # Validate type exists for project
    cat = (
        await db.execute(
            select(RequirementCategory).where(
                RequirementCategory.project_id == payload.project_id,
                RequirementCategory.name == payload.type.upper(),
            )
        )
    ).scalar_one_or_none()
    if not cat:
        # Auto-ensure builtins then recheck
        await _ensure_builtins(db, payload.project_id)
        cat = (
            await db.execute(
                select(RequirementCategory).where(
                    RequirementCategory.project_id == payload.project_id,
                    RequirementCategory.name == payload.type.upper(),
                )
            )
        ).scalar_one_or_none()
    if not cat:
        raise HTTPException(400, f"Requirement type '{payload.type}' is not defined for this project")

    await _validate_hierarchy(db, payload.type.upper(), payload.parent_id)
    req = Requirement(**{**payload.model_dump(), "type": payload.type.upper()})
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


@router.get("/{req_id}", response_model=RequirementRead)
async def get_requirement(req_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, req_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    return req


@router.put("/{req_id}", response_model=RequirementRead)
async def update_requirement(req_id: uuid.UUID, payload: RequirementUpdate, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, req_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(req, k, v)
    await db.commit()
    await db.refresh(req)
    return req


@router.delete("/{req_id}", status_code=204)
async def delete_requirement(req_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    req = await db.get(Requirement, req_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    await db.delete(req)
    await db.commit()


@router.post("/upload", response_model=UploadSummary)
async def upload_requirements(
    project_id: uuid.UUID = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, detail="Only .xlsx files are accepted")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content))
    except Exception:
        raise HTTPException(400, detail="Could not parse Excel file")

    ws = wb.active
    raw_headers = [str(c.value).strip().lower() if c.value else "" for c in ws[1]]

    if not {"type", "title"}.issubset(set(raw_headers)):
        raise HTTPException(400, detail=f"Excel must have columns: type, title. Found: {raw_headers}")

    # Load allowed types for this project
    await _ensure_builtins(db, project_id)
    cats = (
        await db.execute(
            select(RequirementCategory).where(RequirementCategory.project_id == project_id)
        )
    ).scalars().all()
    valid_types = {c.name for c in cats}

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        data = {raw_headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)}
        if not data.get("title"):
            continue
        rows.append(data)

    # Process built-in types in hierarchy order, then custom
    order = {"USER": 0, "SYSTEM": 1, "SOFTWARE": 2}
    rows.sort(key=lambda r: order.get(r.get("type", "").upper(), 99))

    existing_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    title_to_req: dict[str, Requirement] = {r.title: r for r in existing_result.scalars()}

    added, skipped = [], []

    for row in rows:
        type_str = row.get("type", "").upper()
        title = row.get("title", "")
        description = row.get("description", "") or None
        parent_title = row.get("parent_title", "") or None

        if type_str not in valid_types:
            skipped.append({"title": title, "reason": f"Unknown type '{type_str}' — define it in project categories first"})
            continue

        if title in title_to_req:
            skipped.append({"title": title, "reason": "Duplicate title in project"})
            continue

        parent_id = None
        if parent_title:
            if parent_title not in title_to_req:
                skipped.append({"title": title, "reason": f"Parent requirement '{parent_title}' not found"})
                continue
            parent_id = title_to_req[parent_title].id

        new_req = Requirement(
            project_id=project_id, type=type_str,
            title=title, description=description, parent_id=parent_id,
        )
        db.add(new_req)
        await db.flush()
        title_to_req[title] = new_req
        added.append({"title": title, "type": type_str})

    await db.commit()
    return UploadSummary(total_added=len(added), total_skipped=len(skipped), added=added, skipped=skipped)
