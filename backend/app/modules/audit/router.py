import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.users.model import User
from .model import AuditLog
from .schema import AuditLogRead

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=list[AuditLogRead])
async def list_logs(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    logs = (await db.execute(q)).scalars().all()

    user_ids = {log.user_id for log in logs if log.user_id}
    user_map: dict[uuid.UUID, str] = {}
    if user_ids:
        users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        user_map = {u.id: u.name for u in users}

    return [
        AuditLogRead(
            id=log.id,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            action=log.action,
            timestamp=log.timestamp,
            user_id=log.user_id,
            actor_name=user_map.get(log.user_id) if log.user_id else None,
            details=log.details,
        )
        for log in logs
    ]
