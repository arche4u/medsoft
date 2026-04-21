from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.modules.users.model import User
from app.modules.roles.model import RolePermission

from .security import verify_password, create_access_token
from .schema import TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(
            select(User)
            .options(selectinload(User.role))
            .where(User.email == form.username, User.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    # Load permissions for this role
    perms = (
        await db.execute(
            select(RolePermission)
            .options(selectinload(RolePermission.permission))
            .where(RolePermission.role_id == user.role_id)
        )
    ).scalars().all()
    permission_names = [rp.permission.name for rp in perms]

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "permissions": permission_names,
    })

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role.name,
        permissions=permission_names,
    )


@router.get("/me", tags=["auth"])
async def me(db: AsyncSession = Depends(get_db), token: str = ""):
    """Returns current user info — uses the standard dependency in protected routes."""
    return {"message": "Use Authorization: Bearer <token> header to authenticate"}
