# MedSoft Compliance Platform — CLAUDE.md

Medical software compliance platform targeting IEC 62304 traceability requirements, with AI-assisted requirements generation and a standards knowledge base.
Always read this file before starting any task.

---

## Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | FastAPI + SQLAlchemy 2.0 (async)    |
| Database   | PostgreSQL 16 + Alembic migrations  |
| Frontend   | Next.js 15 (App Router, TypeScript) |
| Auth       | JWT + bcrypt                        |
| AI         | Anthropic Claude API (claude-haiku-4-5-20251001) |
| Node.js    | Use `~/.nvm/versions/node/v20.20.2` for builds (system node is v12) |

---

## Repository Layout

```
medsoft/
├── setup.sh                    ← one-command setup for new machines
├── export_knowledge.sh         ← export/import knowledge base via Git
├── docker-compose.yml          ← Postgres only (frontend/backend run locally)
├── backend/
│   ├── app/
│   │   ├── core/               ← config, db session, base model + TimestampMixin
│   │   ├── main.py             ← FastAPI app, all routers registered here
│   │   └── modules/
│   │       ├── projects/       ← CRUD
│   │       ├── requirements/   ← CRUD + hierarchy + categories + readable IDs + Excel upload
│   │       ├── testcases/      ← CRUD
│   │       ├── tracelinks/     ← requirement ↔ testcase links
│   │       ├── risks/          ← risk CRUD, auto risk_level computation
│   │       ├── design/         ← DesignElement + RequirementDesignLink + Mermaid diagrams
│   │       ├── verification/   ← TestExecution (PASS/FAIL/BLOCKED)
│   │       ├── validation/     ← ValidationRecord (USER req → validation)
│   │       ├── audit/          ← AuditLog + service.py helper
│   │       ├── impact/         ← /impact-analysis/{req_id} endpoint
│   │       ├── traceability/   ← full V-model tree endpoint
│   │       ├── documents/      ← Document register (SOP/Plans/Technical/Development/Standards)
│   │       ├── change_control/ ← ChangeRequest + ChangeImpact
│   │       ├── release/        ← Release + ReleaseItem
│   │       ├── dhf/            ← Design History File (JSON + PDF with diagrams)
│   │       ├── knowledge/      ← Knowledge Base (global standards + project-specific)
│   │       ├── ai/             ← AI requirements generation (Claude API)
│   │       ├── users/          ← User accounts
│   │       ├── roles/          ← Role + Permission + RolePermission
│   │       ├── auth/           ← JWT login/register
│   │       ├── esign/          ← ElectronicSignature
│   │       └── training/       ← TrainingRecord
│   ├── alembic/
│   │   └── versions/           ← migration chain, apply with `alembic upgrade head`
│   ├── fixtures/
│   │   └── knowledge_base.sql  ← committed knowledge base snapshot (auto-imported by setup.sh)
│   ├── seed.py                 ← Phase 1 demo data (single project)
│   ├── seed_phase2.py          ← Phase 2 demo data (design/verification/validation)
│   ├── seed_phase4.py          ← Phase 4 demo data (roles/users/training)
│   ├── seed_all.py             ← Full seed: 5 projects + users (recommended)
│   ├── seed_test.py            ← 3-project test data (wipes DB first)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/api.ts          ← typed API client (single source of truth)
        └── app/
            ├── NavSidebar.tsx  ← collapsible icon rail + content panel sidebar
            ├── NavUser.tsx     ← user widget (bottom of sidebar)
            ├── projects/       ← create + list
            ├── requirements/   ← hierarchy tree + readable IDs + Excel upload + ✨ AI Generate
            ├── testcases/      ← create + link SOFTWARE→TC, grouped by linked/unlinked
            ├── risks/          ← risk register grouped HIGH/MEDIUM/LOW
            ├── design/         ← ARCH→DETAILED tree + Mermaid diagrams + link to SW req
            ├── verification/   ← run tests, record PASS/FAIL/BLOCKED
            ├── validation/     ← validation records for USER reqs
            ├── traceability/   ← collapsible V-model tree
            ├── tracelinks/     ← trace matrix grid
            ├── impact/         ← impact analysis UI
            ├── documents/      ← document register (SOP/Plans/Technical/Development/Standards)
            ├── change-control/ ← change requests with impact analysis
            ├── release/        ← release management
            ├── dhf/            ← design history file (JSON + PDF with inline diagrams)
            ├── knowledge/      ← knowledge base (global standards library + project rules)
            ├── audit/          ← audit log viewer
            ├── users/          ← user management
            └── training/       ← training records
```

---

## Data Model

```
Project
├── Requirement (USER → SYSTEM → SOFTWARE hierarchy via parent_id)
│   ├── readable_id: auto-generated URQ-001 / SYS-001 / SWR-001
│   ├── type: references RequirementCategory.name (built-in or custom)
│   ├── Risk (severity × probability → risk_level: LOW/MEDIUM/HIGH)
│   ├── TraceLink → TestCase (only SOFTWARE reqs)
│   └── RequirementDesignLink → DesignElement (only SOFTWARE reqs)
├── RequirementCategory (per-project, built-in USER/SYSTEM/SOFTWARE + custom)
├── TestCase
│   └── TestExecution (PASS/FAIL/BLOCKED, history kept)
├── DesignElement (ARCHITECTURE → DETAILED hierarchy via parent_id, diagram_source Mermaid)
├── Document (SOP/Plans/Technical/Development/Standards — auto-seeded per project)
├── ValidationRecord (linked to USER requirements only)
├── ChangeRequest + ChangeImpact
└── Release + ReleaseItem

KnowledgeEntry    — global (is_global=True, project_id=NULL) or project-specific
                    global entries auto-seeded from seed_data.py + committed to fixtures/
AuditLog          — cross-cutting, logs all write ops
User + Role + Permission — RBAC
ElectronicSignature      — approval signatures
TrainingRecord           — staff training log
DHFDocument              — design history file entries
```

All primary keys are `UUID`. All timestamps are `DateTime(timezone=True)`.

---

## Key Rules (enforced in backend)

| Entity | Constraint |
|--------|-----------|
| Requirement | USER: no parent. SYSTEM: parent must be USER. SOFTWARE: parent must be SYSTEM. |
| Requirement.type | Must match a `RequirementCategory.name` for that project. |
| readable_id | Auto-generated: `URQ-NNN` / `SYS-NNN` / `SWR-NNN`. Unique per project. |
| DesignElement | ARCHITECTURE: no parent. DETAILED: parent must be ARCHITECTURE. |
| RequirementDesignLink | Only SOFTWARE requirements can link to design elements. |
| ValidationRecord | Must link to USER requirements only. |
| Risk level | Computed: S×P ≤ 4 → LOW, ≤ 9 → MEDIUM, > 9 → HIGH. Stored in DB. |
| KnowledgeEntry (global) | Fully editable/deletable via UI. Re-seeded from seed_data.py only if missing. |

---

## API Structure

All routes are prefixed with `/api/v1`.

| Module | Prefix | Key endpoints |
|--------|--------|---------------|
| projects | `/projects` | Standard CRUD |
| requirements | `/requirements` | CRUD + `POST /upload` (Excel) + `/categories` CRUD |
| testcases | `/testcases` | Standard CRUD |
| tracelinks | `/tracelinks` | CRUD |
| risks | `/risks` | CRUD, risk_level auto-computed; `?project_id=` for project-wide list |
| design | `/design` | `/elements` CRUD + `/links` CRUD |
| verification | `/verification` | `/executions` CRUD + `/executions/latest` |
| validation | `/validation` | `/records` CRUD |
| audit | `/audit` | `/logs` (read-only) |
| traceability | `/traceability` | `GET /{project_id}` → full V-model tree |
| impact | `/impact-analysis` | `GET /{requirement_id}` |
| documents | `/documents` | CRUD; auto-seeds 34 canonical docs per project on first GET |
| change_control | `/change-control` | ChangeRequest CRUD + status transitions |
| release | `/release` | Release CRUD + status transitions + items |
| dhf | `/dhf` | DHF document CRUD + `POST /generate/{project_id}` |
| knowledge | `/knowledge` | Global CRUD + project CRUD + copy-to-project |
| ai | `/ai` | `POST /generate-requirements` (Claude API) |
| auth | `/auth` | `POST /login`, `POST /register` |
| users | `/users` | User CRUD |
| roles | `/roles` | Role + Permission management |
| training | `/training` | TrainingRecord CRUD |

Interactive docs: `http://localhost:8000/docs`

---

## AI Requirements Generation

```python
# POST /api/v1/ai/generate-requirements
# Body: { project_id, product_description, focus_area? }
# Returns: { requirements: [{type, title, description, rationale}], categories, tokens_used, model }
```

- Uses `claude-haiku-4-5-20251001` model (fast + cheap, ~$0.001/request)
- Reads project's `RequirementCategory` list — generates for ALL custom types, not hardcoded USER/SYSTEM/SOFTWARE
- Context = project knowledge entries + global standards summaries + project SOP/Plans docs
- `ANTHROPIC_API_KEY` must be set in `backend/.env`

---

## Knowledge Base

- `KnowledgeEntry` with `is_global=True` — visible to all projects, auto-seeded from `seed_data.py`
- Seeding is idempotent (keyed by standard+clause_ref+title) — safe to run repeatedly
- Built-in entries cover: IEC 62304 §4–§9, ISO 14971, IEC 62366, ISO 13485, FDA 21 CFR 820, EU MDR Annex I, plus checklists
- All entries (global + project) are fully editable/deletable via UI
- Snapshot committed to `backend/fixtures/knowledge_base.sql` — auto-imported by `setup.sh`
- To update snapshot after UI changes: `bash export_knowledge.sh && git add backend/fixtures/knowledge_base.sql`

---

## Frontend Conventions

- All pages are `"use client"` components using `useState` + `useEffect`.
- API calls go through `src/lib/api.ts` — never call `fetch` directly in a page.
- Inline styles only (no CSS files, no Tailwind). Style constants at bottom of each file.
- No external UI library dependencies.
- Sidebar fires `CustomEvent("medsoft:project_changed")` and writes to `localStorage("medsoft_active_project")` when project changes.
- All pages with `useSearchParams` must be wrapped in `<Suspense>`.
- Never mix `border` shorthand with `borderColor` non-shorthand in style objects — use full `border: "1px solid #color"`.
- Mermaid diagrams: use dynamic import `import("mermaid")` pattern, never static import.

---

## Adding a New Module

1. **Backend**: create `app/modules/<name>/{__init__,model,schema,router}.py`
2. **Register** router in `app/main.py`
3. **Import** model in `alembic/env.py`
4. **Write migration**: new file in `alembic/versions/` with correct `down_revision`
5. **Run**: `alembic upgrade head`
6. **Frontend**: add page in `src/app/<name>/page.tsx`, add API methods to `src/lib/api.ts`, add nav link in `NavSidebar.tsx`

---

## Running Locally

```bash
# First time — one command
bash setup.sh

# Backend (every time)
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload        # http://localhost:8000

# Frontend (every time)
cd frontend && npm run dev           # http://localhost:3000

# Recommended full seed (5 projects + users, wipes existing data)
cd backend && source .venv/bin/activate
python seed_all.py

# After adding/editing knowledge base entries via UI — update the fixture
bash export_knowledge.sh
git add backend/fixtures/knowledge_base.sql && git commit -m "Update knowledge base"
```

---

## Migrations

```bash
cd backend && source .venv/bin/activate

# Apply all pending
alembic upgrade head

# Create new migration after model changes
alembic revision --autogenerate -m "describe change"

# Rollback one step
alembic downgrade -1
```

> **Important**: When adding a new PostgreSQL ENUM type in a migration that uses
> `op.create_table`, do NOT call `op.execute("CREATE TYPE ...")` separately —
> SQLAlchemy creates it automatically via `op.create_table`. For `op.add_column`
> on an existing table, create the type first with `op.execute` and use
> `create_type=False` in the column definition.
>
> **Requirement.type** is a plain `String(50)` column — NOT an Enum. Never use
> `.value` on it or compare with `RequirementType.xxx` enum in SQLAlchemy WHERE
> clauses; use plain string literals (`"SOFTWARE"`, `"USER"`, `"SYSTEM"`).

---

## Environment Variables

| File | Variable | Default |
|------|----------|---------|
| `backend/.env` | `DATABASE_URL` | `postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft` |
| `backend/.env` | `API_PREFIX` | `/api/v1` |
| `backend/.env` | `ANTHROPIC_API_KEY` | *(required for AI features)* |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` |

---

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| 0 | ✅ Complete | Projects, Requirements, TestCases, TraceLinks |
| 1 | ✅ Complete | Hierarchy, Risk, Excel upload, Traceability tree |
| 2 | ✅ Complete | Design, Verification, Validation, Audit, Impact Analysis |
| 3 | ✅ Complete | Change Control, Release, DHF, Documents register |
| 4 | ✅ Complete | Authentication (JWT), RBAC, Users, Training, Electronic Signatures |
| 5 | ✅ Complete | AI Requirements Generation, Knowledge Base, DHF PDF with diagrams |
| 6 | 🔜 Planned | PDF export for all modules, ERP integration, advanced reporting |
