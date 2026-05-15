import uuid
from typing import Callable
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .security import decode_token
from .schema import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    try:
        payload = decode_token(token)
        return TokenData(
            user_id=uuid.UUID(payload["sub"]),
            email=payload["email"],
            name=payload["name"],
            role=payload["role"],
            permissions=payload.get("permissions", []),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has expired")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token")


def require_permission(permission: str) -> Callable:
    async def _check(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if permission not in current_user.permissions:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Permission '{permission}' is required for this action",
            )
        return current_user
    return _check
