"""
Seed Phase 2 data (design, verification, validation, audit) on top of Phase 1.
Run: python seed_phase2.py
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.projects.model import Project
from app.modules.requirements.model import Requirement
from app.modules.testcases.model import TestCase
import app.modules.tracelinks.model  # noqa: F401 — resolve TraceLink forward ref
import app.modules.risks.model  # noqa: F401 — resolve Risk forward ref
import app.modules.design.model  # noqa: F401 — resolve DesignElement forward ref
from app.modules.verification.model import TestExecution, ExecutionStatus
from app.modules.validation.model import ValidationRecord, ValidationStatus

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
        testcases = (await db.execute(
            select(TestCase).where(TestCase.project_id == proj.id)
        )).scalars().all()

        if not sw_reqs:
            print("✗ No SOFTWARE requirements — run seed.py first")
            return

        # §5.4 design elements are seeded by seed_architecture.py — they link
        # to §5.3 SWComponents, which this legacy Phase-2 seed doesn't create.

        # ── Test executions ───────────────────────────────────────────────────
        tc_by_title = {tc.title: tc for tc in testcases}
        executions = [
            ("TC-001 PID step response test",      ExecutionStatus.PASS,    "Converged in 2 cycles. Within spec."),
            ("TC-002 Dose calculation boundary test", ExecutionStatus.FAIL,  "Overflow detected at max dose input. Bug filed."),
            ("TC-003 Occlusion alarm trigger test", ExecutionStatus.PASS,    "Alarm triggered at 298ms. Within 5s limit."),
            ("TC-004 Pressure sensor accuracy test", ExecutionStatus.BLOCKED, "Hardware calibration rig unavailable."),
        ]
        for tc_title, status, notes in executions:
            tc = tc_by_title.get(tc_title)
            if tc:
                db.add(TestExecution(testcase_id=tc.id, status=status, notes=notes))
        await db.flush()

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
        print(f"✓ {len(executions)} test executions")
        print(f"✓ {min(len(user_reqs), 2)} validation records")


asyncio.run(seed())
