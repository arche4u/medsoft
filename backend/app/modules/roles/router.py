import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from .model import Role, Permission, RolePermission
from .schema import RoleRead, RoleCreate, PermissionRead

router = APIRouter(prefix="/roles", tags=["roles"])


async def _role_read(role: Role) -> RoleRead:
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=[rp.permission.name for rp in role.role_permissions],
    )


@router.get("", response_model=list[RoleRead])
async def list_roles(db: AsyncSession = Depends(get_db)):
    roles = (
        await db.execute(
            select(Role).options(selectinload(Role.role_permissions).selectinload(RolePermission.permission))
        )
    ).scalars().all()
    return [await _role_read(r) for r in roles]


@router.post("", response_model=RoleRead, status_code=201)
async def create_role(body: RoleCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Role).where(Role.name == body.name.upper()))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Role '{body.name}' already exists")
    role = Role(id=uuid.uuid4(), name=body.name.upper(), description=body.description)
    db.add(role)
    await db.flush()
    for pname in body.permission_names:
        perm = (await db.execute(select(Permission).where(Permission.name == pname))).scalar_one_or_none()
        if perm:
            db.add(RolePermission(id=uuid.uuid4(), role_id=role.id, permission_id=perm.id))
    await db.commit()
    role = (
        await db.execute(
            select(Role).options(selectinload(Role.role_permissions).selectinload(RolePermission.permission))
            .where(Role.id == role.id)
        )
    ).scalar_one()
    return await _role_read(role)


@router.delete("/{role_id}", status_code=204)
async def delete_role(role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    role = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role not found")
    await db.delete(role)
    await db.commit()


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(Permission).order_by(Permission.name))).scalars().all()
