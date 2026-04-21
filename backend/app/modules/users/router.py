import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.modules.auth.deps import require_permission
from app.modules.auth.schema import TokenData
from app.modules.auth.security import hash_password
from .model import User
from .schema import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Email '{body.email}' is already registered")
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role_id=body.role_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _enrich(user, db)


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    users = (
        await db.execute(select(User).options(selectinload(User.role)).order_by(User.created_at))
    ).scalars().all()
    return [UserRead(
        id=u.id, name=u.name, email=u.email, role_id=u.role_id,
        is_active=u.is_active, created_at=u.created_at, role_name=u.role.name,
    ) for u in users]


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    user = (
        await db.execute(select(User).options(selectinload(User.role)).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    return UserRead(
        id=user.id, name=user.name, email=user.email, role_id=user.role_id,
        is_active=user.is_active, created_at=user.created_at, role_name=user.role.name,
    )


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(require_permission("MANAGE_USERS")),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if body.name is not None:
        user.name = body.name
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.role_id is not None:
        user.role_id = body.role_id
    await db.commit()
    return await _enrich(user, db)


async def _enrich(user: User, db: AsyncSession) -> UserRead:
    await db.refresh(user)
    u = (
        await db.execute(select(User).options(selectinload(User.role)).where(User.id == user.id))
    ).scalar_one()
    return UserRead(
        id=u.id, name=u.name, email=u.email, role_id=u.role_id,
        is_active=u.is_active, created_at=u.created_at, role_name=u.role.name,
    )
