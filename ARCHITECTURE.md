# MedSoft — Architecture Document

## Overview

MedSoft is a web-based IEC 62304 compliance platform for medical software development teams. It provides end-to-end traceability from user requirements down to verification evidence, with integrated risk management (ISO 14971), change control, release management, and a structured document register.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                           │
│  Next.js 15 App Router  ·  TypeScript  ·  Inline styles (no CSS)   │
│                                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌───────────────────────────────┐  │
│  │ NavSide  │  │  Page trees │  │  Document Editor               │  │
│  │ (dynamic)│  │  (all pages)│  │  (contentEditable + execCmd)  │  │
│  └──────────┘  └─────────────┘  └───────────────────────────────┘  │
│                        ↕ fetch (JWT Bearer)                         │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend                             │
│  Python 3.10+  ·  SQLAlchemy 2.0 async  ·  Pydantic v2             │
│                                                                     │
│  /api/v1/projects           /api/v1/requirements                   │
│  /api/v1/testcases          /api/v1/tracelinks                      │
│  /api/v1/risks              /api/v1/design                          │
│  /api/v1/verification       /api/v1/validation                      │
│  /api/v1/traceability       /api/v1/impact-analysis                 │
│  /api/v1/documents          /api/v1/change-control                  │
│  /api/v1/release            /api/v1/dhf                             │
│  /api/v1/audit              /api/v1/auth                            │
│  /api/v1/users              /api/v1/roles                           │
│  /api/v1/esign              /api/v1/training                        │
│                                                                     │
│                        ↕ asyncpg                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL 16 (Docker)                           │
│  All UUIDs · timezone-aware timestamps · Alembic migrations         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Module Map

### Backend modules (`backend/app/modules/`)

| Module | Model(s) | Key Constraints |
|---|---|---|
| `projects` | `Project` | Root entity; all others reference `project_id` |
| `requirements` | `Requirement`, `RequirementCategory` | Hierarchy: USER → SYSTEM → SOFTWARE via `parent_id`. `type` is `String(50)`, not an Enum. `readable_id` auto-generated (URQ-NNN / SYS-NNN / SWR-NNN), unique per project. |
| `testcases` | `TestCase` | Linked to project; traced to SOFTWARE reqs via TraceLink |
| `tracelinks` | `TraceLink` | Requirement ↔ TestCase junction |
| `risks` | `Risk` | `risk_level` computed: S×P ≤4→LOW, ≤9→MEDIUM, >9→HIGH. Stored in DB. |
| `design` | `DesignElement`, `RequirementDesignLink` | ARCHITECTURE → DETAILED hierarchy. Only SOFTWARE reqs can link to design. |
| `verification` | `TestExecution` | PASS/FAIL/BLOCKED per test case. History kept; latest queried via window func. |
| `validation` | `ValidationRecord` | Must link to USER requirements only. |
| `audit` | `AuditLog` | Append-only; service helper called on all write ops. |
| `traceability` | — (router only) | Recursive V-model tree query returning USER→SYSTEM→SOFTWARE with risks, design, test results. |
| `impact` | — (router only) | `GET /impact-analysis/{req_id}` returns linked design, test cases, latest executions. |
| `documents` | `Document` | Auto-seeded 34 canonical docs per project on first GET. `content` TEXT stores JSON `{section_id: html}`. |
| `change_control` | `ChangeRequest`, `ChangeImpact` | State machine: OPEN→IMPACT_ANALYSIS→APPROVED/REJECTED→IMPLEMENTED |
| `release` | `Release`, `ReleaseItem` | State machine: DRAFT→UNDER_REVIEW→APPROVED→RELEASED. Readiness check queries test pass rate. |
| `dhf` | `DHFDocument` | Design History File entries per project. |
| `users` | `User` | Bcrypt password hash. `role_id` FK to roles. |
| `roles` | `Role`, `Permission`, `RolePermission` | RBAC junction table. |
| `auth` | — | JWT (HS256) login. Token stored in `localStorage("medsoft_auth")`. |
| `esign` | `ElectronicSignature` | Password-verified approval signature with IP and timestamp. |
| `training` | `TrainingRecord` | Per-user training log with validity window. |

---

## Data Model — Entity Relationships

```
Project (root)
│
├── RequirementCategory (per-project types; built-in + custom)
│
├── Requirement  ── type → RequirementCategory.name
│   ├── readable_id: URQ-001 / SYS-001 / SWR-001
│   ├── parent_id → Requirement (USER→SYSTEM→SOFTWARE hierarchy)
│   ├── Risk  (S×P → risk_level)
│   ├── TraceLink → TestCase
│   └── RequirementDesignLink → DesignElement
│
├── TestCase
│   └── TestExecution (PASS/FAIL/BLOCKED, full history)
│
├── DesignElement
│   └── parent_id → DesignElement (ARCHITECTURE → DETAILED)
│
├── Document  (34 canonical IEC 62304 docs; content = JSON sections)
│
├── ValidationRecord  → USER Requirement
│
├── ChangeRequest
│   └── ChangeImpact  → Requirement | DesignElement | TestCase
│
├── Release
│   └── ReleaseItem  → Requirement | TestCase | DesignElement
│
└── DHFDocument

AuditLog         (cross-cutting; entity_type + entity_id + action)
User             → Role → Permission (RBAC)
ElectronicSignature → User + entity
TrainingRecord   → User
```

---

## Frontend Architecture

### Page structure (`frontend/src/app/`)

```
app/
├── layout.tsx              Root layout: sidebar + main content wrapper
├── NavSidebar.tsx          3-section icon rail (Design / Docs / PM)
│                           Dynamic requirement categories via localStorage +
│                           CustomEvent("medsoft:project_changed")
├── NavUser.tsx             User widget at bottom of sidebar
│
├── projects/               Create + list
├── requirements/           Tree view + readable IDs + Excel upload
│                           Fires medsoft:project_changed on project select
├── testcases/              Create + link SW→TC, grouped linked/unlinked
├── risks/                  Register grouped HIGH/MEDIUM/LOW per project
├── design/                 ARCH→DETAILED tree + link to SW req
├── verification/           Run tests, PASS/FAIL/BLOCKED
├── validation/             Validation records for USER reqs
├── traceability/           Collapsible V-model tree
├── tracelinks/             Trace matrix grid
├── impact/                 Impact analysis
│
├── documents/
│   ├── page.tsx            Document register: Plans/Technical/Development/SOP
│   └── edit/page.tsx       Rich-text section editor (contentEditable)
│                           SDP has 7 IEC 62304-defined sections
│                           Preview modal + PDF download via window.print()
│
├── change-control/         Change requests with impact tracking
├── release/                Release management + readiness check
├── dhf/                    Design History File
├── audit/                  Audit log viewer
├── users/                  User management
├── training/               Training records
└── login/                  JWT login
```

### Frontend conventions

| Convention | Detail |
|---|---|
| State management | `useState` + `useEffect` only — no Redux/Zustand |
| API calls | All via `src/lib/api.ts` — typed, single source of truth |
| Styling | Inline styles only — no Tailwind, no CSS modules |
| Components | No external UI library |
| Auth | JWT in `localStorage("medsoft_auth")`; 401 triggers redirect to `/login` |
| Cross-component comms | `localStorage("medsoft_active_project")` + `CustomEvent("medsoft:project_changed")` |
| URL params | Pages with `useSearchParams` wrapped in `<Suspense>` |
| Node.js builds | Use `~/.nvm/versions/node/v20.20.2` (system node is v12) |

---

## Document Editor Architecture

The SDP (and other plan documents) use a structured section editor:

```
/documents/edit?id=<doc_id>
│
├── Top bar: doc type badge, title, status, Preview, Download PDF
├── Sticky toolbar: Bold / Italic / Underline / H1-H3 / Lists / Font size
│   Uses document.execCommand() with onMouseDown+preventDefault
│   to preserve contentEditable focus
│
├── Left panel: section nav (sticky, scroll-spy via activeSection state)
│
└── Editor area (per section):
    ├── Section title + IEC 62304 reference
    ├── Guidance callout (blue-tinted, non-editable)
    └── contentEditable div
        ├── innerHTML set from doc.content JSON on mount (empty deps useEffect)
        ├── onInput → update content state → mark unsaved
        └── onBlur → nothing (state already updated via onInput)

Content saved as: doc.content = JSON.stringify({ section_id: "<html>", ... })
Auto-upgrades doc status NOT_STARTED → DRAFT on first save
Ctrl+S keyboard shortcut triggers save
Download: generates full HTML doc + window.open + print() → PDF
```

---

## Authentication Flow

```
POST /api/v1/auth/login (username/password form-encoded)
  → { access_token, user_id, name, email, role, permissions }
  → stored in localStorage("medsoft_auth")

All API requests:
  Authorization: Bearer <token>

401 response:
  → clear localStorage("medsoft_auth")
  → redirect to /login
```

---

## Key Migration Chain

```
1d15c6bf7cf9  init (Phase 0: projects, requirements, testcases, tracelinks)
b3f92a1c8d40  Phase 1: requirement hierarchy, risks
a1b2c3d4e5f6  FK cascade deletes
b2c3d4e5f6a7  requirement_categories (custom types)
c3d4e5f6a7b8  category parent (flexible hierarchy)
c4e83b2d9f51  Phase 2: design, verification, validation, audit
d4e5f6a7b8c9  documents register
e6a17d4b8c23  Phase 3: change control, release, DHF
f7b83c2e1d46  Phase 4: users, roles, esign, training
e5f6a7b8c9d0  requirements.readable_id (URQ/SYS/SWR auto IDs)
f6a7b8c9d0e1  documents.content (rich text JSON field)   ← current head
```

Apply all: `cd backend && alembic upgrade head`

---

## IEC 62304 Compliance Coverage

| Clause | Module |
|---|---|
| §5.1 Software Development Planning | `documents` (SDP with 7 structured sections) |
| §5.2 Software Requirements Analysis | `requirements` (USER/SYSTEM/SOFTWARE hierarchy) |
| §5.3 Software Architectural Design | `design` (ARCHITECTURE elements) |
| §5.4 Software Detailed Design | `design` (DETAILED elements) |
| §5.5 Software Unit Implementation | `documents` (Coding Guidelines) |
| §5.6 Software Integration | `testcases` + `verification` (integration tests) |
| §5.7 Software System Testing | `testcases` + `verification` + `validation` |
| §5.8 Software Release | `release` (readiness check + release items) |
| §7.1 Configuration Management | `change_control` + `documents` (SCP, SBRP) |
| §8 Software Problem Resolution | `change_control` (anomaly → change request) |
| §9 Software Maintenance | `documents` (SMP) |
| Risk (ISO 14971) | `risks` (severity × probability matrix) |
| Traceability | `tracelinks` + `traceability` (V-model tree) |
| DHF | `dhf` |
| Audit Trail | `audit` (append-only log of all write operations) |

---

## Running Locally

```bash
# 1. Start Postgres
docker-compose up -d

# 2. Backend
cd backend && source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload       # http://localhost:8000/docs

# 3. Frontend
cd frontend && npm run dev          # http://localhost:3000

# 4. Seed test data (3 projects, all modules)
cd backend && python seed_test.py
```
