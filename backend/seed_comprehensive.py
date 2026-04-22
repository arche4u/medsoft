"""
Comprehensive IEC 62304 seed data — 5 medical device projects covering:
  UI · LED · Alarms · Control System · Software · Communication · Safety

Wipes ALL existing data. Run: python seed_comprehensive.py
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


def req(proj_id, typ, rid, title, desc=None, parent_id=None):
    return Requirement(project_id=proj_id, type=typ, readable_id=rid,
                       title=title, description=desc, parent_id=parent_id)

def risk(req_id, hazard, sit, harm, s, p):
    return Risk(requirement_id=req_id, hazard=hazard, hazardous_situation=sit,
                harm=harm, severity=s, probability=p, risk_level=_compute_level(s, p))

def arch(proj_id, rid, title, desc=None):
    return DesignElement(project_id=proj_id, readable_id=rid,
                         type=DesignElementType.ARCHITECTURE, title=title, description=desc)

def det(proj_id, rid, parent_id, title, desc=None):
    return DesignElement(project_id=proj_id, readable_id=rid,
                         type=DesignElementType.DETAILED, parent_id=parent_id,
                         title=title, description=desc)

def tc(proj_id, rid, title, desc=None):
    return TestCase(project_id=proj_id, readable_id=rid, title=title, description=desc)

def exe(tc_id, status, notes):
    return TestExecution(testcase_id=tc_id, status=status, notes=notes)

def val(proj_id, req_id, desc, status):
    return ValidationRecord(project_id=proj_id, related_requirement_id=req_id,
                            description=desc, status=status)


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
        # PROJECT 1 — Patient Vital Signs Monitor  (Class B, UI + LED + Alarms)
        # ══════════════════════════════════════════════════════════════════════
        p1 = Project(name="Patient Vital Signs Monitor",
                     description="Bedside multi-parameter monitor: SpO2, NIBP, ECG, Temp, EtCO2. IEC 62304 Class B.")
        db.add(p1)
        await db.flush()

        # ── USER requirements ──────────────────────────────────────────────
        pu = {}
        rows = [
            ("URQ-001", "Waveform display with configurable layout",
             "Clinician shall configure 2–8 waveform tiles on a 15\" touchscreen; layout persists across power cycles"),
            ("URQ-002", "Alarm threshold management",
             "Clinician shall set per-parameter high/low alarm limits; limits validated against physiological safe range"),
            ("URQ-003", "LED status indication",
             "Device shall provide colour-coded LED bar: green=normal, yellow=advisory, red=critical at all viewing angles"),
            ("URQ-004", "Audible alarm escalation",
             "Unacknowledged critical alarm shall escalate from 65 dB to 85 dB within 60 seconds"),
            ("URQ-005", "Alarm suspension",
             "Operator shall suspend alarms for up to 120 seconds; device shall resume automatically"),
            ("URQ-006", "Trend review – 72 hours",
             "Clinician shall review 72-hour numeric trend graphs for any parameter"),
            ("URQ-007", "Patient data export",
             "Report shall export to PDF and HL7 FHIR R4 within 10 seconds of request"),
            ("URQ-008", "Network connectivity and central station",
             "Device shall transmit live data to central monitoring station via IEEE 802.11ac"),
            ("URQ-009", "Touchscreen interface responsiveness",
             "All touch interactions shall register within 100 ms of contact"),
            ("URQ-010", "Standby mode power LED",
             "In standby, a blue LED shall pulse at 1 Hz to indicate powered-but-monitoring state"),
        ]
        for rid, title, desc in rows:
            r = req(p1.id, "USER", rid, title, desc)
            db.add(r)
            pu[rid] = r
        await db.flush()

        # ── SYSTEM requirements ────────────────────────────────────────────
        ps = {}
        srows = [
            ("SYS-001", "Display rendering subsystem", "URQ-001"),
            ("SYS-002", "Touchscreen input subsystem", "URQ-001"),
            ("SYS-003", "Alarm limit configuration service", "URQ-002"),
            ("SYS-004", "LED driver subsystem", "URQ-003"),
            ("SYS-005", "Audible alarm escalation engine", "URQ-004"),
            ("SYS-006", "Alarm suspend timer", "URQ-005"),
            ("SYS-007", "Trend data archive service", "URQ-006"),
            ("SYS-008", "PDF and FHIR export service", "URQ-007"),
            ("SYS-009", "Wi-Fi and central station gateway", "URQ-008"),
            ("SYS-010", "Standby power management", "URQ-010"),
        ]
        for rid, title, parent_key in srows:
            r = req(p1.id, "SYSTEM", rid, title, None, pu[parent_key].id)
            db.add(r)
            ps[rid] = r
        await db.flush()

        # ── SOFTWARE requirements ──────────────────────────────────────────
        pswmap = [
            ("SWR-001", "Waveform tile layout engine",
             "Render configurable waveform grid; support drag-and-drop tile reorder; store config to NVRAM",
             "SYS-001"),
            ("SWR-002", "Touchscreen gesture driver",
             "Detect tap, long-press, swipe gestures via FT5426 I2C controller; debounce <20 ms",
             "SYS-002"),
            ("SWR-003", "Alarm limit validation module",
             "Reject limits outside physiological bounds table; raise CONFIG_ERROR if violated",
             "SYS-003"),
            ("SWR-004", "LED PWM controller",
             "Drive WS2812B RGB LED strip via SPI DMA; map alarm state to colour and blink pattern",
             "SYS-004"),
            ("SWR-005", "Alarm escalation state machine",
             "States: SILENT→ACTIVE→ESCALATED; timer-driven transitions; log each state change",
             "SYS-005"),
            ("SWR-006", "Alarm suspend watchdog",
             "Start countdown on suspend request; auto-resume and fire ADVISORY alarm on expiry",
             "SYS-006"),
            ("SWR-007", "Ring-buffer trend store",
             "72-hour circular buffer per parameter; 1-second resolution; wear-levelled NAND write",
             "SYS-007"),
            ("SWR-008", "PDF report generator",
             "Compose A4 PDF from template: patient header, trends, alarm events; target <8 s",
             "SYS-008"),
            ("SWR-009", "FHIR Observation publisher",
             "Serialize vitals as FHIR R4 Observation bundle; POST to gateway; retry on 5xx",
             "SYS-008"),
            ("SWR-010", "Wi-Fi link manager",
             "Association, DHCP, TLS1.3 tunnel to central station; reconnect on drop within 5 s",
             "SYS-009"),
            ("SWR-011", "Standby LED pulse driver",
             "1 Hz PWM ramp on blue channel in standby; cease immediately on alarm state entry",
             "SYS-010"),
            ("SWR-012", "Parameter alarm evaluator",
             "Compare each sample against active limits; debounce 3 consecutive violations before raising alarm",
             "SYS-005"),
            ("SWR-013", "Central station packet framer",
             "Frame 100 ms vital-sign snapshots in proprietary binary protocol; CRC-32 protected",
             "SYS-009"),
            ("SWR-014", "Alarm event log",
             "Persist all alarm events (onset, ack, clear) to circular log; retain last 5000 events",
             "SYS-005"),
            ("SWR-015", "Display brightness auto-adjust",
             "Read ambient light sensor (ALS) via I2C; map lux to backlight PWM duty cycle",
             "SYS-001"),
        ]
        psw = {}
        for rid, title, desc, skey in pswmap:
            r = req(p1.id, "SOFTWARE", rid, title, desc, ps[skey].id)
            db.add(r)
            psw[rid] = r
        await db.flush()

        # ── Test cases ─────────────────────────────────────────────────────
        ptc = {}
        tcrows = [
            ("TC-001", "Waveform layout save/restore",
             "Configure 6-tile layout; power-cycle; verify identical layout on boot"),
            ("TC-002", "Touch gesture latency",
             "100 tap events measured with high-speed camera; verify P99 <100 ms"),
            ("TC-003", "Alarm limit rejection – out-of-range",
             "Attempt SpO2 high limit = 110%; verify CONFIG_ERROR raised and limit unchanged"),
            ("TC-004", "LED colour mapping – critical alarm",
             "Trigger HR critical alarm; verify LED transitions to solid red within 200 ms"),
            ("TC-005", "LED colour mapping – advisory alarm",
             "Trigger SpO2 advisory; verify LED transitions to yellow blink 1 Hz"),
            ("TC-006", "Alarm escalation timing",
             "Allow critical alarm unacknowledged for 65 s; verify volume ≥ 82 dB"),
            ("TC-007", "Alarm suspend auto-resume",
             "Suspend alarms; wait 125 s; verify ADVISORY alarm fires and monitoring resumes"),
            ("TC-008", "72-hour trend buffer integrity",
             "Fill 72-hour buffer; power cycle; read back full dataset; verify 0 missing samples"),
            ("TC-009", "PDF export timing",
             "Request 72-hour PDF report; measure wall-clock time; verify ≤ 10 s"),
            ("TC-010", "FHIR publish retry on 5xx",
             "Mock gateway returning HTTP 503; verify client retries ≥ 3 times then alerts"),
            ("TC-011", "Wi-Fi reconnect within 5 s",
             "Drop Wi-Fi AP; re-enable; measure time to reconnect and resume data stream"),
            ("TC-012", "Standby LED pulse verification",
             "Enter standby; measure LED blink frequency with oscilloscope; verify 1 Hz ± 5%"),
            ("TC-013", "Alarm debounce – 3 violations",
             "Inject 2 threshold crossings then normal; verify no alarm raised"),
            ("TC-014", "Alarm event log persistence",
             "Generate 5000 alarm events; read log; power-cycle; verify all 5000 intact"),
            ("TC-015", "Auto-brightness ramp",
             "Vary ambient light 10–1000 lux; verify PWM duty changes monotonically"),
        ]
        for rid, title, desc in tcrows:
            t = tc(p1.id, rid, title, desc)
            db.add(t)
            ptc[rid] = t
        await db.flush()

        # ── Trace links ────────────────────────────────────────────────────
        tl_map = [
            ("SWR-001", "TC-001"), ("SWR-002", "TC-002"), ("SWR-003", "TC-003"),
            ("SWR-004", "TC-004"), ("SWR-004", "TC-005"), ("SWR-005", "TC-006"),
            ("SWR-006", "TC-007"), ("SWR-007", "TC-008"), ("SWR-008", "TC-009"),
            ("SWR-009", "TC-010"), ("SWR-010", "TC-011"), ("SWR-011", "TC-012"),
            ("SWR-012", "TC-013"), ("SWR-014", "TC-014"), ("SWR-015", "TC-015"),
        ]
        for sw_k, tc_k in tl_map:
            db.add(TraceLink(requirement_id=psw[sw_k].id, testcase_id=ptc[tc_k].id))
        await db.flush()

        # ── Risks ──────────────────────────────────────────────────────────
        db.add_all([
            risk(psw["SWR-005"].id, "Alarm escalation timer not started",
                 "Critical alarm remains at low volume indefinitely",
                 "Clinician does not respond; patient deteriorates", 5, 3),
            risk(psw["SWR-004"].id, "LED driver SPI corruption",
                 "LED shows wrong colour during critical alarm",
                 "Misleading visual status; delayed response", 4, 2),
            risk(psw["SWR-012"].id, "Debounce count set too high",
                 "Alarm delayed beyond safe response window",
                 "Missed critical physiological event", 5, 2),
            risk(psw["SWR-006"].id, "Suspend watchdog not armed",
                 "Alarm suspension never expires",
                 "Patient monitoring gap beyond 120 s", 4, 2),
            risk(psw["SWR-003"].id, "Limit validation bypass on import",
                 "Unsafe alarm limits loaded from config file",
                 "Alarms not triggered for dangerous values", 4, 3),
            risk(psw["SWR-007"].id, "Ring-buffer pointer overflow",
                 "Trend data silently corrupted or lost",
                 "Incorrect clinical trend analysis", 3, 2),
            risk(psw["SWR-009"].id, "FHIR publish silent failure",
                 "Central station does not receive alarms",
                 "Remote clinical staff unaware of critical event", 5, 2),
            risk(psw["SWR-010"].id, "Wi-Fi reconnect loop hangs",
                 "Device becomes unreachable; alarms not relayed",
                 "Central monitoring gap", 3, 3),
        ])
        await db.flush()

        # ── Design elements ────────────────────────────────────────────────
        pa1 = arch(p1.id, "ARC-001", "Display & Touch Subsystem",
                   "15\" LCD controller, backlight PWM, FT5426 touch IC")
        pa2 = arch(p1.id, "ARC-002", "LED & Audio Alarm Subsystem",
                   "WS2812B LED strip, piezo buzzer amplifier, alarm state machine")
        pa3 = arch(p1.id, "ARC-003", "Data Management Subsystem",
                   "NAND flash driver, ring-buffer trend store, alarm event log")
        pa4 = arch(p1.id, "ARC-004", "Connectivity Subsystem",
                   "Wi-Fi SoC, TLS stack, FHIR client, central station framer")
        db.add_all([pa1, pa2, pa3, pa4])
        await db.flush()

        pd1 = det(p1.id, "DET-001", pa1.id, "Waveform Tile Layout Engine",
                  "Grid compositor with drag-and-drop; NVRAM persistence")
        pd2 = det(p1.id, "DET-002", pa1.id, "Touch Gesture Recogniser",
                  "Tap/swipe/long-press classifier on FT5426 raw events")
        pd3 = det(p1.id, "DET-003", pa1.id, "Backlight ALS Controller",
                  "I2C ALS read → PWM duty map, hysteresis filter")
        pd4 = det(p1.id, "DET-004", pa2.id, "LED PWM Driver",
                  "SPI DMA to WS2812B; colour palette mapped to alarm state")
        pd5 = det(p1.id, "DET-005", pa2.id, "Alarm Escalation State Machine",
                  "SILENT→ACTIVE→ESCALATED with timer and volume ramp")
        pd6 = det(p1.id, "DET-006", pa2.id, "Alarm Suspend Watchdog",
                  "Countdown timer; auto-resume on expiry")
        pd7 = det(p1.id, "DET-007", pa3.id, "72-Hour Trend Ring Buffer",
                  "Circular NAND buffer, 1 s resolution, wear levelling")
        pd8 = det(p1.id, "DET-008", pa4.id, "FHIR R4 Observation Publisher",
                  "Bundle serialiser, HTTP retry with exponential backoff")
        pd9 = det(p1.id, "DET-009", pa4.id, "Wi-Fi Link Manager",
                  "Association FSM, TLS1.3, 5 s reconnect guarantee")
        db.add_all([pd1, pd2, pd3, pd4, pd5, pd6, pd7, pd8, pd9])
        await db.flush()

        rdlinks = [
            (psw["SWR-001"].id, pd1.id), (psw["SWR-002"].id, pd2.id),
            (psw["SWR-015"].id, pd3.id), (psw["SWR-004"].id, pd4.id),
            (psw["SWR-005"].id, pd5.id), (psw["SWR-006"].id, pd6.id),
            (psw["SWR-007"].id, pd7.id), (psw["SWR-009"].id, pd8.id),
            (psw["SWR-010"].id, pd9.id),
        ]
        for r_id, d_id in rdlinks:
            db.add(RequirementDesignLink(requirement_id=r_id, design_element_id=d_id))
        await db.flush()

        # ── Test executions ────────────────────────────────────────────────
        execs = [
            ("TC-001", ExecutionStatus.PASS, "Layout restored correctly after cold boot in 3 runs"),
            ("TC-002", ExecutionStatus.PASS, "P99 latency 87 ms — within 100 ms spec"),
            ("TC-003", ExecutionStatus.PASS, "CONFIG_ERROR raised; existing limit unchanged"),
            ("TC-004", ExecutionStatus.PASS, "LED turned solid red 145 ms after alarm trigger"),
            ("TC-005", ExecutionStatus.PASS, "Yellow 1 Hz blink confirmed on oscilloscope"),
            ("TC-006", ExecutionStatus.FAIL, "Measured 78 dB at 65 s — below 82 dB target; amplifier gain needs adjustment"),
            ("TC-007", ExecutionStatus.PASS, "ADVISORY alarm fired at 122 s; monitoring resumed normally"),
            ("TC-008", ExecutionStatus.PASS, "Zero missing samples across full 72-hour buffer after power cycle"),
            ("TC-009", ExecutionStatus.PASS, "PDF generated in 6.2 s for 72-hour dataset"),
            ("TC-010", ExecutionStatus.PASS, "Client retried 3 times then raised CONNECTIVITY_ALERT"),
            ("TC-011", ExecutionStatus.PASS, "Reconnected and resumed in 3.8 s"),
            ("TC-012", ExecutionStatus.PASS, "1.002 Hz measured — within ±5% spec"),
            ("TC-013", ExecutionStatus.PASS, "No alarm raised on 2 violations; alarm raised on 3rd"),
            ("TC-014", ExecutionStatus.BLOCKED, "NAND flash test fixture not available in lab yet"),
            ("TC-015", ExecutionStatus.PASS, "PWM increased monotonically across full lux range"),
        ]
        for tc_k, status, notes in execs:
            db.add(exe(ptc[tc_k].id, status, notes))
        await db.flush()

        # ── Validation records ─────────────────────────────────────────────
        db.add_all([
            val(p1.id, pu["URQ-002"].id,
                "Clinical usability study: 15 ICU nurses configured alarm limits for 5 patient scenarios. "
                "All limits accepted within physiological bounds. No unsafe configuration possible.",
                ValidationStatus.PASSED),
            val(p1.id, pu["URQ-003"].id,
                "LED visibility test at 0°, 45°, 90° viewing angles in ambient light 50–2000 lux. "
                "Red/yellow/green unambiguously distinguishable in all conditions.",
                ValidationStatus.PASSED),
            val(p1.id, pu["URQ-004"].id,
                "Sound level meter test in simulated ward noise (65 dB background). "
                "Escalated alarm reached 84 dB at 62 s — within spec.",
                ValidationStatus.PLANNED),
            val(p1.id, pu["URQ-009"].id,
                "10-user gloved touchscreen interaction study. Mean tap registration 68 ms. "
                "All users completed configuration tasks without gestural errors.",
                ValidationStatus.PASSED),
            val(p1.id, pu["URQ-006"].id,
                "72-hour trend review usability: cardiologist reviewed stored AF episode. "
                "Trend graph navigated and event located within 45 s.",
                ValidationStatus.PASSED),
        ])
        await db.flush()

        # ── Change requests ────────────────────────────────────────────────
        cr1 = ChangeRequest(project_id=p1.id,
                            title="CR-001 Increase alarm escalation to 90 dB",
                            description="Clinical advisory board recommends 90 dB maximum for noisy ICU environments",
                            status=ChangeRequestState.APPROVED)
        cr2 = ChangeRequest(project_id=p1.id,
                            title="CR-002 Add SpO2 waveform as default tile",
                            description="Default layout shall include SpO2 pleth waveform on all new patient admissions",
                            status=ChangeRequestState.OPEN)
        cr3 = ChangeRequest(project_id=p1.id,
                            title="CR-003 Extend alarm suspend to 180 seconds",
                            description="Anaesthesia team requests 180 s suspend window for procedure periods",
                            status=ChangeRequestState.IMPACT_ANALYSIS)
        db.add_all([cr1, cr2, cr3])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=cr1.id, impacted_requirement_id=psw["SWR-005"].id,
                         impact_description="SWR-005 escalated volume target changes from 85 dB to 90 dB"),
            ChangeImpact(change_request_id=cr1.id, impacted_testcase_id=ptc["TC-006"].id,
                         impact_description="TC-006 pass criterion changes to ≥ 87 dB at 65 s"),
            ChangeImpact(change_request_id=cr3.id, impacted_requirement_id=psw["SWR-006"].id,
                         impact_description="SWR-006 maximum suspend duration constant changes to 180 s"),
            ChangeImpact(change_request_id=cr3.id, impacted_testcase_id=ptc["TC-007"].id,
                         impact_description="TC-007 wait time changes to 185 s"),
        ])
        await db.flush()

        # ── Releases ───────────────────────────────────────────────────────
        r1a = Release(project_id=p1.id, version="v2.0.0", status=ReleaseStatus.RELEASED)
        r1b = Release(project_id=p1.id, version="v2.1.0", status=ReleaseStatus.UNDER_REVIEW)
        db.add_all([r1a, r1b])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006"]:
            db.add(ReleaseItem(release_id=r1a.id, requirement_id=psw[swk].id))
        for tck in ["TC-001","TC-002","TC-003","TC-004","TC-005","TC-006"]:
            db.add(ReleaseItem(release_id=r1a.id, testcase_id=ptc[tck].id))
        for swk in ["SWR-007","SWR-008","SWR-009","SWR-010","SWR-011"]:
            db.add(ReleaseItem(release_id=r1b.id, requirement_id=psw[swk].id))
        await db.flush()

        print(f"✓ P1 Patient Vital Signs Monitor — 10 USER | 10 SYS | 15 SW | 15 TC | 8 risks")

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 2 — Electrosurgical Generator  (Class C, Control + Software)
        # ══════════════════════════════════════════════════════════════════════
        p2 = Project(name="Electrosurgical Generator",
                     description="High-frequency RF generator for surgical cutting and coagulation. IEC 62304 Class C.")
        db.add(p2)
        await db.flush()

        eu = {}
        for rid, title, desc in [
            ("URQ-001", "RF power output accuracy",
             "Delivered RF power shall be within ±10% of set value at all impedance loads 20–2000 Ω"),
            ("URQ-002", "Cut and coagulation mode selection",
             "Surgeon shall select Cut, Blend-1, Blend-2, Soft-Coag, Spray-Coag modes via foot-switch or front panel"),
            ("URQ-003", "Footswitch activation and deactivation",
             "RF output shall activate within 50 ms of footswitch press and deactivate within 20 ms of release"),
            ("URQ-004", "Tissue impedance feedback",
             "Generator shall continuously measure and display tissue impedance; modulate power to prevent charring"),
            ("URQ-005", "Ground pad monitoring",
             "System shall detect return electrode contact quality; alarm and inhibit output if contact < 66%"),
            ("URQ-006", "Patient isolation and leakage current",
             "Patient leakage current shall not exceed 100 µA per IEC 60601-1"),
            ("URQ-007", "LED mode indicators",
             "Front panel LED shall indicate active mode: blue=Cut, green=Coag, yellow=Blend, red=FAULT"),
            ("URQ-008", "Automatic power-off on no-load detect",
             "Output shall cut off within 500 ms if no-load impedance > 5000 Ω for > 2 s"),
            ("URQ-009", "Thermal overload protection",
             "Device shall inhibit RF output and alarm when internal temperature > 75 °C"),
            ("URQ-010", "Activation tone feedback",
             "Audible tone shall confirm RF activation (Cut: continuous; Coag: interrupted 2 Hz)"),
        ]:
            r = req(p2.id, "USER", rid, title, desc)
            db.add(r)
            eu[rid] = r
        await db.flush()

        es = {}
        for rid, title, pkey in [
            ("SYS-001", "RF power control loop", "URQ-001"),
            ("SYS-002", "Mode selection and footswitch interface", "URQ-002"),
            ("SYS-003", "Footswitch debounce and latency", "URQ-003"),
            ("SYS-004", "Tissue impedance measurement subsystem", "URQ-004"),
            ("SYS-005", "Return electrode monitor (REM)", "URQ-005"),
            ("SYS-006", "Isolation transformer and leakage circuit", "URQ-006"),
            ("SYS-007", "LED mode indicator driver", "URQ-007"),
            ("SYS-008", "No-load detection subsystem", "URQ-008"),
            ("SYS-009", "Thermal management subsystem", "URQ-009"),
            ("SYS-010", "Activation tone generator", "URQ-010"),
        ]:
            r = req(p2.id, "SYSTEM", rid, title, None, eu[pkey].id)
            db.add(r)
            es[rid] = r
        await db.flush()

        esw = {}
        for rid, title, desc, skey in [
            ("SWR-001", "RF power PID controller",
             "Discrete PID; measures V & I via ADC at 1 MHz; adjusts gate drive duty cycle; anti-windup clamp",
             "SYS-001"),
            ("SWR-002", "Mode selection FSM",
             "States: STANDBY→READY→ACTIVE→FAULT; mode parameters loaded from const table per selection",
             "SYS-002"),
            ("SWR-003", "Footswitch ISR",
             "Hardware interrupt on GPIO; 5 ms debounce filter; activate/deactivate RF output gate",
             "SYS-003"),
            ("SWR-004", "Impedance calculation module",
             "Compute Z = V_rms / I_rms per 100 µs window; IIR filter; display and feed to power controller",
             "SYS-004"),
            ("SWR-005", "REM contact quality algorithm",
             "Measure dual-pad resistance ratio; raise REM_ALARM if ratio outside 0.8–1.2 band",
             "SYS-005"),
            ("SWR-006", "Leakage current monitor",
             "Sample differential leakage path ADC at 1 kHz; raise LEAKAGE_FAULT if > 80 µA",
             "SYS-006"),
            ("SWR-007", "LED mode indicator controller",
             "Map FSM state+mode to RGB colour code; drive via I2C LED driver IS31FL3193",
             "SYS-007"),
            ("SWR-008", "No-load detection logic",
             "Compare Z > 5000 Ω for rolling 2 s window; assert NO_LOAD_FAULT and cut gate",
             "SYS-008"),
            ("SWR-009", "Thermal fault monitor",
             "Read NTC thermistor ADC; raise THERMAL_FAULT and inhibit output when T > 75 °C; hysteresis 5 °C",
             "SYS-009"),
            ("SWR-010", "Tone generator driver",
             "DAC output 800 Hz sine for Cut; 800 Hz 50% duty for Coag; silence in FAULT",
             "SYS-010"),
            ("SWR-011", "Fault log recorder",
             "Write timestamped fault code to SPI EEPROM ring buffer; retain 1000 entries",
             "SYS-002"),
            ("SWR-012", "Power calibration table",
             "Factory calibration coefficients stored in EEPROM; applied to ADC readings at startup",
             "SYS-001"),
            ("SWR-013", "Self-test routine",
             "On power-on: verify ADC references, LED test pattern, tone test, REM open-circuit check",
             "SYS-002"),
            ("SWR-014", "Watchdog refresh task",
             "RTOS task running every 200 ms; feeds hardware watchdog; logs missed kicks",
             "SYS-002"),
            ("SWR-015", "RF gate interlock logic",
             "Hardware AND of: FSM_ACTIVE, REM_OK, THERMAL_OK, LEAKAGE_OK; any deassertion cuts gate",
             "SYS-006"),
        ]:
            r = req(p2.id, "SOFTWARE", rid, title, desc, es[skey].id)
            db.add(r)
            esw[rid] = r
        await db.flush()

        etc = {}
        for rid, title, desc in [
            ("TC-001", "PID power accuracy – 50 Ω load",
             "Set 80 W; measure RF power at 50 Ω dummy load; verify within ±8 W"),
            ("TC-002", "PID power accuracy – 200 Ω load",
             "Set 80 W; measure at 200 Ω; verify ±10% over 10 s"),
            ("TC-003", "Mode selection latency",
             "Toggle Cut→Coag via front panel; measure mode parameter load time < 10 ms"),
            ("TC-004", "Footswitch activation latency",
             "Logic analyser on footswitch GPIO and RF gate; verify activate ≤ 50 ms"),
            ("TC-005", "Footswitch deactivation latency",
             "Logic analyser; verify deactivate ≤ 20 ms after release"),
            ("TC-006", "REM alarm – low contact",
             "Set pad resistance ratio to 0.5; verify REM_ALARM within 500 ms"),
            ("TC-007", "Leakage current – IEC 60601-1",
             "Isolation tester; verify patient leakage < 100 µA at 264 V mains"),
            ("TC-008", "LED mode indicator – all modes",
             "Cycle all 5 modes; verify correct colour for each state"),
            ("TC-009", "LED FAULT state – red",
             "Trigger REM_ALARM; verify LED turns solid red and RF gate inhibited"),
            ("TC-010", "No-load auto cutoff",
             "Open circuit on output; verify gate cut within 500 ms after 2 s window"),
            ("TC-011", "Thermal fault inhibit",
             "Inject T > 75 °C via NTC resistor sim; verify output inhibit and alarm"),
            ("TC-012", "Self-test on power-on",
             "Power cycle; verify self-test passes in < 3 s and device enters READY state"),
            ("TC-013", "Watchdog reset on hang",
             "Suspend watchdog task; verify MCU reset within 400 ms"),
            ("TC-014", "Activation tone – Cut mode",
             "Spectrum analyser; verify 800 Hz continuous during Cut activation"),
            ("TC-015", "Activation tone – Coag mode",
             "Verify 800 Hz 50% duty cycle interruption during Coag activation"),
        ]:
            t = tc(p2.id, rid, title, desc)
            db.add(t)
            etc[rid] = t
        await db.flush()

        for sw_k, tc_k in [
            ("SWR-001","TC-001"),("SWR-001","TC-002"),("SWR-002","TC-003"),
            ("SWR-003","TC-004"),("SWR-003","TC-005"),("SWR-005","TC-006"),
            ("SWR-006","TC-007"),("SWR-007","TC-008"),("SWR-007","TC-009"),
            ("SWR-008","TC-010"),("SWR-009","TC-011"),("SWR-013","TC-012"),
            ("SWR-014","TC-013"),("SWR-010","TC-014"),("SWR-010","TC-015"),
        ]:
            db.add(TraceLink(requirement_id=esw[sw_k].id, testcase_id=etc[tc_k].id))
        await db.flush()

        db.add_all([
            risk(esw["SWR-001"].id, "PID integral windup",
                 "Power runaway at high-impedance transition", "Patient burn", 5, 2),
            risk(esw["SWR-003"].id, "Footswitch ISR missed",
                 "RF stays active after surgeon releases pedal", "Unintended tissue damage", 5, 3),
            risk(esw["SWR-005"].id, "REM algorithm false-negative",
                 "Inadequate pad contact not detected", "Return electrode burn", 5, 2),
            risk(esw["SWR-006"].id, "Leakage monitor ADC offset drift",
                 "Leakage > 100 µA not detected", "Microshock risk", 5, 2),
            risk(esw["SWR-008"].id, "No-load timer reset by noise",
                 "Sustained no-load output burns tissue", "Unintended burn", 4, 2),
            risk(esw["SWR-009"].id, "Thermal NTC open circuit",
                 "Overtemperature not detected", "Device damage or fire", 4, 2),
            risk(esw["SWR-015"].id, "Interlock logic gate glitch",
                 "Gate enabled briefly during fault condition", "Unintended RF delivery", 5, 1),
            risk(esw["SWR-002"].id, "Mode table corruption in EEPROM",
                 "Wrong power parameters applied for selected mode", "Under/over-power delivery", 4, 2),
        ])
        await db.flush()

        ea1 = arch(p2.id, "ARC-001", "RF Power Stage", "H-bridge driver, gate signal path, output transformer")
        ea2 = arch(p2.id, "ARC-002", "Sensing & Measurement", "V/I ADC, impedance calculator, leakage monitor, NTC")
        ea3 = arch(p2.id, "ARC-003", "Control & Safety Logic", "PID, FSM, interlock AND gate, watchdog")
        ea4 = arch(p2.id, "ARC-004", "User Interface & Indicators", "LED driver, tone DAC, front-panel input MCU")
        db.add_all([ea1, ea2, ea3, ea4])
        await db.flush()

        ed_list = [
            det(p2.id, "DET-001", ea3.id, "RF Power PID Controller", "Discrete PID with anti-windup; 1 MHz update rate"),
            det(p2.id, "DET-002", ea3.id, "Mode Selection FSM", "STANDBY/READY/ACTIVE/FAULT transitions"),
            det(p2.id, "DET-003", ea3.id, "RF Gate Interlock", "Hardware AND: FSM + REM + Thermal + Leakage"),
            det(p2.id, "DET-004", ea2.id, "Impedance Calculator", "100 µs V_rms/I_rms, IIR filtered"),
            det(p2.id, "DET-005", ea2.id, "REM Contact Monitor", "Dual-pad ratio algorithm"),
            det(p2.id, "DET-006", ea2.id, "Leakage Current Monitor", "1 kHz sampling, 80 µA threshold"),
            det(p2.id, "DET-007", ea4.id, "LED Mode Controller", "IS31FL3193 I2C driver, colour palette"),
            det(p2.id, "DET-008", ea4.id, "Tone Generator", "DAC 800 Hz, Cut/Coag patterns"),
        ]
        edet = {}
        for d in ed_list:
            db.add(d)
        await db.flush()
        ed_list_objs = ed_list  # reference by index below

        for sw_k, d_obj in [
            ("SWR-001", ed_list[0]), ("SWR-002", ed_list[1]), ("SWR-015", ed_list[2]),
            ("SWR-004", ed_list[3]), ("SWR-005", ed_list[4]), ("SWR-006", ed_list[5]),
            ("SWR-007", ed_list[6]), ("SWR-010", ed_list[7]),
        ]:
            db.add(RequirementDesignLink(requirement_id=esw[sw_k].id, design_element_id=d_obj.id))
        await db.flush()

        for tc_k, status, notes in [
            ("TC-001", ExecutionStatus.PASS, "Mean power 79.4 W; max deviation 7.6% — within ±10%"),
            ("TC-002", ExecutionStatus.PASS, "Mean power 78.8 W at 200 Ω over 10 s"),
            ("TC-003", ExecutionStatus.PASS, "Parameter load time 4 ms — well within 10 ms"),
            ("TC-004", ExecutionStatus.PASS, "Activation latency 38 ms — within 50 ms spec"),
            ("TC-005", ExecutionStatus.PASS, "Deactivation latency 14 ms — within 20 ms spec"),
            ("TC-006", ExecutionStatus.PASS, "REM_ALARM raised at 340 ms"),
            ("TC-007", ExecutionStatus.PASS, "Patient leakage measured 62 µA — within 100 µA limit"),
            ("TC-008", ExecutionStatus.PASS, "All 5 mode colours matched specification"),
            ("TC-009", ExecutionStatus.PASS, "LED went solid red within 200 ms of fault injection"),
            ("TC-010", ExecutionStatus.PASS, "Gate cut at 2.48 s after open-circuit condition"),
            ("TC-011", ExecutionStatus.PASS, "Output inhibited 80 ms after NTC sim reached 75 °C"),
            ("TC-012", ExecutionStatus.PASS, "Self-test passed in 1.8 s; READY state achieved"),
            ("TC-013", ExecutionStatus.PASS, "MCU reset at 380 ms after watchdog task suspended"),
            ("TC-014", ExecutionStatus.PASS, "800 Hz ± 2 Hz confirmed by spectrum analyser"),
            ("TC-015", ExecutionStatus.FAIL, "Interruption gap measured 480 ms instead of 500 ms — needs DAC timing fix"),
        ]:
            db.add(exe(etc[tc_k].id, status, notes))
        await db.flush()

        db.add_all([
            val(p2.id, eu["URQ-001"].id,
                "Surgeon usability study: 8 procedures, power accuracy verified gravimetrically. "
                "All deliveries within ±9.2%.", ValidationStatus.PASSED),
            val(p2.id, eu["URQ-005"].id,
                "REM bench validation: 20 electrode attachment scenarios. "
                "System correctly alarmed for all 6 low-contact cases.", ValidationStatus.PASSED),
            val(p2.id, eu["URQ-003"].id,
                "Footswitch latency validation across 200 activations. All within spec.",
                ValidationStatus.PASSED),
            val(p2.id, eu["URQ-006"].id,
                "IEC 60601-1 electrical safety validation pending independent test lab.",
                ValidationStatus.PLANNED),
        ])
        await db.flush()

        ecr1 = ChangeRequest(project_id=p2.id,
                             title="CR-001 Add vessel-sealing mode",
                             description="New mode with controlled energy delivery for vessel sealing applications",
                             status=ChangeRequestState.OPEN)
        ecr2 = ChangeRequest(project_id=p2.id,
                             title="CR-002 Increase impedance display resolution",
                             description="Display impedance to 1 Ω resolution instead of current 10 Ω",
                             status=ChangeRequestState.APPROVED)
        db.add_all([ecr1, ecr2])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=ecr2.id, impacted_requirement_id=esw["SWR-004"].id,
                         impact_description="SWR-004 display format changes; IIR filter bandwidth review needed"),
        ])
        await db.flush()

        er1 = Release(project_id=p2.id, version="v1.0.0", status=ReleaseStatus.RELEASED)
        er2 = Release(project_id=p2.id, version="v1.1.0", status=ReleaseStatus.DRAFT)
        db.add_all([er1, er2])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006","SWR-007"]:
            db.add(ReleaseItem(release_id=er1.id, requirement_id=esw[swk].id))
        for swk in ["SWR-008","SWR-009","SWR-010","SWR-011","SWR-015"]:
            db.add(ReleaseItem(release_id=er2.id, requirement_id=esw[swk].id))
        await db.flush()

        print(f"✓ P2 Electrosurgical Generator — 10 USER | 10 SYS | 15 SW | 15 TC | 8 risks")

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 3 — Smart Drug Infusion Pump v2 (Class C, Alarms + LED + Control)
        # ══════════════════════════════════════════════════════════════════════
        p3 = Project(name="Smart Drug Infusion Pump v2",
                     description="Ambulatory syringe + volumetric pump with drug library and dose-error reduction. IEC 62304 Class C.")
        db.add(p3)
        await db.flush()

        iu = {}
        for rid, title, desc in [
            ("URQ-001", "Drug library dose safety limits",
             "System shall enforce min/max dose rate from onboard drug library for 500+ drugs; refuse out-of-range programming"),
            ("URQ-002", "Occlusion detection and alarm",
             "System shall detect upstream and downstream occlusion and alarm within 30 seconds"),
            ("URQ-003", "Air-in-line detection",
             "System shall detect air bolus > 50 µL and halt infusion; LED flashes amber"),
            ("URQ-004", "Near-end-of-infusion warning",
             "System shall alert 15 minutes before VTBI completion; LED pulses yellow"),
            ("URQ-005", "Battery status LED",
             "4-segment LED bar shall indicate battery charge: green>75%, yellow 25–75%, red<25%, flashing red<10%"),
            ("URQ-006", "Secondary piggyback infusion",
             "System shall manage primary/piggyback switchover; notify on piggyback completion"),
            ("URQ-007", "Dose rate change confirmation",
             "Any dose rate change > 20% shall require nurse PIN confirmation"),
            ("URQ-008", "Infusion history log",
             "System shall record all infusion events in tamper-evident log for 30 days"),
            ("URQ-009", "Wireless communication to PDMS",
             "Device shall transmit infusion data to Patient Data Management System via Bluetooth LE 5.0"),
            ("URQ-010", "Free-flow prevention",
             "Anti-free-flow valve shall engage within 100 ms of door open; LED indicator confirms state"),
        ]:
            r = req(p3.id, "USER", rid, title, desc)
            db.add(r)
            iu[rid] = r
        await db.flush()

        is_ = {}
        for rid, title, pkey in [
            ("SYS-001", "Drug library service and VTBI engine", "URQ-001"),
            ("SYS-002", "Occlusion pressure monitor", "URQ-002"),
            ("SYS-003", "Air-in-line sensor subsystem", "URQ-003"),
            ("SYS-004", "VTBI countdown and NEI timer", "URQ-004"),
            ("SYS-005", "Battery management and LED driver", "URQ-005"),
            ("SYS-006", "Piggyback scheduler", "URQ-006"),
            ("SYS-007", "PIN authentication service", "URQ-007"),
            ("SYS-008", "Tamper-evident event log", "URQ-008"),
            ("SYS-009", "Bluetooth LE PDMS gateway", "URQ-009"),
            ("SYS-010", "Free-flow valve controller", "URQ-010"),
        ]:
            r = req(p3.id, "SYSTEM", rid, title, None, iu[pkey].id)
            db.add(r)
            is_[rid] = r
        await db.flush()

        isw = {}
        for rid, title, desc, skey in [
            ("SWR-001", "Drug library lookup engine",
             "Binary search of 512-entry drug table; return dose limits; flag 'soft' vs 'hard' limits",
             "SYS-001"),
            ("SWR-002", "VTBI calculator",
             "Compute remaining volume; raise NEI alert 15 min before zero; update BLE characteristic",
             "SYS-004"),
            ("SWR-003", "Motor drive PID controller",
             "Stepper motor velocity PID; encoder feedback; stall detection; units: µL/min",
             "SYS-001"),
            ("SWR-004", "Occlusion pressure FSM",
             "States: NORMAL→RISING→OCCLUSION_ALARM; threshold configurable per drug; alarm relay",
             "SYS-002"),
            ("SWR-005", "Air-in-line classifier",
             "Ultrasonic ADC samples; FFT-based bubble classification; halt motor on > 50 µL",
             "SYS-003"),
            ("SWR-006", "Battery SoC estimator",
             "Coulomb counter + OCV correction; map SoC% to 4-segment LED bar pattern",
             "SYS-005"),
            ("SWR-007", "LED animation controller",
             "Drive 8-LED RGB bar via SPI; patterns: solid, pulse, blink, chase; state-mapped priority",
             "SYS-005"),
            ("SWR-008", "Piggyback scheduler FSM",
             "States: PRIMARY→PIGGYBACK_ACTIVE→PIGGYBACK_COMPLETE→PRIMARY_RESUME; alarm on timeout",
             "SYS-006"),
            ("SWR-009", "PIN authentication module",
             "PBKDF2-HMAC-SHA256 PIN hash; lockout after 3 failures; audit log entry per attempt",
             "SYS-007"),
            ("SWR-010", "Tamper-evident log writer",
             "HMAC-SHA256 chain over log entries; detect any deletion or modification",
             "SYS-008"),
            ("SWR-011", "BLE GATT server",
             "Expose infusion status, VTBI, drug name, alarm state as GATT characteristics; notify on change",
             "SYS-009"),
            ("SWR-012", "Free-flow valve ISR",
             "Door switch GPIO interrupt; assert valve solenoid within 100 ms; update LED D4",
             "SYS-010"),
            ("SWR-013", "Alarm priority arbitrator",
             "Priority queue: OCCLUSION > AIR-IN-LINE > BATTERY_CRITICAL > NEI > ADVISORY; manage LED and buzzer",
             "SYS-002"),
            ("SWR-014", "Dose-change PIN gate",
             "Intercept setpoint writes > 20% delta; suspend until PIN verified; timeout 30 s",
             "SYS-007"),
            ("SWR-015", "Self-test on power-on",
             "Verify drug library CRC, motor encoder home, valve solenoid continuity, LED test pattern",
             "SYS-001"),
        ]:
            r = req(p3.id, "SOFTWARE", rid, title, desc, is_[skey].id)
            db.add(r)
            isw[rid] = r
        await db.flush()

        itc = {}
        for rid, title, desc in [
            ("TC-001", "Drug library hard-limit rejection",
             "Program morphine at 200% of max dose; verify hard-limit rejection and alarm"),
            ("TC-002", "Drug library soft-limit warning",
             "Program at 110% of soft limit; verify advisory warning displayed"),
            ("TC-003", "VTBI NEI alert timing",
             "Set VTBI=150 mL at 10 mL/h; verify NEI alert at exactly 15 min remaining"),
            ("TC-004", "Upstream occlusion alarm",
             "Clamp upstream line; verify OCCLUSION_ALARM within 30 s at 5 mL/h"),
            ("TC-005", "Air-in-line halt – 50 µL bubble",
             "Inject calibrated 50 µL air bolus; verify motor halts and LED flashes amber"),
            ("TC-006", "Air-in-line – 30 µL no halt",
             "Inject 30 µL bubble; verify infusion continues (below threshold)"),
            ("TC-007", "Battery LED – 4 states",
             "Discharge to 80%, 50%, 20%, 8%; verify LED segment count and colour at each"),
            ("TC-008", "Battery LED – flashing red < 10%",
             "Discharge to 9%; verify red blink at 1 Hz"),
            ("TC-009", "Piggyback switchover",
             "Configure piggyback; verify primary pauses, piggyback runs, primary resumes on completion"),
            ("TC-010", "PIN gate – dose change > 20%",
             "Increase rate by 25% without PIN; verify pump holds and prompts for PIN"),
            ("TC-011", "PIN gate lockout after 3 failures",
             "Enter wrong PIN 3 times; verify lockout and audit log entries"),
            ("TC-012", "Tamper-evident log integrity check",
             "Write 100 entries; manually alter entry 50; verify HMAC chain break detected"),
            ("TC-013", "BLE GATT notify on alarm",
             "Trigger NEI alarm; verify GATT notification sent to connected PDMS within 2 s"),
            ("TC-014", "Free-flow valve activation latency",
             "Open pump door; logic analyser; verify solenoid asserted within 100 ms"),
            ("TC-015", "Motor stall detection",
             "Mechanically stall syringe plunger; verify stall detected and OCCLUSION path taken"),
        ]:
            t = tc(p3.id, rid, title, desc)
            db.add(t)
            itc[rid] = t
        await db.flush()

        for sw_k, tc_k in [
            ("SWR-001","TC-001"),("SWR-001","TC-002"),("SWR-002","TC-003"),
            ("SWR-004","TC-004"),("SWR-005","TC-005"),("SWR-005","TC-006"),
            ("SWR-006","TC-007"),("SWR-006","TC-008"),("SWR-008","TC-009"),
            ("SWR-014","TC-010"),("SWR-009","TC-011"),("SWR-010","TC-012"),
            ("SWR-011","TC-013"),("SWR-012","TC-014"),("SWR-003","TC-015"),
        ]:
            db.add(TraceLink(requirement_id=isw[sw_k].id, testcase_id=itc[tc_k].id))
        await db.flush()

        db.add_all([
            risk(isw["SWR-001"].id, "Drug library CRC failure undetected",
                 "Corrupt dose limits applied without warning", "Overdose or underdose", 5, 2),
            risk(isw["SWR-003"].id, "Motor encoder slip",
                 "Delivered volume deviates from programmed VTBI", "Dosing error", 4, 3),
            risk(isw["SWR-004"].id, "Occlusion threshold not adjusted for viscous drug",
                 "High-viscosity occlusion missed", "Drug extravasation", 4, 3),
            risk(isw["SWR-005"].id, "Air classifier false negative",
                 "Air bolus > 50 µL not detected", "Air embolism", 5, 2),
            risk(isw["SWR-012"].id, "Free-flow valve ISR latency > 100 ms",
                 "Brief free-flow before valve closes", "Uncontrolled drug bolus", 5, 2),
            risk(isw["SWR-013"].id, "Alarm priority inversion",
                 "Low-priority alarm masks OCCLUSION alarm", "Delayed clinical response", 4, 3),
            risk(isw["SWR-009"].id, "PIN bypass via config port",
                 "Service mode allows dose change without PIN", "Unauthorised dose modification", 3, 2),
            risk(isw["SWR-006"].id, "SoC estimator drift at low temp",
                 "Battery depletes faster than indicated", "Unexpected therapy interruption", 3, 3),
        ])
        await db.flush()

        ia1 = arch(p3.id, "ARC-001", "Drug Delivery Control", "Motor PID, VTBI engine, drug library service")
        ia2 = arch(p3.id, "ARC-002", "Sensing & Safety Interlocks", "Pressure FSM, AIE classifier, free-flow valve")
        ia3 = arch(p3.id, "ARC-003", "LED & Alarm Output", "LED bar driver, alarm arbitrator, buzzer")
        ia4 = arch(p3.id, "ARC-004", "Security & Logging", "PIN auth, tamper-evident log, BLE gateway")
        db.add_all([ia1, ia2, ia3, ia4])
        await db.flush()

        for sw_k, d_obj in [
            ("SWR-003", det(p3.id, "DET-001", ia1.id, "Motor Drive PID", "Velocity PID, encoder feedback, stall detect")),
            ("SWR-001", det(p3.id, "DET-002", ia1.id, "Drug Library Lookup", "512-entry binary search, hard/soft limits")),
            ("SWR-004", det(p3.id, "DET-003", ia2.id, "Occlusion Pressure FSM", "Configurable threshold, alarm relay")),
            ("SWR-005", det(p3.id, "DET-004", ia2.id, "AIE Bubble Classifier", "FFT-based, 50 µL threshold")),
            ("SWR-012", det(p3.id, "DET-005", ia2.id, "Free-flow Valve ISR", "GPIO ISR, 100 ms solenoid assert")),
            ("SWR-007", det(p3.id, "DET-006", ia3.id, "LED Animation Controller", "8-LED SPI, priority-mapped patterns")),
            ("SWR-013", det(p3.id, "DET-007", ia3.id, "Alarm Priority Arbitrator", "Priority queue, buzzer + LED routing")),
            ("SWR-010", det(p3.id, "DET-008", ia4.id, "Tamper-Evident Log", "HMAC-SHA256 chain")),
        ]:
            db.add(d_obj)
            await db.flush()
            db.add(RequirementDesignLink(requirement_id=isw[sw_k].id, design_element_id=d_obj.id))
        await db.flush()

        for tc_k, status, notes in [
            ("TC-001", ExecutionStatus.PASS, "Hard-limit rejection confirmed; alarm raised immediately"),
            ("TC-002", ExecutionStatus.PASS, "Soft-limit advisory displayed correctly"),
            ("TC-003", ExecutionStatus.PASS, "NEI alert fired at 14 min 58 s — within tolerance"),
            ("TC-004", ExecutionStatus.PASS, "OCCLUSION_ALARM at 22 s — within 30 s spec"),
            ("TC-005", ExecutionStatus.PASS, "Motor halted within 200 ms; amber LED blink confirmed"),
            ("TC-006", ExecutionStatus.PASS, "Infusion continued; no alarm for 30 µL bubble"),
            ("TC-007", ExecutionStatus.PASS, "All 4 LED states matched expected segment/colour"),
            ("TC-008", ExecutionStatus.PASS, "Red 1 Hz blink confirmed at 9% SoC"),
            ("TC-009", ExecutionStatus.PASS, "Piggyback switchover sequence completed correctly"),
            ("TC-010", ExecutionStatus.PASS, "Pump held; PIN prompt displayed within 1 s"),
            ("TC-011", ExecutionStatus.PASS, "Lockout after 3rd failure; 3 audit entries logged"),
            ("TC-012", ExecutionStatus.PASS, "HMAC chain break detected at entry 50"),
            ("TC-013", ExecutionStatus.FAIL, "GATT notification delayed 3.8 s — BLE stack congestion; under investigation"),
            ("TC-014", ExecutionStatus.PASS, "Solenoid asserted at 78 ms — within 100 ms spec"),
            ("TC-015", ExecutionStatus.PASS, "Stall detected in 4 encoder ticks; OCCLUSION path taken"),
        ]:
            db.add(exe(itc[tc_k].id, status, notes))
        await db.flush()

        db.add_all([
            val(p3.id, iu["URQ-001"].id,
                "Drug library clinical validation: pharmacist reviewed 50 drugs for limit accuracy. "
                "All hard limits matched formulary. Soft limits adjusted for 3 drugs.",
                ValidationStatus.PASSED),
            val(p3.id, iu["URQ-002"].id,
                "Occlusion simulation with 5 drug viscosities; all detected within 25 s.",
                ValidationStatus.PASSED),
            val(p3.id, iu["URQ-003"].id,
                "Air-in-line validation with calibrated bubble generator at 50 µL threshold. "
                "10/10 boluses detected; 0/10 false positives at 30 µL.",
                ValidationStatus.PASSED),
            val(p3.id, iu["URQ-005"].id,
                "Battery LED usability study: 10 nurses correctly identified battery state 100% of the time.",
                ValidationStatus.PASSED),
            val(p3.id, iu["URQ-010"].id,
                "Free-flow prevention validation: 20 door-open events; no free-flow observed.",
                ValidationStatus.PLANNED),
        ])
        await db.flush()

        icr1 = ChangeRequest(project_id=p3.id,
                             title="CR-001 Add 'keep-vein-open' mode",
                             description="KVO mode delivers 1 mL/h after VTBI complete to maintain IV access",
                             status=ChangeRequestState.OPEN)
        icr2 = ChangeRequest(project_id=p3.id,
                             title="CR-002 Expand drug library to 1000 entries",
                             description="Hospital formulary has grown; library must expand from 512 to 1000 drugs",
                             status=ChangeRequestState.APPROVED)
        icr3 = ChangeRequest(project_id=p3.id,
                             title="CR-003 Reduce AIE threshold to 30 µL",
                             description="Safety committee recommends lower threshold based on adverse event review",
                             status=ChangeRequestState.IMPACT_ANALYSIS)
        db.add_all([icr1, icr2, icr3])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=icr2.id, impacted_requirement_id=isw["SWR-001"].id,
                         impact_description="SWR-001 lookup table size doubles; SRAM impact analysis required"),
            ChangeImpact(change_request_id=icr3.id, impacted_requirement_id=isw["SWR-005"].id,
                         impact_description="SWR-005 threshold constant and TC-006 pass criteria must change"),
            ChangeImpact(change_request_id=icr3.id, impacted_testcase_id=itc["TC-006"].id,
                         impact_description="TC-006 must now verify halt at 30 µL"),
        ])
        await db.flush()

        ir1 = Release(project_id=p3.id, version="v3.0.0", status=ReleaseStatus.RELEASED)
        ir2 = Release(project_id=p3.id, version="v3.1.0", status=ReleaseStatus.UNDER_REVIEW)
        db.add_all([ir1, ir2])
        await db.flush()

        for swk in ["SWR-001","SWR-003","SWR-004","SWR-005","SWR-006","SWR-007","SWR-012"]:
            db.add(ReleaseItem(release_id=ir1.id, requirement_id=isw[swk].id))
        for swk in ["SWR-008","SWR-009","SWR-010","SWR-011","SWR-013","SWR-014"]:
            db.add(ReleaseItem(release_id=ir2.id, requirement_id=isw[swk].id))
        await db.flush()

        print(f"✓ P3 Smart Drug Infusion Pump v2 — 10 USER | 10 SYS | 15 SW | 15 TC | 8 risks")

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 4 — Hemodialysis Machine  (Class C, Control + UI + Alarms)
        # ══════════════════════════════════════════════════════════════════════
        p4 = Project(name="Hemodialysis Machine Control System",
                     description="Software for single-needle and dual-needle hemodialysis. IEC 62304 Class C, ISO 23500.")
        db.add(p4)
        await db.flush()

        hu = {}
        for rid, title, desc in [
            ("URQ-001", "Blood flow rate control",
             "Blood pump shall deliver set flow rate 50–600 mL/min within ±5%; operator adjustable"),
            ("URQ-002", "Dialysate conductivity monitoring",
             "System shall monitor dialysate conductivity 12–16 mS/cm; alarm outside ±0.3 mS/cm of setpoint"),
            ("URQ-003", "Transmembrane pressure control",
             "TMP shall be maintained within ±25 mmHg of target; alarm if > 350 mmHg"),
            ("URQ-004", "Dialysate temperature monitoring",
             "Dialysate temperature shall be maintained 35–39 °C; alarm outside ±0.5 °C"),
            ("URQ-005", "Air detector and clamp",
             "Venous air detector shall detect > 0.2 mL air and clamp venous line within 500 ms"),
            ("URQ-006", "Blood leak detection",
             "System shall detect blood leak into dialysate by optical sensor; alarm and halt"),
            ("URQ-007", "Treatment session timer",
             "Session timer counts down from set duration; alerts at 15 min and 5 min remaining"),
            ("URQ-008", "Touchscreen treatment configuration",
             "Operator configures all treatment parameters on 12\" touchscreen before session start"),
            ("URQ-009", "Alarm log and export",
             "All alarms stored with timestamp and operator response; export to USB as CSV"),
            ("URQ-010", "UF rate and goal programming",
             "Operator sets ultrafiltration goal (mL) and rate (mL/h); system profiles UF over session"),
        ]:
            r = req(p4.id, "USER", rid, title, desc)
            db.add(r)
            hu[rid] = r
        await db.flush()

        hs = {}
        for rid, title, pkey in [
            ("SYS-001", "Blood pump drive and flow measurement", "URQ-001"),
            ("SYS-002", "Conductivity measurement subsystem", "URQ-002"),
            ("SYS-003", "Transmembrane pressure measurement", "URQ-003"),
            ("SYS-004", "Dialysate thermal management", "URQ-004"),
            ("SYS-005", "Venous air detector and clamp", "URQ-005"),
            ("SYS-006", "Blood leak optical sensor", "URQ-006"),
            ("SYS-007", "Session timer and alert service", "URQ-007"),
            ("SYS-008", "Treatment configuration UI", "URQ-008"),
            ("SYS-009", "Alarm log service", "URQ-009"),
            ("SYS-010", "Ultrafiltration control subsystem", "URQ-010"),
        ]:
            r = req(p4.id, "SYSTEM", rid, title, None, hu[pkey].id)
            db.add(r)
            hs[rid] = r
        await db.flush()

        hsw = {}
        for rid, title, desc, skey in [
            ("SWR-001", "Blood pump PID controller",
             "Rotary encoder feedback; PI controller; anti-windup; flow rate in mL/min; update rate 50 Hz",
             "SYS-001"),
            ("SWR-002", "Conductivity alarm evaluator",
             "3-reading moving average; raise CONDUCTIVITY_ALARM if outside band; inhibit dialysate pump",
             "SYS-002"),
            ("SWR-003", "TMP calculation and alarm",
             "TMP = (Pv + Pa)/2 − Pd; compare to setpoint; raise TMP_ALARM if > 350 mmHg",
             "SYS-003"),
            ("SWR-004", "Thermal PID controller",
             "Heater PWM PID; RTD sensor feedback; 35–39 °C range enforcement; overshoot protection",
             "SYS-004"),
            ("SWR-005", "Air detector FSM and clamp driver",
             "States: MONITORING→AIR_DETECTED→CLAMPED; ultrasonic sensor; solenoid clamp within 500 ms",
             "SYS-005"),
            ("SWR-006", "Blood leak detection algorithm",
             "OD sensor at 640 nm; baseline calibration; raise BLOOD_LEAK_ALARM if delta > threshold",
             "SYS-006"),
            ("SWR-007", "Session countdown timer",
             "Countdown from set duration; fire SESSION_15MIN and SESSION_5MIN events; SESSION_END halt",
             "SYS-007"),
            ("SWR-008", "Treatment configuration validation",
             "Validate all parameters against clinical safety limits before allowing session start",
             "SYS-008"),
            ("SWR-009", "Alarm log writer",
             "Append alarm record (code, timestamp, operator_id, ack_time) to SQLite DB on eMMC",
             "SYS-009"),
            ("SWR-010", "CSV export module",
             "Query alarm log; serialise to RFC 4180 CSV; write to USB mass storage on mount",
             "SYS-009"),
            ("SWR-011", "UF rate profiler",
             "Divide UF goal into session time; compute mL/h target per 15-min interval; drive UF pump PID",
             "SYS-010"),
            ("SWR-012", "UF pump PID controller",
             "Gravimetric feedback via load cell; PID drives peristaltic UF pump; ±2% accuracy",
             "SYS-010"),
            ("SWR-013", "Touchscreen parameter input validator",
             "Range-check each field on entry; display inline error; prevent out-of-range confirmation",
             "SYS-008"),
            ("SWR-014", "Alarm priority display manager",
             "Maintain sorted alarm banner; highlight highest priority; require sequential acknowledgement",
             "SYS-009"),
            ("SWR-015", "Safety interlock controller",
             "Hardware AND: conductivity_ok, TMP_ok, temp_ok, bloodleak_ok; any false inhibits blood pump",
             "SYS-001"),
        ]:
            r = req(p4.id, "SOFTWARE", rid, title, desc, hs[skey].id)
            db.add(r)
            hsw[rid] = r
        await db.flush()

        htc = {}
        for rid, title, desc in [
            ("TC-001", "Blood pump flow accuracy – 50 mL/min",
             "Gravimetric measurement; verify ±5% over 5 min"),
            ("TC-002", "Blood pump flow accuracy – 400 mL/min",
             "Gravimetric measurement at high flow; verify ±5%"),
            ("TC-003", "Conductivity alarm – high conductivity",
             "Inject 16.5 mS/cm solution; verify alarm within 10 s"),
            ("TC-004", "Conductivity alarm – low conductivity",
             "Inject 11.5 mS/cm solution; verify alarm and dialysate pump inhibit"),
            ("TC-005", "TMP alarm – 360 mmHg",
             "Simulate TMP > 350 mmHg; verify TMP_ALARM and blood pump halt"),
            ("TC-006", "Thermal control – setpoint tracking",
             "Set 37 °C; measure temperature over 30 min; verify within ±0.5 °C"),
            ("TC-007", "Air detector clamp latency",
             "Inject 0.3 mL air bolus; verify clamp asserted within 500 ms"),
            ("TC-008", "Air detector – 0.1 mL no clamp",
             "Inject 0.1 mL air; verify no clamp (below threshold)"),
            ("TC-009", "Blood leak alarm",
             "Add 0.5% haemoglobin solution to dialysate path; verify BLOOD_LEAK_ALARM"),
            ("TC-010", "Session 15-min alert",
             "Set 60-min session; advance timer to 14 min remaining; verify alert fires"),
            ("TC-011", "UF rate accuracy – 500 mL goal",
             "Set 500 mL UF goal over 4 h; measure actual UF by weight; verify within ±2%"),
            ("TC-012", "Parameter validation – out-of-range rejection",
             "Enter blood flow 650 mL/min; verify inline error and session start blocked"),
            ("TC-013", "Alarm log export to USB",
             "Generate 50 alarm events; insert USB; verify CSV written with all 50 records"),
            ("TC-014", "Safety interlock – conductivity fault",
             "Trigger conductivity fault; verify blood pump inhibited within 500 ms"),
            ("TC-015", "Safety interlock – temperature fault",
             "Trigger temperature fault; verify blood pump inhibited and alarm displayed"),
        ]:
            t = tc(p4.id, rid, title, desc)
            db.add(t)
            htc[rid] = t
        await db.flush()

        for sw_k, tc_k in [
            ("SWR-001","TC-001"),("SWR-001","TC-002"),("SWR-002","TC-003"),
            ("SWR-002","TC-004"),("SWR-003","TC-005"),("SWR-004","TC-006"),
            ("SWR-005","TC-007"),("SWR-005","TC-008"),("SWR-006","TC-009"),
            ("SWR-007","TC-010"),("SWR-012","TC-011"),("SWR-013","TC-012"),
            ("SWR-010","TC-013"),("SWR-015","TC-014"),("SWR-015","TC-015"),
        ]:
            db.add(TraceLink(requirement_id=hsw[sw_k].id, testcase_id=htc[tc_k].id))
        await db.flush()

        db.add_all([
            risk(hsw["SWR-001"].id, "Blood pump PID overshoot",
                 "Flow rate exceeds set value by > 5%", "Haemolysis or volume imbalance", 4, 2),
            risk(hsw["SWR-005"].id, "Air clamp latency > 500 ms",
                 "Air bolus enters patient before clamping", "Venous air embolism", 5, 2),
            risk(hsw["SWR-002"].id, "Conductivity moving average masks spike",
                 "Conductivity alarm delayed by 3-sample filter", "Electrolyte imbalance", 4, 3),
            risk(hsw["SWR-004"].id, "Thermal PID wind-up on heater failure",
                 "Dialysate overheated before alarm", "Patient thermal injury", 5, 2),
            risk(hsw["SWR-006"].id, "Blood leak OD sensor fouled",
                 "Blood leak not detected", "Undetected dialysate contamination", 4, 2),
            risk(hsw["SWR-012"].id, "Load cell drift over session",
                 "UF delivered differs from goal", "Fluid overload or dehydration", 4, 3),
            risk(hsw["SWR-015"].id, "Interlock not asserted on sensor power loss",
                 "Blood pump runs with invalid sensor data", "Undetected treatment error", 5, 2),
            risk(hsw["SWR-011"].id, "UF profiler divide-by-zero on zero session time",
                 "UF pump runs at maximum rate", "Rapid dehydration", 5, 1),
        ])
        await db.flush()

        ha1 = arch(p4.id, "ARC-001", "Blood Circuit Control", "Blood pump PID, safety interlock, TMP monitor")
        ha2 = arch(p4.id, "ARC-002", "Dialysate Preparation", "Conductivity monitor, thermal PID, UF control")
        ha3 = arch(p4.id, "ARC-003", "Safety Sensors", "Air detector, blood leak sensor, pressure transducers")
        ha4 = arch(p4.id, "ARC-004", "UI & Data Management", "Touchscreen config, alarm log, CSV export")
        db.add_all([ha1, ha2, ha3, ha4])
        await db.flush()

        for sw_k, d_obj in [
            ("SWR-001", det(p4.id, "DET-001", ha1.id, "Blood Pump PID", "PI control, encoder feedback, 50 Hz")),
            ("SWR-015", det(p4.id, "DET-002", ha1.id, "Safety Interlock Controller", "Hardware AND, all-sensor health")),
            ("SWR-002", det(p4.id, "DET-003", ha2.id, "Conductivity Alarm Evaluator", "3-sample MA, inhibit relay")),
            ("SWR-004", det(p4.id, "DET-004", ha2.id, "Thermal PID Controller", "RTD feedback, PWM heater")),
            ("SWR-012", det(p4.id, "DET-005", ha2.id, "UF Pump PID with Load Cell", "Gravimetric feedback, ±2%")),
            ("SWR-005", det(p4.id, "DET-006", ha3.id, "Air Detector FSM", "Ultrasonic, clamp solenoid, 500 ms")),
            ("SWR-006", det(p4.id, "DET-007", ha3.id, "Blood Leak Optical Sensor", "640 nm OD, baseline cal")),
            ("SWR-009", det(p4.id, "DET-008", ha4.id, "Alarm Log SQLite Writer", "eMMC persistence, audit trail")),
        ]:
            db.add(d_obj)
            await db.flush()
            db.add(RequirementDesignLink(requirement_id=hsw[sw_k].id, design_element_id=d_obj.id))
        await db.flush()

        for tc_k, status, notes in [
            ("TC-001", ExecutionStatus.PASS, "Mean flow 49.1 mL/min; max deviation 2.8% — within ±5%"),
            ("TC-002", ExecutionStatus.PASS, "Mean flow 398 mL/min; max deviation 3.2%"),
            ("TC-003", ExecutionStatus.PASS, "Alarm raised at 7 s after conductivity injection"),
            ("TC-004", ExecutionStatus.PASS, "Alarm and pump inhibit within 8 s"),
            ("TC-005", ExecutionStatus.PASS, "TMP_ALARM and blood pump halt confirmed"),
            ("TC-006", ExecutionStatus.FAIL, "Temperature drifted to 37.6 °C at 20 min — RTD calibration offset identified"),
            ("TC-007", ExecutionStatus.PASS, "Clamp asserted at 420 ms — within 500 ms spec"),
            ("TC-008", ExecutionStatus.PASS, "No clamp for 0.1 mL air — correct behaviour"),
            ("TC-009", ExecutionStatus.PASS, "BLOOD_LEAK_ALARM raised within 5 s"),
            ("TC-010", ExecutionStatus.PASS, "Alert fired at exactly 15 min mark"),
            ("TC-011", ExecutionStatus.PASS, "Actual UF 499.2 mL — 0.16% error"),
            ("TC-012", ExecutionStatus.PASS, "Inline error displayed; session start button disabled"),
            ("TC-013", ExecutionStatus.PASS, "CSV written with all 50 records within 3 s of USB mount"),
            ("TC-014", ExecutionStatus.PASS, "Blood pump inhibited within 320 ms of conductivity fault injection"),
            ("TC-015", ExecutionStatus.BLOCKED, "Temperature fault injection fixture not yet calibrated"),
        ]:
            db.add(exe(htc[tc_k].id, status, notes))
        await db.flush()

        db.add_all([
            val(p4.id, hu["URQ-001"].id,
                "Blood pump accuracy validation: 10 flow settings × 3 runs each. All within ±4.8%.",
                ValidationStatus.PASSED),
            val(p4.id, hu["URQ-005"].id,
                "Air embolism prevention validation: 30 air injection events. All clamped within spec. "
                "No false clamps over 120-minute treatment simulation.",
                ValidationStatus.PASSED),
            val(p4.id, hu["URQ-002"].id,
                "Conductivity alarm clinical validation with electrolyte solutions. All 12 alarm events detected.",
                ValidationStatus.PASSED),
            val(p4.id, hu["URQ-010"].id,
                "UF accuracy validation: 5 patients × 3 sessions. Mean UF error 1.2%.",
                ValidationStatus.PASSED),
            val(p4.id, hu["URQ-004"].id,
                "Temperature control usability study: nephrologist verified control interface. "
                "Pending independent thermal validation.", ValidationStatus.PLANNED),
        ])
        await db.flush()

        hcr1 = ChangeRequest(project_id=p4.id,
                             title="CR-001 Add hemodiafiltration mode (HDF)",
                             description="Extend system to support online HDF with substitution fluid control",
                             status=ChangeRequestState.OPEN)
        hcr2 = ChangeRequest(project_id=p4.id,
                             title="CR-002 Lower air detection threshold to 0.1 mL",
                             description="Based on adverse event analysis, reduce AIE threshold for higher sensitivity",
                             status=ChangeRequestState.APPROVED)
        hcr3 = ChangeRequest(project_id=p4.id,
                             title="CR-003 Add patient weight trending",
                             description="Log pre- and post-dialysis weight for fluid management trending",
                             status=ChangeRequestState.IMPACT_ANALYSIS)
        db.add_all([hcr1, hcr2, hcr3])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=hcr2.id, impacted_requirement_id=hsw["SWR-005"].id,
                         impact_description="SWR-005 threshold constant changes; TC-008 criteria must be updated"),
            ChangeImpact(change_request_id=hcr2.id, impacted_testcase_id=htc["TC-008"].id,
                         impact_description="TC-008 must verify no-clamp at 0.05 mL instead of 0.1 mL"),
        ])
        await db.flush()

        hr1 = Release(project_id=p4.id, version="v4.0.0", status=ReleaseStatus.RELEASED)
        hr2 = Release(project_id=p4.id, version="v4.1.0", status=ReleaseStatus.UNDER_REVIEW)
        db.add_all([hr1, hr2])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006","SWR-007"]:
            db.add(ReleaseItem(release_id=hr1.id, requirement_id=hsw[swk].id))
        for swk in ["SWR-008","SWR-009","SWR-010","SWR-011","SWR-012","SWR-015"]:
            db.add(ReleaseItem(release_id=hr2.id, requirement_id=hsw[swk].id))
        await db.flush()

        print(f"✓ P4 Hemodialysis Machine — 10 USER | 10 SYS | 15 SW | 15 TC | 8 risks")

        # ══════════════════════════════════════════════════════════════════════
        # PROJECT 5 — Automated External Defibrillator  (Class C, LED + Alarms + Control)
        # ══════════════════════════════════════════════════════════════════════
        p5 = Project(name="Automated External Defibrillator (AED)",
                     description="Fully automatic and semi-automatic AED with CPR feedback and LED guidance. IEC 62304 Class C.")
        db.add(p5)
        await db.flush()

        au = {}
        for rid, title, desc in [
            ("URQ-001", "Rhythm analysis and shock decision",
             "AED shall correctly identify shockable rhythms (VF, pulseless VT) with sensitivity ≥ 90%, specificity ≥ 95%"),
            ("URQ-002", "Shock energy delivery",
             "Device shall deliver 150 J ± 15% biphasic energy; charge time < 10 s from 12 V battery"),
            ("URQ-003", "CPR feedback – compression depth",
             "Accelerometer-based CPR advisor shall indicate compression depth 5–6 cm; LED and audio cues"),
            ("URQ-004", "LED step-by-step guidance",
             "4 status LEDs shall illuminate sequentially: POWER ON → PADS ATTACHED → ANALYSING → SHOCK ADVISED"),
            ("URQ-005", "Voice prompt guidance",
             "System shall narrate all steps in operator language; audio ≥ 70 dB at 1 m"),
            ("URQ-006", "Paediatric mode",
             "Paediatric key switch shall halve energy delivery and adjust analysis thresholds"),
            ("URQ-007", "Self-test and readiness LED",
             "Device shall run daily self-test; green readiness LED on pass; red with beep on fail"),
            ("URQ-008", "Event data recording",
             "All ECG, CPR, shock events stored at 125 Hz; downloadable via USB"),
            ("URQ-009", "Battery life and LED indicator",
             "Battery LED shall indicate standby life remaining; device shall operate ≥ 200 shocks or 3 years standby"),
            ("URQ-010", "IP55 environmental protection",
             "Device casing shall be rated IP55; electronics sealed against moisture and dust"),
        ]:
            r = req(p5.id, "USER", rid, title, desc)
            db.add(r)
            au[rid] = r
        await db.flush()

        as_ = {}
        for rid, title, pkey in [
            ("SYS-001", "ECG acquisition and rhythm analysis engine", "URQ-001"),
            ("SYS-002", "High-voltage capacitor charge controller", "URQ-002"),
            ("SYS-003", "CPR compression feedback subsystem", "URQ-003"),
            ("SYS-004", "LED guidance display controller", "URQ-004"),
            ("SYS-005", "Audio prompt playback subsystem", "URQ-005"),
            ("SYS-006", "Paediatric mode attenuator", "URQ-006"),
            ("SYS-007", "Self-test and readiness monitoring", "URQ-007"),
            ("SYS-008", "Event data recorder", "URQ-008"),
            ("SYS-009", "Battery monitoring and LED driver", "URQ-009"),
            ("SYS-010", "Safety interlock and charge inhibit", "URQ-002"),
        ]:
            r = req(p5.id, "SYSTEM", rid, title, None, au[pkey].id)
            db.add(r)
            as_[rid] = r
        await db.flush()

        asw = {}
        for rid, title, desc, skey in [
            ("SWR-001", "VF/VT rhythm classifier",
             "200 ms window FFT + threshold; STE algorithm; sensitivity ≥ 90%; no shock if NSR or asystole",
             "SYS-001"),
            ("SWR-002", "ECG noise and motion artefact filter",
             "Bandpass 1–30 Hz; notch 50/60 Hz; CPR artefact blanking during compressions",
             "SYS-001"),
            ("SWR-003", "Capacitor charge controller",
             "PWM flyback converter; voltage sense feedback; charge to 2000 V ± 5% within 10 s; safety bleed on abort",
             "SYS-002"),
            ("SWR-004", "Biphasic shock delivery sequencer",
             "H-bridge control; deliver truncated exponential biphasic waveform; 150 J ± 15% into 50 Ω",
             "SYS-002"),
            ("SWR-005", "CPR compression depth estimator",
             "Double-integrate accelerometer signal; apply high-pass to remove gravity; display depth bar on LED",
             "SYS-003"),
            ("SWR-006", "CPR rate advisor",
             "Detect compression peaks; compute rate; advise 'faster' or 'slower' via audio cue",
             "SYS-003"),
            ("SWR-007", "LED guidance sequencer",
             "4-LED state machine: POWER(blue)→PADS(yellow)→ANALYSE(yellow blink)→SHOCK(red flash); "
             "drive via GPIO, active-high",
             "SYS-004"),
            ("SWR-008", "Audio prompt player",
             "WAV file playback from QSPI flash via I2S DAC; priority queue; amplifier enable GPIO",
             "SYS-005"),
            ("SWR-009", "Paediatric energy attenuator",
             "Key-switch ISR sets energy_scale = 0.5; propagates to charge controller target voltage",
             "SYS-006"),
            ("SWR-010", "Daily self-test routine",
             "Test: ECG path continuity, cap charge to 100 V then bleed, LED test pattern, audio chirp, battery SoC",
             "SYS-007"),
            ("SWR-011", "Readiness LED controller",
             "Green solid on self-test PASS; red blink + 30 s beep on FAIL; persist state in EEPROM",
             "SYS-007"),
            ("SWR-012", "Event data logger",
             "Write ECG (125 sps), CPR metrics, shock events to circular NAND buffer; USB mass-storage read-out",
             "SYS-008"),
            ("SWR-013", "Battery SoC monitor",
             "Coulomb counter IC (LC709203F) via I2C; map SoC% to LED indicator; raise LOW_BATTERY at 20%",
             "SYS-009"),
            ("SWR-014", "Charge abort and bleed interlock",
             "Any lid-open, pad-off, or ABORT command triggers bleed resistor MOSFET within 200 ms; "
             "inhibit shock delivery",
             "SYS-010"),
            ("SWR-015", "Shock delivery safety gate",
             "Hardware AND: analyse_complete, charge_ready, no_motion, operator_button; "
             "all must assert; deassertion cancels shock",
             "SYS-010"),
        ]:
            r = req(p5.id, "SOFTWARE", rid, title, desc, as_[skey].id)
            db.add(r)
            asw[rid] = r
        await db.flush()

        atc = {}
        for rid, title, desc in [
            ("TC-001", "VF detection sensitivity – AHA/ANSI database",
             "AHA arrhythmia database, 200 VF episodes; verify sensitivity ≥ 90%"),
            ("TC-002", "NSR specificity – no false shock",
             "AHA database, 100 NSR episodes; verify 0 shock decisions"),
            ("TC-003", "Charge time – 12 V battery",
             "Charge from 0 to 2000 V; measure wall-clock time; verify < 10 s"),
            ("TC-004", "Shock energy – 50 Ω load",
             "Deliver shock; measure energy via voltage/current integration; verify 150 J ± 15%"),
            ("TC-005", "CPR depth estimation – 5 cm reference",
             "Mechanical CPR device at 5 cm depth; verify LED depth bar lights at correct segment"),
            ("TC-006", "CPR rate advisory – 80 cpm",
             "Mechanical CPR at 80 cpm; verify 'faster' audio cue issued"),
            ("TC-007", "LED sequence – normal scenario",
             "Complete power-on → pads → analyse → shock advised scenario; verify all 4 LED transitions"),
            ("TC-008", "LED SHOCK state – red flash during charging",
             "Trigger shock-advised state; verify red LED flashes during capacitor charge"),
            ("TC-009", "Audio prompt – volume at 1 m",
             "Sound level meter measurement; verify ≥ 70 dB at 1 m"),
            ("TC-010", "Paediatric mode – energy halved",
             "Enable paediatric key; charge and deliver shock; verify energy 75 J ± 15%"),
            ("TC-011", "Daily self-test – pass path",
             "Power on fresh device; verify self-test completes and green LED illuminates within 30 s"),
            ("TC-012", "Daily self-test – battery fail",
             "Remove battery mid-test; verify red LED blink and 30 s beep alarm"),
            ("TC-013", "Event data USB read-out",
             "Complete 2 shock sequence; read USB; verify ECG and shock events present"),
            ("TC-014", "Charge abort – pad removal",
             "Remove pads during charging; verify bleed resistor activates within 200 ms"),
            ("TC-015", "Shock gate – motion during analysis",
             "Apply motion artefact during analysis; verify shock not delivered"),
        ]:
            t = tc(p5.id, rid, title, desc)
            db.add(t)
            atc[rid] = t
        await db.flush()

        for sw_k, tc_k in [
            ("SWR-001","TC-001"),("SWR-001","TC-002"),("SWR-003","TC-003"),
            ("SWR-004","TC-004"),("SWR-005","TC-005"),("SWR-006","TC-006"),
            ("SWR-007","TC-007"),("SWR-007","TC-008"),("SWR-008","TC-009"),
            ("SWR-009","TC-010"),("SWR-010","TC-011"),("SWR-011","TC-012"),
            ("SWR-012","TC-013"),("SWR-014","TC-014"),("SWR-015","TC-015"),
        ]:
            db.add(TraceLink(requirement_id=asw[sw_k].id, testcase_id=atc[tc_k].id))
        await db.flush()

        db.add_all([
            risk(asw["SWR-001"].id, "VF classifier false negative",
                 "Shockable rhythm not detected", "Failure to defibrillate; patient death", 5, 2),
            risk(asw["SWR-001"].id, "NSR classified as VF",
                 "Shock delivered to patient with organised rhythm", "Induced VF; patient death", 5, 1),
            risk(asw["SWR-003"].id, "Capacitor charge controller overshoot",
                 "Cap charged beyond 2200 V", "Component failure; shock energy out of spec", 4, 2),
            risk(asw["SWR-014"].id, "Bleed interlock delay > 200 ms",
                 "Operator contact with patient during charged state", "Operator electrocution risk", 5, 1),
            risk(asw["SWR-015"].id, "Shock gate race condition",
                 "Shock delivered before all safety signals asserted", "Inappropriate shock", 5, 1),
            risk(asw["SWR-009"].id, "Paediatric attenuator not reset on key removal",
                 "Adult patient receives half energy", "Failed defibrillation", 5, 1),
            risk(asw["SWR-005"].id, "CPR depth double-integration drift",
                 "Depth estimate inaccurate after 60 s", "Ineffective CPR guidance", 3, 3),
            risk(asw["SWR-013"].id, "Battery SoC I2C read failure",
                 "LOW_BATTERY alarm not raised", "Device inoperable during emergency", 4, 2),
        ])
        await db.flush()

        aa1 = arch(p5.id, "ARC-001", "ECG Analysis Engine", "Signal acquisition, noise filter, VF/VT classifier")
        aa2 = arch(p5.id, "ARC-002", "High-Voltage Shock Delivery", "Flyback charge controller, H-bridge, bleed interlock")
        aa3 = arch(p5.id, "ARC-003", "CPR Feedback System", "Accelerometer, depth estimator, rate advisor")
        aa4 = arch(p5.id, "ARC-004", "Guidance, Safety & Logging", "LED sequencer, audio player, safety gate, event logger")
        db.add_all([aa1, aa2, aa3, aa4])
        await db.flush()

        for sw_k, d_obj in [
            ("SWR-001", det(p5.id, "DET-001", aa1.id, "VF/VT Rhythm Classifier", "STE algorithm, 200 ms window, FFT")),
            ("SWR-002", det(p5.id, "DET-002", aa1.id, "ECG Noise Filter", "Bandpass + notch + CPR blanker")),
            ("SWR-003", det(p5.id, "DET-003", aa2.id, "Capacitor Charge Controller", "PWM flyback, 2000 V ± 5%")),
            ("SWR-004", det(p5.id, "DET-004", aa2.id, "Biphasic Shock Sequencer", "H-bridge, 150 J truncated exp")),
            ("SWR-014", det(p5.id, "DET-005", aa2.id, "Charge Abort & Bleed Interlock", "200 ms bleed MOSFET")),
            ("SWR-005", det(p5.id, "DET-006", aa3.id, "CPR Depth Estimator", "Double-integrate, HP filter")),
            ("SWR-007", det(p5.id, "DET-007", aa4.id, "LED Guidance Sequencer", "4-LED GPIO state machine")),
            ("SWR-015", det(p5.id, "DET-008", aa4.id, "Shock Delivery Safety Gate", "Hardware AND, 5 inputs")),
        ]:
            db.add(d_obj)
            await db.flush()
            db.add(RequirementDesignLink(requirement_id=asw[sw_k].id, design_element_id=d_obj.id))
        await db.flush()

        for tc_k, status, notes in [
            ("TC-001", ExecutionStatus.PASS, "Sensitivity 93.5% on 200-episode AHA database"),
            ("TC-002", ExecutionStatus.PASS, "0 false shock decisions on 100 NSR episodes"),
            ("TC-003", ExecutionStatus.PASS, "Charge time 8.4 s from 12.0 V battery"),
            ("TC-004", ExecutionStatus.PASS, "Energy 148.2 J — within 150 J ± 15% spec"),
            ("TC-005", ExecutionStatus.PASS, "Depth bar LED correctly indicated 5 cm compression"),
            ("TC-006", ExecutionStatus.PASS, "'Faster' audio cue issued at 80 cpm — correct"),
            ("TC-007", ExecutionStatus.PASS, "All 4 LED transitions confirmed in correct order"),
            ("TC-008", ExecutionStatus.PASS, "Red LED flash confirmed during charge phase"),
            ("TC-009", ExecutionStatus.FAIL, "Audio measured 66 dB at 1 m — below 70 dB; amplifier gain needs +4 dB"),
            ("TC-010", ExecutionStatus.PASS, "Energy 74.8 J — within 75 J ± 15% spec"),
            ("TC-011", ExecutionStatus.PASS, "Self-test passed in 18 s; green LED illuminated"),
            ("TC-012", ExecutionStatus.PASS, "Red LED blink and 30 s beep alarm confirmed on battery removal"),
            ("TC-013", ExecutionStatus.PASS, "ECG + shock events present in USB read-out; timestamps correct"),
            ("TC-014", ExecutionStatus.PASS, "Bleed resistor activated at 140 ms after pad removal"),
            ("TC-015", ExecutionStatus.PASS, "Shock withheld during motion artefact — correct gate behaviour"),
        ]:
            db.add(exe(atc[tc_k].id, status, notes))
        await db.flush()

        db.add_all([
            val(p5.id, au["URQ-001"].id,
                "Rhythm analysis clinical validation: 400-episode database (200 VF, 200 non-shockable). "
                "Sensitivity 93.5%, specificity 97.0% — both exceed minimum thresholds.",
                ValidationStatus.PASSED),
            val(p5.id, au["URQ-002"].id,
                "Energy delivery validation: 50 shocks into 25/50/100 Ω loads. "
                "All within 150 J ± 12% — within spec.",
                ValidationStatus.PASSED),
            val(p5.id, au["URQ-003"].id,
                "CPR feedback usability: 20 first-aider trainees used AED. "
                "Compression depth improved from 3.8 cm to 5.2 cm average with guidance.",
                ValidationStatus.PASSED),
            val(p5.id, au["URQ-004"].id,
                "LED guidance usability: 15 lay users followed LED cues without prior training. "
                "14/15 completed shock delivery sequence correctly.",
                ValidationStatus.PASSED),
            val(p5.id, au["URQ-005"].id,
                "Audio volume validation pending re-test after amplifier gain adjustment (CR-001).",
                ValidationStatus.PLANNED),
        ])
        await db.flush()

        acr1 = ChangeRequest(project_id=p5.id,
                             title="CR-001 Increase audio amplifier gain to meet 70 dB",
                             description="TC-009 failed at 66 dB; amplifier stage requires +4 dB gain adjustment",
                             status=ChangeRequestState.APPROVED)
        acr2 = ChangeRequest(project_id=p5.id,
                             title="CR-002 Add real-time CPR coaching on display",
                             description="Add small graphical LCD showing compression depth bar and rate in real time",
                             status=ChangeRequestState.OPEN)
        acr3 = ChangeRequest(project_id=p5.id,
                             title="CR-003 Bluetooth data transmission to dispatch",
                             description="Transmit live ECG to emergency dispatch via Bluetooth LE during resuscitation",
                             status=ChangeRequestState.IMPACT_ANALYSIS)
        db.add_all([acr1, acr2, acr3])
        await db.flush()

        db.add_all([
            ChangeImpact(change_request_id=acr1.id, impacted_requirement_id=asw["SWR-008"].id,
                         impact_description="SWR-008 amplifier enable configuration changes; TC-009 must be re-run"),
            ChangeImpact(change_request_id=acr1.id, impacted_testcase_id=atc["TC-009"].id,
                         impact_description="TC-009 re-test required after hardware rework"),
        ])
        await db.flush()

        ar1 = Release(project_id=p5.id, version="v1.0.0", status=ReleaseStatus.RELEASED)
        ar2 = Release(project_id=p5.id, version="v1.0.1", status=ReleaseStatus.DRAFT)
        db.add_all([ar1, ar2])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006","SWR-007"]:
            db.add(ReleaseItem(release_id=ar1.id, requirement_id=asw[swk].id))
        for tck in ["TC-001","TC-002","TC-003","TC-004","TC-007"]:
            db.add(ReleaseItem(release_id=ar1.id, testcase_id=atc[tck].id))
        for swk in ["SWR-008","SWR-009","SWR-010","SWR-011","SWR-012","SWR-013","SWR-014","SWR-015"]:
            db.add(ReleaseItem(release_id=ar2.id, requirement_id=asw[swk].id))
        await db.flush()

        await db.commit()

    print(f"✓ P5 AED — 10 USER | 10 SYS | 15 SW | 15 TC | 8 risks")
    print(f"\n{'='*65}")
    print("COMPREHENSIVE SEED COMPLETE")
    print(f"{'='*65}")
    print("Project 1: Patient Vital Signs Monitor      — UI + LED + Alarms")
    print("Project 2: Electrosurgical Generator        — Control + Software")
    print("Project 3: Smart Drug Infusion Pump v2      — Alarms + LED + Control")
    print("Project 4: Hemodialysis Machine             — Control + UI + Alarms")
    print("Project 5: Automated External Defibrillator — LED + Alarms + Control")
    print(f"{'='*65}")
    print("Each project: 10 USER | 10 SYS | 15 SW | 15 TC | 8+ risks")
    print("              4 ARCH + 8 DETAILED design | 15 test executions")
    print("              5 validation records | 3 change requests | 2 releases")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    asyncio.run(seed())
