"""
Master seed script — run this single file to populate a fresh database.

Steps executed:
  1. seed_comprehensive.py  — wipes DB; seeds 5 IEC 62304 projects with full data
  2. seed_phase4.py         — adds 4 users (admin / qa / dev / reviewer) + RBAC roles + training

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
        "label":  "Comprehensive project data (5 projects, all modules)",
    },
    {
        "script": "seed_phase4.py",
        "label":  "Users, roles & training records",
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
    10 USER / 10 SYSTEM / 15 SOFTWARE requirements
    15 test cases + 15 test executions
    8 risks · 4 arch + 8 detailed design elements
    5 validation records · 3 change requests · 2 releases

  Default login credentials:
    admin@medsoft.local    / Admin@123    [ADMIN]
    qa@medsoft.local       / Qa@123456    [QA]
    dev@medsoft.local      / Dev@123456   [DEVELOPER]
    reviewer@medsoft.local / Review@123   [REVIEWER]
""")


if __name__ == "__main__":
    main()
