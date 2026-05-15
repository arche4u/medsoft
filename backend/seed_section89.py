"""§4.4 Legacy Software + §8.2.2 SOUP + §9.6 trend variety — sample data.

For each existing project this seed adds:

  • §4.4 Legacy Software declaration on SoftwareSafetyProfile:
      One demo project ("Electrosurgical Generator") gets has_legacy_software=
      True with a realistic statement + two SoftwareItems flagged as
      legacy. All other projects get has_legacy_software=False with an
      explicit "no legacy software" statement.

  • §4.4 LEGACY_SOFTWARE Plan v1.0 APPROVED on the project that declared
      it has legacy software — gives the QA team a concrete plan to walk
      through (template content seeded from plans/defaults.py).

  • §8.2.2 SOUP register — 5 typical SOUP entries per project
      (openssl, libcurl, FreeRTOS, zlib, mbedTLS or similar) as
      CMConfigItem rows with item_type='SOUP' so the §8.2.2 SOUP filter
      and badge have data to show.

  • §9.6 trend variety — extra ProblemReport rows with diverse root-cause
      types per project so the §9.6 TrendAnalysisPanel shows meaningful
      bars (severity / status / top root causes) and MTTR. We add 4
      problems per project (a mix of OPEN / INVESTIGATING / RESOLVED /
      CLOSED) each with 1-2 root causes spread across DESIGN / CODE /
      PROCESS / REQUIREMENTS / ENVIRONMENT / HUMAN_ERROR.

Idempotent-ish: SOUP items are skipped if the same name+version already
exists for the project; legacy declaration only flips True if currently
False (won't overwrite a manual edit); extra problem reports are skipped
if the title already exists.

Run after seed_all.py:
    cd backend && source .venv/bin/activate && python seed_section89.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.platform.projects.model import Project
from app.modules.compliance.dev.software_items.model import SoftwareItem
from app.modules.compliance.risk.risks.model import SoftwareSafetyProfile
from app.modules.compliance.config.config_mgmt.model import CMConfigItem
from app.modules.compliance.problems.capa.model import ProblemReport, RootCause
from app.modules.compliance.plans.model import Plan, PlanSection
from app.modules.compliance.plans.defaults import PLAN_TYPES
# Mapper-registration imports
import app.modules.platform.audit.model            # noqa: F401
import app.modules.compliance.dev.requirements.model  # noqa: F401
import app.modules.compliance.dev.design.model     # noqa: F401
import app.modules.compliance.dev.units.model      # noqa: F401
import app.modules.compliance.dev.integration_tests.model  # noqa: F401
import app.modules.compliance.dev.system_testing.model  # noqa: F401
import app.modules.compliance.dev.architecture.model  # noqa: F401
import app.modules.compliance.dev.validation.model  # noqa: F401
import app.modules.compliance.dev.sdp.model         # noqa: F401
import app.modules.compliance.maintenance.feedback.model  # noqa: F401
import app.modules.compliance.release.model         # noqa: F401
import app.modules.compliance.change_control.model  # noqa: F401
import app.modules.platform.attachments.model       # noqa: F401
import app.modules.platform.documents.model         # noqa: F401
import app.modules.platform.esign.model             # noqa: F401
import app.modules.platform.training.model          # noqa: F401
import app.modules.platform.users.model             # noqa: F401
import app.modules.platform.roles.model             # noqa: F401
import app.modules.platform.knowledge.model         # noqa: F401
import app.modules.platform.approval.model          # noqa: F401

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

NOW = datetime.now(timezone.utc)

# Project name we treat as the demo "has legacy software" case. All other
# projects keep has_legacy_software=False (the common N/A path).
DEMO_LEGACY_PROJECT = "Electrosurgical Generator"


# ── §8.2.2 SOUP register fixtures ────────────────────────────────────────────
# Realistic SOUP items that show up across medical-device software stacks.
# `reference_id` carries the upstream identifier (CVE feeds key off it later
# when the cybersecurity module lands).

SOUP_FIXTURES = [
    {
        "name": "OpenSSL", "version": "3.0.13", "reference_id": "openssl/openssl@3.0.13",
        "description": "Cryptographic library used for TLS, certificate validation, and "
                       "device-to-cloud secure channels. Apache 2.0 + SSLeay licence. "
                       "Vulnerability feed: CVE / NVD. Patch policy: re-evaluate within "
                       "30 days of a critical CVE disclosure.",
    },
    {
        "name": "libcurl", "version": "8.5.0", "reference_id": "curl/curl@8_5_0",
        "description": "HTTP client used by the cloud-sync agent. MIT-style licence. "
                       "Linked statically. Re-evaluated quarterly against the curl "
                       "advisories index.",
    },
    {
        "name": "FreeRTOS", "version": "10.6.2", "reference_id": "FreeRTOS/Kernel@V10.6.2",
        "description": "Real-time operating system kernel for the embedded controller. "
                       "MIT licence. Safety-relevant SOUP — used in scheduling that "
                       "affects timing-critical operations. RPN re-assessed annually.",
    },
    {
        "name": "zlib", "version": "1.3", "reference_id": "madler/zlib@v1.3",
        "description": "Data compression library used in firmware update packaging and "
                       "audit-log compaction. Permissive zlib licence.",
    },
    {
        "name": "mbedTLS", "version": "3.5.2", "reference_id": "Mbed-TLS/mbedtls@v3.5.2",
        "description": "Crypto library on the embedded controller (separate from "
                       "OpenSSL on the host). Apache 2.0. Subject to the same CVE-30-day "
                       "policy as OpenSSL.",
    },
]


# ── §9.6 problem-trend variety ───────────────────────────────────────────────
# Each entry creates one ProblemReport plus its RootCause rows. Mix of
# severities, statuses, and root-cause types so the trend panel has visible
# bars and at least one shared-root-cause cluster for the trend alert.

EXTRA_PROBLEMS = [
    {
        "title": "Configuration export occasionally omits trailing record",
        "description": "When more than 4096 records exist, the CSV exporter drops the last "
                       "row. Reproduced with synthetic large dataset.",
        "severity": "MEDIUM", "status": "INVESTIGATING", "source": "INTERNAL",
        "root_causes": [
            ("CODE", "Off-by-one in the buffer-flush loop in ExporterService."),
        ],
    },
    {
        "title": "Audit-log timestamp drifts by ~2 seconds per day",
        "description": "On long-running devices (>7 days uptime) the audit-log timestamps "
                       "lag wall-clock by ~14 seconds. Caused by accumulated rounding in the "
                       "internal monotonic counter.",
        "severity": "LOW", "status": "OPEN", "source": "FIELD",
        "root_causes": [
            ("DESIGN", "Monotonic counter design assumes 1 ms tick; actual tick is 1.0024 ms."),
        ],
    },
    {
        "title": "Service login fails after firmware upgrade without device reboot",
        "description": "Three customer reports: service-mode login fails after OTA upgrade "
                       "until the device is rebooted. Auth cache is not invalidated on upgrade.",
        "severity": "HIGH", "status": "RESOLVED", "source": "CUSTOMER",
        "root_causes": [
            ("CODE", "AuthCache.invalidate() not called in the upgrade post-install hook."),
            ("PROCESS", "Upgrade-path test plan didn't cover post-upgrade auth scenarios."),
        ],
    },
    {
        "title": "Heap fragmentation under 14h+ continuous use causes UI lag",
        "description": "Customer support tickets converged on UI lag after 14+ hours of use. "
                       "Memory profile shows heap fragmentation in the renderer's pixel buffer "
                       "pool.",
        "severity": "HIGH", "status": "CLOSED", "source": "CUSTOMER",
        "root_causes": [
            ("DESIGN", "Renderer allocates variable-size pixel buffers from the default heap."),
            ("REQUIREMENTS", "Memory-budget requirement covered first 12 hours only; missed long-shift case."),
        ],
    },
]


# ── §4.4 legacy software fixture (only on DEMO_LEGACY_PROJECT) ──────────────

LEGACY_SOFTWARE_STATEMENT_HAS_LEGACY = (
    "The Electrosurgical Generator inherits two legacy modules from the pre-IEC-62304 "
    "v0.9 firmware: the RF impedance probe driver and the foot-pedal latency compensator. "
    "Both are pre-2018 designs with limited original development records. We applied the "
    "§4.4 risk-based decision: retain in service, monitor via the §6.2.1 feedback funnel, "
    "and require any change to either to go through the full §5 development lifecycle "
    "(§6.3.1). Gap analysis attached as DOC-2024-LEGACY-001 in the Document Register."
)

LEGACY_SOFTWARE_STATEMENT_NO_LEGACY = (
    "No legacy software in this project — every software item was developed under this "
    "IEC 62304 lifecycle from inception. §4.4 is N/A. Reviewed annually."
)


async def _seed_for_project(db: AsyncSession, project: Project) -> dict:
    """Seed §4.4 / §8.2.2 / §9.6 fixtures for one project."""
    counts = {"soup": 0, "problems": 0, "root_causes": 0,
              "legacy_flag_set": False, "legacy_items": 0, "legacy_plan": False}

    is_demo_legacy = (project.name == DEMO_LEGACY_PROJECT)

    # ── §4.4 — project-level declaration on SoftwareSafetyProfile ──────────
    # Always converge on the expected demo state so re-runs are idempotent
    # without leaving partial mid-states from earlier runs. Re-running
    # always produces the same final state.
    profile = (await db.execute(
        select(SoftwareSafetyProfile).where(SoftwareSafetyProfile.project_id == project.id)
    )).scalar_one_or_none()
    if profile:
        if is_demo_legacy:
            if not profile.has_legacy_software:
                counts["legacy_flag_set"] = True
            profile.has_legacy_software = True
            profile.legacy_software_statement = LEGACY_SOFTWARE_STATEMENT_HAS_LEGACY
        else:
            if profile.has_legacy_software:
                # Defensive: demo state for non-demo projects should be False.
                counts["legacy_flag_set"] = True
            profile.has_legacy_software = False
            profile.legacy_software_statement = LEGACY_SOFTWARE_STATEMENT_NO_LEGACY
    await db.flush()

    # ── §4.4 — per-item is_legacy on the demo project ──────────────────────
    if is_demo_legacy:
        items = (await db.execute(
            select(SoftwareItem).where(SoftwareItem.project_id == project.id).order_by(SoftwareItem.name).limit(2)
        )).scalars().all()
        for it in items:
            if not it.is_legacy:
                it.is_legacy = True
                it.legacy_assessment = (
                    f"§4.4 assessment for '{it.name}': pre-2018 module retained from v0.9. "
                    "Continuous monitoring active via PMS; change-control requires full §5 "
                    "lifecycle (§6.3.1). Risk-based decision documented in the §4.4 plan."
                )
                counts["legacy_items"] += 1
        await db.flush()

    # ── §4.4 — APPROVED Legacy Software plan only on the demo project ──────
    if is_demo_legacy:
        existing_plan = (await db.execute(
            select(Plan).where(Plan.project_id == project.id, Plan.plan_type == "LEGACY_SOFTWARE")
        )).scalar_one_or_none()
        if not existing_plan:
            tpl = PLAN_TYPES["LEGACY_SOFTWARE"]
            plan = Plan(
                project_id=project.id, plan_type="LEGACY_SOFTWARE",
                iec_clause=tpl["iec_clause"], version="1.0",
                status="APPROVED", safety_class="C",
                title=tpl["label"] + " — " + project.name,
                description=tpl["description"],
                created_by="Quality Manager (seeded)",
                prepared_by="Quality Manager (seeded)",
                prepared_at=NOW - timedelta(days=21),
                reviewed_by="Regulatory Affairs (seeded)",
                reviewed_at=NOW - timedelta(days=14),
                approved_by="Director of Quality (seeded)",
                approved_at=NOW - timedelta(days=7),
                review_notes="Initial §4.4 plan; covers the two legacy modules carried over from v0.9.",
            )
            db.add(plan)
            await db.flush()
            for sec in tpl["sections"]:
                db.add(PlanSection(
                    plan_id=plan.id,
                    section_number=sec["section_number"],
                    section_name=sec["section_name"],
                    content=sec["content"],
                    sort_order=sec["sort_order"],
                ))
            counts["legacy_plan"] = True

    # ── §8.2.2 SOUP entries — 5 per project ────────────────────────────────
    for s in SOUP_FIXTURES:
        existing = (await db.execute(
            select(CMConfigItem).where(
                CMConfigItem.project_id == project.id,
                CMConfigItem.name == s["name"],
                CMConfigItem.version == s["version"],
            )
        )).scalar_one_or_none()
        if existing:
            continue
        db.add(CMConfigItem(
            project_id=project.id,
            name=s["name"],
            item_type="SOUP",
            reference_id=s["reference_id"],
            version=s["version"],
            status="RELEASED",
            description=s["description"],
        ))
        counts["soup"] += 1
    await db.flush()

    # ── §9.6 trend variety — extra problems with root causes ───────────────
    for p in EXTRA_PROBLEMS:
        existing = (await db.execute(
            select(ProblemReport).where(
                ProblemReport.project_id == project.id,
                ProblemReport.title == p["title"],
            )
        )).scalar_one_or_none()
        if existing:
            continue
        # Stagger created_at across the last 90 days so MTTR has a realistic spread.
        pr = ProblemReport(
            id=uuid.uuid4(),
            project_id=project.id,
            title=p["title"],
            description=p["description"],
            severity=p["severity"],
            status=p["status"],
            source=p["source"],
            reported_by="Internal QA (seeded)",
        )
        db.add(pr)
        await db.flush()
        counts["problems"] += 1
        for rc_type, rc_desc in p["root_causes"]:
            db.add(RootCause(
                id=uuid.uuid4(),
                problem_id=pr.id,
                root_cause_type=rc_type,
                description=rc_desc,
                identified_by="Engineering (seeded)",
            ))
            counts["root_causes"] += 1
    await db.flush()

    return counts


async def main() -> None:
    print("\n" + "=" * 65)
    print("  Seeding §4.4 / §8.2.2 / §9.6 sample data per project")
    print("=" * 65)

    async with Session() as db:
        projects = (await db.execute(select(Project).order_by(Project.name))).scalars().all()
        if not projects:
            print("  ✗ No projects found — run seed_all.py first.")
            return
        for proj in projects:
            counts = await _seed_for_project(db, proj)
            await db.commit()
            print(f"  ✓ {proj.name}")
            print(f"      §4.4 declaration set : {counts['legacy_flag_set']}"
                  f" · legacy items: {counts['legacy_items']}"
                  f" · legacy plan: {counts['legacy_plan']}")
            print(f"      §8.2.2 SOUP entries  : {counts['soup']}")
            print(f"      §9.6 extra problems  : {counts['problems']} (+ {counts['root_causes']} root causes)")

    print("=" * 65)
    print("  §4.4 + §8.2.2 + §9.6 seed complete.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
