from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from .model import Role, Permission, RolePermission
from .schema import RoleRead, PermissionRead

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleRead])
async def list_roles(db: AsyncSession = Depends(get_db)):
    roles = (
        await db.execute(
            select(Role).options(selectinload(Role.role_permissions).selectinload(RolePermission.permission))
        )
    ).scalars().all()
    result = []
    for role in roles:
        result.append(RoleRead(
            id=role.id,
            name=role.name,
            description=role.description,
            permissions=[rp.permission.name for rp in role.role_permissions],
        ))
    return result


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(Permission).order_by(Permission.name))).scalars().all()
