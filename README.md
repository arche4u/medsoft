# MedSoft Compliance Platform

Phase 0 foundation for a scalable medical software compliance platform targeting **IEC 62304** traceability requirements.

## Stack

| Layer    | Technology                     |
|----------|-------------------------------|
| Backend  | FastAPI + SQLAlchemy 2 (async) |
| Database | PostgreSQL 16                  |
| Migrations | Alembic                      |
| Frontend | Next.js 15 (App Router)        |

## Project Structure

```
medsoft/
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── core/              # config, db session, base model
│   │   └── modules/
│   │       ├── projects/      # model, schema, router
│   │       ├── requirements/
│   │       ├── testcases/
│   │       └── tracelinks/
│   ├── alembic/               # migrations
│   ├── alembic.ini
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/api.ts         # typed API client
        └── app/
            ├── projects/
            ├── requirements/
            └── testcases/
```

## Data Model

```
Project
 ├── Requirements  (project_id → projects.id)
 ├── TestCases     (project_id → projects.id)
 └── TraceLinks    (requirement_id + testcase_id)
```

All primary keys are UUIDs.

## Local Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 16 running locally

### 1. Database

```bash
sudo -u postgres psql <<EOF
CREATE USER medsoft WITH PASSWORD 'medsoft';
CREATE DATABASE medsoft OWNER medsoft;
EOF
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

alembic revision --autogenerate -m "init"
alembic upgrade head

uvicorn app.main:app --reload
```

API runs at `http://localhost:8000`
Interactive docs at `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

## API Endpoints

| Method | Path                        | Description         |
|--------|-----------------------------|---------------------|
| GET    | /api/v1/projects/           | List projects       |
| POST   | /api/v1/projects/           | Create project      |
| GET    | /api/v1/projects/{id}       | Get project         |
| PUT    | /api/v1/projects/{id}       | Update project      |
| DELETE | /api/v1/projects/{id}       | Delete project      |
| GET    | /api/v1/requirements/       | List requirements   |
| POST   | /api/v1/requirements/       | Create requirement  |
| GET    | /api/v1/testcases/          | List test cases     |
| POST   | /api/v1/testcases/          | Create test case    |
| GET    | /api/v1/tracelinks/         | List trace links    |
| POST   | /api/v1/tracelinks/         | Create trace link   |
| DELETE | /api/v1/tracelinks/{id}     | Delete trace link   |

Query params `?project_id=<uuid>` on requirements and testcases filter by project.

## Quick Smoke Test

```bash
# Create a project
curl -X POST http://localhost:8000/api/v1/projects/ \
  -H "Content-Type: application/json" \
  -d '{"name":"IEC 62304 Project","description":"Phase 0"}'

# Add a requirement (replace <project_id>)
curl -X POST http://localhost:8000/api/v1/requirements/ \
  -H "Content-Type: application/json" \
  -d '{"project_id":"<project_id>","title":"REQ-001","description":"System shall..."}'

# Add a test case
curl -X POST http://localhost:8000/api/v1/testcases/ \
  -H "Content-Type: application/json" \
  -d '{"project_id":"<project_id>","title":"TC-001","description":"Verify REQ-001"}'

# Link them
curl -X POST http://localhost:8000/api/v1/tracelinks/ \
  -H "Content-Type: application/json" \
  -d '{"requirement_id":"<req_id>","testcase_id":"<tc_id>"}'
```

## Demo Credentials

Run `python seed_phase4.py` (or `python seed_test.py` for full 3-project data) to create these accounts:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@medsoft.local | Admin@123 |
| QA Engineer | qa@medsoft.local | Qa@123456 |
| Developer | dev@medsoft.local | Dev@123456 |
| Reviewer | reviewer@medsoft.local | Review@123 |

## Seed Files

| File | Description |
|------|-------------|
| `seed.py` | Phase 1 — single Pump project, basic requirements/test cases/risks |
| `seed_phase2.py` | Phase 2 — design elements, verifications, validations (add-on) |
| `seed_phase4.py` | Phase 4 — users, roles, RBAC, training records (add-on) |
| `seed_test.py` | **Full reset** — 3 projects (Pump, Cardiac Monitor, Ventilator), all modules, wipes DB first |

```bash
# Recommended: full demo data (wipes existing data)
cd backend && source .venv/bin/activate
python seed_test.py
python seed_phase4.py   # adds users/roles on top
```

## Roadmap

- [ ] Authentication & RBAC
- [ ] Traceability matrix export (CSV / PDF)
- [ ] IEC 62304 classification tags on requirements
- [ ] Audit trail / change history
- [ ] ERP modules (inventory, CAPA, risk management)
