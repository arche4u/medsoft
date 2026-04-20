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
from app.modules.requirements.model import Requirement, RequirementType
from app.modules.testcases.model import TestCase
import app.modules.tracelinks.model  # noqa: F401 — resolve TraceLink forward ref
import app.modules.risks.model  # noqa: F401 — resolve Risk forward ref
from app.modules.design.model import DesignElement, DesignElementType, RequirementDesignLink
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

        user_reqs = [r for r in reqs if r.type == RequirementType.USER]
        sw_reqs   = [r for r in reqs if r.type == RequirementType.SOFTWARE]
        testcases = (await db.execute(
            select(TestCase).where(TestCase.project_id == proj.id)
        )).scalars().all()

        if not sw_reqs:
            print("✗ No SOFTWARE requirements — run seed.py first")
            return

        # ── Architecture elements ─────────────────────────────────────────────
        arch1 = DesignElement(
            project_id=proj.id, type=DesignElementType.ARCHITECTURE,
            title="ARCH-001 Pump Control Subsystem",
            description="Top-level component managing motor and flow control",
        )
        arch2 = DesignElement(
            project_id=proj.id, type=DesignElementType.ARCHITECTURE,
            title="ARCH-002 Safety Monitor Subsystem",
            description="Dedicated safety monitoring and alarm generation",
        )
        db.add_all([arch1, arch2])
        await db.flush()

        # ── Detailed design elements ──────────────────────────────────────────
        det1 = DesignElement(
            project_id=proj.id, type=DesignElementType.DETAILED,
            parent_id=arch1.id,
            title="DES-001 PID Controller Module",
            description="Discrete PID with Kp/Ki/Kd tuning interface, anti-windup, output clamping",
        )
        det2 = DesignElement(
            project_id=proj.id, type=DesignElementType.DETAILED,
            parent_id=arch1.id,
            title="DES-002 Dosage Computation Module",
            description="Weight-based dosage calculation with input validation and overflow guard",
        )
        det3 = DesignElement(
            project_id=proj.id, type=DesignElementType.DETAILED,
            parent_id=arch2.id,
            title="DES-003 Pressure Alarm Module",
            description="ADC sampling at 100ms intervals, threshold comparison, alarm GPIO driver",
        )
        db.add_all([det1, det2, det3])
        await db.flush()

        # ── Link SOFTWARE requirements to design elements ─────────────────────
        sw_by_title = {r.title: r for r in sw_reqs}
        sw1 = sw_by_title.get("SWS-001 PID algorithm implementation")
        sw2 = sw_by_title.get("SWS-002 Dose computation module")
        sw3 = sw_by_title.get("SWS-003 Pressure threshold check")

        if sw1:
            db.add(RequirementDesignLink(requirement_id=sw1.id, design_element_id=det1.id))
        if sw2:
            db.add(RequirementDesignLink(requirement_id=sw2.id, design_element_id=det2.id))
        if sw3:
            db.add(RequirementDesignLink(requirement_id=sw3.id, design_element_id=det3.id))
        await db.flush()

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
        print(f"✓ 2 ARCH + 3 DETAILED design elements")
        print(f"✓ 3 requirement → design links")
        print(f"✓ {len(executions)} test executions")
        print(f"✓ {min(len(user_reqs), 2)} validation records")


asyncio.run(seed())
