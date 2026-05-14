"""Per-device IEC 62304 §5.3 architecture + §5.4 design demo data.

Runs after `seed_comprehensive.py` (and before `seed_phase4.py`) in the
`seed_all.py` pipeline. For every seeded project it inserts a product-specific
software architecture — SYSTEM → SUBSYSTEM → ITEM → UNIT components plus
interfaces and data flows — then the §5.4 detailed-design elements that detail
those components, and finally an APPROVED Architecture v1.0 baseline.

Each medical-device project gets its own template (matched by a substring of
the project name, with a generic fallback) so the names are relevant to the
actual product rather than a one-size-fits-all skeleton.
"""
import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Eager-import every model so the SQLAlchemy mapper resolves cross-module
# relationships (Requirement → Risk → TraceLink etc.) before we query.
import app.modules.projects.model           # noqa: F401
import app.modules.requirements.model       # noqa: F401
import app.modules.testcases.model          # noqa: F401
import app.modules.tracelinks.model         # noqa: F401
import app.modules.risks.model              # noqa: F401
import app.modules.design.model             # noqa: F401
import app.modules.verification.model       # noqa: F401
import app.modules.validation.model         # noqa: F401
import app.modules.architecture.model       # noqa: F401
import app.modules.config_mgmt.model        # noqa: F401
import app.modules.sdp.model                # noqa: F401
import app.modules.audit.model              # noqa: F401
import app.modules.units.model              # noqa: F401
import app.modules.integration_tests.model  # noqa: F401
import app.modules.system_testing.model     # noqa: F401
import app.modules.software_items.model     # noqa: F401
import app.modules.release.model            # noqa: F401
import app.modules.capa.model               # noqa: F401
import app.modules.esign.model              # noqa: F401
import app.modules.users.model              # noqa: F401
import app.modules.roles.model              # noqa: F401
import app.modules.training.model           # noqa: F401

from app.core.config import settings
from app.modules.projects.model import Project
from app.modules.architecture.model import (
    SWComponent, SWInterface, SWDataFlow, ArchitectureBaseline,
)
from app.modules.architecture.seed import seed_approved_architecture
from app.modules.design.model import DesignElement, RequirementDesignLink
from app.modules.requirements.model import Requirement
from app.modules.risks.model import Risk
from app.modules.units.model import (
    SoftwareUnit, CodeArtifact, UnitTestCase, UnitTestResult, UnitRequirementLink,
)
from app.modules.integration_tests.model import (
    IntegrationTestCase, IntegrationTestResult, ITCRequirementLink,
)
from app.modules.system_testing.model import (
    SystemTestCase, SystemTestResult, STRiskLink,
)
from app.modules.software_items.model import (
    SoftwareItem, SoftwareItemRequirementLink, SoftwareItemRiskLink,
)
from app.modules.release.model import Release, ReleaseItem, ReleaseStatus
from app.modules.system_testing.model import ReleaseArtifact, ReleaseSnapshot
from app.modules.capa.model import ProblemReport, ProblemLink, RootCause, CAPA, CAPAVerification
from app.modules.esign.model import ElectronicSignature, ESignEntityType, ESignMeaning
from app.modules.users.model import User


engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Per-device architecture + design templates ───────────────────────────────
#
# Each template:
#   match            — substrings of the project name that select this template
#   subsystems       — SUBSYSTEM components; each has ITEM children, some with UNITs
#   interfaces       — SWInterfaces between subsystems (source_key/target_key)
#   design_elements  — §5.4 detailed-design elements attached to an ITEM by name,
#                      optionally sub-nested via `children`
#
# A data flow is {data_name, data_type, frequency, criticality}.

PATIENT_MONITOR = {
    "match": ["vital", "monitor"],
    "subsystems": [
        {"key": "display", "name": "Display & Touch Subsystem",
         "description": "Touchscreen rendering and operator input.",
         "items": [
             {"name": "Waveform Renderer", "description": "Renders live waveforms and parameter tiles.",
              "units": [{"name": "Frame Buffer Writer", "description": "Pushes pixel data to the LCD controller."}]},
         ]},
        {"key": "alarm", "name": "LED & Audio Alarm Subsystem",
         "description": "Visual and audible alarm annunciation.",
         "items": [
             {"name": "Alarm Engine", "description": "Drives the alarm LED strip and audio annunciator."},
         ]},
        {"key": "data", "name": "Data Management Subsystem",
         "description": "Trend storage and alarm event logging.",
         "items": [
             {"name": "Trend Store", "description": "72-hour ring-buffer trend store on NAND flash."},
         ]},
        {"key": "conn", "name": "Connectivity Subsystem",
         "description": "Wi-Fi link to the central monitoring station.",
         "items": [
             {"name": "Central Station Link", "description": "TLS link and FHIR client to the central station."},
         ]},
    ],
    "interfaces": [
        {"name": "Waveforms → Trend Store", "interface_type": "DATA", "source_key": "display", "target_key": "data",
         "description": "Sampled parameters streamed to the trend store.", "data_format": "binary tuple stream",
         "communication_method": "shared ring buffer", "safety_relevant": False,
         "data_flows": [{"data_name": "parameter_sample", "data_type": "float32", "frequency": "1 Hz", "criticality": "MEDIUM"}]},
        {"name": "Alarm State → UI Banner", "interface_type": "CONTROL", "source_key": "alarm", "target_key": "display",
         "description": "Active alarm pushed to the UI for the alarm banner.", "data_format": "enum + text",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "active_alarm", "data_type": "struct", "frequency": "on-change", "criticality": "HIGH"}]},
        {"name": "Trend Upload to Central Station", "interface_type": "API", "source_key": "data", "target_key": "conn",
         "description": "Encrypted batch upload of trend windows.", "data_format": "FHIR R4 over TLS",
         "communication_method": "HTTPS POST", "safety_relevant": False,
         "data_flows": [{"data_name": "trend_window", "data_type": "bytes", "frequency": "every 1 min", "criticality": "LOW"}]},
    ],
    "design_elements": [
        {"item_name": "Waveform Renderer", "title": "Waveform Tile Layout Engine",
         "description": "Grid compositor with drag-and-drop; NVRAM persistence.",
         "children": [{"title": "Touch Gesture Recogniser", "description": "Tap/swipe/long-press classifier on raw touch events."}]},
        {"item_name": "Alarm Engine", "title": "Alarm Escalation State Machine",
         "description": "SILENT → ACTIVE → ESCALATED with timer and volume ramp.",
         "children": [{"title": "Alarm Suspend Watchdog", "description": "Countdown timer; auto-resume on expiry."}]},
        {"item_name": "Trend Store", "title": "72-Hour Trend Ring Buffer",
         "description": "Circular NAND buffer, 1 s resolution, wear levelling.", "children": []},
        {"item_name": "Central Station Link", "title": "FHIR R4 Observation Publisher",
         "description": "Bundle serialiser, HTTP retry with exponential backoff.",
         "children": [{"title": "Wi-Fi Link Manager", "description": "Association FSM, TLS 1.3, 5 s reconnect guarantee."}]},
    ],
}

ELECTROSURGICAL = {
    "match": ["electrosurgical", "generator"],
    "subsystems": [
        {"key": "rf", "name": "RF Power Stage",
         "description": "H-bridge driver, gate signal path, output transformer.",
         "items": [{"name": "Gate Driver", "description": "Generates the H-bridge gate signal path."}]},
        {"key": "sensing", "name": "Sensing & Measurement",
         "description": "V/I acquisition, impedance, leakage and contact monitoring.",
         "items": [{"name": "Measurement Pipeline", "description": "V/I ADC sampling, RMS and impedance computation."}]},
        {"key": "control", "name": "Control & Safety Logic",
         "description": "PID control, mode FSM, interlock AND gate, watchdog.",
         "items": [{"name": "Safety Logic Core", "description": "Mode FSM and the hardware interlock AND gate."}]},
        {"key": "ui", "name": "User Interface & Indicators",
         "description": "LED driver, tone DAC, front-panel input MCU.",
         "items": [{"name": "Front Panel Controller", "description": "Front-panel inputs, LED and tone output."}]},
    ],
    "interfaces": [
        {"name": "Sensing → Control measurements", "interface_type": "DATA", "source_key": "sensing", "target_key": "control",
         "description": "Impedance, leakage and REM status to the control logic.", "data_format": "binary tuple stream",
         "communication_method": "shared ring buffer", "safety_relevant": True,
         "data_flows": [{"data_name": "impedance", "data_type": "float32", "frequency": "10 kHz", "criticality": "HIGH"},
                        {"data_name": "leakage_current", "data_type": "float32", "frequency": "1 kHz", "criticality": "HIGH"}]},
        {"name": "Control → RF gate enable", "interface_type": "SIGNAL", "source_key": "control", "target_key": "rf",
         "description": "Hardware-gated RF enable from the interlock AND gate.", "data_format": "discrete signal",
         "communication_method": "GPIO interlock line", "safety_relevant": True,
         "data_flows": [{"data_name": "rf_enable", "data_type": "bool", "frequency": "on-change", "criticality": "CRITICAL"}]},
        {"name": "UI → Control mode request", "interface_type": "API", "source_key": "ui", "target_key": "control",
         "description": "Operator mode and power-setpoint requests.", "data_format": "JSON over IPC",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "mode_request", "data_type": "enum", "frequency": "on-change", "criticality": "HIGH"}]},
    ],
    "design_elements": [
        {"item_name": "Gate Driver", "title": "RF Power PID Controller",
         "description": "Discrete PID with anti-windup; 1 MHz update rate.", "children": []},
        {"item_name": "Measurement Pipeline", "title": "Impedance Calculator",
         "description": "100 µs V_rms/I_rms, IIR filtered.",
         "children": [{"title": "REM Contact Monitor", "description": "Dual-pad ratio algorithm."},
                      {"title": "Leakage Current Monitor", "description": "1 kHz sampling, 80 µA threshold."}]},
        {"item_name": "Safety Logic Core", "title": "Mode Selection FSM",
         "description": "STANDBY → READY → ACTIVE → FAULT transitions.",
         "children": [{"title": "RF Gate Interlock", "description": "Hardware AND: FSM + REM + Thermal + Leakage."}]},
        {"item_name": "Front Panel Controller", "title": "LED Mode Controller",
         "description": "I2C LED driver with a colour palette per mode.",
         "children": [{"title": "Tone Generator", "description": "DAC 800 Hz, Cut/Coag patterns."}]},
    ],
}

INFUSION_PUMP = {
    "match": ["infusion", "pump"],
    "subsystems": [
        {"key": "delivery", "name": "Drug Delivery Control",
         "description": "Motor PID, VTBI engine, drug-library service.",
         "items": [{"name": "Pump Controller", "description": "Velocity-controlled stepper drive with VTBI tracking."}]},
        {"key": "safety", "name": "Sensing & Safety Interlocks",
         "description": "Pressure FSM, air-in-line classifier, free-flow valve.",
         "items": [{"name": "Interlock Monitor", "description": "Occlusion, air-in-line and free-flow interlocks."}]},
        {"key": "alarm", "name": "LED & Alarm Output",
         "description": "LED bar driver, alarm arbitrator, buzzer.",
         "items": [{"name": "Alarm Output Manager", "description": "Priority-arbitrated alarm LED and buzzer output."}]},
        {"key": "security", "name": "Security & Logging",
         "description": "PIN auth, tamper-evident log, BLE gateway.",
         "items": [{"name": "Audit Logger", "description": "Tamper-evident infusion event log."}]},
    ],
    "interfaces": [
        {"name": "Safety → Delivery stop", "interface_type": "SIGNAL", "source_key": "safety", "target_key": "delivery",
         "description": "Interlock trip halts the pump within 100 ms.", "data_format": "discrete signal",
         "communication_method": "GPIO interlock line", "safety_relevant": True,
         "data_flows": [{"data_name": "stop_request", "data_type": "bool", "frequency": "on-event", "criticality": "CRITICAL"}]},
        {"name": "Delivery → Safety state", "interface_type": "DATA", "source_key": "delivery", "target_key": "safety",
         "description": "Pump rate and pressure shared with the interlock monitor.", "data_format": "binary tuple stream",
         "communication_method": "shared ring buffer", "safety_relevant": True,
         "data_flows": [{"data_name": "pump_state", "data_type": "struct", "frequency": "50 Hz", "criticality": "HIGH"}]},
        {"name": "Safety → Alarm escalation", "interface_type": "CONTROL", "source_key": "safety", "target_key": "alarm",
         "description": "Interlock events raised to the alarm arbitrator.", "data_format": "enum + priority",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "alarm_event", "data_type": "struct", "frequency": "on-event", "criticality": "HIGH"}]},
    ],
    "design_elements": [
        {"item_name": "Pump Controller", "title": "Motor Drive PID",
         "description": "Velocity PID, encoder feedback, stall detect.",
         "children": [{"title": "Drug Library Lookup", "description": "512-entry binary search, hard/soft limits."}]},
        {"item_name": "Interlock Monitor", "title": "Occlusion Pressure FSM",
         "description": "Configurable threshold, alarm relay.",
         "children": [{"title": "Free-flow Valve ISR", "description": "GPIO ISR, 100 ms solenoid assert."},
                      {"title": "AIE Bubble Classifier", "description": "FFT-based air-in-line, 50 µL threshold."}]},
        {"item_name": "Alarm Output Manager", "title": "Alarm Priority Arbitrator",
         "description": "Priority queue, buzzer + LED routing.",
         "children": [{"title": "LED Animation Controller", "description": "8-LED SPI, priority-mapped patterns."}]},
        {"item_name": "Audit Logger", "title": "Tamper-Evident Log",
         "description": "HMAC-SHA256 hash chain over infusion events.", "children": []},
    ],
}

HEMODIALYSIS = {
    "match": ["hemodialysis", "dialysis"],
    "subsystems": [
        {"key": "blood", "name": "Blood Circuit Control",
         "description": "Blood pump PID, safety interlock, TMP monitor.",
         "items": [{"name": "Blood Pump Controller", "description": "PI-controlled blood pump with TMP supervision."}]},
        {"key": "dialysate", "name": "Dialysate Preparation",
         "description": "Conductivity monitor, thermal PID, UF control.",
         "items": [{"name": "Dialysate Controller", "description": "Conductivity, temperature and ultrafiltration control."}]},
        {"key": "safety", "name": "Safety Sensors",
         "description": "Air detector, blood-leak sensor, pressure transducers.",
         "items": [{"name": "Sensor Array", "description": "Air-in-line, blood-leak and pressure sensing."}]},
        {"key": "ui", "name": "UI & Data Management",
         "description": "Touchscreen config, alarm log, CSV export.",
         "items": [{"name": "Operator Console", "description": "Treatment configuration UI and alarm log."}]},
    ],
    "interfaces": [
        {"name": "Safety → Blood circuit stop", "interface_type": "SIGNAL", "source_key": "safety", "target_key": "blood",
         "description": "Air or leak detection clamps the blood circuit.", "data_format": "discrete signal",
         "communication_method": "GPIO interlock line", "safety_relevant": True,
         "data_flows": [{"data_name": "clamp_request", "data_type": "bool", "frequency": "on-event", "criticality": "CRITICAL"}]},
        {"name": "Dialysate → Blood TMP feedback", "interface_type": "DATA", "source_key": "dialysate", "target_key": "blood",
         "description": "Dialysate pressure used for trans-membrane-pressure control.", "data_format": "binary tuple stream",
         "communication_method": "shared ring buffer", "safety_relevant": True,
         "data_flows": [{"data_name": "dialysate_pressure", "data_type": "float32", "frequency": "50 Hz", "criticality": "HIGH"}]},
        {"name": "UI → Blood circuit setpoints", "interface_type": "API", "source_key": "ui", "target_key": "blood",
         "description": "Operator-entered flow and UF-rate setpoints.", "data_format": "JSON over IPC",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "treatment_setpoints", "data_type": "struct", "frequency": "on-change", "criticality": "HIGH"}]},
    ],
    "design_elements": [
        {"item_name": "Blood Pump Controller", "title": "Blood Pump PID",
         "description": "PI control, encoder feedback, 50 Hz.",
         "children": [{"title": "Safety Interlock Controller", "description": "Hardware AND over all-sensor health."}]},
        {"item_name": "Dialysate Controller", "title": "Conductivity Alarm Evaluator",
         "description": "3-sample moving average, inhibit relay.",
         "children": [{"title": "Thermal PID Controller", "description": "RTD feedback, PWM heater."},
                      {"title": "UF Pump PID with Load Cell", "description": "Gravimetric feedback, ±2%."}]},
        {"item_name": "Sensor Array", "title": "Air Detector FSM",
         "description": "Ultrasonic detection, clamp solenoid, 500 ms.",
         "children": [{"title": "Blood Leak Optical Sensor", "description": "640 nm optical density, baseline calibration."}]},
        {"item_name": "Operator Console", "title": "Alarm Log SQLite Writer",
         "description": "eMMC persistence, audit trail.", "children": []},
    ],
}

DEFIBRILLATOR = {
    "match": ["defibrillator", "aed"],
    "subsystems": [
        {"key": "ecg", "name": "ECG Analysis Engine",
         "description": "Signal acquisition, noise filter, VF/VT classifier.",
         "items": [{"name": "Rhythm Analyzer", "description": "Acquires the ECG and classifies the rhythm."}]},
        {"key": "shock", "name": "High-Voltage Shock Delivery",
         "description": "Flyback charge controller, H-bridge, bleed interlock.",
         "items": [{"name": "Shock Controller", "description": "Capacitor charge control and biphasic shock delivery."}]},
        {"key": "cpr", "name": "CPR Feedback System",
         "description": "Accelerometer, depth estimator, rate advisor.",
         "items": [{"name": "CPR Monitor", "description": "Estimates compression depth and rate from accelerometer data."}]},
        {"key": "guidance", "name": "Guidance, Safety & Logging",
         "description": "LED sequencer, audio player, safety gate, event logger.",
         "items": [{"name": "Guidance Engine", "description": "Voice/LED rescue guidance with the shock safety gate."}]},
    ],
    "interfaces": [
        {"name": "ECG → Shock advisory", "interface_type": "DATA", "source_key": "ecg", "target_key": "shock",
         "description": "Shockable-rhythm decision passed to the shock controller.", "data_format": "enum + confidence",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "shock_advised", "data_type": "struct", "frequency": "every 2 s", "criticality": "CRITICAL"}]},
        {"name": "Guidance → Shock arm gate", "interface_type": "SIGNAL", "source_key": "guidance", "target_key": "shock",
         "description": "Hardware safety gate that arms the shock delivery path.", "data_format": "discrete signal",
         "communication_method": "GPIO interlock line", "safety_relevant": True,
         "data_flows": [{"data_name": "arm_gate", "data_type": "bool", "frequency": "on-event", "criticality": "CRITICAL"}]},
        {"name": "CPR → Guidance feedback", "interface_type": "DATA", "source_key": "cpr", "target_key": "guidance",
         "description": "Compression depth/rate drives the CPR coaching prompts.", "data_format": "binary tuple stream",
         "communication_method": "shared ring buffer", "safety_relevant": False,
         "data_flows": [{"data_name": "cpr_metrics", "data_type": "struct", "frequency": "20 Hz", "criticality": "MEDIUM"}]},
    ],
    "design_elements": [
        {"item_name": "Rhythm Analyzer", "title": "VF/VT Rhythm Classifier",
         "description": "STE algorithm, 200 ms window, FFT.",
         "children": [{"title": "ECG Noise Filter", "description": "Bandpass + notch + CPR blanker."}]},
        {"item_name": "Shock Controller", "title": "Capacitor Charge Controller",
         "description": "PWM flyback, 2000 V ± 5%.",
         "children": [{"title": "Charge Abort & Bleed Interlock", "description": "200 ms bleed MOSFET on abort."},
                      {"title": "Biphasic Shock Sequencer", "description": "H-bridge, 150 J truncated exponential."}]},
        {"item_name": "CPR Monitor", "title": "CPR Depth Estimator",
         "description": "Double-integration with high-pass filter.", "children": []},
        {"item_name": "Guidance Engine", "title": "LED Guidance Sequencer",
         "description": "4-LED GPIO rescue-step state machine.",
         "children": [{"title": "Shock Delivery Safety Gate", "description": "Hardware AND over 5 arming inputs."}]},
    ],
}

# Fallback for any project whose name matches no device template.
GENERIC_TEMPLATE = {
    "match": [],
    "subsystems": [
        {"key": "ui", "name": "UI Subsystem", "description": "Operator-facing display, input, and indicators.",
         "items": [{"name": "Display Renderer", "description": "Renders the operator UI."}]},
        {"key": "control", "name": "Control Subsystem", "description": "Core control loop with safety supervisor.",
         "items": [{"name": "Control Loop", "description": "Sampled-time controller."}]},
        {"key": "data", "name": "Data Management Subsystem", "description": "Trends, logs, and configuration storage.",
         "items": [{"name": "Data Store", "description": "Persistent trend and log store."}]},
        {"key": "conn", "name": "Connectivity Subsystem", "description": "Links to external systems.",
         "items": [{"name": "Uplink Manager", "description": "Network link to external systems."}]},
    ],
    "interfaces": [
        {"name": "UI → Control commands", "interface_type": "API", "source_key": "ui", "target_key": "control",
         "description": "Operator commands flow from UI to the control loop.", "data_format": "JSON over IPC",
         "communication_method": "in-process queue", "safety_relevant": True,
         "data_flows": [{"data_name": "setpoint", "data_type": "float64", "frequency": "on-change", "criticality": "HIGH"}]},
        {"name": "Control → Data persistence", "interface_type": "DATA", "source_key": "control", "target_key": "data",
         "description": "Trend samples written to the local store.", "data_format": "Apache Arrow",
         "communication_method": "async file write", "safety_relevant": False,
         "data_flows": [{"data_name": "trend_sample", "data_type": "struct", "frequency": "1 Hz", "criticality": "MEDIUM"}]},
        {"name": "Data → Connectivity upload", "interface_type": "API", "source_key": "data", "target_key": "conn",
         "description": "Encrypted batch upload to the central server.", "data_format": "Protobuf over TLS",
         "communication_method": "HTTPS POST", "safety_relevant": False,
         "data_flows": [{"data_name": "encrypted_batch", "data_type": "bytes", "frequency": "every 5 min", "criticality": "LOW"}]},
    ],
    "design_elements": [
        {"item_name": "Display Renderer", "title": "Render Loop & Compositor",
         "description": "Double-buffered frame compositor.",
         "children": [{"title": "Dirty-Rect Tracker", "description": "Minimises redraw to changed regions."}]},
        {"item_name": "Control Loop", "title": "Sampled-Time Controller",
         "description": "Fixed-step PID with anti-windup.", "children": []},
        {"item_name": "Data Store", "title": "Trend Ring Buffer",
         "description": "Circular buffer with wear levelling.", "children": []},
        {"item_name": "Uplink Manager", "title": "Link Manager",
         "description": "Association FSM with reconnect guarantee.", "children": []},
    ],
}

PROJECT_TEMPLATES = [PATIENT_MONITOR, ELECTROSURGICAL, INFUSION_PUMP, HEMODIALYSIS, DEFIBRILLATOR]


def _template_for(project_name: str) -> dict:
    """Pick the device template whose `match` substrings appear in the project
    name (case-insensitive). Falls back to GENERIC_TEMPLATE."""
    name = project_name.lower()
    for tpl in PROJECT_TEMPLATES:
        if any(token in name for token in tpl["match"]):
            return tpl
    return GENERIC_TEMPLATE


async def _seed_design_elements(
    db: AsyncSession, proj: Project,
    item_by_name: dict[str, SWComponent], design_elements: list[dict],
) -> int:
    """Seed §5.4 detailed-design elements attached to the project's §5.3 ITEM
    components, tracing each top-level element to a SOFTWARE requirement."""
    sw_reqs = (await db.execute(
        select(Requirement)
        .where(Requirement.project_id == proj.id, Requirement.type == "SOFTWARE")
        .order_by(Requirement.readable_id)
    )).scalars().all()

    seq = 0
    for spec in design_elements:
        item = item_by_name.get(spec["item_name"])
        if not item:
            continue
        seq += 1
        parent_el = DesignElement(
            project_id=proj.id, component_id=item.id,
            readable_id=f"DET-{seq:03d}",
            title=spec["title"], description=spec["description"],
        )
        db.add(parent_el)
        await db.flush()
        if sw_reqs:
            req = sw_reqs[(seq - 1) % len(sw_reqs)]
            db.add(RequirementDesignLink(requirement_id=req.id, design_element_id=parent_el.id))
        for child in spec.get("children", []):
            seq += 1
            db.add(DesignElement(
                project_id=proj.id, component_id=item.id, parent_id=parent_el.id,
                readable_id=f"DET-{seq:03d}",
                title=child["title"], description=child["description"],
            ))
    await db.flush()
    return seq


# ── §5.5 software units ───────────────────────────────────────────────────────
#
# Units are derived from the project's lowest-level §5.3 components (UNIT type,
# falling back to ITEM). Each gets a code artifact (§5.5.1 implementation
# evidence), two passing unit test cases with coverage (§5.5.5 verification),
# and a trace link to a SOFTWARE requirement. Cycled metadata gives variety in
# language / safety class / lifecycle status across the seeded set.

_UNIT_LANGS    = ["C++", "Python", "Rust", "C", "Go"]
_UNIT_EXT      = {"C++": "cpp", "Python": "py", "Rust": "rs", "C": "c", "Go": "go"}
_UNIT_CLASSES  = ["C", "B", "C", "A", "B", "C"]
_UNIT_STATUSES = ["VERIFIED", "IMPLEMENTED", "VERIFIED", "DRAFT", "IMPLEMENTED", "VERIFIED"]


async def _seed_software_units(db: AsyncSession, proj: Project) -> int:
    """Seed §5.5 software units for one project. Idempotent — skips if the
    project already has units, so it can run independently of `_seed_one`."""
    existing = (await db.execute(
        select(SoftwareUnit).where(SoftwareUnit.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    # Prefer UNIT components; fall back to ITEM components for templates with none.
    comps = (await db.execute(
        select(SWComponent).where(
            SWComponent.project_id == proj.id, SWComponent.component_type == "UNIT",
        ).order_by(SWComponent.name)
    )).scalars().all()
    if not comps:
        comps = (await db.execute(
            select(SWComponent).where(
                SWComponent.project_id == proj.id, SWComponent.component_type == "ITEM",
            ).order_by(SWComponent.name)
        )).scalars().all()
    comps = comps[:6]
    if not comps:
        return 0

    sw_reqs = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == proj.id, Requirement.type == "SOFTWARE",
        ).order_by(Requirement.readable_id)
    )).scalars().all()

    proj_slug = "".join(c if c.isalnum() else "-" for c in proj.name.lower()).strip("-")[:40]
    repo_url = f"https://git.internal/medsoft/{proj_slug}"

    for i, comp in enumerate(comps):
        lang = _UNIT_LANGS[i % len(_UNIT_LANGS)]
        fname = "".join(c if c.isalnum() else "_" for c in comp.name.lower())[:40]
        file_path = f"src/{fname}.{_UNIT_EXT[lang]}"

        unit = SoftwareUnit(
            project_id=proj.id, component_id=comp.id,
            name=comp.name, description=comp.description,
            programming_language=lang, repository_url=repo_url, file_path=file_path,
            safety_class=_UNIT_CLASSES[i % len(_UNIT_CLASSES)],
            status=_UNIT_STATUSES[i % len(_UNIT_STATUSES)],
        )
        db.add(unit)
        await db.flush()

        # §5.5.1 — code artifact (implementation evidence)
        db.add(CodeArtifact(
            unit_id=unit.id, repository=repo_url, branch="main",
            commit_id=f"{(i + 1) * 1234567:07x}"[:7],
            file_path=file_path, version_tag="v1.0.0",
        ))

        # §5.5.5 — two unit test cases, each with a passing result + coverage.
        for j, (tt, suffix) in enumerate([
            ("FUNCTIONAL", "nominal behaviour"),
            ("BOUNDARY",   "boundary & fault handling"),
        ]):
            tc = UnitTestCase(
                unit_id=unit.id, name=f"{comp.name} — {suffix}",
                description=f"Verifies {comp.name} {'under nominal inputs' if j == 0 else 'at input boundaries and fault paths'}.",
                test_type=tt,
                expected_result="All assertions pass; no unhandled exceptions.",
            )
            db.add(tc)
            await db.flush()
            db.add(UnitTestResult(
                test_case_id=tc.id, result="PASS",
                logs=f"{tc.name}: 0 failures, 0 errors.",
                coverage_percentage=float(88 + (i + j) % 10),  # 88–97%
                executed_by="CI Pipeline (seeded)",
            ))

        if sw_reqs:
            db.add(UnitRequirementLink(
                unit_id=unit.id, requirement_id=sw_reqs[i % len(sw_reqs)].id,
            ))

    await db.flush()
    return len(comps)


# ── §5.6 integration tests ────────────────────────────────────────────────────
#
# One integration test per §5.3 interface — exercising the data flow / control
# path between the two components it connects. Each test gets a passing result
# (latency under threshold for TIMING tests, data-integrity PASS) and a trace
# link to a SOFTWARE requirement.

_ITC_TYPES = ["DATA_FLOW", "CONTROL", "TIMING", "ERROR_HANDLING", "DATA_FLOW", "REGRESSION"]


async def _seed_integration_tests(db: AsyncSession, proj: Project) -> int:
    """Seed §5.6 integration test cases for one project from its §5.3
    interfaces. Idempotent — skips if the project already has integration tests."""
    existing = (await db.execute(
        select(IntegrationTestCase).where(IntegrationTestCase.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    interfaces = (await db.execute(
        select(SWInterface).where(SWInterface.project_id == proj.id)
        .order_by(SWInterface.created_at)
    )).scalars().all()
    if not interfaces:
        return 0
    interfaces = interfaces[:6]

    sw_reqs = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == proj.id, Requirement.type == "SOFTWARE",
        ).order_by(Requirement.readable_id)
    )).scalars().all()

    for i, iface in enumerate(interfaces):
        test_type = _ITC_TYPES[i % len(_ITC_TYPES)]
        threshold = 50.0 if test_type == "TIMING" else None

        tc = IntegrationTestCase(
            project_id=proj.id, interface_id=iface.id,
            source_component_id=iface.source_component_id,
            target_component_id=iface.target_component_id,
            name=f"{iface.name} — integration test",
            description=f"Verifies the {iface.name} interface between its source and target components ({test_type.replace('_', ' ').lower()}).",
            test_type=test_type,
            preconditions="Both components built from the current architecture baseline and deployed to the integration environment.",
            test_steps=(
                f"1. Drive a representative payload across {iface.name}.\n"
                "2. Capture the data received at the target component.\n"
                "3. Compare against the expected contract; measure round-trip latency."
            ),
            expected_result="Payload arrives intact; data-integrity check passes; latency within threshold.",
            safety_relevance=iface.safety_relevant,
            latency_threshold_ms=threshold,
        )
        db.add(tc)
        await db.flush()

        db.add(IntegrationTestResult(
            test_case_id=tc.id, result="PASS",
            logs=f"{tc.name}: contract verified, 0 mismatches.",
            latency_ms=(threshold - 18.0) if threshold else None,  # comfortably under threshold
            data_integrity_check="PASS",
            executed_by="Integration CI (seeded)",
        ))

        if sw_reqs:
            db.add(ITCRequirementLink(
                itc_id=tc.id, requirement_id=sw_reqs[i % len(sw_reqs)].id,
            ))

    await db.flush()
    return len(interfaces)


# ── §5.7 system tests ─────────────────────────────────────────────────────────
#
# End-to-end system tests, one per SOFTWARE requirement — verifying the
# integrated software against the requirement. Each gets a passing result;
# safety-relevant tests also link a project hazard for traceability.

_ST_TYPES = ["FUNCTIONAL", "PERFORMANCE", "SAFETY", "USABILITY", "REGRESSION", "SECURITY"]


async def _seed_system_tests(db: AsyncSession, proj: Project) -> int:
    """Seed §5.7 system test cases for one project from its SOFTWARE
    requirements. Idempotent — skips if the project already has system tests."""
    existing = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    sw_reqs = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == proj.id, Requirement.type == "SOFTWARE",
        ).order_by(Requirement.readable_id)
    )).scalars().all()
    if not sw_reqs:
        return 0
    reqs = sw_reqs[:6]

    # Risks belong to requirements, not projects directly — join through.
    risks = (await db.execute(
        select(Risk).join(Requirement, Requirement.id == Risk.requirement_id)
        .where(Requirement.project_id == proj.id)
    )).scalars().all()

    for i, req in enumerate(reqs):
        test_type = _ST_TYPES[i % len(_ST_TYPES)]
        safety = test_type == "SAFETY" or i % 3 == 0

        tc = SystemTestCase(
            project_id=proj.id, requirement_id=req.id,
            name=f"System test — {req.readable_id} {(req.title or '')[:48]}".strip(),
            description=f"End-to-end system test verifying {req.readable_id} on the integrated software.",
            test_type=test_type,
            preconditions="Integrated software deployed to the system test environment from the current release build.",
            test_steps=(
                "1. Bring the device to the documented start state.\n"
                "2. Exercise the workflow described by the requirement.\n"
                "3. Observe and record system behaviour against the expected result."
            ),
            expected_result="System behaviour matches the requirement; no safety-relevant deviations observed.",
            safety_relevance=safety,
        )
        db.add(tc)
        await db.flush()

        db.add(SystemTestResult(
            test_case_id=tc.id, result="PASS",
            logs=f"{tc.name}: executed, requirement satisfied.",
            actual_result="Observed behaviour matched the expected result.",
            defects_found=None,
            executed_by="System Test Lead (seeded)",
        ))

        # Safety-relevant tests trace to a project hazard (ISO 14971 linkage).
        if safety and risks:
            db.add(STRiskLink(stc_id=tc.id, risk_id=risks[i % len(risks)].id))

    await db.flush()
    return len(reqs)


# ── §4.3 software items (safety classification) ───────────────────────────────
#
# A §4.3 classification tree per project: one SYSTEM item (the mandatory system
# classification) with SUBSYSTEM and UNIT children that either inherit the
# parent's class or — with a documented segregation justification — carry a
# lower one. Names mirror the §5.3 subsystem/unit components so the §4.3 and
# §5.3 decompositions stay recognisably aligned. Every item that sits below its
# parent's class carries a justification, so the data is valid under the
# inheritance rule enforced by the software_items router.

async def _seed_software_items(db: AsyncSession, proj: Project) -> int:
    """Seed the §4.3 software-safety-classification tree for one project.
    Idempotent — skips if the project already has software items."""
    existing = (await db.execute(
        select(SoftwareItem).where(SoftwareItem.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    sw_reqs = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == proj.id, Requirement.type == "SOFTWARE",
        ).order_by(Requirement.readable_id)
    )).scalars().all()
    risks = (await db.execute(
        select(Risk).join(Requirement, Requirement.id == Risk.requirement_id)
        .where(Requirement.project_id == proj.id)
    )).scalars().all()
    sub_comps = (await db.execute(
        select(SWComponent).where(
            SWComponent.project_id == proj.id, SWComponent.component_type == "SUBSYSTEM",
        ).order_by(SWComponent.name)
    )).scalars().all()
    unit_comps = (await db.execute(
        select(SWComponent).where(
            SWComponent.project_id == proj.id, SWComponent.component_type == "UNIT",
        ).order_by(SWComponent.name)
    )).scalars().all()

    def _link(item: SoftwareItem, req_idx: int | None = None, risk_idx: int | None = None) -> None:
        if sw_reqs and req_idx is not None:
            db.add(SoftwareItemRequirementLink(
                software_item_id=item.id, requirement_id=sw_reqs[req_idx % len(sw_reqs)].id))
        if risks and risk_idx is not None:
            db.add(SoftwareItemRiskLink(
                software_item_id=item.id, risk_id=risks[risk_idx % len(risks)].id))

    count = 0

    # SYSTEM root — IEC 62304 §4.3 mandatory system classification.
    system = SoftwareItem(
        project_id=proj.id, parent_id=None, item_type="SYSTEM",
        name=f"{proj.name} Software System",
        description="Top-level software system — the IEC 62304 §4.3 classification anchor.",
        safety_class="C", status="APPROVED",
        classification_justification=(
            "Software can contribute to a HAZARD resulting in serious injury or death; "
            "Class C assigned per worst-case hazard analysis (IEC 62304 §4.3)."),
    )
    db.add(system)
    await db.flush()
    count += 1
    _link(system, req_idx=0, risk_idx=0)

    # SUBSYSTEMs — first two inherit Class C, the third is segregated down to B.
    sub_specs = [
        ("C", "REVIEWED", None),
        ("C", "DRAFT", None),
        ("B", "REVIEWED",
         "Segregated from Class C functions by a verified software barrier; worst-case "
         "effect limited to non-serious injury — Class B (IEC 62304 §4.3, §5.3.5)."),
    ]
    subsystems: list[SoftwareItem] = []
    for i, (cls, status, just) in enumerate(sub_specs):
        name = sub_comps[i].name if i < len(sub_comps) else f"Subsystem {i + 1}"
        sub = SoftwareItem(
            project_id=proj.id, parent_id=system.id, item_type="SUBSYSTEM",
            name=name,
            description=f"{name} — software subsystem of the {proj.name} software system.",
            safety_class=cls, status=status, classification_justification=just,
        )
        db.add(sub)
        await db.flush()
        count += 1
        subsystems.append(sub)
        _link(sub, req_idx=i + 1, risk_idx=(i + 1) if cls == "C" else None)

    # UNITs under the Class C subsystem — one inherits C, two are segregated down.
    parent_sub = subsystems[0]
    unit_specs = [
        ("C", None),
        ("A", "No hazardous behaviour reachable from this unit; fully segregated from "
              "Class C paths — Class A (IEC 62304 §4.3)."),
        ("B", "Contributes only to non-serious-injury hazards behind a verified "
              "input-validation barrier — Class B (IEC 62304 §4.3)."),
    ]
    for j, (cls, just) in enumerate(unit_specs):
        name = unit_comps[j].name if j < len(unit_comps) else f"Unit {j + 1}"
        unit = SoftwareItem(
            project_id=proj.id, parent_id=parent_sub.id, item_type="UNIT",
            name=name,
            description=f"{name} — software unit of {parent_sub.name}.",
            safety_class=cls, status="DRAFT", classification_justification=just,
        )
        db.add(unit)
        await db.flush()
        count += 1
        _link(unit, req_idx=j + 4, risk_idx=j if cls == "C" else None)

    await db.flush()
    return count


# ── §5.8 release baselines ────────────────────────────────────────────────────
#
# For each release of a project: a configuration-baseline snapshot (IEC 62304
# §8.3 — retrievable history of configuration items) plus build / release-notes
# / SBOM artifacts. The snapshot freezes the project's configuration-item counts
# at release time; `capture_snapshot` regenerates a full one on demand.

async def _seed_release_baselines(db: AsyncSession, proj: Project) -> int:
    """Seed §5.8 release evidence — a configuration baseline snapshot + release
    artifacts for each of the project's releases. Idempotent — skips releases
    that already have a snapshot."""
    releases = (await db.execute(
        select(Release).where(Release.project_id == proj.id)
    )).scalars().all()
    if not releases:
        return 0

    async def _count(model, *where) -> int:
        return (await db.execute(
            select(func.count()).select_from(model).where(*where)
        )).scalar_one()

    # Project-wide configuration-item counts — captured once per project.
    counts = {
        "requirements":            await _count(Requirement, Requirement.project_id == proj.id),
        "software_items":          await _count(SoftwareItem, SoftwareItem.project_id == proj.id),
        "architecture_components": await _count(SWComponent, SWComponent.project_id == proj.id),
        "software_units":          await _count(SoftwareUnit, SoftwareUnit.project_id == proj.id),
        "integration_tests":       await _count(IntegrationTestCase, IntegrationTestCase.project_id == proj.id),
        "system_tests":            await _count(SystemTestCase, SystemTestCase.project_id == proj.id),
    }

    n = 0
    for rel in releases:
        existing = (await db.execute(
            select(ReleaseSnapshot).where(ReleaseSnapshot.release_id == rel.id)
        )).scalar_one_or_none()
        if existing:
            continue

        ri_count = await _count(ReleaseItem, ReleaseItem.release_id == rel.id)
        snapshot = {
            "release_version": rel.version,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "baseline_type": "seeded",
            "counts": {**counts, "release_items": ri_count},
        }
        db.add(ReleaseSnapshot(release_id=rel.id, snapshot_json=json.dumps(snapshot)))

        for atype, ref, label in [
            ("BUILD",         f"build-{rel.version}", f"Build pipeline output {rel.version} — reproducible, signed"),
            ("RELEASE_NOTES", f"RN-{rel.version}",
             f"Release notes {rel.version} — verified build; scope, fixed problems and "
             f"frozen configuration recorded in the release baseline snapshot (audit record)."),
            ("SBOM",          f"sbom-{rel.version}",  f"Software bill of materials {rel.version}"),
        ]:
            db.add(ReleaseArtifact(
                release_id=rel.id, artifact_type=atype,
                reference_id=ref, version=rel.version, label=label,
            ))
        n += 1

    await db.flush()
    return n


# ── §9 problem resolution / CAPA ──────────────────────────────────────────────
#
# Two closed problem reports per project, each with an identified root cause, a
# verified CAPA, and a link to a project hazard (ISO 14971 feedback loop). Kept
# CLOSED/VERIFIED so the project stays releasable through the CAPA release gate.

_CAPA_SPECS = [
    dict(title="Alarm tone inaudible above 80 dB ambient noise", source="TESTING",
         severity="HIGH", rc_type="DESIGN",
         rc="Alarm driver gain ceiling set too low for the specified noise environment.",
         action_type="CORRECTIVE",
         capa="Raise the alarm amplifier gain ceiling and re-verify against IEC 60601-1-8 audibility limits.",
         assignee="Firmware Team"),
    dict(title="Intermittent watchdog reset during extended procedures", source="FIELD",
         severity="CRITICAL", rc_type="CODE",
         rc="Watchdog service task starved under sustained high-priority interrupt load.",
         action_type="PREVENTIVE",
         capa="Re-prioritise the watchdog service task and add a sustained-load stress test to the integration suite.",
         assignee="Software Team"),
]


async def _seed_capa(db: AsyncSession, proj: Project) -> int:
    """Seed §9 problem reports + root causes + verified CAPAs for one project.
    Idempotent — skips if the project already has problem reports."""
    existing = (await db.execute(
        select(ProblemReport).where(ProblemReport.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    risks = (await db.execute(
        select(Risk).join(Requirement, Requirement.id == Risk.requirement_id)
        .where(Requirement.project_id == proj.id)
    )).scalars().all()

    for i, s in enumerate(_CAPA_SPECS):
        pr = ProblemReport(
            project_id=proj.id, title=s["title"],
            description=f"{s['title']} — reported via the {s['source'].lower()} channel; "
                        "investigated, root cause identified, corrective action verified effective.",
            source=s["source"], severity=s["severity"], status="CLOSED",
            reported_by="QA Engineer (seeded)",
        )
        db.add(pr)
        await db.flush()

        if risks:
            rk = risks[i % len(risks)]
            db.add(ProblemLink(
                problem_id=pr.id, linked_type="RISK", linked_id=str(rk.id),
                linked_name=(rk.hazard or "Linked hazard")[:200],
            ))
        db.add(RootCause(
            problem_id=pr.id, root_cause_type=s["rc_type"],
            description=s["rc"], identified_by="QA Engineer (seeded)",
        ))
        capa = CAPA(
            problem_id=pr.id, action_type=s["action_type"], description=s["capa"],
            assigned_to=s["assignee"], due_date=datetime.now(timezone.utc).date(),
            status="VERIFIED",
        )
        db.add(capa)
        await db.flush()
        db.add(CAPAVerification(
            capa_id=capa.id, verification_method="Re-test + design review",
            result="PASS", verified_by="QA Engineer (seeded)",
            notes="Corrective/preventive action verified effective; no recurrence observed.",
        ))

    await db.flush()
    return len(_CAPA_SPECS)


# ── §5.8 release sign-off (21 CFR Part 11 electronic signatures) ───────────────

async def _seed_esign(db: AsyncSession, proj: Project) -> int:
    """Seed REVIEW + APPROVAL electronic signatures on the project's
    APPROVED/RELEASED releases. Idempotent — skips releases already signed."""
    admin = (await db.execute(
        select(User).where(User.email == "admin@medsoft.local")
    )).scalar_one_or_none()
    reviewer = (await db.execute(
        select(User).where(User.email == "reviewer@medsoft.local")
    )).scalar_one_or_none()
    if not admin:
        return 0

    releases = (await db.execute(
        select(Release).where(Release.project_id == proj.id)
    )).scalars().all()

    n = 0
    for rel in releases:
        if rel.status not in (ReleaseStatus.APPROVED, ReleaseStatus.RELEASED):
            continue
        already = (await db.execute(
            select(ElectronicSignature).where(
                ElectronicSignature.entity_type == ESignEntityType.RELEASE,
                ElectronicSignature.entity_id == rel.id,
                ElectronicSignature.meaning == ESignMeaning.APPROVAL,
            )
        )).scalar_one_or_none()
        if already:
            continue

        if reviewer:
            db.add(ElectronicSignature(
                user_id=reviewer.id, entity_type=ESignEntityType.RELEASE,
                entity_id=rel.id, meaning=ESignMeaning.REVIEW, ip_address="10.0.0.21",
                comments=f"Reviewed release {rel.version} — V&V evidence and traceability complete.",
            ))
        db.add(ElectronicSignature(
            user_id=admin.id, entity_type=ESignEntityType.RELEASE,
            entity_id=rel.id, meaning=ESignMeaning.APPROVAL, ip_address="10.0.0.10",
            comments=f"Approved release {rel.version} for production per IEC 62304 §5.8.",
        ))
        n += 1

    await db.flush()
    return n


async def _seed_one(db: AsyncSession, proj: Project, template: dict) -> int:
    """Seed components + interfaces + data flows + design elements for one
    project from its device template. Returns the component count. Skips if
    the project already has components — idempotent re-runs don't duplicate."""
    existing = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == proj.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return 0

    # 1. SYSTEM (top-level, no parent)
    system = SWComponent(
        project_id=proj.id,
        name=f"{proj.name} System",
        description=f"Top-level software system for {proj.name}.",
        component_type="SYSTEM",
        safety_class="C",   # default safest for demo; project may rebaseline lower per real risk
        status="APPROVED",
        version="1.0",
        rationale="Software system as defined by the SDP for this medical device.",
    )
    db.add(system)
    await db.flush()

    # 2. SUBSYSTEMs + ITEMs + UNITs
    sub_by_key: dict[str, SWComponent] = {}
    item_by_name: dict[str, SWComponent] = {}
    for sub_spec in template["subsystems"]:
        sub = SWComponent(
            project_id=proj.id, parent_id=system.id,
            name=sub_spec["name"], description=sub_spec["description"],
            component_type="SUBSYSTEM", safety_class="C", status="APPROVED", version="1.0",
        )
        db.add(sub)
        await db.flush()
        sub_by_key[sub_spec["key"]] = sub

        for item_spec in sub_spec.get("items", []):
            item = SWComponent(
                project_id=proj.id, parent_id=sub.id,
                name=item_spec["name"], description=item_spec["description"],
                component_type="ITEM", safety_class="B", status="APPROVED", version="1.0",
            )
            db.add(item)
            await db.flush()
            item_by_name[item_spec["name"]] = item
            for unit_spec in item_spec.get("units", []):
                db.add(SWComponent(
                    project_id=proj.id, parent_id=item.id,
                    name=unit_spec["name"], description=unit_spec["description"],
                    component_type="UNIT", safety_class="A", status="APPROVED", version="1.0",
                ))

    await db.flush()
    all_components = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == proj.id)
    )).scalars().all()

    # 3. Interfaces + data flows
    for iface_spec in template["interfaces"]:
        src = sub_by_key.get(iface_spec["source_key"])
        tgt = sub_by_key.get(iface_spec["target_key"])
        if not src or not tgt:
            continue
        iface = SWInterface(
            project_id=proj.id,
            source_component_id=src.id, target_component_id=tgt.id,
            name=iface_spec["name"], description=iface_spec["description"],
            interface_type=iface_spec["interface_type"],
            data_format=iface_spec["data_format"],
            communication_method=iface_spec["communication_method"],
            safety_relevant=iface_spec["safety_relevant"],
        )
        db.add(iface)
        await db.flush()
        for f in iface_spec["data_flows"]:
            db.add(SWDataFlow(
                interface_id=iface.id,
                data_name=f["data_name"], data_type=f["data_type"],
                frequency=f["frequency"], criticality=f["criticality"],
                description=f.get("description"),
            ))
    await db.flush()

    # 4. §5.4 detailed-design elements attached to the §5.3 ITEM components.
    await _seed_design_elements(db, proj, item_by_name, template["design_elements"])

    return len(all_components)


async def main() -> None:
    bar = "=" * 65
    print(f"\n{bar}\n  Seeding per-device architecture + design + APPROVED baselines\n{bar}")
    async with Session() as db:
        projects = (await db.execute(select(Project).order_by(Project.created_at))).scalars().all()
        if not projects:
            print("✗ No projects found — run seed_comprehensive.py first.")
            return

        totals = {"components": 0, "items": 0, "units": 0, "itests": 0,
                  "stests": 0, "rbaselines": 0, "capa": 0, "esign": 0}
        baselines_created = 0

        async def _seed_phase6(proj: Project) -> dict:
            """Seed every post-architecture module for one project — idempotent,
            so it runs whether or not the components were just created."""
            return {
                "items":      await _seed_software_items(db, proj),
                "units":      await _seed_software_units(db, proj),
                "itests":     await _seed_integration_tests(db, proj),
                "stests":     await _seed_system_tests(db, proj),
                "rbaselines": await _seed_release_baselines(db, proj),
                "capa":       await _seed_capa(db, proj),
                "esign":      await _seed_esign(db, proj),
            }

        for proj in projects:
            template = _template_for(proj.name)
            n = await _seed_one(db, proj, template)

            if n == 0:
                # Components already exist — the post-architecture modules may
                # still be missing (each `_seed_*` is independently idempotent).
                added = await _seed_phase6(proj)
                for k, v in added.items():
                    totals[k] += v
                if any(added.values()):
                    print(f"  • {proj.name}: +{added['items']} software items, +{added['units']} units, "
                          f"+{added['itests']} integration tests, +{added['stests']} system tests, "
                          f"+{added['rbaselines']} release baselines, +{added['capa']} CAPA, "
                          f"+{added['esign']} e-signatures (components pre-existed)")
                else:
                    print(f"  • {proj.name}: skipped (already fully seeded)")
                continue
            totals["components"] += n

            # Defensive: clear any prior baseline before seeding the new one.
            existing_bl = (await db.execute(
                select(ArchitectureBaseline).where(ArchitectureBaseline.project_id == proj.id)
            )).scalars().all()
            for b in existing_bl:
                await db.delete(b)
            await db.flush()

            baseline = await seed_approved_architecture(db, project_id=proj.id, version="1.0")
            await db.flush()
            added = await _seed_phase6(proj)
            for k, v in added.items():
                totals[k] += v
            if baseline is not None:
                baselines_created += 1
                print(f"  ✓ {proj.name}: {n} components + {added['items']} software items + {added['units']} units "
                      f"+ {added['itests']} integration tests + {added['stests']} system tests "
                      f"+ {added['rbaselines']} release baselines + {added['capa']} CAPA + "
                      f"{added['esign']} e-signatures + Architecture v1.0 APPROVED")
            else:
                print(f"  ✗ {proj.name}: baseline did NOT create (unexpected)")

        await db.commit()

    print(f"\n{bar}")
    print(f"  Architecture seed complete — {baselines_created} project(s), {totals['components']} components, "
          f"{totals['items']} software items, {totals['units']} units, {totals['itests']} integration tests, "
          f"{totals['stests']} system tests, {totals['rbaselines']} release baselines, "
          f"{totals['capa']} CAPA reports, {totals['esign']} e-signatures")
    print(bar)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
