"""
Master seed script — run this single file to populate a fresh database.

Steps executed (order matters):
  1. seed_comprehensive.py — wipes DB; seeds 5 IEC 62304 projects with full base
                             data (requirements, risks, test cases, releases,
                             documents, config management, change requests …).
                             Also wipes users/roles/permissions — MUST run first.
  2. seed_phase4.py        — users (admin / qa / qara / dev / tester / reviewer)
                             + RBAC roles & permissions + training records. Runs
                             before step 3 so architecture's e-signature seeding
                             can resolve real user accounts.
  3. seed_architecture.py  — per project: §5.3 components/interfaces + APPROVED
                             Architecture v1.0, §4.3 software items, §5.4 design
                             elements, §5.5 units, §5.6 integration tests, §5.7
                             system tests, §5.8 release baselines + artifacts,
                             §9 CAPA, and release e-signatures.
  4. seed_section6.py      — §6 Software Maintenance: APPROVED Maintenance Plan
                             v1.0 per project, feedback items across every
                             lifecycle state + all 8 built-in channels +
                             a custom-channel example, ProblemReport / Change
                             Request escalation chains, and §6.2.5 user +
                             regulator notification audit trail on each
                             RELEASED version.
  5. seed_section7.py      — §7 Software Risk Management deepening: assigns
                             a varied risk_class (SAFETY / SECURITY /
                             SAFETY_SECURITY) for cyber-readiness, adds §7.1
                             RiskContribution rows linking risks to §4.3
                             SoftwareItems + §5.3 SWComponents, records §7.3
                             VerificationEvidence on existing RiskControls
                             (auto-flipping them to VERIFIED), and flags
                             two risks per project as §7.4 re-evaluation
                             required so the inbox view has data.
  6. seed_section89.py     — §4.4 Legacy Software declaration (one demo
                             project marked has_legacy_software=true with
                             two flagged items + APPROVED Legacy Software
                             Plan v1.0; others get the "no legacy" N/A
                             statement). §8.2.2 SOUP register: 5 typical
                             SOUP entries per project (openssl / libcurl /
                             FreeRTOS / zlib / mbedTLS). §9.6 problem-
                             trend variety: 4 extra ProblemReports per
                             project with 1-2 RootCauses spread across
                             types so the TrendAnalysisPanel renders.

Not seeded — generated on demand: DHF documents (POST /dhf/generate/{project_id}).

Usage:
    cd backend && source .venv/bin/activate
    python seed_all.py
"""
import subprocess
import sys
import time

STEPS = [
    {
        "script": "seed_comprehensive.py",
        "label":  "Comprehensive project data (5 projects, all base modules)",
    },
    {
        "script": "seed_phase4.py",
        "label":  "Users, roles, RBAC permissions & training records",
    },
    {
        "script": "seed_architecture.py",
        "label":  "Architecture, §4.3–§5.8 modules, CAPA & release e-signatures",
    },
    {
        "script": "seed_section6.py",
        "label":  "§6 Software Maintenance: Plans, feedback intake, escalations, notifications",
    },
    {
        "script": "seed_section7.py",
        "label":  "§7 Software Risk Management: contributions (§7.1), evidence (§7.3), re-eval flags (§7.4)",
    },
    {
        "script": "seed_section89.py",
        "label":  "§4.4 Legacy + §8.2.2 SOUP register + §9.6 problem-trend variety",
    },
]

BAR = "=" * 65

def run(script: str, label: str) -> bool:
    print(f"\n{BAR}")
    print(f"  Running: {script}")
    print(f"  {label}")
    print(BAR)
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, script],
        capture_output=False,   # stream output directly to terminal
    )
    elapsed = time.time() - t0
    if result.returncode != 0:
        print(f"\n✗ {script} FAILED (exit {result.returncode}) after {elapsed:.1f}s")
        return False
    print(f"\n✓ {script} completed in {elapsed:.1f}s")
    return True


def main():
    print(f"\n{BAR}")
    print("  MedSoft — Full Database Seed")
    print(BAR)

    for step in STEPS:
        ok = run(**step)
        if not ok:
            print(f"\n✗ Seed aborted at {step['script']}. Fix the error above and re-run.\n")
            sys.exit(1)

    print(f"\n{BAR}")
    print("  ALL STEPS COMPLETE")
    print(BAR)
    print("""
  5 IEC 62304 projects loaded:
    • Patient Vital Signs Monitor      (UI · LED · Alarms)
    • Electrosurgical Generator        (RF Control · Software)
    • Smart Drug Infusion Pump v2      (Alarms · LED · Control)
    • Hemodialysis Machine             (Control · UI · Alarms)
    • Automated External Defibrillator (LED · Alarms · Control)

  Each project includes:
    §5.2  10 USER / 10 SYSTEM / 15 SOFTWARE requirements · 8 risks
    §4.3  software items (safety-classification tree)
    §5.3  architecture components + interfaces + APPROVED v1.0 baseline
    §5.4  design elements linked to architecture components
    §5.5  software units + code artifacts + unit tests
    §5.6  integration test cases + results
    §5.7  system test cases + results
    §5.8  releases + configuration-baseline snapshots + artifacts + e-signatures
    §6.1  APPROVED Software Maintenance Plan v1.0 (11 sections, §6.1 a–f)
    §6.2  Feedback intake (5–7 items per project across all 8 channels) with
          ProblemReport (§6.2.2) + ChangeRequest (§6.2.3) escalation chains
    §6.2.5 user + regulator notification audit trail on every RELEASED version
    §9    CAPA / problem reports with verified corrective actions
    V&V   15 test cases + executions · validation records · change requests
    §8    config management items + baselines · 34 documents

  Generate on demand (not seeded): DHF — POST /dhf/generate/{project_id}

  Default login credentials:
    admin@medsoft.local    / Admin@123      [ADMIN]
    qa@medsoft.local       / Qa@123456      [QA]
    qara@medsoft.local     / Qara@123456    [QARA]
    dev@medsoft.local      / Dev@123456     [DEVELOPER]
    tester@medsoft.local   / Test@123456    [TESTER]
    reviewer@medsoft.local / Review@123     [REVIEWER]
""")


if __name__ == "__main__":
    main()
