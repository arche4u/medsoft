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

    # ── §7.2 controls — add one per risk if missing ────────────────────────
    # Existing seeds focus on hazard analysis (§7.1) and accept residual risk
    # but don't seed the §7.2 risk-control measures themselves. Add a
    # PROTECTIVE_MEASURE control per risk so the evidence loop below has
    # something to attach to. Real projects fill these out manually based
    # on their actual design decisions; this is just demo data.
    all_risk_ids = [r.id for r in risks]
    existing_controls = (await db.execute(
        select(RiskControl).where(RiskControl.risk_id.in_(all_risk_ids))
    )).scalars().all()
    risks_with_controls = {c.risk_id for c in existing_controls}
    counts["controls"] = 0
    for r in risks:
        if r.id in risks_with_controls:
            continue
        # Vary the control type to demonstrate the ISO 14971 §6.2 hierarchy.
        if r.risk_class == "SECURITY":
            ctype, desc = "PROTECTIVE_MEASURE", \
                "Authentication + authorization layer (PROTECTIVE_MEASURE per ISO 14971 §6.2). " \
                "Mitigates the security risk by restricting access to authorized roles."
        elif r.risk_class == "SAFETY_SECURITY":
            ctype, desc = "INHERENT_SAFETY", \
                "Defence-in-depth design: independent safety interlock that cannot be defeated " \
                "by a security compromise (INHERENT_SAFETY per ISO 14971 §6.2)."
        else:
            ctype, desc = "PROTECTIVE_MEASURE", \
                "Runtime guard with alarm (PROTECTIVE_MEASURE per ISO 14971 §6.2). " \
                "Detects the hazardous condition and triggers a safe-state transition."
        ctrl = RiskControl(
            risk_id=r.id,
            control_type=ctype,
            description=desc,
            implementation_status="IMPLEMENTED",  # bumped to VERIFIED below when evidence lands
            verification_notes=None,
        )
        db.add(ctrl)
        counts["controls"] += 1
    await db.flush()

    # ── §7.3 verification evidence ─────────────────────────────────────────
    # For each RiskControl, add a SYSTEM_TEST evidence row with PASS →
    # flips control to VERIFIED. Skips if evidence already exists (idempotent).
    controls = (await db.execute(
        select(RiskControl).where(RiskControl.risk_id.in_(all_risk_ids))
    )).scalars().all()
    sys_tests = (await db.execute(
        select(SystemTestCase).where(SystemTestCase.project_id == project.id).limit(1)
    )).scalars().all()
    a_test = sys_tests[0] if sys_tests else None

    for c in controls:
        existing = (await db.execute(
            select(VerificationEvidence).where(VerificationEvidence.control_id == c.id).limit(1)
        )).scalar_one_or_none()
        if existing:
            continue
        ev = VerificationEvidence(
            control_id=c.id,
            evidence_type="SYSTEM_TEST" if a_test else "REVIEW",
            system_test_id=a_test.id if a_test else None,
            external_reference=None if a_test else "Internal design review minutes 2026-03-12 — verified by 2 reviewers",
            result="PASS",
            notes="§7.3 verification recorded; control demonstrated effective via the linked test.",
            verified_by="QA Engineer (seeded)",
            verified_at=NOW - timedelta(days=5),
        )
        db.add(ev)
        counts["evidence"] += 1
        c.implementation_status = "VERIFIED"
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
