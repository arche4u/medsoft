import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import require_permission
from app.modules.auth.schema import TokenData
from app.modules.requirements.model import Requirement, RequirementCategory
from app.modules.architecture.model import SWComponent
from .model import DesignElement, RequirementDesignLink
from .schema import (
    DesignElementCreate, DesignElementRead, DesignElementUpdate,
    RequirementDesignLinkCreate, RequirementDesignLinkRead,
)

router = APIRouter(prefix="/design", tags=["design"])

# IEC 62304 §5.4 — every design element details a §5.3 SWComponent. There is
# no longer an ARCHITECTURE/DETAILED tier (that's the §5.3 module) nor a
# category-folder system, so readable IDs use a single DET- prefix.
_DESIGN_PREFIX = "DET"


async def _next_design_id(db: AsyncSession, project_id: uuid.UUID) -> str:
    rows = (await db.execute(
        select(DesignElement.readable_id).where(
            DesignElement.project_id == project_id,
            DesignElement.readable_id.like(f"{_DESIGN_PREFIX}-%"),
        )
    )).scalars().all()
    max_n = 0
    for rid in rows:
        try:
            max_n = max(max_n, int(rid.split("-", 1)[1]))
        except (ValueError, IndexError):
            pass
    return f"{_DESIGN_PREFIX}-{max_n + 1:03d}"


async def _resolve_component(db: AsyncSession, component_id: uuid.UUID, project_id: uuid.UUID) -> SWComponent:
    component = await db.get(SWComponent, component_id)
    if not component or component.project_id != project_id:
        raise HTTPException(400, "component_id must reference a §5.3 component in this project")
    return component


async def _check_parent(db: AsyncSession, parent_id: uuid.UUID, component_id: uuid.UUID) -> None:
    parent = await db.get(DesignElement, parent_id)
    if not parent:
        raise HTTPException(400, f"Parent design element {parent_id} not found")
    if parent.component_id != component_id:
        raise HTTPException(400, "A nested design element must belong to the same component as its parent")


# ── Design Elements ──────────────────────────────────────────────────────────

@router.get("/elements", response_model=list[DesignElementRead])
async def list_elements(
    project_id: uuid.UUID | None = None,
    component_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(DesignElement)
    if project_id:
        q = q.where(DesignElement.project_id == project_id)
    if component_id:
        q = q.where(DesignElement.component_id == component_id)
    return (await db.execute(q)).scalars().all()


@router.post("/elements", response_model=DesignElementRead, status_code=201)
async def create_element(
    payload: DesignElementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_DESIGN")),
):
    await _resolve_component(db, payload.component_id, payload.project_id)
    if payload.parent_id is not None:
        await _check_parent(db, payload.parent_id, payload.component_id)
    rid = await _next_design_id(db, payload.project_id)
    el = DesignElement(**payload.model_dump(), readable_id=rid)
    db.add(el)
    await db.flush()
    await audit(db, "design_element", el.id, AuditAction.CREATE, current_user.user_id, f"{rid} {el.title}")
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
async def update_element(
    el_id: uuid.UUID, payload: DesignElementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_DESIGN")),
):
    el = await db.get(DesignElement, el_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("parent_id") is not None:
        if data["parent_id"] == el.id:
            raise HTTPException(400, "A design element cannot be its own parent")
        await _check_parent(db, data["parent_id"], el.component_id)
    for k, v in data.items():
        setattr(el, k, v)
    await audit(db, "design_element", el.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(el)
    return el


@router.delete("/elements/{el_id}", status_code=204)
async def delete_element(
    el_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_DESIGN")),
):
    el = await db.get(DesignElement, el_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    # Detach any sub-nested children so the FK doesn't block the delete.
    children = (await db.execute(
        select(DesignElement).where(DesignElement.parent_id == el_id)
    )).scalars().all()
    for child in children:
        child.parent_id = None
    await audit(db, "design_element", el.id, AuditAction.DELETE, current_user.user_id, el.title)
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
async def create_link(
    payload: RequirementDesignLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_DESIGN")),
):
    req = await db.get(Requirement, payload.requirement_id)
    if not req:
        raise HTTPException(404, detail="Requirement not found")
    el = await db.get(DesignElement, payload.design_element_id)
    if not el:
        raise HTTPException(404, detail="Design element not found")
    # IEC 62304 §5.4: design links only allowed on SOFTWARE-tier requirements,
    # defined as those whose category is a leaf in the per-project category
    # tree (no child categories point at it via parent_id).
    category = (await db.execute(
        select(RequirementCategory).where(
            RequirementCategory.project_id == req.project_id,
            RequirementCategory.name == req.type,
        )
    )).scalar_one_or_none()
    if category is None:
        raise HTTPException(
            400,
            f"§5.4: Requirement '{req.readable_id}' has type '{req.type}' which is not a "
            f"category in this project; cannot determine leaf-ness for design link.",
        )
    has_child = (await db.execute(
        select(RequirementCategory.id)
        .where(RequirementCategory.parent_id == category.id)
        .limit(1)
    )).scalar_one_or_none()
    if has_child is not None:
        raise HTTPException(
            400,
            f"§5.4: Cannot link a non-leaf requirement to design. Requirement "
            f"'{req.readable_id}' is in category '{category.name}' which has child "
            f"categories. Design links only allowed on SOFTWARE (leaf-category) requirements.",
        )
    link = RequirementDesignLink(**payload.model_dump())
    db.add(link)
    await db.flush()
    await audit(db, "requirement_design_link", link.id, AuditAction.CREATE, current_user.user_id)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=204)
async def delete_link(
    link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_DESIGN")),
):
    link = await db.get(RequirementDesignLink, link_id)
    if not link:
        raise HTTPException(404, detail="Link not found")
    await audit(db, "requirement_design_link", link.id, AuditAction.DELETE, current_user.user_id)
    await db.delete(link)
    await db.commit()
