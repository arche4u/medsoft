# CAPA / Problem Resolution (§9)

When a feedback item or internal observation is determined to be a **problem**, it flows into the §9 problem-resolution process: a Problem Report → Root Cause analysis → CAPA (Corrective And Preventive Action) → Verification.

**Docs → Problem Resolution → CAPA**

## Problem Reports

A **Problem Report** is the formal record of a confirmed problem. Each carries:

- **Title** — short description (prefixed `[FB-NNN]` if the problem originated from a feedback item — §6.2.2 provenance).
- **Description** — full problem narrative (includes the §6.2.1.3 safety impact assessment if escalated from feedback).
- **Severity** — LOW / MEDIUM / HIGH / CRITICAL.
- **Source** — where the problem came from (mirrors the feedback channel, or INTERNAL for internally-found problems).
- **Reported by** — name + role.
- **Related release** — optional link to the affected release version.
- **Status** — OPEN → INVESTIGATING → RESOLVED → CLOSED.

## Add a problem report

`+ New Problem Report`. Fields above. Click **Create**.

Most problem reports arrive **automatically** via the [Feedback Intake](06-feedback.md) escalation workflow rather than being created manually.

## Linked items (ProblemLink)

Each problem report can link to:

- **Requirements** — what's affected.
- **Risks** — ISO 14971 risks impacted.
- **Test cases** — affected system / integration / unit tests.
- **Components** — architecture components implicated.
- **Configuration items** — CM items affected.

Add links from the problem detail panel.

## Root cause analysis

Open a problem report → tab **Root Causes** → `+ Add Root Cause`:

- **Root cause type**:
  - DESIGN — design flaw.
  - CODE — implementation bug.
  - PROCESS — process gap (review missed, test missing).
  - REQUIREMENTS — requirement was wrong or missing.
  - ENVIRONMENT — environmental / external factor.
  - HUMAN_ERROR — user / operator error.
- **Description** — what the root cause is.
- **Identified by** — name + role.

A problem can have multiple root causes (e.g. DESIGN + PROCESS).

## CAPAs (Corrective And Preventive Actions)

For each root cause, define one or more corrective / preventive actions:

`+ Add CAPA`:

- **Action type** — CORRECTIVE (fix the specific instance) or PREVENTIVE (prevent recurrence).
- **Description** — what will be done.
- **Assigned to** — owner.
- **Due date** — target completion.
- **Status** — OPEN → IN_PROGRESS → COMPLETED → VERIFIED.

## CAPA Verifications

When a CAPA is COMPLETED, it must be VERIFIED before the parent problem report can be CLOSED:

CAPA detail → `+ Add Verification`:

- **Verification method** — TEST / REVIEW / AUDIT / INSPECTION.
- **Result** — PASS / FAIL.
- **Evidence link** — URL or reference to verification record.
- **Verified by** — name + role.
- **Notes**.

Adding a verification with PASS moves the CAPA status to VERIFIED.

## Closing a problem report

A problem report can move to CLOSED only when:

- It has at least one root cause.
- It has at least one CAPA.
- All CAPAs are status=VERIFIED.

Otherwise the **Close** button is disabled.

## Pre-release CAPA gate

Before a Release can move to RELEASED, the platform calls a **CAPA release-check** that blocks publication if:

- Any problem report is OPEN or INVESTIGATING.
- Any CAPA is OPEN or IN_PROGRESS.
- Any CAPA is COMPLETED but not yet VERIFIED.

Resolve all open CAPAs (or accept the residual risk explicitly via §7) before publishing the release.

## §9 Problem Resolution Plan

The plan template covers:

1. Purpose and Scope
2. Problem Reporting — channels + intake (links to §6.2.1)
3. Problem Analysis — process for root cause analysis
4. Corrective and Preventive Action — CAPA workflow
5. Verification of Corrective Actions — methods + acceptance
6. Trend Analysis — threshold criteria for declaring trend (links to §6.1(b))
7. Roles and Responsibilities

**Docs → IEC 62304 Plans → Problem Resolution Plan (§9)** to view / edit.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Software problem resolution process | §9 |
| Prepare problem reports | §9.1 |
| Investigate the problem | §9.2 (linked to §7 safety re-evaluation) |
| Advise relevant parties | §9.3 |
| Use change-control process for changes | §9.4 + §6.2.4 |
| Maintain records | §9.5 (via audit log) |
| Analyse problems for trends | §9.6 + §6.1(b) |
| Verify software problem resolution | §9.7 (CAPA verification) |
| Test documentation contents | §9.8 |
