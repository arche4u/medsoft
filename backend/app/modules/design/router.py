import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.requirements.model import Requirement
from .model import DesignElement, DesignElementType, RequirementDesignLink
from .schema import (
    DesignElementCreate, DesignElementRead, DesignElementUpdate,
    RequirementDesignLinkCreate, RequirementDesignLinkRead,
)

router = APIRouter(prefix="/design", tags=["design"])


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
    el = DesignElement(**payload.model_dump())
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
    if req.type != "SOFTWARE":
        raise HTTPException(400, detail="Only SOFTWARE requirements can be linked to design elements")
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
