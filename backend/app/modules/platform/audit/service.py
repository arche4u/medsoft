import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from .model import AuditLog, AuditAction


async def audit(
    db: AsyncSession,
    entity_type: str,
    entity_id: uuid.UUID,
    action: AuditAction,
    user_id: uuid.UUID | None = None,
    details: str | None = None,
) -> None:
    db.add(AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user_id,
        details=details,
    ))
