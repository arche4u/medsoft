# Architecture

## Two-layer module split

The backend separates **what makes the platform work** from **what makes it regulated**. Every module belongs to exactly one of two top-level packages:

```
backend/app/modules/
├── platform/               ← cross-cutting infrastructure
│   ├── auth/                  JWT login, password hashing
│   ├── users/                 User accounts
│   ├── roles/                 Role + Permission + RolePermission (RBAC)
│   ├── audit/                 AuditLog + audit() service helper
│   ├── esign/                 ElectronicSignature (21 CFR Part 11)
│   ├── training/              TrainingRecord
│   ├── attachments/           Generic file attachments
│   ├── ai/                    Anthropic Claude API integration
│   ├── knowledge/             KnowledgeEntry (standards reference library)
│   ├── documents/             Document Register (SOP / Plans / Technical)
│   ├── approval/              Generic approval workflow
│   └── projects/              Multi-project anchor
│
└── compliance/             ← regulated process modules
    ├── dev/                   §4.3 + §5.1–§5.7
    │   ├── requirements/        §5.2
    │   ├── software_items/      §4.3 safety classification
    │   ├── sdp/                 §5.1 Software Development Plan
    │   ├── architecture/        §5.3
    │   ├── design/              §5.4 detailed design
    │   ├── units/               §5.5 unit implementation + verification
    │   ├── integration_tests/   §5.6
    │   ├── system_testing/      §5.7
    │   ├── validation/          USER-requirement validation records
    │   ├── traceability/        V-model tree endpoint
    │   └── impact/              Impact-analysis endpoint
    │
    ├── maintenance/           §6
    │   └── feedback/            §6.2.1 Feedback Intake
    │
    ├── risk/                  §7
    │   └── risks/               Risk register (ISO 14971)
    │
    ├── config/                §8
    │   └── config_mgmt/         CMConfigItem + CMBaseline
    │
    ├── problems/              §9
    │   └── capa/                Problem Report → Root Cause → CAPA → Verification
    │
    ├── release/               §5.8 Release management
    ├── change_control/        §6.2 + §6.3 (cross-clause, shared workflow)
    ├── dhf/                   Design History File generator
    └── plans/                 §6.1 / §7 / §8.1 / §9 plan templates engine
```

**Why this split?** A `platform/` module exists because the application needs it (auth, audit). A `compliance/` module exists because a *standard* requires it (IEC 62304, ISO 14971, FDA 21 CFR 820). When auditors ask "where do you implement §X.Y of IEC 62304?" the answer maps cleanly onto a file path.

When **cybersecurity (IEC 81001-5-1)** lands, it gets its own sibling under `compliance/cybersecurity/` (SBOM, threat model, vulnerability intake, cyber plan) — not nested inside `dev/`.

## Frontend mirrors the backend

```
frontend/src/app/
├── layout.tsx
├── page.tsx                    ← root home
├── NavSidebar.tsx              ← top-level sidebar with grouped sections
├── NavUser.tsx
├── (platform)/                 ← parens-wrapped: route groups DON'T appear in URLs
│   ├── audit/page.tsx          → URL /audit
│   ├── users/page.tsx          → /users
│   ├── projects/page.tsx       → /projects
│   ├── documents/page.tsx      → /documents
│   ├── knowledge/page.tsx      → /knowledge
│   ├── training/page.tsx       → /training
│   └── login/page.tsx          → /login
└── (compliance)/
    ├── (dev)/
    │   ├── requirements/page.tsx     → /requirements
    │   ├── architecture/page.tsx     → /architecture
    │   ├── design/page.tsx           → /design
    │   ├── units/page.tsx            → /units
    │   ├── integration-tests/page.tsx → /integration-tests
    │   ├── system-testing/page.tsx   → /system-testing
    │   ├── software-items/page.tsx   → /software-items
    │   ├── sdp/page.tsx              → /sdp
    │   ├── validation/page.tsx       → /validation
    │   └── traceability/page.tsx     → /traceability
    ├── (maintenance)/feedback/page.tsx → /feedback
    ├── (risk)/risks/page.tsx          → /risks
    ├── (config)/config-mgmt/page.tsx  → /config-mgmt
    ├── (problems)/capa/page.tsx       → /capa
    ├── (release)/release/page.tsx     → /release
    ├── (release)/change-control/page.tsx → /change-control
    ├── (release)/dhf/page.tsx         → /dhf
    └── plans/                        → /plans, /plans/maintenance, …
```

The parens-wrapped folders are Next.js **route groups** — they're file-system organisation only and disappear from the URL. The user types `/feedback`, never `/(compliance)/(maintenance)/feedback`.

## Request lifecycle

```
Browser
   │   GET /feedback (page)
   ▼
Next.js (port 3000)
   │   fetch /api/v1/feedback/?project_id=… with Bearer JWT
   ▼
FastAPI (port 8000)
   │   1. Decodes JWT in `platform.auth.deps.get_current_user`
   │   2. require_permission("READ_FEEDBACK") checks the token's permissions
   │   3. Router handler queries DB via `AsyncSession`
   │   4. On write: also writes an `AuditLog` row via `platform.audit.service.audit()`
   ▼
PostgreSQL
```

Key invariants:
- **Every route is protected by JWT** except `/auth/login` and `/health`.
- **Every write endpoint calls `audit(...)`** so the audit log is the legal record.
- **Permissions live on the JWT**, so the frontend doesn't have to re-fetch them.

## Data flow patterns

### "Active project" pattern

The sidebar owns one global piece of state: which project is currently active. It's stored in `localStorage["medsoft_active_project"]` and broadcast via the `medsoft:project_changed` custom event.

Pages consume it via the [`useActiveProject`](https://github.com/) hook (`frontend/src/lib/useActiveProject.ts`). On mount the hook also **verifies the cached project still exists** — re-seeds and project deletions previously stranded the frontend.

### Single API client

All HTTP calls go through `frontend/src/lib/api.ts`. Pages never call `fetch()` directly. The single client centralises JWT injection, 401 handling, and error parsing.

### Plan engine reuse

§5.1 SDP, §6.1 Maintenance Plan, §7 Risk Management Plan, §8.1 Configuration Management Plan, §9 Problem Resolution Plan, and any custom plan all share **one** model (`Plan` + `PlanSection`) and **one** shared shell component (`<PlanShell>`). Adding a new plan type is: add an entry to `app/modules/compliance/plans/defaults.py` and a thin page that passes plan-type props into `<PlanShell>`.

### V-model traceability

`/api/v1/traceability/{project_id}` walks the requirement-category parent_id chain dynamically — no hardcoded `USER → SYSTEM → SOFTWARE` assumption. Any project's category taxonomy is honoured.

## Why no hardcoded dynamic data

A recurring lesson from this codebase: **anything user-customizable must come from the database, not from code constants**. Project names, requirement category names, plan types, severity labels, source channels — they all live in tables (or in defaults that seed the tables on first use). The frontend pulls them via `*/meta` endpoints or by listing the relevant entity. This means:

- A project can add a custom requirement category and the trees render correctly.
- A project can add a "STAKEHOLDER_INTERVIEW" feedback channel and the Monitor view picks it up automatically.
- The taxonomy can change without a code release.
