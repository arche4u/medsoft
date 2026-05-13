"""Architecture baseline seed helper for demo data.

Mirrors `app/modules/sdp/seed.py` and `app/modules/requirements/seed.py`.
Seeds an APPROVED Software Architecture Document v1.0 for a project by
snapshotting any existing components/interfaces and mirroring to a CMBaseline.
"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from .baseline_router import _snapshot_architecture, _mirror_to_cm
from .model import ArchitectureBaseline


async def seed_approved_architecture(
    db: AsyncSession,
    *,
    project_id,
    version: str = "1.0",
    approved_by: str = "Quality Manager (seeded)",
) -> ArchitectureBaseline | None:
    """Snapshot current components/interfaces into an APPROVED architecture
    baseline. Skips silently if there are no components to snapshot (no
    architecture in the seeded project)."""
    now = datetime.now(timezone.utc)
    b = ArchitectureBaseline(
        project_id=project_id,
        version=version,
        status="APPROVED",
        prepared_by="Software Architect (seeded)",
        prepared_at=now,
        reviewed_by="Technical Lead (seeded)",
        reviewed_at=now,
        approved_by=approved_by,
        approved_at=now,
    )
    db.add(b)
    await db.flush()

    n_comp, _ = await _snapshot_architecture(db, b)
    if n_comp == 0:
        # No architecture to baseline — back out cleanly.
        await db.delete(b)
        await db.flush()
        return None

    await db.flush()
    await db.refresh(b)

    cm_id = await _mirror_to_cm(db, b)
    b.cm_baseline_id = cm_id
    await db.flush()
    return b
