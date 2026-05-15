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
from app.modules.platform.projects.model import Project
from app.modules.compliance.dev.requirements.model import Requirement
from app.modules.compliance.risk.risks.model import Risk, _compute_level
import app.modules.compliance.dev.design.model  # noqa: F401 — register design_elements table for FK resolution
# §5.4 design elements themselves are seeded by seed_architecture.py (they link to §5.3 components).
from app.modules.compliance.dev.validation.model import ValidationRecord, ValidationStatus
from app.modules.compliance.change_control.model import ChangeRequest, ChangeRequestState, ChangeImpact
from app.modules.compliance.release.model import Release, ReleaseStatus, ReleaseItem
from app.modules.compliance.dev.sdp.seed import seed_approved_sdp
from app.modules.compliance.dev.requirements.seed import seed_approved_srs
from app.modules.compliance.dev.requirements.router import _ensure_builtins
import app.modules.compliance.dev.architecture.model  # noqa: F401  ensure mapper registered
import app.modules.platform.audit.model  # noqa: F401
import app.modules.compliance.dev.sdp.model  # noqa: F401  (ensure mapper registered before TRUNCATE)
import app.modules.compliance.config.config_mgmt.model  # noqa: F401  (CM mirror tables)
import app.modules.compliance.dev.system_testing.model  # noqa: F401  (system_test_cases — FK target for §5.7 columns)
import app.modules.compliance.dev.units.model  # noqa: F401  (§5.5 unit tests)
import app.modules.compliance.dev.integration_tests.model  # noqa: F401  (§5.6 integration tests)
import app.modules.compliance.dev.software_items.model  # noqa: F401  (§4.3 safety classification)
import app.modules.compliance.plans.model  # noqa: F401
import app.modules.compliance.problems.capa.model  # noqa: F401
import app.modules.platform.attachments.model  # noqa: F401

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def req(proj_id, typ, rid, title, desc=None, parent_id=None):
    return Requirement(project_id=proj_id, type=typ, readable_id=rid,
                       title=title, description=desc, parent_id=parent_id)

def risk(req_id, hazard, sit, harm, s, p):
    return Risk(requirement_id=req_id, hazard=hazard, hazardous_situation=sit,
                harm=harm, severity=s, probability=p, risk_level=_compute_level(s, p))

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
        "validation_records",
        "requirement_design_links", "design_elements",
        "risks",
        "requirements", "requirement_categories",
        "software_safety_profiles",
        "architecture_baseline_interfaces", "architecture_baseline_components", "architecture_baselines",
        "requirements_baseline_items", "requirements_baselines",
        "cm_baseline_items", "cm_baselines", "cm_config_items",
        "sdp_sections", "sdp_lifecycle_phases", "sdp_project_roles", "sdp",
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
        # §5.4 design elements are seeded in seed_architecture.py (they link to
        # §5.3 SWComponents, which don't exist until that step runs).
        # §5.7 system tests are seeded by seed_architecture.py.

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
            ChangeImpact(change_request_id=cr3.id, impacted_requirement_id=psw["SWR-006"].id,
                         impact_description="SWR-006 maximum suspend duration constant changes to 180 s"),
        ])
        await db.flush()

        # ── Releases ───────────────────────────────────────────────────────
        r1a = Release(project_id=p1.id, version="v2.0.0", status=ReleaseStatus.RELEASED)
        r1b = Release(project_id=p1.id, version="v2.1.0", status=ReleaseStatus.UNDER_REVIEW)
        db.add_all([r1a, r1b])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006"]:
            db.add(ReleaseItem(release_id=r1a.id, requirement_id=psw[swk].id))
        for swk in ["SWR-007","SWR-008","SWR-009","SWR-010","SWR-011"]:
            db.add(ReleaseItem(release_id=r1b.id, requirement_id=psw[swk].id))
        await db.flush()

        print(f"✓ P1 Patient Vital Signs Monitor — 10 USER | 10 SYS | 15 SW | 8 risks")

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

        # §5.4 design elements seeded in seed_architecture.py (see project 1).
        # §5.7 system tests seeded by seed_architecture.py.

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

        print(f"✓ P2 Electrosurgical Generator — 10 USER | 10 SYS | 15 SW | 8 risks")

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

        # §5.4 design elements seeded in seed_architecture.py (see project 1).
        # §5.7 system tests seeded by seed_architecture.py.

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

        print(f"✓ P3 Smart Drug Infusion Pump v2 — 10 USER | 10 SYS | 15 SW | 8 risks")

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

        # §5.4 design elements seeded in seed_architecture.py (see project 1).
        # §5.7 system tests seeded by seed_architecture.py.

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

        print(f"✓ P4 Hemodialysis Machine — 10 USER | 10 SYS | 15 SW | 8 risks")

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

        # §5.4 design elements seeded in seed_architecture.py (see project 1).
        # §5.7 system tests seeded by seed_architecture.py.

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
        ])
        await db.flush()

        ar1 = Release(project_id=p5.id, version="v1.0.0", status=ReleaseStatus.RELEASED)
        ar2 = Release(project_id=p5.id, version="v1.0.1", status=ReleaseStatus.DRAFT)
        db.add_all([ar1, ar2])
        await db.flush()

        for swk in ["SWR-001","SWR-002","SWR-003","SWR-004","SWR-005","SWR-006","SWR-007"]:
            db.add(ReleaseItem(release_id=ar1.id, requirement_id=asw[swk].id))
        for swk in ["SWR-008","SWR-009","SWR-010","SWR-011","SWR-012","SWR-013","SWR-014","SWR-015"]:
            db.add(ReleaseItem(release_id=ar2.id, requirement_id=asw[swk].id))
        await db.flush()

        # ══════════════════════════════════════════════════════════════════════
        # Requirement categories — ensure every project has its initial tree
        # (USER → SYSTEM → SOFTWARE with readable_id_prefix and parent_id chain)
        # so traceability and category-baseline UIs work after a fresh seed.
        # The dynamic API auto-seeds these on first GET, but tests/CLI users
        # may inspect the DB before opening the UI, so do it up front.
        # ══════════════════════════════════════════════════════════════════════
        for proj in (p1, p2, p3, p4, p5):
            await _ensure_builtins(db, proj.id)
        await db.flush()

        # ══════════════════════════════════════════════════════════════════════
        # SDPs (IEC 62304 §5.1) — one APPROVED SDP per project, gates release.
        # Project names are pulled from the inserted Project rows (not
        # hardcoded). Safety class is metadata not stored on Project, so we
        # provide it per-project here.
        # ══════════════════════════════════════════════════════════════════════
        sdp_classes = [(p1, "B"), (p2, "C"), (p3, "C"), (p4, "C"), (p5, "C")]
        for proj, sclass in sdp_classes:
            await seed_approved_sdp(
                db,
                project_id=proj.id,
                safety_class=sclass,
                title=f"SDP — {proj.name}",
            )
        await db.flush()
        print(f"✓ Seeded {len(sdp_classes)} APPROVED SDPs from DB project names")

        # ══════════════════════════════════════════════════════════════════════
        # SRS baselines (IEC 62304 §5.2) — one APPROVED SRS v1.0 per project,
        # auto-mirrored as a CMBaseline. Locks live requirements until forked.
        # ══════════════════════════════════════════════════════════════════════
        for proj in (p1, p2, p3, p4, p5):
            await seed_approved_srs(db, project_id=proj.id)
        await db.flush()
        print(f"✓ Seeded 5 APPROVED SRS v1.0 baselines (CM-mirrored, requirements now locked)")

        # Architecture components + baselines are seeded in a separate step
        # (seed_architecture.py) — keeps this file focused on the legacy
        # requirements / risks / design-elements / tests data.

        await db.commit()

    print(f"✓ P5 AED — 10 USER | 10 SYS | 15 SW | 8 risks")
    print(f"\n{'='*65}")
    print("COMPREHENSIVE SEED COMPLETE")
    print(f"{'='*65}")
    print("Project 1: Patient Vital Signs Monitor      — UI + LED + Alarms")
    print("Project 2: Electrosurgical Generator        — Control + Software")
    print("Project 3: Smart Drug Infusion Pump v2      — Alarms + LED + Control")
    print("Project 4: Hemodialysis Machine             — Control + UI + Alarms")
    print("Project 5: Automated External Defibrillator — LED + Alarms + Control")
    print(f"{'='*65}")
    print("Each project: 10 USER | 10 SYS | 15 SW | 8+ risks")
    print("              (§5.4 design elements + §5.7 system tests: seed_architecture.py)")
    print("              5 validation records | 3 change requests | 2 releases")
    print("              + 1 APPROVED SDP per project (release gate ready)")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    asyncio.run(seed())
