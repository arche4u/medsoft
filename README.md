# MedSoft Compliance Platform

A medical-device software compliance platform aligned to **IEC 62304** (with **ISO 14971** risk management), **IEC 81001-5-1** (cybersecurity), and **IEC 62366-1** (usability engineering). Covers §4.3 + §5.1–§5.8 + §6 + §7 + §8 + §9 end-to-end, generates auditor-ready Design History Files (DHF) on demand, ships threat modeling + CVE intake + SBOM (CycloneDX) for cyber, and ships a Usability Engineering File (UEF) accepted by every major regulator (EU MDR / FDA / Health Canada / TGA / PMDA / MHRA). AI-assisted requirements generation backed by the Anthropic Claude API.

---

## Where to start

| If you are… | Read |
|---|---|
| **A user** (QA, regulatory affairs, clinical engineer) | [docs/user/](docs/user/index.md) |
| **A developer** working on the codebase | [docs/developer/](docs/developer/index.md) + [CLAUDE.md](CLAUDE.md) |
| **An auditor** evaluating the platform | [docs/developer/iec-62304-mapping.md](docs/developer/iec-62304-mapping.md) |

Documentation builds to a browseable HTML site:

```bash
pip install mkdocs-material
mkdocs serve          # http://127.0.0.1:8002
mkdocs build          # static HTML in site/
```

The running application also exposes the user manual at `http://localhost:8000/manual` — accessible from the **Help** button at the bottom of the sidebar.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 + Alembic migrations |
| Frontend | Next.js 15 (App Router, TypeScript) — inline styles only |
| Auth | JWT + bcrypt |
| AI | Anthropic Claude API (claude-haiku-4-5-20251001) |
| Docs | mkdocs-material |
| Node.js | Use `~/.nvm/versions/node/v20.20.2` for builds |

---

## Quick start (new machine)

```bash
git clone <your-repo> medsoft && cd medsoft
bash setup.sh
```

`setup.sh` handles: Python venv, Node packages, PostgreSQL setup, Alembic migrations, seed data, and knowledge-base import.

Then in two terminals:

```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload       # http://localhost:8000

# Terminal 2 — frontend
cd frontend && npm run dev          # http://localhost:3000
```

### Default credentials (demo only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@medsoft.local` | `Admin@123` |
| QA | `qa@medsoft.local` | `Qa@123456` |
| QARA | `qara@medsoft.local` | `Qara@123456` |
| Developer | `dev@medsoft.local` | `Dev@123456` |
| Tester | `tester@medsoft.local` | `Test@123456` |
| Reviewer | `reviewer@medsoft.local` | `Review@123` |

### Master seed

```bash
cd backend && source .venv/bin/activate
python seed_all.py
```

Loads 5 sample projects (Patient Vital Signs Monitor, Electrosurgical Generator, Smart Drug Infusion Pump, Hemodialysis Machine, AED) with realistic data across every IEC 62304 clause from §4.3 to §6.

---

## What this platform covers

| IEC 62304 clause | Module | Status |
|---|---|---|
| §4.3 Software safety classification | `software_items` | ✅ |
| §5.1 Development plan | `sdp` + Plans engine | ✅ |
| §5.2 Requirements + SRS baselines | `requirements` | ✅ |
| §5.3 Architecture + baselines | `architecture` | ✅ |
| §5.4 Detailed design | `design` | ✅ |
| §5.5 Software units + tests | `units` | ✅ |
| §5.6 Integration tests | `integration_tests` | ✅ |
| §5.7 System tests + readiness gates | `system_testing` | ✅ |
| §5.8 Release management | `release` | ✅ |
| §6.1 Maintenance plan | Plans (`MAINTENANCE`) | ✅ |
| §6.2.1 Feedback intake (monitoring + evaluation + safety impact) | `feedback` | ✅ |
| §6.2.2 Escalate to CAPA | `feedback` → `capa` | ✅ |
| §6.2.3 CR impact analysis gate | `change_control` | ✅ |
| §6.2.4 CR approval (esign + permission) | `change_control` | ✅ |
| §6.2.5 User & regulator notification | `release` | ✅ |
| §6.3.2 Maintenance release lineage | `release` (`parent_release_id`) | ✅ |
| §7 Risk register (ISO 14971 + IEC 81001-5-1 + IEC 62366-1 via `risk_class`) | `risks` | ✅ §7.1 contributions · §7.2 controls + §5.3 link · §7.3 closed-loop evidence · §7.4 auto-trigger + inbox · SAFETY/SECURITY/SAFETY_SECURITY/USABILITY discriminator |
| §8 Configuration management | `config_mgmt` | ✅ |
| §9 Problem resolution (CAPA) | `capa` | ✅ |
| **Cybersecurity (IEC 81001-5-1)** Plan + Threat Model (STRIDE) + Vulnerability intake (CVE) + SBOM (CycloneDX 1.5) | `cybersecurity/{threat_model, vulnerabilities, sbom}` + `plans` (`CYBERSECURITY`) | ✅ |
| **Usability Engineering (IEC 62366-1)** — UEF · §5.1 use spec · §5.4 scenarios · use errors → §7 | `usability` + `plans` (`USABILITY`) | ✅ |

Plus cross-cutting:
- **FDA 21 CFR Part 11** electronic signatures
- **FDA 21 CFR 820.30(j)** Design History File generator
- **RBAC** with 6 default roles + per-action permissions
- **Audit log** on every write (legal record)
- **Knowledge base** with standards references (IEC 62304, ISO 14971, IEC 81001-5-1, IEC 62366-1, ISO 13485, FDA 21 CFR 820, EU MDR Annex I)

---

## Repository layout

```
medsoft/
├── CLAUDE.md            ← AI / contributor context (read first)
├── README.md            ← this file
├── mkdocs.yml           ← docs site config
├── docs/
│   ├── developer/       ← architecture, conventions, API ref, IEC mapping
│   └── user/            ← non-technical workflow guides per module
├── backend/
│   └── app/modules/
│       ├── platform/    ← auth, users, audit, esign, training, AI, knowledge, documents, …
│       └── compliance/  ← dev/ maintenance/ risk/ config/ problems/ release/ change_control/ dhf/ plans/
└── frontend/
    └── src/app/
        ├── (platform)/  ← route group — URLs stay flat
        └── (compliance)/(dev | maintenance | risk | config | problems | release)/…
```

Full layout + rationale in [CLAUDE.md](CLAUDE.md) and [docs/developer/architecture.md](docs/developer/architecture.md).

---

## Updating documentation

This platform is regulated. **Documentation is audit evidence.** Update docs in the same commit as the code change.

Specifically:
- `CLAUDE.md` for AI / contributor context.
- `docs/developer/*` for architecture, conventions, API reference, clause mapping.
- `docs/user/*` for user-facing workflow guides.
- In-module docstrings + IEC clause references in source.
- `mkdocs build` after edits to verify the site still renders.

---

## License

*(TBD — internal use)*
