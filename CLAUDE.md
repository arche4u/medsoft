# MedSoft Compliance Platform — CLAUDE.md

Medical software compliance platform targeting IEC 62304 traceability requirements.
Built across 3 phases. Always read this file before starting any task.

---

## Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | FastAPI + SQLAlchemy 2.0 (async)    |
| Database   | PostgreSQL 16 + Alembic migrations  |
| Frontend   | Next.js 15 (App Router, TypeScript) |
| Auth       | None (Phase 0–2 scope)              |

---

## Repository Layout

```
medsoft/
├── setup.sh                    ← one-command setup for new machines
├── docker-compose.yml          ← Postgres only (frontend/backend run locally)
├── backend/
│   ├── app/
│   │   ├── core/               ← config, db session, base model + TimestampMixin
│   │   ├── main.py             ← FastAPI app, all routers registered here
│   │   └── modules/
│   │       ├── projects/       ← CRUD
│   │       ├── requirements/   ← CRUD + hierarchy enforcement + Excel upload
│   │       ├── testcases/      ← CRUD
│   │       ├── tracelinks/     ← requirement ↔ testcase links
│   │       ├── risks/          ← risk CRUD, auto risk_level computation
│   │       ├── design/         ← DesignElement + RequirementDesignLink
│   │       ├── verification/   ← TestExecution (PASS/FAIL/BLOCKED)
│   │       ├── validation/     ← ValidationRecord (USER req → validation)
│   │       ├── audit/          ← AuditLog + service.py helper
│   │       ├── impact/         ← /impact-analysis/{req_id} endpoint
│   │       └── traceability/   ← full V-model tree endpoint
│   ├── alembic/
│   │   └── versions/
│   │       ├── 1d15c6bf7cf9_init.py               ← Phase 0
│   │       ├── b3f92a1c8d40_phase1_*.py           ← Phase 1
│   │       └── c4e83b2d9f51_phase2_*.py           ← Phase 2
│   ├── seed.py                 ← Phase 1 demo data
│   ├── seed_phase2.py          ← Phase 2 demo data (runs after seed.py)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/api.ts          ← typed API client (single source of truth)
        └── app/
            ├── projects/       ← create + list
            ├── requirements/   ← hierarchy tree + Excel upload
            ├── testcases/      ← create + link SOFTWARE→TC
            ├── risks/          ← risk CRUD per requirement
            ├── design/         ← ARCH→DETAILED tree + link to SW req
            ├── verification/   ← run tests, record PASS/FAIL/BLOCKED
            ├── validation/     ← validation records for USER reqs
            ├── traceability/   ← collapsible V-model tree
            ├── tracelinks/     ← trace matrix grid
            └── impact/         ← impact analysis UI
```

---

## Data Model

```
Project
├── Requirement (USER → SYSTEM → SOFTWARE hierarchy via parent_id)
│   ├── Risk (severity × probability → risk_level: LOW/MEDIUM/HIGH)
│   ├── TraceLink → TestCase (only SOFTWARE reqs)
│   └── RequirementDesignLink → DesignElement (only SOFTWARE reqs)
├── TestCase
│   └── TestExecution (PASS/FAIL/BLOCKED, history kept)
├── DesignElement (ARCHITECTURE → DETAILED hierarchy via parent_id)
└── ValidationRecord (linked to USER requirements only)

AuditLog (cross-cutting, logs all write ops in design/verification/validation)
```

All primary keys are `UUID`. All timestamps are `DateTime(timezone=True)`.

---

## Key Rules (enforced in backend)

| Entity | Constraint |
|--------|-----------|
| Requirement | USER: no parent. SYSTEM: parent must be USER. SOFTWARE: parent must be SYSTEM. |
| DesignElement | ARCHITECTURE: no parent. DETAILED: parent must be ARCHITECTURE. |
| RequirementDesignLink | Only SOFTWARE requirements can link to design elements. |
| ValidationRecord | Must link to USER requirements only. |
| Risk level | Computed: S×P ≤ 4 → LOW, ≤ 9 → MEDIUM, > 9 → HIGH. Stored in DB. |

---

## API Structure

All routes are prefixed with `/api/v1`.

| Module | Prefix | Key endpoints |
|--------|--------|---------------|
| projects | `/projects` | Standard CRUD |
| requirements | `/requirements` | CRUD + `POST /upload` (Excel) |
| testcases | `/testcases` | Standard CRUD |
| tracelinks | `/tracelinks` | CRUD |
| risks | `/risks` | CRUD, risk_level auto-computed |
| design | `/design` | `/elements` CRUD + `/links` CRUD |
| verification | `/verification` | `/executions` CRUD + `/executions/latest` |
| validation | `/validation` | `/records` CRUD |
| audit | `/audit` | `/logs` (read-only) |
| traceability | `/traceability` | `GET /{project_id}` → full V-model tree |
| impact | `/impact-analysis` | `GET /{requirement_id}` |

Interactive docs: `http://localhost:8000/docs`

---

## Frontend Conventions

- All pages are `"use client"` components using `useState` + `useEffect`.
- API calls go through `src/lib/api.ts` — never call `fetch` directly in a page.
- Inline styles only (no CSS files, no Tailwind). `cardStyle`, `inputStyle`, `btnStyle`, `tableStyle` defined at bottom of each file.
- No external UI library dependencies.

---

## Adding a New Module

1. **Backend**: create `app/modules/<name>/{__init__,model,schema,router}.py`
2. **Register** router in `app/main.py`
3. **Import** model in `alembic/env.py`
4. **Write migration**: new file in `alembic/versions/` with correct `down_revision`
5. **Run**: `alembic upgrade head`
6. **Frontend**: add page in `src/app/<name>/page.tsx`, add API methods to `src/lib/api.ts`, add nav link in `src/app/layout.tsx`

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

# Re-seed from scratch
cd backend && source .venv/bin/activate
python seed.py && python seed_phase2.py
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

---

## Environment Variables

| File | Variable | Default |
|------|----------|---------|
| `backend/.env` | `DATABASE_URL` | `postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft` |
| `backend/.env` | `API_PREFIX` | `/api/v1` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` |

---

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| 0 | ✅ Complete | Projects, Requirements, TestCases, TraceLinks |
| 1 | ✅ Complete | Hierarchy, Risk, Excel upload, Traceability tree |
| 2 | ✅ Complete | Design, Verification, Validation, Audit, Impact Analysis |
| 3 | 🔜 Planned | Authentication, RBAC, PDF export, ERP modules |
