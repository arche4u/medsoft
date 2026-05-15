"""§7 Software Risk Management — sample data per project.

For every existing project, this seed:

  • Sets a varied risk_class on existing risks so the UI tabs / filter
    have data to show (most stay SAFETY; one becomes SECURITY for variety
    and one becomes SAFETY_SECURITY — the cross-cutting cyber-safety case).
  • Adds RiskContribution rows linking each project's risks to a few
    SoftwareItems and SWComponents (§7.1 — "which software contributes
    to this hazardous situation?").
  • Adds VerificationEvidence rows under existing RiskControls (§7.3 —
    closed-loop evidence): one SYSTEM_TEST evidence per VERIFIED control
    (or per IMPLEMENTED control, which also bumps it to VERIFIED).
  • Sets a couple of risks per project as `re_evaluation_required=True`
    with a realistic reason so the §7.4 inbox view has data to show.

Idempotent-ish: contributions and evidences use UNIQUE constraints; on
re-runs duplicates are skipped silently. risk_class re-assignment is
deterministic (first risk → SECURITY, second → SAFETY_SECURITY, rest →
SAFETY).

Usage:
    cd backend && source .venv/bin/activate && python seed_section7.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.platform.projects.model import Project
from app.modules.compliance.dev.requirements.model import Requirement
from app.modules.compliance.dev.software_items.model import SoftwareItem
from app.modules.compliance.dev.architecture.model import SWComponent
from app.modules.compliance.dev.system_testing.model import SystemTestCase
from app.modules.compliance.risk.risks.model import (
    Risk, RiskControl, RiskContribution, VerificationEvidence,
)
# Mapper-registration imports
import app.modules.platform.audit.model            # noqa: F401
import app.modules.compliance.dev.design.model     # noqa: F401
import app.modules.compliance.dev.units.model      # noqa: F401
import app.modules.compliance.dev.integration_tests.model  # noqa: F401
import app.modules.compliance.dev.validation.model      # noqa: F401
import app.modules.compliance.dev.sdp.model         # noqa: F401
import app.modules.compliance.config.config_mgmt.model  # noqa: F401
import app.modules.compliance.maintenance.feedback.model  # noqa: F401
import app.modules.compliance.problems.capa.model   # noqa: F401
import app.modules.compliance.release.model         # noqa: F401
import app.modules.compliance.change_control.model  # noqa: F401
import app.modules.compliance.plans.model           # noqa: F401
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


async def _seed_for_project(db: AsyncSession, project: Project) -> dict:
    """Seed §7 fixtures for a single project. Returns counts for reporting."""
    counts = {"risk_class_safety_security": 0, "risk_class_security": 0,
              "contributions": 0, "evidence": 0, "re_eval_flagged": 0}

    # Get project's risks (via its requirements)
    req_ids = (await db.execute(
        select(Requirement.id).where(Requirement.project_id == project.id)
    )).scalars().all()
    if not req_ids:
        return counts
    risks = (await db.execute(
        select(Risk).where(Risk.requirement_id.in_(req_ids)).order_by(Risk.id)
    )).scalars().all()
    if not risks:
        return counts

    # ── risk_class variety ─────────────────────────────────────────────────
    # First risk → SECURITY (pure cyber risk)
    # Second risk → SAFETY_SECURITY (cyber failure → safety hazard, AAMI TIR57)
    # The rest stay SAFETY.
    for idx, r in enumerate(risks):
        if idx == 0:
            r.risk_class = "SECURITY"
            counts["risk_class_security"] += 1
        elif idx == 1:
            r.risk_class = "SAFETY_SECURITY"
            counts["risk_class_safety_security"] += 1
        else:
            r.risk_class = "SAFETY"
    await db.flush()

    # ── §7.1 contributions ─────────────────────────────────────────────────
    software_items = (await db.execute(
        select(SoftwareItem).where(SoftwareItem.project_id == project.id)
    )).scalars().all()
    components = (await db.execute(
        select(SWComponent).where(SWComponent.project_id == project.id)
    )).scalars().all()

    for idx, r in enumerate(risks):
        # Link each risk to one SoftwareItem (rotating) and one SWComponent (rotating).
        if software_items:
            si = software_items[idx % len(software_items)]
            existing = (await db.execute(
                select(RiskContribution).where(
                    RiskContribution.risk_id == r.id,
                    RiskContribution.software_item_id == si.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(RiskContribution(
                    risk_id=r.id, software_item_id=si.id,
                    contribution_notes=f"§4.3 software item '{si.name}' (class {si.safety_class}) "
                                       f"can contribute to this hazardous situation by failing in any way.",
                ))
                counts["contributions"] += 1
        if components:
            comp = components[idx % len(components)]
            existing = (await db.execute(
                select(RiskContribution).where(
                    RiskContribution.risk_id == r.id,
                    RiskContribution.component_id == comp.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(RiskContribution(
                    risk_id=r.id, component_id=comp.id,
                    contribution_notes=f"§5.3 component '{comp.name}' implements behaviour relevant to this risk.",
                ))
                counts["contributions"] += 1
    await db.flush()

    # ── §7.2 controls + §7.3 evidence — rich fixtures for testing ──────────
    # We seed *varied* control + evidence combinations so QA / RA can
    # exercise every §7 feature in the UI without manual setup:
    #
    #   risk[0]  SECURITY        → 2 controls (PROTECTIVE + INFORMATION),
    #                              first VERIFIED, second still PROPOSED.
    #                              Demonstrates "not all controls verified."
    #   risk[1]  SAFETY_SECURITY → 3 controls covering all 3 ISO 14971 §6.2
    #                              types (INHERENT + PROTECTIVE + INFO),
    #                              with multi-evidence per control
    #                              (SYSTEM_TEST PASS + REVIEW PASS).
    #                              Demonstrates ISO 14971 hierarchy.
    #   risk[2]  SAFETY (HIGH)   → 2 controls, one with FAIL evidence first
    #                              (so it sits at IMPLEMENTED) plus a later
    #                              PASS (VERIFIED). Demonstrates the audit
    #                              trail of a failed-then-passing verification.
    #   risk[3..6]                → 1 control each, VERIFIED via SYSTEM_TEST.
    #   risk[7] (if exists)      → no controls — pure OPEN state, lets the
    #                              user see what a fresh risk looks like.

    all_risk_ids = [r.id for r in risks]
    existing_controls = (await db.execute(
        select(RiskControl).where(RiskControl.risk_id.in_(all_risk_ids))
    )).scalars().all()
    if existing_controls:
        # Re-runs: leave existing controls / evidence in place (idempotent).
        # Just record counts of what's there so the report is accurate.
        counts["controls"] = 0
        counts["evidence"] = 0
        for c in existing_controls:
            counts["controls"] += 0  # already counted on first run; skip
        return counts

    # Fetch supporting refs for realistic linkage
    sys_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.project_id == project.id)
    )).scalars().all()
    components_in_proj = components  # already fetched above

    def _ctrl(r: Risk, ctype: str, desc: str,
              status: str = "IMPLEMENTED",
              component=None, req_id=None, st=None) -> RiskControl:
        return RiskControl(
            risk_id=r.id,
            control_type=ctype,
            description=desc,
            component_id=component.id if component else None,
            requirement_id=req_id,
            system_test_id=st.id if st else None,
            implementation_status=status,
        )

    def _ev(control: RiskControl, evidence_type: str,
            result: str = "PASS",
            st: SystemTestCase | None = None,
            external_ref: str | None = None,
            days_ago: int = 5,
            notes: str | None = None,
            verified_by: str = "QA Engineer (seeded)") -> VerificationEvidence:
        return VerificationEvidence(
            control_id=control.id,
            evidence_type=evidence_type,
            system_test_id=st.id if st else None,
            external_reference=external_ref,
            result=result,
            notes=notes or f"§7.3 evidence recorded {days_ago}d ago.",
            verified_by=verified_by,
            verified_at=NOW - timedelta(days=days_ago),
        )

    a_test = sys_tests[0] if sys_tests else None
    b_test = sys_tests[1] if len(sys_tests) > 1 else a_test
    a_comp = components_in_proj[0] if components_in_proj else None
    b_comp = components_in_proj[1] if len(components_in_proj) > 1 else a_comp

    counts["controls"] = 0
    counts["evidence"] = 0

    # ── risk[0] SECURITY: 2 controls, first VERIFIED, second still PROPOSED ─
    if len(risks) > 0:
        r0 = risks[0]  # SECURITY
        c0a = _ctrl(r0, "PROTECTIVE_MEASURE",
                    "Role-based access control + session timeout. Mitigates unauthorized access "
                    "to safety-relevant configuration via the service interface.",
                    status="IMPLEMENTED", component=a_comp,
                    req_id=r0.requirement_id, st=a_test)
        c0b = _ctrl(r0, "INFORMATION_FOR_SAFETY",
                    "IFU section §7.2 — operators must log out after each session; service-mode "
                    "credentials are rotated quarterly.",
                    status="PROPOSED")  # deliberately unverified — for testing
        db.add(c0a); db.add(c0b)
        counts["controls"] += 2
        await db.flush()
        ev = _ev(c0a, "SYSTEM_TEST" if a_test else "REVIEW",
                 st=a_test, days_ago=10,
                 notes="Verified via penetration test scenario 'unauthorized service-mode access' — denied as expected.")
        db.add(ev); counts["evidence"] += 1
        c0a.implementation_status = "VERIFIED"

    # ── risk[1] SAFETY_SECURITY: 3 controls covering the §6.2 hierarchy ───
    if len(risks) > 1:
        r1 = risks[1]  # SAFETY_SECURITY
        c1a = _ctrl(r1, "INHERENT_SAFETY",
                    "Independent hardware safety interlock — cannot be defeated by any software "
                    "compromise (defence-in-depth per AAMI TIR57).",
                    status="IMPLEMENTED", component=a_comp,
                    req_id=r1.requirement_id, st=a_test)
        c1b = _ctrl(r1, "PROTECTIVE_MEASURE",
                    "Cryptographic integrity check on configuration tables at boot. If the "
                    "signature fails, the device enters safe-state and alerts the operator.",
                    status="IMPLEMENTED", component=b_comp,
                    st=b_test)
        c1c = _ctrl(r1, "INFORMATION_FOR_SAFETY",
                    "User-facing alert ribbon when integrity check fails. Operator IFU explains "
                    "the response procedure.",
                    status="IMPLEMENTED")
        db.add(c1a); db.add(c1b); db.add(c1c)
        counts["controls"] += 3
        await db.flush()
        # Multiple evidence per control — demonstrates the multi-evidence list
        db.add(_ev(c1a, "SYSTEM_TEST" if a_test else "REVIEW", st=a_test,
                   days_ago=14, notes="Independent interlock validated under fault injection."))
        db.add(_ev(c1a, "REVIEW",
                   external_ref="Design review record DR-2026-031, signed by 3 reviewers",
                   days_ago=20))
        db.add(_ev(c1b, "SYSTEM_TEST" if b_test else "REVIEW", st=b_test,
                   days_ago=12, notes="Integrity check verified with intentionally-corrupted config."))
        db.add(_ev(c1c, "INSPECTION",
                   external_ref="Usability inspection report 2026-04-02",
                   days_ago=8, notes="Alert ribbon visible from typical operator distance, in expected lighting."))
        counts["evidence"] += 4
        c1a.implementation_status = "VERIFIED"
        c1b.implementation_status = "VERIFIED"
        c1c.implementation_status = "VERIFIED"

    # ── risk[2] SAFETY HIGH: 2 controls, one with FAIL-then-PASS history ──
    if len(risks) > 2:
        r2 = risks[2]
        c2a = _ctrl(r2, "PROTECTIVE_MEASURE",
                    "Runtime range check on critical parameter — triggers safe-state and alarms "
                    "if out of bounds. Reviewed against expected operational envelope.",
                    status="IMPLEMENTED", component=a_comp,
                    req_id=r2.requirement_id, st=a_test)
        c2b = _ctrl(r2, "PROTECTIVE_MEASURE",
                    "Watchdog timer with safe-state on missed heartbeat.",
                    status="IMPLEMENTED", component=b_comp,
                    st=b_test)
        db.add(c2a); db.add(c2b)
        counts["controls"] += 2
        await db.flush()
        # FAIL evidence first (control stayed IMPLEMENTED via the failed run)
        db.add(_ev(c2a, "SYSTEM_TEST" if a_test else "REVIEW", result="FAIL", st=a_test,
                   days_ago=20,
                   notes="Initial verification: range check missed a corner case (negative-zero "
                         "boundary). Reported as PR-2026-004; fix verified by re-test below.",
                   verified_by="Tester Engineer (seeded)"))
        # …then PASS (flips control to VERIFIED)
        db.add(_ev(c2a, "SYSTEM_TEST" if a_test else "REVIEW", result="PASS", st=a_test,
                   days_ago=4,
                   notes="Re-test after PR-2026-004 fix: range check correctly rejects the corner case."))
        db.add(_ev(c2b, "SYSTEM_TEST" if b_test else "REVIEW", st=b_test, days_ago=6))
        counts["evidence"] += 3
        c2a.implementation_status = "VERIFIED"
        c2b.implementation_status = "VERIFIED"

    # ── risk[3..6] SAFETY: single control, simple VERIFIED via SYSTEM_TEST ─
    for idx, r in enumerate(risks[3:7] if len(risks) > 3 else [], start=3):
        ctype = "PROTECTIVE_MEASURE"
        ctrl = _ctrl(r, ctype,
                     f"Runtime guard for {r.hazard.lower()[:60]}. Detects the hazardous condition "
                     "and triggers a safe-state transition with operator alert.",
                     status="IMPLEMENTED", component=a_comp,
                     req_id=r.requirement_id, st=a_test)
        db.add(ctrl); counts["controls"] += 1
        await db.flush()
        ev = _ev(ctrl, "SYSTEM_TEST" if a_test else "REVIEW",
                 st=a_test, days_ago=5 + idx)
        db.add(ev); counts["evidence"] += 1
        ctrl.implementation_status = "VERIFIED"

    # ── risk[7+] SAFETY: NO controls at all → demo of OPEN state ──────────
    # (Intentionally leaving these without controls so the user can see what
    # a fresh, untouched risk looks like.)

    await db.flush()

    # ── §7.4 re-evaluation flag (two risks per project) ───────────────────
    # Mark the first two risks as needing re-eval with a realistic reason.
    for idx, r in enumerate(risks[:2]):
        r.re_evaluation_required = True
        r.re_evaluation_reason = (
            f"Auto-flagged on {NOW.strftime('%Y-%m-%d')} after CR 'Foot-pedal latency fix' "
            "was approved with modifies_released_software=true. Verify the risk score still "
            "holds under the modified behaviour."
        )
        r.re_evaluation_triggered_at = NOW - timedelta(days=2)
        if r.status == "ACCEPTED":
            r.status = "RE_EVALUATION_REQUIRED"
        counts["re_eval_flagged"] += 1
    await db.flush()
    return counts


async def main() -> None:
    print("\n" + "=" * 65)
    print("  Seeding IEC 62304 §7 sample data per project")
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
            print(f"      risk_class: 1 SECURITY · 1 SAFETY_SECURITY · rest SAFETY")
            print(f"      §7.1 contributions added: {counts['contributions']}")
            print(f"      §7.2 controls added:      {counts.get('controls', 0)}")
            print(f"      §7.3 evidence rows added: {counts['evidence']}")
            print(f"      §7.4 risks flagged for re-eval: {counts['re_eval_flagged']}")

    print("=" * 65)
    print("  §7 seed complete — open /risks and check the Re-eval Inbox tab.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
