"""Architecture lock helper (IEC 62304 §5.3).

The project-level architecture document is editable only when a DRAFT or
IN_REVIEW baseline is open. When the latest baseline is APPROVED and no
draft has been forked yet, architecture writes (component create/update/
delete, interface mutations, data flow mutations) are blocked — the user
must fork to a new draft version first.

Bootstrap: a project with NO architecture baselines at all is treated as
unlocked so users can build the architecture from scratch before going
through approval the first time.
"""
import uuid
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .model import ArchitectureBaseline


async def _open_draft(db: AsyncSession, project_id: uuid.UUID) -> ArchitectureBaseline | None:
    return (await db.execute(
        select(ArchitectureBaseline)
        .where(
            ArchitectureBaseline.project_id == project_id,
            ArchitectureBaseline.status.in_(("DRAFT", "IN_REVIEW")),
        )
        .order_by(ArchitectureBaseline.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def _locking_baseline(db: AsyncSession, project_id: uuid.UUID) -> ArchitectureBaseline | None:
    """Return the APPROVED baseline currently locking this project's
    architecture, if any. Returns None when there's an open draft (in which
    case writes are allowed) or no baseline at all (bootstrap mode)."""
    if await _open_draft(db, project_id) is not None:
        return None
    return (await db.execute(
        select(ArchitectureBaseline)
        .where(
            ArchitectureBaseline.project_id == project_id,
            ArchitectureBaseline.status == "APPROVED",
        )
        .order_by(ArchitectureBaseline.approved_at.desc())
        .limit(1)
    )).scalar_one_or_none()


def _bump(version: str) -> str:
    try:
        major, minor = version.split(".", 1)
        return f"{major}.{int(minor) + 1}"
    except (ValueError, IndexError):
        return f"{version}.1"


async def assert_architecture_unlocked(db: AsyncSession, project_id: uuid.UUID) -> None:
    locker = await _locking_baseline(db, project_id)
    if locker is not None:
        raise HTTPException(
            400,
            f"Architecture is locked by approved baseline v{locker.version}. "
            f"Fork to v{_bump(locker.version)} to make changes.",
        )


async def is_architecture_locked(db: AsyncSession, project_id: uuid.UUID) -> bool:
    return (await _locking_baseline(db, project_id)) is not None
