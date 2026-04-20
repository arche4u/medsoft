"""
Seed dummy data for Phase 1 testing.
Run from backend/: python seed.py
"""
import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.modules.projects.model import Project
from app.modules.requirements.model import Requirement, RequirementType
from app.modules.testcases.model import TestCase
from app.modules.tracelinks.model import TraceLink
from app.modules.risks.model import Risk, _compute_level

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    async with Session() as db:
        # ── Project ──────────────────────────────────────────────────────────
        project = Project(name="IEC 62304 Pump Controller", description="Infusion pump firmware compliance project")
        db.add(project)
        await db.flush()

        # ── USER requirements ─────────────────────────────────────────────────
        u1 = Requirement(project_id=project.id, type=RequirementType.USER,
                         title="URS-001 Accurate dose delivery",
                         description="System shall deliver medication dose within ±2% of programmed value")
        u2 = Requirement(project_id=project.id, type=RequirementType.USER,
                         title="URS-002 Occlusion detection",
                         description="System shall detect and alarm within 5 seconds of occlusion event")
        db.add_all([u1, u2])
        await db.flush()

        # ── SYSTEM requirements ───────────────────────────────────────────────
        s1 = Requirement(project_id=project.id, type=RequirementType.SYSTEM,
                         parent_id=u1.id,
                         title="SRS-001 Flow rate control",
                         description="System shall regulate flow rate via closed-loop PID controller")
        s2 = Requirement(project_id=project.id, type=RequirementType.SYSTEM,
                         parent_id=u1.id,
                         title="SRS-002 Dosage calculation",
                         description="System shall compute dose from weight and concentration inputs")
        s3 = Requirement(project_id=project.id, type=RequirementType.SYSTEM,
                         parent_id=u2.id,
                         title="SRS-003 Pressure monitoring",
                         description="System shall sample line pressure every 100ms")
        db.add_all([s1, s2, s3])
        await db.flush()

        # ── SOFTWARE requirements ─────────────────────────────────────────────
        sw1 = Requirement(project_id=project.id, type=RequirementType.SOFTWARE,
                          parent_id=s1.id,
                          title="SWS-001 PID algorithm implementation",
                          description="Software shall implement discrete PID with configurable Kp, Ki, Kd")
        sw2 = Requirement(project_id=project.id, type=RequirementType.SOFTWARE,
                          parent_id=s2.id,
                          title="SWS-002 Dose computation module",
                          description="Software shall validate inputs before computing and clamp output")
        sw3 = Requirement(project_id=project.id, type=RequirementType.SOFTWARE,
                          parent_id=s3.id,
                          title="SWS-003 Pressure threshold check",
                          description="Software shall trigger OCCLUSION_ALARM when pressure > 300 mmHg")
        db.add_all([sw1, sw2, sw3])
        await db.flush()

        # ── Test cases ────────────────────────────────────────────────────────
        tc1 = TestCase(project_id=project.id, title="TC-001 PID step response test",
                       description="Verify PID output converges within 3 cycles")
        tc2 = TestCase(project_id=project.id, title="TC-002 Dose calculation boundary test",
                       description="Test min/max dose inputs including negative and overflow")
        tc3 = TestCase(project_id=project.id, title="TC-003 Occlusion alarm trigger test",
                       description="Simulate pressure > 300 mmHg and verify alarm within 5s")
        tc4 = TestCase(project_id=project.id, title="TC-004 Pressure sensor accuracy test",
                       description="Verify ADC readings match calibrated pressure gauge ±1%")
        db.add_all([tc1, tc2, tc3, tc4])
        await db.flush()

        # ── Trace links (SOFTWARE ↔ TestCase) ─────────────────────────────────
        db.add_all([
            TraceLink(requirement_id=sw1.id, testcase_id=tc1.id),
            TraceLink(requirement_id=sw2.id, testcase_id=tc2.id),
            TraceLink(requirement_id=sw3.id, testcase_id=tc3.id),
            TraceLink(requirement_id=sw3.id, testcase_id=tc4.id),
        ])
        await db.flush()

        # ── Risks ─────────────────────────────────────────────────────────────
        db.add_all([
            Risk(requirement_id=sw1.id,
                 hazard="PID instability",
                 hazardous_situation="Uncontrolled flow rate oscillation",
                 harm="Overdose / underdose of medication",
                 severity=5, probability=2,
                 risk_level=_compute_level(5, 2)),
            Risk(requirement_id=sw3.id,
                 hazard="Missed occlusion detection",
                 hazardous_situation="Pressure alarm not triggered",
                 harm="Air embolism or drug extravasation",
                 severity=5, probability=3,
                 risk_level=_compute_level(5, 3)),
            Risk(requirement_id=sw2.id,
                 hazard="Integer overflow in dose calculation",
                 hazardous_situation="Incorrect dose computed for extreme inputs",
                 harm="Patient receives incorrect medication dose",
                 severity=4, probability=2,
                 risk_level=_compute_level(4, 2)),
        ])

        await db.commit()
        print(f"✓ Project created: {project.id}")
        print(f"  2 USER | 3 SYSTEM | 3 SOFTWARE requirements")
        print(f"  4 test cases | 4 trace links | 3 risks")


asyncio.run(seed())
