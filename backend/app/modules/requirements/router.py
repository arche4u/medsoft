import io
import uuid
import openpyxl
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import Requirement, RequirementType
from .schema import RequirementCreate, RequirementRead, RequirementUpdate, UploadSummary

router = APIRouter(prefix="/requirements", tags=["requirements"])


async def _validate_hierarchy(db: AsyncSession, req_type: RequirementType, parent_id: uuid.UUID | None):
    if req_type == RequirementType.USER:
        return
    parent = await db.get(Requirement, parent_id)
    if not parent:
        raise HTTPException(400, detail=f"Parent requirement {parent_id} not found")
    if req_type == RequirementType.SYSTEM and parent.type != RequirementType.USER:
        raise HTTPException(400, detail="SYSTEM requirement must have a USER parent")
    if req_type == RequirementType.SOFTWARE and parent.type != RequirementType.SYSTEM:
        raise HTTPException(400, detail="SOFTWARE requirement must have a SYSTEM parent")


@router.get("/", response_model=list[RequirementRead])
async def list_requirements(
    project_id: uuid.UUID | None = None,
    type: RequirementType | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Requirement)
    if project_id:
        q = q.where(Requirement.project_id == project_id)
    if type:
        q = q.where(Requirement.type == type)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=RequirementRead, status_code=201)
async def create_requirement(payload: RequirementCreate, db: AsyncSession = Depends(get_db)):
    await _validate_hierarchy(db, payload.type, payload.parent_id)
    req = Requirement(**payload.model_dump())
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

    required_cols = {"type", "title"}
    if not required_cols.issubset(set(raw_headers)):
        raise HTTPException(400, detail=f"Excel must have columns: {required_cols}. Found: {raw_headers}")

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        data = {raw_headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)}
        if not data.get("title"):
            continue
        rows.append(data)

    # Process USER first, then SYSTEM, then SOFTWARE
    order = {RequirementType.USER: 0, RequirementType.SYSTEM: 1, RequirementType.SOFTWARE: 2}
    valid_types = {t.value for t in RequirementType}

    def sort_key(r):
        t = r.get("type", "").upper()
        return order.get(RequirementType(t), 99) if t in valid_types else 99

    rows.sort(key=sort_key)

    # Load existing requirements for this project
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
            skipped.append({"title": title, "reason": f"Unknown type '{type_str}'"})
            continue

        req_type = RequirementType(type_str)

        if title in title_to_req:
            skipped.append({"title": title, "reason": "Duplicate title in project"})
            continue

        parent_id = None
        if req_type == RequirementType.SYSTEM:
            if not parent_title or parent_title not in title_to_req:
                skipped.append({"title": title, "reason": f"Parent USER req '{parent_title}' not found"})
                continue
            parent = title_to_req[parent_title]
            if parent.type != RequirementType.USER:
                skipped.append({"title": title, "reason": "Parent must be USER type"})
                continue
            parent_id = parent.id

        elif req_type == RequirementType.SOFTWARE:
            if not parent_title or parent_title not in title_to_req:
                skipped.append({"title": title, "reason": f"Parent SYSTEM req '{parent_title}' not found"})
                continue
            parent = title_to_req[parent_title]
            if parent.type != RequirementType.SYSTEM:
                skipped.append({"title": title, "reason": "Parent must be SYSTEM type"})
                continue
            parent_id = parent.id

        new_req = Requirement(
            project_id=project_id,
            type=req_type,
            title=title,
            description=description,
            parent_id=parent_id,
        )
        db.add(new_req)
        await db.flush()
        title_to_req[title] = new_req
        added.append({"title": title, "type": type_str})

    await db.commit()
    return UploadSummary(
        total_added=len(added),
        total_skipped=len(skipped),
        added=added,
        skipped=skipped,
    )
