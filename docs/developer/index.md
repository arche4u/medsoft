# Developer Guide

This is the reference for anyone working on the MedSoft codebase.

## Quick orientation

| Need | Read |
|---|---|
| "Where does code live? How do the two halves fit?" | [Architecture](architecture.md) |
| "I'm adding a new module — what's the checklist?" | [Adding a Module](adding-a-module.md) |
| "What conventions does the codebase follow?" | [Conventions](conventions.md) |
| "What does the data model look like?" | [Data Model](data-model.md) |
| "What REST endpoints exist?" | [API Reference](api-reference.md) |
| "Which IEC 62304 clause does which module satisfy?" | [Clause Mapping](iec-62304-mapping.md) |

## TL;DR

- **Backend:** FastAPI + SQLAlchemy 2.0 async + PostgreSQL 16 + Alembic. Modules under `backend/app/modules/` are split into `platform/` (cross-cutting infrastructure) and `compliance/<domain>/` (regulated process modules).
- **Frontend:** Next.js 15 App Router + TypeScript. Inline styles only. Pages live under `frontend/src/app/` organised by Next.js route groups `(platform)/` and `(compliance)/(dev|maintenance|risk|config|problems|release)/` — the parens are stripped from URLs so all routes stay flat (`/feedback`, `/requirements`, etc.).
- **All write endpoints write an audit log entry.** All write endpoints check a permission via `require_permission("…")`.
- **No hardcoded enums or dynamic data in the frontend.** Frontend pulls taxonomies (sources, severities, statuses, component types) from `/meta` endpoints.
- **Never start a background uvicorn on :8000** — the developer runs their own `uvicorn --reload` there.

## Running locally

```bash
# First time
bash setup.sh                # spins up Postgres, runs migrations, imports knowledge base

# Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload         # http://localhost:8000
# API docs: http://localhost:8000/docs

# Frontend
cd frontend && npm run dev             # http://localhost:3000

# Full seed (5 sample projects, all modules)
cd backend && source .venv/bin/activate
python seed_all.py
```

## Documentation conventions

- Markdown source under `docs/`. HTML rendering via `mkdocs serve` / `mkdocs build` (mkdocs-material).
- **Update docs before every commit.** See `CLAUDE.md` and the inline directive in each module's docstring for which file owns which behaviour.
- IEC 62304 clause references in docstrings should always be of the form `§5.7` (with section sign).
