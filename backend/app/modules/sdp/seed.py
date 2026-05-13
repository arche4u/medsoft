"""SDP seed helper — creates a fully-populated APPROVED SDP for demo data.

Used by `backend/seed_comprehensive.py` (and any other seed/demo scripts) so the
default content lives next to the SDP module rather than being duplicated in
every seed script. IEC 62304 §5.1 requires an approved SDP before release;
seeded projects need one to be exercisable end-to-end.
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from .defaults import SECTIONS, PHASES, ROLES
from .model import SoftwareDevelopmentPlan, SDPSection, SDPLifecyclePhase, SDPProjectRole


async def seed_approved_sdp(
    db: AsyncSession,
    *,
    project_id,
    safety_class: str,
    title: str,
    version: str = "1.0",
    approved_by: str = "Quality Manager (seeded)",
    lifecycle_model: str = "V_MODEL",
    description: str | None = None,
) -> SoftwareDevelopmentPlan:
    """Create an APPROVED SDP with default sections/phases/roles for the given project.

    Inserts SoftwareDevelopmentPlan plus all default SDPSection / SDPLifecyclePhase /
    SDPProjectRole rows. Caller is responsible for `await db.commit()` afterwards.
    """
    now = datetime.now(timezone.utc)
    sdp = SoftwareDevelopmentPlan(
        project_id=project_id,
        version=version,
        status="APPROVED",
        lifecycle_model=lifecycle_model,
        safety_class=safety_class,
        title=title,
        description=description or f"IEC 62304 SDP for {title} (auto-seeded).",
        created_by=approved_by,
        # Three-stage signoff trail (seeded names; replace via real workflow).
        prepared_by="Software Lead (seeded)",
        prepared_at=now,
        reviewed_by="Technical Reviewer (seeded)",
        reviewed_at=now,
        approved_by=approved_by,
        approved_at=now,
    )
    db.add(sdp)
    await db.flush()

    for s in SECTIONS:
        db.add(SDPSection(sdp_id=sdp.id, **s))

    for p in PHASES:
        if safety_class in p["required_for_class"]:
            db.add(SDPLifecyclePhase(sdp_id=sdp.id, **p))

    for r in ROLES:
        if safety_class in r["required_for_class"]:
            db.add(SDPProjectRole(sdp_id=sdp.id, **r))

    await db.flush()
    return sdp
