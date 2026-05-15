"""§6 Software Maintenance Process — sample data per project.

Seeds, for every project that already exists:
  • One APPROVED Maintenance Plan v1.0 (§6.1) using the default template.
  • A realistic mix of FeedbackItems (§6.2.1) across all 5 lifecycle states:
      NEW · UNDER_REVIEW · EVALUATED (closed, not a problem) ·
      EVALUATED + escalated → ProblemReport (§6.2.2) ·
      EVALUATED + escalated → ChangeRequest (§6.2.3) · CLOSED.
  • §6.2.5 user-notification record on the project's RELEASED version, where
    one exists, so the audit trail shows a post-release communication.

Idempotent-ish: deletes pre-existing feedback for each project before
seeding, so re-runs don't accumulate. Maintenance Plans are skipped if a
v1.0 already exists for the project. Designed to run after seed_all.py.

Usage:
    cd backend && source .venv/bin/activate && python seed_section6.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.platform.projects.model import Project
from app.modules.compliance.plans.model import Plan, PlanSection
from app.modules.compliance.plans.defaults import PLAN_TYPES
from app.modules.compliance.maintenance.feedback.model import FeedbackItem
from app.modules.compliance.problems.capa.model import ProblemReport
from app.modules.compliance.change_control.model import ChangeRequest, ChangeRequestState
from app.modules.compliance.release.model import Release, ReleaseStatus
# ── Mapper-registration imports (forces relationship resolution at module load) ─
import app.modules.platform.audit.model            # noqa: F401
import app.modules.compliance.dev.requirements.model  # noqa: F401
import app.modules.compliance.risk.risks.model     # noqa: F401
import app.modules.compliance.dev.system_testing.model  # noqa: F401
import app.modules.compliance.dev.architecture.model    # noqa: F401
import app.modules.compliance.dev.design.model     # noqa: F401
import app.modules.compliance.dev.units.model      # noqa: F401
import app.modules.compliance.dev.integration_tests.model  # noqa: F401
import app.modules.compliance.dev.software_items.model  # noqa: F401
import app.modules.compliance.dev.validation.model      # noqa: F401
import app.modules.compliance.dev.sdp.model         # noqa: F401
import app.modules.compliance.config.config_mgmt.model  # noqa: F401
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


# ── Feedback recipes per project type ────────────────────────────────────────
# The first 5 entries are the lifecycle archetypes — every project gets these
# (with project-specific text). Index 6+ is extra context-specific colour.

def _feedback_recipes(project_name: str) -> list[dict]:
    """Return realistic feedback rows for a given project name. Each row is a
    dict of FeedbackItem kwargs plus a `lifecycle` hint that the seeder uses
    to drive the state machine."""
    p = project_name.lower()

    # Per-project tailored summaries — they map to realistic medical-device
    # post-market reports rather than generic placeholders.
    if "electrosurgical" in p:
        return [
            dict(lifecycle="NEW", source="CUSTOMER_SUPPORT", reporter="Dr. Wells — Cleveland Clinic",
                 summary="Foot-pedal latency >200ms on RF power start under heavy bus load",
                 description="During high-density tissue cut, RF output lagged pedal press by ~250ms. Reproducible on bench when bus is at 80%+ load.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True),
            dict(lifecycle="UNDER_REVIEW", source="FIELD_SERVICE", reporter="Field Engineer Tokyo",
                 summary="Impedance probe reading drift after 4h continuous use",
                 description="Probe calibration drifts ±8% from baseline once unit has been running 4+ hours. Customer reports needing recalibration mid-procedure.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True),
            dict(lifecycle="CLOSED_NOT_PROBLEM", source="CUSTOMER_SUPPORT", reporter="Surgeon — Brazil",
                 summary="Spanish/Portuguese UI translation request",
                 description="Customer asking for localized UI as part of LATAM rollout.",
                 affected_version="v1.0.0", severity="COSMETIC"),
            dict(lifecycle="ESCALATE_PROBLEM", source="VIGILANCE", reporter="EU Vigilance Office",
                 summary="2 unintended thermal events reported in EU between 2026-Q1 and 2026-Q2",
                 description="Mandatory vigilance reports: 2 cases where lateral thermal spread exceeded expected envelope. No serious harm but bordering on §62366 use-error category.",
                 affected_version="v1.0.0", severity="SAFETY", adverse_event=True, spec_deviation=True,
                 safety_impact="Lateral thermal spread above intended envelope may injure adjacent tissue. RSK-007 (thermal injury) needs re-evaluation."),
            dict(lifecycle="ESCALATE_CHANGE", source="PMCF", reporter="Post-Market Clinical Follow-up Team",
                 summary="Clinician request: configurable pre-coag warm-up time per tissue type",
                 description="PMCF surveys consistently request a per-tissue pre-coag profile. Currently single global setting. Affects efficacy not safety.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=False,
                 safety_impact="No direct safety risk — feature gap."),
            dict(lifecycle="CLOSED", source="REGULATORY", reporter="FDA pre-submission feedback",
                 summary="FDA request for additional cybersecurity vulnerability disclosure documentation",
                 description="Closed via Q1 2026 cybersecurity-disclosure update; documentation submitted and accepted.",
                 affected_version="v1.0.0", severity="MAJOR"),
        ]

    if "vital signs" in p or "monitor" in p:
        return [
            dict(lifecycle="NEW", source="CUSTOMER_SUPPORT", reporter="ICU charge nurse — St. Mary's",
                 summary="Touchscreen unresponsive after 14+ hour continuous use",
                 description="Reports of touchscreen becoming unresponsive after long shifts. Power cycle restores function. Suspect heap fragmentation.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True),
            dict(lifecycle="UNDER_REVIEW", source="VIGILANCE", reporter="Vigilance officer — DE",
                 summary="Alarm escalation timing drift when battery <30%",
                 description="Critical-alarm escalation from 65→85 dB takes ~75 s instead of spec 60 s when battery is below 30%.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True),
            dict(lifecycle="CLOSED_NOT_PROBLEM", source="CUSTOMER_SUPPORT", reporter="Pediatric ward — Boston",
                 summary="Request: pediatric-mode default alarm thresholds",
                 description="Customer asking for a built-in pediatric preset.",
                 affected_version="v1.0.0", severity="COSMETIC"),
            dict(lifecycle="ESCALATE_PROBLEM", source="PMCF", reporter="PMCF team — cardiology cohort",
                 summary="False high-HR alarm on patients with pacemaker spikes",
                 description="Cardiology PMCF shows ~3% false-positive rate on pacemaker patients. RSK-004 (false alarm fatigue) re-evaluation needed.",
                 affected_version="v1.0.0", severity="SAFETY", adverse_event=True, spec_deviation=True,
                 safety_impact="False alarm fatigue could lead clinicians to silence real alarms. Patient-safety concern."),
            dict(lifecycle="ESCALATE_CHANGE", source="FIELD_SERVICE", reporter="Field engineer EMEA",
                 summary="Wi-Fi reconnect time after roaming >30 s",
                 description="When central station roams between APs, reconnect takes 30–45 s. Customers want this <10 s.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True,
                 safety_impact="During reconnect gap, central-station view is stale; bedside alarms continue normally."),
        ]

    if "infusion" in p or "pump" in p:
        return [
            dict(lifecycle="NEW", source="CUSTOMER_SUPPORT", reporter="Onc ward — Lyon",
                 summary="Air-in-line sensor false positive during priming",
                 description="Sensor trips during normal priming with 0.9% saline. Workaround: lower priming speed.",
                 affected_version="v1.0.0", severity="MAJOR"),
            dict(lifecycle="UNDER_REVIEW", source="CUSTOMER_SUPPORT", reporter="Pharmacy",
                 summary="Drug library update takes >10 minutes",
                 description="Library push from server to ~200 pumps takes ~12 minutes; pharmacy needs faster turnaround.",
                 affected_version="v1.0.0", severity="MAJOR"),
            dict(lifecycle="CLOSED_NOT_PROBLEM", source="FIELD_SERVICE", reporter="Field engineer",
                 summary="Battery icon shows full when at 60% charge",
                 description="Cosmetic — actual battery monitoring is correct; only the icon LUT is off.",
                 affected_version="v1.0.0", severity="MINOR"),
            dict(lifecycle="ESCALATE_PROBLEM", source="VIGILANCE", reporter="Vigilance officer — UK",
                 summary="Bolus over-delivery when door closed during programming",
                 description="Edge case: closing the door at exactly the wrong programming step delivers an extra ~5% bolus.",
                 affected_version="v1.0.0", severity="SAFETY", adverse_event=True, spec_deviation=True,
                 safety_impact="Bolus over-delivery is a Class C hazard. Immediate field safety notice required."),
            dict(lifecycle="ESCALATE_CHANGE", source="REGULATORY", reporter="EU Notified Body",
                 summary="Notified-body query on free-flow protection logic",
                 description="EU NB asking for updated free-flow protection state diagram and verification evidence under MDR §17.2.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True,
                 safety_impact="No new hazard, but documentation gap could delay re-certification."),
        ]

    if "hemodialysis" in p or "dialysis" in p:
        return [
            dict(lifecycle="NEW", source="FIELD_SERVICE", reporter="Service tech — Hong Kong",
                 summary="Conductivity readings drift after 4 h run-time",
                 description="Conductivity sensor output drifts ~5% by hour 4. Calibration recovers it; suspecting sensor drift coefficient.",
                 affected_version="v1.0.0", severity="MAJOR", spec_deviation=True),
            dict(lifecycle="UNDER_REVIEW", source="CUSTOMER_SUPPORT", reporter="Clinical IT",
                 summary="Treatment summary export to EMR sometimes truncated",
                 description="Long treatments (5h+) sometimes produce truncated HL7 export. Suspecting buffer overflow.",
                 affected_version="v1.0.0", severity="MINOR"),
            dict(lifecycle="CLOSED_NOT_PROBLEM", source="FIELD_SERVICE", reporter="Service tech",
                 summary="Cleaning-cycle audible alert too quiet in noisy ward",
                 description="Customer-config issue — alert volume can be raised in service menu.",
                 affected_version="v1.0.0", severity="MINOR"),
            dict(lifecycle="ESCALATE_PROBLEM", source="INTERNAL", reporter="QA — internal test",
                 summary="Blood leak detector latency exceeds 5 s spec on red-tinted dialysate",
                 description="Internal QA discovered that red-dye dialysate (used for some flush protocols) defeats the optical leak detector for up to 8 s.",
                 affected_version="v1.0.0", severity="SAFETY", spec_deviation=True,
                 safety_impact="Latency in blood-leak detection delays alarm — direct patient safety. RSK-005 needs re-evaluation."),
            dict(lifecycle="ESCALATE_CHANGE", source="PMCF", reporter="Renal-care PMCF",
                 summary="Add support for citrate anticoagulant protocol",
                 description="Major hospitals moving to citrate over heparin. Need protocol library entry + safety interlock review.",
                 affected_version="v1.0.0", severity="MAJOR",
                 safety_impact="New protocol introduces new hazardous situations (citrate accumulation) that require fresh risk analysis."),
        ]

    # AED / catch-all — also seeds the 3 channels that aren't hit by the
    # other 4 projects (LITERATURE, SOCIAL_MEDIA, OTHER-custom) so the
    # collective sample exercises every channel in FEEDBACK_SOURCES + one
    # custom (free-text) example to demonstrate the open-vocabulary field.
    return [
        dict(lifecycle="NEW", source="VIGILANCE", reporter="EU vigilance",
             summary="Voice prompt volume drops after device unused >60 days",
             description="Two reports of low audio output during use when device sat in storage 60+ days. Battery self-test passed.",
             affected_version="v1.0.0", severity="MAJOR", adverse_event=True),
        dict(lifecycle="UNDER_REVIEW", source="FIELD_SERVICE", reporter="Field service",
             summary="QR-code event log scanner unreliable in low light",
             description="Service technicians report ~20% scan failure in dim utility-closet storage spots.",
             affected_version="v1.0.0", severity="MINOR"),
        dict(lifecycle="CLOSED_NOT_PROBLEM", source="SOCIAL_MEDIA", reporter="Twitter / X mention",
             summary="Public-access AED found in non-operational state — viral post",
             description="Tweet about a public-access AED in a train station that wouldn't power on. Investigation: the unit had been disconnected from mains by station staff; nothing to do with the software.",
             affected_version="v1.0.0", severity="MINOR"),
        dict(lifecycle="ESCALATE_PROBLEM", source="VIGILANCE", reporter="Vigilance officer",
             summary="Self-test reports OK but battery actually depleted in 2 cases",
             description="Two reports of self-test passing while the actual battery had insufficient charge for a shock. Possible state-of-charge estimator bug.",
             affected_version="v1.0.0", severity="SAFETY", adverse_event=True, spec_deviation=True,
             safety_impact="A non-functional AED in an emergency is a direct safety hazard. RSK-002 (battery status) needs re-evaluation."),
        dict(lifecycle="ESCALATE_CHANGE", source="PMCF", reporter="PMCF — public-access AED programme",
             summary="Add Bluetooth low-energy beacon for asset tracking",
             description="Cities deploying public-access AEDs are asking for periodic BLE pings so the asset-tracking app can verify the device is in place.",
             affected_version="v1.0.0", severity="MAJOR",
             safety_impact="Feature addition; no direct safety hazard but enhances readiness assurance."),
        dict(lifecycle="UNDER_REVIEW", source="LITERATURE", reporter="Resus journal — Q1 2026",
             summary="Recent paper recommends 5s pre-shock pause vs. our 3s",
             description="2026 ERC guideline draft suggests a longer pre-shock pause to reduce inappropriate-shock rate. Worth a literature-driven update review.",
             affected_version="v1.0.0", severity="MAJOR"),
        dict(lifecycle="NEW", source="STAKEHOLDER_INTERVIEW", reporter="Customer Advisory Board Q1",
             summary="Customer council asks for clearer end-of-life indicator",
             description="Custom 'STAKEHOLDER_INTERVIEW' channel — non-built-in. Validates the open-vocabulary source field for project-specific feedback streams.",
             affected_version="v1.0.0", severity="MINOR"),
    ]


async def _seed_maintenance_plan(db: AsyncSession, project: Project) -> str:
    """Create an APPROVED Maintenance Plan v1.0 for the project, using the
    template in defaults.py. Returns 'created' / 'skipped' / 'error' for
    reporting."""
    existing = (await db.execute(
        select(Plan).where(
            Plan.project_id == project.id,
            Plan.plan_type == "MAINTENANCE",
        )
    )).scalars().first()
    if existing:
        return "skipped"

    tpl = PLAN_TYPES["MAINTENANCE"]
    plan = Plan(
        project_id=project.id,
        plan_type="MAINTENANCE",
        iec_clause=tpl["iec_clause"],
        version="1.0",
        status="APPROVED",
        safety_class="C",
        title=tpl["label"] + " — " + project.name,
        description=tpl["description"],
        created_by="Quality Manager (seeded)",
        prepared_by="Quality Manager (seeded)",
        prepared_at=NOW - timedelta(days=14),
        reviewed_by="Regulatory Affairs (seeded)",
        reviewed_at=NOW - timedelta(days=7),
        approved_by="Director of Quality (seeded)",
        approved_at=NOW - timedelta(days=3),
        review_notes="Initial maintenance plan; covers §6.1 (a-f) per IEC 62304.",
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
    return "created"


async def _seed_feedback_for_project(db: AsyncSession, project: Project) -> dict:
    """Wipe existing feedback for this project, then seed the realistic
    lifecycle mix. Returns counts by terminal state for reporting."""
    # Clear pre-existing feedback so re-runs stay idempotent.
    await db.execute(delete(FeedbackItem).where(FeedbackItem.project_id == project.id))
    await db.flush()

    recipes = _feedback_recipes(project.name)
    counts: dict[str, int] = {}
    for idx, r in enumerate(recipes, start=1):
        readable_id = f"FB-{idx:03d}"
        lifecycle = r["lifecycle"]
        fb = FeedbackItem(
            project_id=project.id,
            readable_id=readable_id,
            source=r["source"],
            reporter=r.get("reporter"),
            reported_at=NOW - timedelta(days=20 - idx),
            summary=r["summary"],
            description=r.get("description"),
            affected_version=r.get("affected_version"),
            severity=r.get("severity", "MINOR"),
            adverse_event=r.get("adverse_event", False),
            spec_deviation=r.get("spec_deviation", False),
            status="NEW",
        )
        db.add(fb)
        await db.flush()

        # ── Drive the state machine in-place (mirrors what the router does
        # via /evaluate, /escalate, /close — but we hard-set the fields here
        # because we're seeding, not exercising the API.) ──────────────────
        if lifecycle == "NEW":
            counts["NEW"] = counts.get("NEW", 0) + 1

        elif lifecycle == "UNDER_REVIEW":
            fb.status = "UNDER_REVIEW"
            counts["UNDER_REVIEW"] = counts.get("UNDER_REVIEW", 0) + 1

        elif lifecycle == "CLOSED_NOT_PROBLEM":
            # Evaluated → decided NOT a problem → closed.
            fb.status = "CLOSED"
            fb.is_problem = False
            fb.evaluation_notes = "Evaluated; determined not to be a defect or safety issue."
            fb.evaluated_by = "QA Engineer (seeded)"
            fb.evaluated_at = NOW - timedelta(days=10 - idx)
            fb.change_needed = False
            fb.closure_rationale = "Out of scope or user-configurable behaviour; no action required."
            counts["CLOSED"] = counts.get("CLOSED", 0) + 1

        elif lifecycle == "ESCALATE_PROBLEM":
            # Evaluate → confirmed problem → escalate to ProblemReport (§6.2.2).
            fb.status = "EVALUATED"
            fb.is_problem = True
            fb.evaluation_notes = "Confirmed defect; risk to released software."
            fb.evaluated_by = "QA Engineer (seeded)"
            fb.evaluated_at = NOW - timedelta(days=8 - idx)
            fb.safety_impact_assessment = r.get("safety_impact")
            fb.change_needed = True

            sev_map = {"COSMETIC": "LOW", "MINOR": "LOW", "MAJOR": "HIGH", "SAFETY": "CRITICAL"}
            safety_block = (f"\n\n— §6.2.1.3 safety impact assessment —\n{r['safety_impact']}"
                            if r.get("safety_impact") else "")
            pr = ProblemReport(
                project_id=project.id,
                title=f"[{readable_id}] {r['summary']}",
                description=(r.get("description") or "") + safety_block,
                severity=sev_map.get(r.get("severity", "MINOR"), "MEDIUM"),
                source=r["source"],
                reported_by=r.get("reporter"),
                status="INVESTIGATING",
            )
            db.add(pr)
            await db.flush()
            fb.escalated_problem_id = pr.id
            fb.status = "ESCALATED"
            counts["ESCALATED_PR"] = counts.get("ESCALATED_PR", 0) + 1

        elif lifecycle == "ESCALATE_CHANGE":
            # Evaluate → confirmed → escalate to ChangeRequest (§6.2.3).
            fb.status = "EVALUATED"
            fb.is_problem = True
            fb.evaluation_notes = "Confirmed enhancement / fix needed in next release cycle."
            fb.evaluated_by = "QA Engineer (seeded)"
            fb.evaluated_at = NOW - timedelta(days=6 - idx)
            fb.safety_impact_assessment = r.get("safety_impact")
            fb.change_needed = True

            cr = ChangeRequest(
                project_id=project.id,
                title=f"[CR ← {readable_id}] {r['summary']}",
                description=r.get("description"),
                status=ChangeRequestState.IMPACT_ANALYSIS,
                modifies_released_software=True,
                # Pre-populate the §6.2.3 fields so the CR is APPROVED-ready.
                effect_on_organization=(
                    "Engineering: ~3 sprints for design + verification. QARA: re-baseline SRS "
                    "and re-issue Technical File. Customer Support: prepare advisory + update "
                    "training materials. Production: OTA push planned with v1.1.0."
                ),
                effect_on_released_software=(
                    "Targets the §5.5 unit identified in the originating feedback "
                    f"({readable_id}). Re-verification of §5.5/§5.6 + new §5.7 system tests "
                    "required. Backward-compatible upgrade path planned."
                ),
                effect_on_interfacing_systems=(
                    "No protocol changes to EMR/HL7/FHIR interfaces. Existing accessories and "
                    "service tooling unaffected. Customer training manual update only."
                ),
            )
            db.add(cr)
            await db.flush()
            fb.escalated_change_request_id = cr.id
            fb.status = "ESCALATED"
            counts["ESCALATED_CR"] = counts.get("ESCALATED_CR", 0) + 1

        elif lifecycle == "CLOSED":
            # Already-resolved item (e.g. regulator query closed).
            fb.status = "CLOSED"
            fb.is_problem = True
            fb.evaluation_notes = "Resolved through existing process."
            fb.evaluated_by = "QA Engineer (seeded)"
            fb.evaluated_at = NOW - timedelta(days=5 - idx)
            fb.change_needed = False
            fb.closure_rationale = "Resolved; documentation submitted and accepted."
            counts["CLOSED"] = counts.get("CLOSED", 0) + 1

    return counts


async def _seed_release_notification(db: AsyncSession, project: Project) -> bool:
    """Record §6.2.5 user-notification on the project's RELEASED release.
    Returns True if a release was annotated."""
    rel = (await db.execute(
        select(Release).where(
            Release.project_id == project.id,
            Release.status == ReleaseStatus.RELEASED,
        ).order_by(Release.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if not rel:
        return False
    rel.user_notification_sent = True
    rel.user_notification_summary = (
        f"Release v{rel.version} of {project.name} published. Field-safety notice issued via "
        "customer email + distributor portal. OTA update available; older firmware remains "
        "supported for 90 days. Customers asked to acknowledge receipt within 14 days."
    )
    rel.user_notified_at = NOW - timedelta(days=2)
    rel.regulator_notification_sent = True
    rel.regulator_notification_summary = (
        "Submitted change summary + safety impact evaluation to relevant Notified Body and "
        "FDA pre-submission inbox per §6.2.5 / MDR §92. Acknowledgement received."
    )
    rel.regulator_notified_at = NOW - timedelta(days=1)
    return True


async def main() -> None:
    print("\n" + "=" * 65)
    print("  Seeding IEC 62304 §6 sample data per project")
    print("=" * 65)

    async with Session() as db:
        projects = (await db.execute(select(Project).order_by(Project.name))).scalars().all()
        if not projects:
            print("  ✗ No projects found — run seed_all.py first.")
            return

        for proj in projects:
            plan_state = await _seed_maintenance_plan(db, proj)
            fb_counts = await _seed_feedback_for_project(db, proj)
            notif = await _seed_release_notification(db, proj)
            await db.commit()
            tally = ", ".join(f"{k}:{v}" for k, v in sorted(fb_counts.items()))
            notif_tag = "✓ §6.2.5 notification" if notif else "— no RELEASED version"
            print(f"  ✓ {proj.name}")
            print(f"      §6.1 Maintenance Plan: {plan_state}")
            print(f"      §6.2.1 Feedback: {sum(fb_counts.values())} items ({tally})")
            print(f"      {notif_tag}")

    print("=" * 65)
    print("  §6 seed complete — log in and visit /feedback to see the data.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
