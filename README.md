# MedSoft Compliance Platform

A production-ready medical software compliance platform targeting **IEC 62304** traceability requirements, with AI-assisted requirements generation, structured document management, and full regulatory lifecycle support.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 + Alembic migrations |
| Frontend | Next.js 15 (App Router, TypeScript) |
| Auth | JWT + bcrypt |
| AI | Anthropic Claude API (Haiku) |
| Node.js | Use `~/.nvm/versions/node/v20.20.2` (system node may be too old) |

---

## Quick Start (New Machine)

```bash
git clone <your-repo> medsoft && cd medsoft
bash setup.sh
```

`setup.sh` handles everything: Python venv, Node packages, PostgreSQL setup, migrations, seed data, and knowledge base import.

### After setup

```bash
# Terminal 1 — Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload        # http://localhost:8000/docs

# Terminal 2 — Frontend
cd frontend && npm run dev            # http://localhost:3000
```

### Required: Anthropic API key (for AI features)

1. Sign up at **console.anthropic.com** (free, pay-as-you-go)
2. Create an API key
3. Add to `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

Without this key, all features work except **AI Requirements Generation**.

---

## Features

### IEC 62304 Compliance Modules

| Module | Description |
|---|---|
| **Requirements** | USER → SYSTEM → SOFTWARE hierarchy, readable IDs (URQ/SYS/SWR), Excel upload, custom types |
| **Design** | ARCHITECTURE → DETAILED elements with Mermaid diagrams |
| **Test Cases** | Linked to SOFTWARE requirements |
| **Verification** | PASS / FAIL / BLOCKED test executions with history |
| **Validation** | Validation records linked to USER requirements |
| **Traceability** | Full V-model tree (requirement → design → test → result) |
| **Risk Management** | ISO 14971 risk register, S×P matrix, mitigation tracking |
| **Change Control** | Change requests with impact analysis |
| **Release** | Release management with readiness check |
| **DHF** | Design History File — JSON + PDF export with inline diagrams |
| **Documents** | 34 canonical IEC 62304 documents (SOPs, Plans, Technical, Development) with structured editors |
| **Audit Log** | Append-only audit trail for all write operations |

### AI Features

| Feature | Description |
|---|---|
| **AI Requirements Generation** | Describe your device → AI generates USER/SYSTEM/SOFTWARE requirements mapped to your project's custom categories (Regulatory, Mechanical, Electrical, Software, etc.) |
| **Knowledge Base context** | AI reads your Knowledge Base (IEC 62304 summaries, company rules, SOPs) before generating |
| **Human-in-the-loop** | All generated requirements shown for review and editing before any are saved |

### Knowledge Base

| Type | Description |
|---|---|
| **Global Library** | Pre-seeded IEC 62304 §4–§9, ISO 14971, IEC 62366, ISO 13485, FDA, MDR summaries and checklists — auto-appear on every machine |
| **Project-Specific** | Company rules, device-specific notes, compliance checklists — stored in DB |

---

## Project Structure

```
medsoft/
├── setup.sh                      ← one-command setup for new machines
├── export_knowledge.sh           ← export/import knowledge base via Git
├── docker-compose.yml            ← PostgreSQL only
├── backend/
│   ├── app/
│   │   ├── core/                 ← config, db session, base model
│   │   └── modules/
│   │       ├── projects/         ← CRUD
│   │       ├── requirements/     ← CRUD + hierarchy + readable IDs + Excel upload
│   │       ├── testcases/        ← CRUD
│   │       ├── tracelinks/       ← requirement ↔ testcase links
│   │       ├── risks/            ← risk register, auto risk_level
│   │       ├── design/           ← DesignElement + RequirementDesignLink
│   │       ├── verification/     ← TestExecution (PASS/FAIL/BLOCKED)
│   │       ├── validation/       ← ValidationRecord
│   │       ├── audit/            ← AuditLog + service helper
│   │       ├── traceability/     ← V-model tree endpoint
│   │       ├── impact/           ← impact analysis endpoint
│   │       ├── documents/        ← Document register (34 canonical docs)
│   │       ├── change_control/   ← ChangeRequest + ChangeImpact
│   │       ├── release/          ← Release + ReleaseItem
│   │       ├── dhf/              ← Design History File
│   │       ├── knowledge/        ← Knowledge Base (global + project)
│   │       ├── ai/               ← AI requirements generation (Claude API)
│   │       ├── users/            ← User accounts
│   │       ├── roles/            ← Role + Permission + RolePermission
│   │       ├── auth/             ← JWT login/register
│   │       ├── esign/            ← Electronic signatures
│   │       └── training/         ← Training records
│   ├── alembic/versions/         ← migration chain
│   ├── fixtures/
│   │   └── knowledge_base.sql    ← exportable knowledge base snapshot
│   ├── seed.py                   ← Phase 1 demo data
│   ├── seed_phase2.py            ← Phase 2 demo data
│   ├── seed_phase4.py            ← Users, roles, training
│   ├── seed_all.py               ← Full seed: 5 projects + users (recommended)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/api.ts            ← typed API client (single source of truth)
        └── app/
            ├── NavSidebar.tsx
            ├── projects/
            ├── requirements/     ← ✨ AI Generate button
            ├── testcases/
            ├── risks/
            ├── design/
            ├── verification/
            ├── validation/
            ├── traceability/
            ├── tracelinks/
            ├── impact/
            ├── documents/
            ├── change-control/
            ├── release/
            ├── dhf/
            ├── knowledge/        ← Knowledge Base UI
            ├── audit/
            ├── users/
            └── training/
```

---

## Environment Variables

### `backend/.env`
```env
DATABASE_URL=postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft
ANTHROPIC_API_KEY=sk-ant-...       # required for AI features
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## Seed Files

| File | Description |
|---|---|
| `seed_all.py` | **Recommended** — 5 IEC 62304 projects + users/roles (wipes DB first) |
| `seed.py` | Phase 1 — single project, basic data |
| `seed_phase2.py` | Phase 2 add-on — design/verification/validation |
| `seed_phase4.py` | Phase 4 add-on — users, roles, RBAC, training |
| `seed_test.py` | 3-project test dataset |

```bash
cd backend && source .venv/bin/activate
python seed_all.py
```

---

## Default Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@medsoft.local | Admin@123 |
| QA Engineer | qa@medsoft.local | Qa@123456 |
| Developer | dev@medsoft.local | Dev@123456 |
| Reviewer | reviewer@medsoft.local | Review@123 |

---

## Transferring Knowledge Base Between Machines

Built-in IEC 62304 entries auto-seed from code — no action needed.

For entries **added/edited via the UI**:

```bash
# Export from current machine → commit to Git
bash export_knowledge.sh export
git add backend/fixtures/knowledge_base.sql
git commit -m "Update knowledge base"
git push

# On another machine after git pull
bash export_knowledge.sh import
# OR: setup.sh imports it automatically
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

---

## Phases

| Phase | Status | Scope |
|---|---|---|
| 0 | ✅ Complete | Projects, Requirements, TestCases, TraceLinks |
| 1 | ✅ Complete | Hierarchy, Risk, Excel upload, Traceability tree |
| 2 | ✅ Complete | Design, Verification, Validation, Audit, Impact Analysis |
| 3 | ✅ Complete | Change Control, Release, DHF, Documents register |
| 4 | ✅ Complete | Authentication (JWT), RBAC, Users, Training, Electronic Signatures |
| 5 | ✅ Complete | AI Requirements Generation, Knowledge Base, DHF PDF with diagrams |
| 6 | 🔜 Planned | PDF export for all modules, ERP integration, advanced reporting |
