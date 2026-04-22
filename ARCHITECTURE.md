# MedSoft — Architecture Document

## Overview

MedSoft is a web-based IEC 62304 compliance platform for medical software development teams. It provides end-to-end traceability from user requirements down to verification evidence, with integrated risk management (ISO 14971), AI-assisted requirements generation, a structured knowledge base, change control, release management, and a document register.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                           │
│  Next.js 15 App Router  ·  TypeScript  ·  Inline styles             │
│                                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │NavSidebar│  │  Page trees │  │  Doc Editor  │  │AI Review UI │  │
│  │(dynamic) │  │ (all pages) │  │(contentEdit) │  │(requirements│  │
│  └──────────┘  └─────────────┘  └──────────────┘  │  modal)     │  │
│                        ↕ fetch (JWT Bearer)         └─────────────┘  │
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
│  /api/v1/knowledge          /api/v1/ai                              │
│                        ↕                      ↕                     │
│                     asyncpg              Anthropic API              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │                      │ HTTPS
                           ▼                      ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│    PostgreSQL 16             │   │   Anthropic Claude API           │
│  All UUIDs · TZ timestamps   │   │   Model: claude-haiku-4-5        │
│  Alembic migrations          │   │   Used for: AI req generation    │
└──────────────────────────────┘   └──────────────────────────────────┘
```

---

## Module Map

### Backend modules (`backend/app/modules/`)

| Module | Model(s) | Key Notes |
|---|---|---|
| `projects` | `Project` | Root entity; all others reference `project_id` |
| `requirements` | `Requirement`, `RequirementCategory` | Hierarchy via `parent_id`. `type` is `String(50)` — not an Enum. `readable_id` auto-generated (URQ/SYS/SWR), unique per project. |
| `testcases` | `TestCase` | Linked to project; traced to SOFTWARE reqs via TraceLink |
| `tracelinks` | `TraceLink` | Requirement ↔ TestCase junction |
| `risks` | `Risk` | `risk_level` computed: S×P ≤4→LOW, ≤9→MEDIUM, >9→HIGH. Stored in DB. |
| `design` | `DesignElement`, `RequirementDesignLink` | ARCHITECTURE→DETAILED hierarchy. Only SOFTWARE reqs can link to design. Mermaid diagram source stored. |
| `verification` | `TestExecution` | PASS/FAIL/BLOCKED per test case. Full history kept. |
| `validation` | `ValidationRecord` | Must link to USER requirements only. |
| `audit` | `AuditLog` | Append-only; service helper called on all write ops. |
| `traceability` | — (router only) | Recursive V-model tree: USER→SYSTEM→SOFTWARE with risks, design, test results. |
| `impact` | — (router only) | `GET /impact-analysis/{req_id}` — linked design, test cases, latest executions. |
| `documents` | `Document` | 34 canonical IEC 62304 docs auto-seeded per project. Categories: SOP/PLANS/TECHNICAL/DEVELOPMENT/STANDARDS. `content` TEXT stores JSON `{section_id: html}`. Supports tags (JSON array). |
| `change_control` | `ChangeRequest`, `ChangeImpact` | State machine: OPEN→IMPACT_ANALYSIS→APPROVED/REJECTED→IMPLEMENTED |
| `release` | `Release`, `ReleaseItem` | State machine: DRAFT→UNDER_REVIEW→APPROVED→RELEASED. Readiness check queries test pass rate. |
| `dhf` | `DHFDocument` | Design History File — JSON content + PDF export with Mermaid diagrams. |
| `knowledge` | `KnowledgeEntry` | Global entries (`is_global=True`, `project_id=NULL`) auto-seeded from `seed_data.py`. Project entries per-project. AI reads both. |
| `ai` | — (router only) | `POST /ai/generate-requirements` — calls Claude API with project categories + knowledge base context. Returns structured requirements for human review. |
| `users` | `User` | Bcrypt password hash. `role_id` FK to roles. |
| `roles` | `Role`, `Permission`, `RolePermission` | RBAC junction table. |
| `auth` | — | JWT (HS256) login. Token stored in `localStorage("medsoft_auth")`. |
| `esign` | `ElectronicSignature` | Password-verified approval with IP and timestamp. |
| `training` | `TrainingRecord` | Per-user training log with validity window. |

---

## Data Model — Entity Relationships

```
Project (root)
│
├── RequirementCategory (per-project; built-in USER/SYSTEM/SOFTWARE + custom)
│
├── Requirement  ── type → RequirementCategory.name
│   ├── readable_id: URQ-001 / SYS-001 / SWR-001
│   ├── parent_id → Requirement (hierarchy)
│   ├── Risk  (S×P → risk_level LOW/MEDIUM/HIGH)
│   ├── TraceLink → TestCase
│   └── RequirementDesignLink → DesignElement
│
├── TestCase
│   └── TestExecution (PASS/FAIL/BLOCKED, full history)
│
├── DesignElement  (ARCHITECTURE → DETAILED, diagram_source for Mermaid)
│
├── Document  (34 canonical docs; content = JSON sections; tags = JSON array)
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

KnowledgeEntry   (project_id nullable; is_global=True for standards library)
AuditLog         (cross-cutting; entity_type + entity_id + action)
User             → Role → Permission (RBAC)
ElectronicSignature → User + entity
TrainingRecord   → User
```

---

## AI Requirements Generation Flow

```
User (Requirements page)
  │
  ├─ Clicks "✨ Generate with AI"
  ├─ Types product description + optional focus area
  └─ Clicks "Generate Requirements"
        │
        ▼
POST /api/v1/ai/generate-requirements
  │
  ├─ Load project RequirementCategories (dynamic — not hardcoded USER/SYSTEM/SOFTWARE)
  ├─ Load KnowledgeEntries:
  │    1. Project-specific entries (highest priority)
  │    2. Global standard summaries (IEC 62304, ISO 14971, MDR, etc.)
  │    3. Project SOP/Plans/Standards documents
  │
  ├─ Build prompt: description + categories + knowledge context
  └─ Call Claude Haiku API (claude-haiku-4-5-20251001, max 4096 tokens)
        │
        ▼
Structured JSON response
  { requirements: [{ type, title, description, rationale }] }
        │
        ▼
Frontend Review Modal
  ├─ Requirements grouped by project category (colour-coded)
  ├─ Inline editing of title and description
  ├─ Checkbox to include/exclude each requirement
  ├─ "← Regenerate" to try again
  └─ "Confirm & Import N requirements" → POST to /requirements
        │
        ▼ (only after user confirmation)
Requirements saved to database
```

---

## Knowledge Base Architecture

```
KnowledgeEntry
├── is_global = True   (project_id = NULL)
│   ├── Auto-seeded from backend/app/modules/knowledge/seed_data.py
│   ├── Contains: IEC 62304 §4–§9, ISO 14971, IEC 62366, ISO 13485, FDA, MDR
│   ├── Fully editable, addable, deletable via UI (admin)
│   └── Exported to backend/fixtures/knowledge_base.sql → committed to Git
│
└── is_global = False  (project_id set)
    ├── Per-project custom entries
    ├── Company rules, device-specific notes, checklists
    └── Can copy global entry → customise for project

AI Context Priority:
  1. Project-specific entries  (600 chars each, up to 10)
  2. Global summaries          (one-liner each, up to 15)
  3. Project documents (SOP/Plans/Standards)  (800 chars each, up to 4)
```

---

## Frontend Architecture

### Page structure (`frontend/src/app/`)

```
app/
├── layout.tsx              Root layout
├── NavSidebar.tsx          3-section icon rail
│                           Sections: Design | Docs (Document Register + Knowledge Base) | PM
├── NavUser.tsx             User widget
│
├── projects/               Create + list + ⚙ Manage requirement types
├── requirements/           Tree view + readable IDs + Excel upload
│                           ✨ "Generate with AI" button → AI review modal
├── testcases/
├── risks/
├── design/                 Mermaid diagram editor per element
├── verification/
├── validation/
├── traceability/
├── tracelinks/
├── impact/
│
├── documents/
│   ├── page.tsx            Register: SOP / Plans / Technical / Development / Standards
│   └── edit/page.tsx       Section editor with IEC 62304 reference sidebar
│
├── knowledge/              Knowledge Base
│   └── page.tsx            Global Library tab + Project-Specific tab
│                           Full CRUD on both global and project entries
│                           Filter by standard / category / search
│
├── change-control/
├── release/
├── dhf/                    DHF viewer + JSON download + PDF with Mermaid diagrams
├── audit/
├── users/
└── training/
```

### Frontend conventions

| Convention | Detail |
|---|---|
| State management | `useState` + `useEffect` only |
| API calls | All via `src/lib/api.ts` — typed, single source of truth |
| Styling | Inline styles only — no Tailwind, no CSS modules |
| Components | No external UI library |
| Auth | JWT in `localStorage("medsoft_auth")`; 401 → redirect to `/login` |
| Project context | `localStorage("medsoft_active_project")` + `CustomEvent("medsoft:project_changed")` |
| URL params | Pages with `useSearchParams` wrapped in `<Suspense>` |
| Mermaid | Dynamic import `import("mermaid")` — used in design page + DHF viewer |

---

## Document Editor Architecture

```
/documents/edit?id=<doc_id>
│
├── Top bar: doc type, title, status, Preview, Download PDF
├── Sticky toolbar: Bold / Italic / H1–H3 / Lists
│   document.execCommand() with onMouseDown+preventDefault
│
├── Left sidebar:
│   ├── Section navigation (sticky, scroll-spy)
│   └── 📖 IEC 62304 Reference panel (collapsible)
│       — clause-specific guidance while writing
│
└── Editor area (per section):
    ├── contentEditable div
    └── Content saved as: { section_id: "<html>", ... }

Section definitions (SECTION_DEFS) cover:
  Plans: SMP, SPRP, SCP, SVP, SBRP
  Development: SBD, SII, CG, SUTP, SUTR, SITP, SITR, SOUP, CRR, VDD, RHL, UAL, TM
```

---

## Authentication Flow

```
POST /api/v1/auth/login
  → { access_token, user_id, name, email, role, permissions }
  → stored in localStorage("medsoft_auth")

All API requests:
  Authorization: Bearer <token>

401 response:
  → clear localStorage + redirect to /login
```

---

## Migration Chain

```
1d15c6bf7cf9  init: projects, requirements, testcases, tracelinks
b3f92a1c8d40  requirement hierarchy, risks
a1b2c3d4e5f6  FK cascade deletes
b2c3d4e5f6a7  requirement_categories
c3d4e5f6a7b8  category parent hierarchy
c4e83b2d9f51  design, verification, validation, audit
d4e5f6a7b8c9  documents register
e6a17d4b8c23  change control, release, DHF
f7b83c2e1d46  users, roles, esign, training
e5f6a7b8c9d0  requirements.readable_id
f6a7b8c9d0e1  documents.content
g7h8i9j0k1l2  design_element.diagram_source
k1f2g3h4i5j6  design + test categories
l2g3h4i5j6k7  design_element.diagram_source (extended)
m3h4i5j6k7l8  documents.description
n4i5j6k7l8m9  documents.tags
o5j6k7l8m9n0  knowledge_entries          ← current head
```

Apply all: `cd backend && alembic upgrade head`

---

## IEC 62304 Compliance Coverage

| Clause | Module |
|---|---|
| §4 Safety Classification | `requirements` (USER/SYSTEM/SOFTWARE + custom categories) |
| §5.1 Development Planning | `documents` (SMP with structured sections) |
| §5.2 Requirements Analysis | `requirements` (hierarchy, readable IDs, traceability) |
| §5.3 Architectural Design | `design` (ARCHITECTURE elements + Mermaid diagrams) |
| §5.4 Detailed Design | `design` (DETAILED elements) |
| §5.5 Unit Implementation | `documents` (Coding Guidelines) |
| §5.6 Integration Testing | `testcases` + `verification` |
| §5.7 System Testing | `testcases` + `verification` + `validation` |
| §5.8 Release | `release` (readiness check + release items) |
| §6 Maintenance | `change_control` + `documents` (SMP) |
| §7 Risk Management | `risks` (ISO 14971 matrix) |
| §8 Configuration Mgmt | `change_control` + `documents` (SCP, SBRP) |
| §9 Problem Resolution | `change_control` (anomaly → change request) |
| Traceability | `tracelinks` + `traceability` (V-model tree) |
| DHF | `dhf` (JSON + PDF with diagrams) |
| Audit Trail | `audit` (append-only log) |
| Knowledge / Standards | `knowledge` (IEC 62304, ISO 14971, MDR, FDA summaries) |
| AI Assistance | `ai` (Claude-powered requirements generation) |

---

## Running Locally

```bash
# One-command setup (new machine)
bash setup.sh

# Or manually:
docker-compose up -d               # start PostgreSQL
cd backend && source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload      # http://localhost:8000/docs

cd frontend && npm run dev         # http://localhost:3000

# Full seed (5 projects + users)
cd backend && python seed_all.py
```
