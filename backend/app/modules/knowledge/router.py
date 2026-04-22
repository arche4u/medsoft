import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction

from .model import KnowledgeEntry
from .schema import KnowledgeEntryUpdate, KnowledgeEntryRead
from .seed_data import GLOBAL_ENTRIES

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class GlobalEntryCreate(BaseModel):
    category: str
    standard: str | None = None
    clause_ref: str | None = None
    title: str
    summary: str | None = None
    content: str | None = None
    tags: list[str] = []
    sort_order: int = 99


class ProjectEntryCreate(BaseModel):
    category: str
    standard: str | None = None
    clause_ref: str | None = None
    title: str
    summary: str | None = None
    content: str | None = None
    tags: list[str] = []
    sort_order: int = 99


async def _ensure_global_entries(db: AsyncSession):
    """Seed built-in entries once — idempotent, keyed by (standard, clause_ref, title)."""
    existing = (
        await db.execute(
            select(KnowledgeEntry).where(KnowledgeEntry.is_global == True)  # noqa: E712
        )
    ).scalars().all()
    existing_keys = {(e.standard, e.clause_ref, e.title) for e in existing}

    added = False
    for entry in GLOBAL_ENTRIES:
        key = (entry.get("standard"), entry.get("clause_ref"), entry["title"])
        if key not in existing_keys:
            db.add(KnowledgeEntry(is_global=True, project_id=None, **entry))
            added = True

    if added:
        await db.commit()


# ── Global library endpoints ──────────────────────────────────────────────────

@router.get("/global", response_model=list[KnowledgeEntryRead])
async def list_global(
    standard: str | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_global_entries(db)
    q = select(KnowledgeEntry).where(KnowledgeEntry.is_global == True)  # noqa: E712
    if standard:
        q = q.where(KnowledgeEntry.standard == standard)
    if category:
        q = q.where(KnowledgeEntry.category == category)
    q = q.order_by(KnowledgeEntry.sort_order, KnowledgeEntry.title)
    return (await db.execute(q)).scalars().all()


@router.post("/global", response_model=KnowledgeEntryRead, status_code=201)
async def create_global_entry(
    body: GlobalEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new global knowledge entry visible to all projects."""
    entry = KnowledgeEntry(
        project_id=None,
        is_global=True,
        category=body.category,
        standard=body.standard,
        clause_ref=body.clause_ref,
        title=body.title,
        summary=body.summary,
        content=body.content,
        tags=body.tags,
        sort_order=body.sort_order,
    )
    db.add(entry)
    await db.flush()
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/global/{entry_id}", response_model=KnowledgeEntryRead)
async def update_global_entry(
    entry_id: uuid.UUID,
    body: KnowledgeEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update any global knowledge entry."""
    entry = (await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.id == entry_id,
            KnowledgeEntry.is_global == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Global entry not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(entry, field, val)
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.UPDATE)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/global/{entry_id}", status_code=204)
async def delete_global_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a global knowledge entry."""
    entry = (await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.id == entry_id,
            KnowledgeEntry.is_global == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Global entry not found")
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.DELETE)
    await db.delete(entry)
    await db.commit()


# ── Project-specific endpoints ────────────────────────────────────────────────

@router.get("/project/{project_id}", response_model=list[KnowledgeEntryRead])
async def list_project(
    project_id: uuid.UUID,
    standard: str | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(KnowledgeEntry).where(
        KnowledgeEntry.project_id == project_id,
        KnowledgeEntry.is_global == False,  # noqa: E712
    )
    if standard:
        q = q.where(KnowledgeEntry.standard == standard)
    if category:
        q = q.where(KnowledgeEntry.category == category)
    q = q.order_by(KnowledgeEntry.sort_order, KnowledgeEntry.title)
    return (await db.execute(q)).scalars().all()


@router.post("/project/{project_id}", response_model=KnowledgeEntryRead, status_code=201)
async def create_project_entry(
    project_id: uuid.UUID,
    body: ProjectEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    entry = KnowledgeEntry(
        project_id=project_id,
        is_global=False,
        category=body.category,
        standard=body.standard,
        clause_ref=body.clause_ref,
        title=body.title,
        summary=body.summary,
        content=body.content,
        tags=body.tags,
        sort_order=body.sort_order,
    )
    db.add(entry)
    await db.flush()
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/entry/{entry_id}", response_model=KnowledgeEntryRead)
async def get_entry(entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Knowledge entry not found")
    return entry


@router.put("/entry/{entry_id}", response_model=KnowledgeEntryRead)
async def update_entry(
    entry_id: uuid.UUID,
    body: KnowledgeEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update any entry (global or project-specific)."""
    entry = (await db.execute(
        select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Knowledge entry not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(entry, field, val)
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.UPDATE)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/entry/{entry_id}", status_code=204)
async def delete_entry(entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete any entry (global or project-specific)."""
    entry = (await db.execute(
        select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Knowledge entry not found")
    await audit(db, "KnowledgeEntry", entry.id, AuditAction.DELETE)
    await db.delete(entry)
    await db.commit()


@router.post("/entry/{entry_id}/copy-to-project/{project_id}", response_model=KnowledgeEntryRead, status_code=201)
async def copy_to_project(
    entry_id: uuid.UUID,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Copy a global entry into a project for customisation."""
    source = (await db.execute(
        select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
    )).scalar_one_or_none()
    if not source:
        raise HTTPException(404, "Source entry not found")

    copy = KnowledgeEntry(
        project_id=project_id,
        is_global=False,
        category=source.category,
        standard=source.standard,
        clause_ref=source.clause_ref,
        title=f"{source.title} (customised)",
        summary=source.summary,
        content=source.content,
        tags=list(source.tags or []),
        sort_order=source.sort_order,
    )
    db.add(copy)
    await db.flush()
    await audit(db, "KnowledgeEntry", copy.id, AuditAction.CREATE)
    await db.commit()
    await db.refresh(copy)
    return copy
