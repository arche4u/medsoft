"""
Comprehensive test data seed covering multiple projects and all modules.

Wipes ALL existing data and inserts fresh test records.
Run: python seed_test.py
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.projects.model import Project
from app.modules.requirements.model import Requirement
from app.modules.testcases.model import TestCase
from app.modules.tracelinks.model import TraceLink
from app.modules.risks.model import Risk, _compute_level
from app.modules.design.model import DesignElement, DesignElementType, RequirementDesignLink
from app.modules.verification.model import TestExecution, ExecutionStatus
from app.modules.validation.model import ValidationRecord, ValidationStatus
from app.modules.change_control.model import ChangeRequest, ChangeRequestState, ChangeImpact
from app.modules.release.model import Release, ReleaseStatus, ReleaseItem
import app.modules.audit.model  # noqa: F401

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ── helpers ───────────────────────────────────────────────────────────────────

def req(proj_id, typ, rid, title, desc=None, parent_id=None):
    return Requirement(project_id=proj_id, type=typ, readable_id=rid,
                       title=title, description=desc, parent_id=parent_id)

def risk(req_id, hazard, sit, harm, s, p):
    return Risk(requirement_id=req_id, hazard=hazard, hazardous_situation=sit,
                harm=harm, severity=s, probability=p, risk_level=_compute_level(s, p))


async def wipe(db: AsyncSession):
    tables = ", ".join([
        "approvals", "electronic_signatures", "training_records",
        "role_permissions", "permissions", "users", "roles",
        "dhf_documents",
        "release_items", "releases",
        "change_impacts", "change_requests",
        "test_executions", "validation_records",
        "requirement_design_links", "design_elements",
        "tracelinks", "risks", "testcases",
        "requirements", "requirement_categories",
        "software_safety_profiles",
        "audit_logs", "documents", "projects",
    ])
    await db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await db.commit()
    print("✓ Wiped all tables")


async def seed():
    async with Session() as db:
        await wipe(db)

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 1 — Infusion Pump Controller (IEC 62304, Class C)
        # ══════════════════════════════════════════════════════════════════════
        p1 = Project(name="IEC 62304 Pump Controller",
                     description="Class C infusion pump firmware compliance project")
        db.add(p1)
        await db.flush()

        # USER reqs
        u1 = req(p1.id, "USER", "URQ-001", "Accurate dose delivery",
                 "System shall deliver medication dose within ±2% of programmed value")
        u2 = req(p1.id, "USER", "URQ-002", "Occlusion detection",
                 "System shall detect and alarm within 5 seconds of occlusion event")
        u3 = req(p1.id, "USER", "URQ-003", "Air-in-line detection",
                 "System shall detect air bubbles > 0.1 mL and halt infusion")
        u4 = req(p1.id, "USER", "URQ-004", "Battery backup operation",
                 "System shall continue operation on battery for at least 4 hours")
        u5 = req(p1.id, "USER", "URQ-005", "Audible and visual alarms",
                 "All critical alarms shall have both audible (>65 dB) and visual indication")
        db.add_all([u1, u2, u3, u4, u5])
        await db.flush()

        # SYSTEM reqs
        s1 = req(p1.id, "SYSTEM", "SYS-001", "Flow rate control", None, u1.id)
        s2 = req(p1.id, "SYSTEM", "SYS-002", "Dosage calculation", None, u1.id)
        s3 = req(p1.id, "SYSTEM", "SYS-003", "Pressure monitoring", None, u2.id)
        s4 = req(p1.id, "SYSTEM", "SYS-004", "Ultrasonic bubble detection", None, u3.id)
        s5 = req(p1.id, "SYSTEM", "SYS-005", "Power management subsystem", None, u4.id)
        s6 = req(p1.id, "SYSTEM", "SYS-006", "Alarm management", None, u5.id)
        db.add_all([s1, s2, s3, s4, s5, s6])
        await db.flush()

        # SOFTWARE reqs
        sw1  = req(p1.id, "SOFTWARE", "SWR-001", "PID algorithm implementation",
                   "Discrete PID with configurable Kp, Ki, Kd and anti-windup", s1.id)
        sw2  = req(p1.id, "SOFTWARE", "SWR-002", "Dose computation module",
                   "Validate inputs before computing; clamp output to safe range", s2.id)
        sw3  = req(p1.id, "SOFTWARE", "SWR-003", "Pressure threshold check",
                   "Trigger OCCLUSION_ALARM when pressure > 300 mmHg", s3.id)
        sw4  = req(p1.id, "SOFTWARE", "SWR-004", "Bubble detection driver",
                   "Interface with ultrasonic sensor, classify bubble size in real-time", s4.id)
        sw5  = req(p1.id, "SOFTWARE", "SWR-005", "Battery state machine",
                   "Implement charge/discharge state machine with low-battery warning", s5.id)
        sw6  = req(p1.id, "SOFTWARE", "SWR-006", "Alarm scheduler",
                   "Priority queue for concurrent alarms; enforce >65 dB output", s6.id)
        sw7  = req(p1.id, "SOFTWARE", "SWR-007", "Infusion log module",
                   "Persist last 1000 infusion events to non-volatile memory", s1.id)
        sw8  = req(p1.id, "SOFTWARE", "SWR-008", "Watchdog timer reset",
                   "Kick hardware watchdog every 500 ms to detect software lock-up", s5.id)
        db.add_all([sw1, sw2, sw3, sw4, sw5, sw6, sw7, sw8])
        await db.flush()

        # Test cases
        tc1  = TestCase(project_id=p1.id, readable_id="TC-001", title="PID step response",
                        description="Verify PID output converges within 3 cycles on step input")
        tc2  = TestCase(project_id=p1.id, readable_id="TC-002", title="Dose calculation boundary",
                        description="Min/max dose including negative and overflow values")
        tc3  = TestCase(project_id=p1.id, readable_id="TC-003", title="Occlusion alarm trigger",
                        description="Simulate pressure > 300 mmHg; verify alarm fires within 5 s")
        tc4  = TestCase(project_id=p1.id, readable_id="TC-004", title="Pressure sensor accuracy",
                        description="ADC readings vs calibrated gauge ±1%")
        tc5  = TestCase(project_id=p1.id, readable_id="TC-005", title="Bubble detection – 0.1 mL",
                        description="Inject 0.1 mL air bubble; confirm infusion halt")
        tc6  = TestCase(project_id=p1.id, readable_id="TC-006", title="Battery runtime test",
                        description="Full charge → discharge; verify >4 hours runtime")
        tc7  = TestCase(project_id=p1.id, readable_id="TC-007", title="Alarm audio level",
                        description="Sound level meter measurement during critical alarm")
        tc8  = TestCase(project_id=p1.id, readable_id="TC-008", title="Watchdog reset",
                        description="Block main loop; confirm MCU resets within 1 second")
        tc9  = TestCase(project_id=p1.id, readable_id="TC-009", title="Infusion log persistence",
                        description="Power-cycle after 500 events; verify all events intact")
        db.add_all([tc1, tc2, tc3, tc4, tc5, tc6, tc7, tc8, tc9])
        await db.flush()

        # Trace links
        db.add_all([
            TraceLink(requirement_id=sw1.id, testcase_id=tc1.id),
            TraceLink(requirement_id=sw2.id, testcase_id=tc2.id),
            TraceLink(requirement_id=sw3.id, testcase_id=tc3.id),
            TraceLink(requirement_id=sw3.id, testcase_id=tc4.id),
            TraceLink(requirement_id=sw4.id, testcase_id=tc5.id),
            TraceLink(requirement_id=sw5.id, testcase_id=tc6.id),
            TraceLink(requirement_id=sw6.id, testcase_id=tc7.id),
            TraceLink(requirement_id=sw8.id, testcase_id=tc8.id),
            TraceLink(requirement_id=sw7.id, testcase_id=tc9.id),
        ])
        await db.flush()

        # Risks
        db.add_all([
            risk(sw1.id,  "PID instability", "Uncontrolled flow rate oscillation",
                 "Overdose / underdose", 5, 2),
            risk(sw3.id,  "Missed occlusion", "Pressure alarm not triggered",
                 "Air embolism or drug extravasation", 5, 3),
            risk(sw2.id,  "Integer overflow in dose calc", "Incorrect dose for extreme inputs",
                 "Patient receives wrong dose", 4, 2),
            risk(sw4.id,  "Bubble detection threshold drift", "Small bubbles undetected",
                 "Air embolism", 5, 2),
            risk(sw5.id,  "Battery gauge inaccuracy", "Battery depletes without warning",
                 "Therapy interruption", 3, 3),
            risk(sw6.id,  "Alarm mask bug", "Critical alarm silenced by lower-priority alarm",
                 "Delayed clinical response", 4, 3),
            risk(sw8.id,  "Watchdog not kicked", "Firmware lock-up undetected",
                 "Silent therapy failure", 5, 2),
            risk(sw7.id,  "Log write failure", "Infusion data lost on power loss",
                 "Missing audit trail", 2, 3),
        ])
        await db.flush()

        # Design elements
        arch1 = DesignElement(project_id=p1.id, readable_id="ARC-001",
                              type=DesignElementType.ARCHITECTURE,
                              title="Motor Control Subsystem",
                              description="Stepper motor driver + encoder feedback loop")
        arch2 = DesignElement(project_id=p1.id, readable_id="ARC-002",
                              type=DesignElementType.ARCHITECTURE,
                              title="Sensor Acquisition Subsystem",
                              description="ADC drivers for pressure, temperature, bubble sensor")
        arch3 = DesignElement(project_id=p1.id, readable_id="ARC-003",
                              type=DesignElementType.ARCHITECTURE,
                              title="Power Management Subsystem",
                              description="Battery charger IC interface and state machine")
        arch4 = DesignElement(project_id=p1.id, readable_id="ARC-004",
                              type=DesignElementType.ARCHITECTURE,
                              title="Alarm & UI Subsystem",
                              description="Buzzer driver, LED matrix, display controller")
        db.add_all([arch1, arch2, arch3, arch4])
        await db.flush()

        det1 = DesignElement(project_id=p1.id, readable_id="DET-001",
                             type=DesignElementType.DETAILED,
                             parent_id=arch1.id, title="PID Controller Module",
                             description="Discrete PID, anti-windup, configurable gains")
        det2 = DesignElement(project_id=p1.id, readable_id="DET-002",
                             type=DesignElementType.DETAILED,
                             parent_id=arch1.id, title="Stepper Driver HAL",
                             description="Hardware abstraction for DRV8825 step/dir interface")
        det3 = DesignElement(project_id=p1.id, readable_id="DET-003",
                             type=DesignElementType.DETAILED,
                             parent_id=arch2.id, title="Pressure Sensor Driver",
                             description="SPI ADC read, oversampling, calibration offset")
        det4 = DesignElement(project_id=p1.id, readable_id="DET-004",
                             type=DesignElementType.DETAILED,
                             parent_id=arch2.id, title="Bubble Detection Driver",
                             description="Ultrasonic transceiver, threshold classification")
        det5 = DesignElement(project_id=p1.id, readable_id="DET-005",
                             type=DesignElementType.DETAILED,
                             parent_id=arch3.id, title="Battery State Machine",
                             description="CHARGE / DISCHARGE / LOW / FAULT states")
        det6 = DesignElement(project_id=p1.id, readable_id="DET-006",
                             type=DesignElementType.DETAILED,
                             parent_id=arch4.id, title="Alarm Scheduler",
                             description="Priority queue, masking rules, audio output")
        db.add_all([det1, det2, det3, det4, det5, det6])
        await db.flush()

        db.add_all([
            RequirementDesignLink(requirement_id=sw1.id, design_element_id=det1.id),
            RequirementDesignLink(requirement_id=sw3.id, design_element_id=det3.id),
            RequirementDesignLink(requirement_id=sw4.id, design_element_id=det4.id),
            RequirementDesignLink(requirement_id=sw5.id, design_element_id=det5.id),
            RequirementDesignLink(requirement_id=sw6.id, design_element_id=det6.id),
        ])
        await db.flush()

        # Test executions
        db.add_all([
            TestExecution(testcase_id=tc1.id, status=ExecutionStatus.PASS,
                          notes="PID converged in 2 cycles at nominal setpoint"),
            TestExecution(testcase_id=tc2.id, status=ExecutionStatus.PASS,
                          notes="All boundary conditions handled correctly"),
            TestExecution(testcase_id=tc3.id, status=ExecutionStatus.PASS,
                          notes="Alarm fired 3.2 s after threshold exceeded"),
            TestExecution(testcase_id=tc4.id, status=ExecutionStatus.PASS,
                          notes="Max deviation 0.7% against reference gauge"),
            TestExecution(testcase_id=tc5.id, status=ExecutionStatus.FAIL,
                          notes="0.08 mL bubble not detected — threshold needs tuning"),
            TestExecution(testcase_id=tc6.id, status=ExecutionStatus.PASS,
                          notes="4 h 18 min runtime on fully charged battery"),
            TestExecution(testcase_id=tc7.id, status=ExecutionStatus.PASS,
                          notes="Measured 72 dB at 1 m during critical alarm"),
            TestExecution(testcase_id=tc8.id, status=ExecutionStatus.PASS,
                          notes="MCU reset within 820 ms of watchdog not kicked"),
            TestExecution(testcase_id=tc9.id, status=ExecutionStatus.BLOCKED,
                          notes="NVM write API not yet integrated — test blocked"),
        ])
        await db.flush()

        # Validation records (USER reqs only)
        db.add_all([
            ValidationRecord(project_id=p1.id, related_requirement_id=u1.id,
                             description="Gravimetric test: 10 nurses, 30 scenarios. All 300 deliveries within ±1.5%.",
                             status=ValidationStatus.PASSED),
            ValidationRecord(project_id=p1.id, related_requirement_id=u2.id,
                             description="Occlusion simulation in ICU lab. Mean detection time 2.8 s.",
                             status=ValidationStatus.PASSED),
            ValidationRecord(project_id=p1.id, related_requirement_id=u3.id,
                             description="Bench test with calibrated bubble generator at 0.1 mL threshold.",
                             status=ValidationStatus.PLANNED),
            ValidationRecord(project_id=p1.id, related_requirement_id=u4.id,
                             description="24-hour monitoring in simulated ICU conditions.",
                             status=ValidationStatus.PLANNED),
        ])
        await db.flush()

        # Change requests
        cr1 = ChangeRequest(project_id=p1.id, title="CR-001 Increase pressure alarm threshold",
                            description="Clinical team requests 350 mmHg threshold instead of 300",
                            status=ChangeRequestState.APPROVED)
        cr2 = ChangeRequest(project_id=p1.id, title="CR-002 Add drug library integration",
                            description="Interface with hospital formulary for automatic weight-based dosing",
                            status=ChangeRequestState.OPEN)
        cr3 = ChangeRequest(project_id=p1.id, title="CR-003 Reduce bubble detection threshold",
                            description="Reduce from 0.1 mL to 0.05 mL per safety review findings",
                            status=ChangeRequestState.IMPACT_ANALYSIS)
        db.add_all([cr1, cr2, cr3])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=cr1.id, impacted_requirement_id=sw3.id,
                         impact_description="SWR-003 threshold constant must change to 350 mmHg"),
            ChangeImpact(change_request_id=cr1.id, impacted_testcase_id=tc3.id,
                         impact_description="TC-003 must be re-run with new threshold"),
            ChangeImpact(change_request_id=cr3.id, impacted_requirement_id=sw4.id,
                         impact_description="SWR-004 classification algorithm sensitivity change"),
            ChangeImpact(change_request_id=cr3.id, impacted_testcase_id=tc5.id,
                         impact_description="TC-005 must use 0.05 mL bubble fixture"),
        ])
        await db.flush()

        # Releases
        rel1 = Release(project_id=p1.id, version="v1.0.0", status=ReleaseStatus.RELEASED)
        rel2 = Release(project_id=p1.id, version="v1.1.0", status=ReleaseStatus.UNDER_REVIEW)
        db.add_all([rel1, rel2])
        await db.flush()

        db.add_all([
            ReleaseItem(release_id=rel1.id, requirement_id=sw1.id),
            ReleaseItem(release_id=rel1.id, requirement_id=sw2.id),
            ReleaseItem(release_id=rel1.id, requirement_id=sw3.id),
            ReleaseItem(release_id=rel1.id, testcase_id=tc1.id),
            ReleaseItem(release_id=rel1.id, testcase_id=tc2.id),
            ReleaseItem(release_id=rel1.id, testcase_id=tc3.id),
            ReleaseItem(release_id=rel2.id, requirement_id=sw4.id),
            ReleaseItem(release_id=rel2.id, requirement_id=sw5.id),
            ReleaseItem(release_id=rel2.id, testcase_id=tc5.id),
            ReleaseItem(release_id=rel2.id, testcase_id=tc6.id),
        ])
        await db.flush()

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 2 — Cardiac Monitor Software (IEC 62304, Class B)
        # ══════════════════════════════════════════════════════════════════════
        p2 = Project(name="Cardiac Monitor Software",
                     description="Class B bedside ECG and vital signs monitoring application")
        db.add(p2)
        await db.flush()

        cu1 = req(p2.id, "USER", "URQ-001", "Real-time ECG display",
                  "System shall display 12-lead ECG with <200 ms latency")
        cu2 = req(p2.id, "USER", "URQ-002", "Arrhythmia detection",
                  "System shall detect and annotate common arrhythmias (AF, VT, VF, Brady)")
        cu3 = req(p2.id, "USER", "URQ-003", "Nurse call integration",
                  "Critical alarms shall trigger nurse call system within 2 seconds")
        cu4 = req(p2.id, "USER", "URQ-004", "Trend review – 24 hours",
                  "Clinician shall review up to 24 hours of stored waveform data")
        db.add_all([cu1, cu2, cu3, cu4])
        await db.flush()

        cs1 = req(p2.id, "SYSTEM", "SYS-001", "ECG signal acquisition & filtering", None, cu1.id)
        cs2 = req(p2.id, "SYSTEM", "SYS-002", "QRS complex detection", None, cu2.id)
        cs3 = req(p2.id, "SYSTEM", "SYS-003", "Alarm routing to nurse call", None, cu3.id)
        cs4 = req(p2.id, "SYSTEM", "SYS-004", "Waveform archive service", None, cu4.id)
        db.add_all([cs1, cs2, cs3, cs4])
        await db.flush()

        csw1 = req(p2.id, "SOFTWARE", "SWR-001", "Notch filter (50/60 Hz)", None, cs1.id)
        csw2 = req(p2.id, "SOFTWARE", "SWR-002", "Pan-Tompkins QRS detector", None, cs2.id)
        csw3 = req(p2.id, "SOFTWARE", "SWR-003", "Arrhythmia classifier module", None, cs2.id)
        csw4 = req(p2.id, "SOFTWARE", "SWR-004", "HL7 FHIR alarm publisher", None, cs3.id)
        csw5 = req(p2.id, "SOFTWARE", "SWR-005", "Circular waveform buffer (24 h)", None, cs4.id)
        db.add_all([csw1, csw2, csw3, csw4, csw5])
        await db.flush()

        ctc1 = TestCase(project_id=p2.id, readable_id="TC-001", title="Notch filter attenuation",
                        description="Inject 50 Hz tone; verify >40 dB attenuation")
        ctc2 = TestCase(project_id=p2.id, readable_id="TC-002", title="QRS detection sensitivity",
                        description="MIT-BIH arrhythmia database – sensitivity >99%")
        ctc3 = TestCase(project_id=p2.id, readable_id="TC-003", title="AF classification accuracy",
                        description="100-episode AF database; F1 score >0.95")
        ctc4 = TestCase(project_id=p2.id, readable_id="TC-004", title="Nurse call trigger latency",
                        description="Critical alarm to nurse call output <2 s")
        ctc5 = TestCase(project_id=p2.id, readable_id="TC-005", title="24-hour buffer integrity",
                        description="Fill buffer; power-cycle; verify all records intact")
        db.add_all([ctc1, ctc2, ctc3, ctc4, ctc5])
        await db.flush()

        db.add_all([
            TraceLink(requirement_id=csw1.id, testcase_id=ctc1.id),
            TraceLink(requirement_id=csw2.id, testcase_id=ctc2.id),
            TraceLink(requirement_id=csw3.id, testcase_id=ctc3.id),
            TraceLink(requirement_id=csw4.id, testcase_id=ctc4.id),
            TraceLink(requirement_id=csw5.id, testcase_id=ctc5.id),
        ])
        await db.flush()

        db.add_all([
            risk(csw2.id, "QRS missed in noisy signal", "Arrhythmia episode not detected",
                 "Delayed treatment for VT/VF", 5, 3),
            risk(csw3.id, "False AF classification", "Unnecessary alarm fatigue",
                 "Nurse alert desensitisation", 3, 4),
            risk(csw4.id, "FHIR publish failure", "Nurse call not triggered",
                 "Delayed clinical response for critical alarm", 5, 2),
            risk(csw5.id, "Buffer overflow", "Oldest waveform data overwritten prematurely",
                 "Loss of diagnostic waveform", 2, 3),
        ])
        await db.flush()

        db.add_all([
            TestExecution(testcase_id=ctc1.id, status=ExecutionStatus.PASS,
                          notes="47 dB attenuation at 50 Hz — exceeds requirement"),
            TestExecution(testcase_id=ctc2.id, status=ExecutionStatus.PASS,
                          notes="Sensitivity 99.4%, specificity 99.1% on MIT-BIH"),
            TestExecution(testcase_id=ctc3.id, status=ExecutionStatus.FAIL,
                          notes="F1 = 0.91 on noisy dataset — below 0.95 threshold"),
            TestExecution(testcase_id=ctc4.id, status=ExecutionStatus.PASS,
                          notes="Mean latency 0.8 s over 50 triggered alarms"),
            TestExecution(testcase_id=ctc5.id, status=ExecutionStatus.PASS,
                          notes="All 86400 seconds of data intact after power cycle"),
        ])
        await db.flush()

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 3 — Ventilator Control System (IEC 62304, Class C)
        # ══════════════════════════════════════════════════════════════════════
        p3 = Project(name="Ventilator Control System",
                     description="Mechanical ventilator software — IEC 62304 Class C, ISO 80601-2-12")
        db.add(p3)
        await db.flush()

        vu1 = req(p3.id, "USER", "URQ-001", "Tidal volume accuracy",
                  "Delivered tidal volume shall be within ±10% of set value")
        vu2 = req(p3.id, "USER", "URQ-002", "Apnea alarm",
                  "System shall alarm if no spontaneous breath detected within 20 s")
        vu3 = req(p3.id, "USER", "URQ-003", "High pressure alarm",
                  "System shall alarm and terminate inspiration when Ppeak > 45 cmH2O")
        db.add_all([vu1, vu2, vu3])
        await db.flush()

        vs1 = req(p3.id, "SYSTEM", "SYS-001", "Flow control valve", None, vu1.id)
        vs2 = req(p3.id, "SYSTEM", "SYS-002", "Apnea detection subsystem", None, vu2.id)
        vs3 = req(p3.id, "SYSTEM", "SYS-003", "Airway pressure monitoring", None, vu3.id)
        db.add_all([vs1, vs2, vs3])
        await db.flush()

        vsw1 = req(p3.id, "SOFTWARE", "SWR-001", "Volume control loop", None, vs1.id)
        vsw2 = req(p3.id, "SOFTWARE", "SWR-002", "Breath detection algorithm", None, vs2.id)
        vsw3 = req(p3.id, "SOFTWARE", "SWR-003", "Ppeak limit enforcement", None, vs3.id)
        db.add_all([vsw1, vsw2, vsw3])
        await db.flush()

        vtc1 = TestCase(project_id=p3.id, readable_id="TC-001", title="Volume delivery accuracy – lung model",
                        description="Michigan test lung; 10 VT settings from 200–800 mL")
        vtc2 = TestCase(project_id=p3.id, readable_id="TC-002", title="Apnea alarm response time",
                        description="Disconnect breathing circuit; measure alarm delay")
        vtc3 = TestCase(project_id=p3.id, readable_id="TC-003", title="High pressure alarm and safety stop",
                        description="Occlude circuit; verify inspiration terminates and alarm fires")
        db.add_all([vtc1, vtc2, vtc3])
        await db.flush()

        db.add_all([
            TraceLink(requirement_id=vsw1.id, testcase_id=vtc1.id),
            TraceLink(requirement_id=vsw2.id, testcase_id=vtc2.id),
            TraceLink(requirement_id=vsw3.id, testcase_id=vtc3.id),
        ])
        await db.flush()

        db.add_all([
            risk(vsw1.id, "Valve calibration drift", "Delivered volume > set value",
                 "Volutrauma / barotrauma", 5, 2),
            risk(vsw2.id, "Apnea timer not reset on valid breath", "False apnea alarm",
                 "Unnecessary alarm and alarm fatigue", 3, 2),
            risk(vsw3.id, "Ppeak check bypassed in fast inspiration", "Overpressure delivered",
                 "Barotrauma / pneumothorax", 5, 3),
        ])
        await db.flush()

        db.add_all([
            TestExecution(testcase_id=vtc1.id, status=ExecutionStatus.PASS,
                          notes="Max deviation 7.2% at 200 mL setting — within ±10%"),
            TestExecution(testcase_id=vtc2.id, status=ExecutionStatus.PASS,
                          notes="Alarm triggered at 18.4 s — within 20 s limit"),
            TestExecution(testcase_id=vtc3.id, status=ExecutionStatus.BLOCKED,
                          notes="High-flow test fixture not yet calibrated"),
        ])
        await db.flush()

        await db.commit()

    print(f"\n{'='*60}")
    print(f"✓ Project 1: {p1.name}")
    print(f"   5 USER | 6 SYSTEM | 8 SOFTWARE reqs")
    print(f"   9 test cases | 8 risks | 4 arch + 6 detailed design elements")
    print(f"   3 change requests | 2 releases | 4 validation records")
    print(f"\n✓ Project 2: {p2.name}")
    print(f"   4 USER | 4 SYSTEM | 5 SOFTWARE reqs")
    print(f"   5 test cases | 4 risks")
    print(f"\n✓ Project 3: {p3.name}")
    print(f"   3 USER | 3 SYSTEM | 3 SOFTWARE reqs")
    print(f"   3 test cases | 3 risks")
    print(f"{'='*60}\n")


asyncio.run(seed())
