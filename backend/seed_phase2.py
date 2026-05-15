"""
Seed Phase 2 data (design, verification, validation, audit) on top of Phase 1.
Run: python seed_phase2.py
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.platform.projects.model import Project
from app.modules.compliance.dev.requirements.model import Requirement
import app.modules.compliance.risk.risks.model  # noqa: F401 — resolve Risk forward ref
import app.modules.compliance.dev.design.model  # noqa: F401 — resolve DesignElement forward ref
from app.modules.compliance.dev.validation.model import ValidationRecord, ValidationStatus

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    async with Session() as db:
        # ── Find existing Phase 1 project ─────────────────────────────────────
        from sqlalchemy import desc
        proj = (await db.execute(
            select(Project).order_by(desc(Project.created_at)).limit(1)
        )).scalar_one_or_none()
        if not proj:
            print("✗ No project found — run seed.py (Phase 1) first")
            return
        print(f"Using project: {proj.name}")

        # ── Find existing requirements ────────────────────────────────────────
        reqs = (await db.execute(
            select(Requirement).where(Requirement.project_id == proj.id)
        )).scalars().all()

        # Requirement.type is a plain String (per CLAUDE.md) — compare literals.
        user_reqs = [r for r in reqs if r.type == "USER"]
        sw_reqs   = [r for r in reqs if r.type == "SOFTWARE"]

        if not sw_reqs:
            print("✗ No SOFTWARE requirements — run seed.py first")
            return

        # §5.4 design elements are seeded by seed_architecture.py — they link
        # to §5.3 SWComponents, which this legacy Phase-2 seed doesn't create.

        # ── Validation records (linked to USER requirements) ──────────────────
        for user_req in user_reqs[:2]:
            db.add(ValidationRecord(
                project_id=proj.id,
                related_requirement_id=user_req.id,
                description=f"Clinical validation protocol for: {user_req.title}",
                status=ValidationStatus.PLANNED,
            ))
        await db.flush()

        await db.commit()
        print(f"✓ {min(len(user_reqs), 2)} validation records")


asyncio.run(seed())
