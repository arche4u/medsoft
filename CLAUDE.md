# MedSoft Compliance Platform — CLAUDE.md

Medical-device software compliance platform targeting **IEC 62304** with risk management per **ISO 14971**. Currently covers §4.3 + §5.1–§5.8 + §6 + §7 + §8 + §9. **Cybersecurity (IEC 81001-5-1)** is planned as its own top-level layer.

**Always read this file before starting any task.**

For end-user help, see [`docs/user/`](docs/user/index.md). For deeper developer reference, see [`docs/developer/`](docs/developer/index.md). Both render as a browseable site via `mkdocs build` / `mkdocs serve`.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 + Alembic migrations |
| Frontend | Next.js 15 (App Router, TypeScript) — inline styles only |
| Auth | JWT + bcrypt |
| AI | Anthropic Claude API (claude-haiku-4-5-20251001) |
| Docs | Markdown source + mkdocs-material → static HTML |
| Node.js | Use `~/.nvm/versions/node/v20.20.2` for builds (system node is v12) |

---

## Repository Layout

```
medsoft/
├── CLAUDE.md                  ← this file — AI / contributor context
├── README.md                  ← project entry point
├── mkdocs.yml                 ← docs site config
├── docs/                      ← all project documentation
│   ├── index.md
│   ├── developer/             ← architecture, conventions, API ref, IEC mapping
│   └── user/                  ← non-technical workflow guides per module
├── setup.sh                   ← one-command setup for new machines
├── export_knowledge.sh        ← export/import knowledge base via Git
├── docker-compose.yml         ← Postgres only (frontend/backend run locally)
├── backend/
│   ├── app/
│   │   ├── core/              ← config, db session, base model + TimestampMixin
│   │   ├── main.py            ← FastAPI app; all routers registered here
│   │   └── modules/
│   │       ├── platform/      ← cross-cutting infrastructure
│   │       │   ├── auth/                 ← JWT login/register
│   │       │   ├── users/                ← User accounts
│   │       │   ├── roles/                ← Role + Permission + RolePermission (RBAC)
│   │       │   ├── audit/                ← AuditLog + audit() service helper
│   │       │   ├── esign/                ← ElectronicSignature (21 CFR Part 11)
│   │       │   ├── training/             ← TrainingRecord
│   │       │   ├── attachments/          ← Generic file attachments
│   │       │   ├── ai/                   ← Anthropic Claude integration
│   │       │   ├── knowledge/            ← Standards reference library
│   │       │   ├── documents/            ← Document Register (SOP / Plans / Technical)
│   │       │   ├── approval/             ← Generic approval workflow
│   │       │   └── projects/             ← Multi-project anchor
│   │       │
│   │       └── compliance/    ← regulated process modules
│   │           ├── dev/                  §4.3 + §5.1–§5.7
│   │           │   ├── requirements/     §5.2 — hierarchy + categories + baselines + Excel upload
│   │           │   ├── software_items/   §4.3 — safety classification tree (A/B/C)
│   │           │   ├── sdp/              §5.1 — Software Development Plan
│   │           │   ├── architecture/     §5.3 — SWComponent + SWInterface + Baselines
│   │           │   ├── design/           §5.4 — Detailed Design (Mermaid diagrams)
│   │           │   ├── units/            §5.5 — SoftwareUnit + UnitTestCase + Results
│   │           │   ├── integration_tests/ §5.6 — IntegrationTestCase + Results + Coverage
│   │           │   ├── system_testing/   §5.7 — SystemTestCase + Readiness gates
│   │           │   ├── validation/       USER-requirement validation records
│   │           │   ├── traceability/     /traceability/{project_id} V-model tree
│   │           │   └── impact/           /impact-analysis/{req_id}
│   │           ├── maintenance/
│   │           │   └── feedback/         §6.2.1 — Feedback Intake + escalation
│   │           ├── risk/
│   │           │   └── risks/            §7 / ISO 14971 — Risk + RiskControl + ResidualRisk
│   │           ├── config/
│   │           │   └── config_mgmt/      §8 — CMConfigItem + CMBaseline
│   │           ├── problems/
│   │           │   └── capa/             §9 — ProblemReport → RootCause → CAPA → Verification
│   │           ├── release/              §5.8 — Release lifecycle, snapshots, §6.2.5, §6.3.2
│   │           ├── change_control/       §6.2 / §6.3 — ChangeRequest with §6.2.3 gate
│   │           ├── dhf/                  Design History File generator (auditor bundle)
│   │           └── plans/                §6.1 / §7 / §8.1 / §9 plan-template engine
│   ├── alembic/
│   │   └── versions/                     ← migration chain (run `alembic upgrade head`)
│   ├── fixtures/
│   │   └── knowledge_base.sql            ← committed KB snapshot (auto-imported by setup.sh)
│   ├── seed_all.py                       ← Master seed: chains the 4 below
│   ├── seed_comprehensive.py             ← 5 IEC 62304 projects, all base modules (wipes DB)
│   ├── seed_phase4.py                    ← users / roles / permissions / training
│   ├── seed_architecture.py              ← §4.3–§5.8 modules, CAPA, release e-signatures
│   ├── seed_section6.py                  ← §6 Maintenance: plans, feedback, notifications, lineage
│   ├── seed.py                           ← minimal Phase 1 demo (single project)
│   ├── seed_phase2.py                    ← minimal Phase 2 demo (design/verification/validation)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/
        │   ├── api.ts                    ← typed API client (single source of truth)
        │   └── useActiveProject.ts       ← project-id hook + localStorage + stale-id guard
        └── app/
            ├── layout.tsx + page.tsx     ← root
            ├── NavSidebar.tsx            ← collapsible icon rail + grouped panel (bottom Help link)
            ├── NavUser.tsx               ← user widget
            ├── (platform)/               ← route group — parens stripped from URL
            │   ├── audit/                ← /audit
            │   ├── users/                ← /users
            │   ├── training/             ← /training
            │   ├── projects/             ← /projects, /projects/dashboard
            │   ├── documents/            ← /documents, /documents/edit
            │   ├── knowledge/            ← /knowledge
            │   └── login/                ← /login
            └── (compliance)/
                ├── (dev)/
                │   ├── requirements/     ← /requirements
                │   ├── software-items/   ← /software-items
                │   ├── sdp/              ← /sdp
                │   ├── architecture/     ← /architecture
                │   ├── design/           ← /design
                │   ├── units/            ← /units
                │   ├── integration-tests/← /integration-tests
                │   ├── system-testing/   ← /system-testing
                │   ├── validation/       ← /validation
                │   └── traceability/     ← /traceability
                ├── (maintenance)/
                │   └── feedback/         ← /feedback  (Triage + Monitor §6.2.1.1 tabs)
                ├── (risk)/
                │   └── risks/            ← /risks
                ├── (config)/
                │   └── config-mgmt/      ← /config-mgmt
                ├── (problems)/
                │   └── capa/             ← /capa
                ├── (release)/
                │   ├── release/          ← /release  (with §6.2.5 notification UI + §6.3.2 chip)
                │   ├── change-control/   ← /change-control
                │   └── dhf/              ← /dhf
                └── plans/                ← /plans + /plans/{maintenance,risk-mgmt,…}
```

**Two-package split rationale:**
- `platform/` modules exist because the *application* needs them (auth, files, audit).
- `compliance/` modules exist because a *standard* requires them (IEC 62304, ISO 14971, FDA 21 CFR 820).
- Cybersecurity (IEC 81001-5-1) lands as `compliance/cybersecurity/` — its own sibling, not nested in `dev/`.

---

## Data Model

Every regulated entity FKs to a `Project`. See [`docs/developer/data-model.md`](docs/developer/data-model.md) for the full ER overview.

```
Project
├── Requirement (USER → SYSTEM → SOFTWARE — dynamic tree from RequirementCategory.parent_id)
│   ├── readable_id auto-generated (URQ-NNN / SYS-NNN / SWR-NNN — prefix configurable per category)
│   ├── Risk (severity × probability → risk_level: LOW / MEDIUM / HIGH)
│   └── RequirementDesignLink → DesignElement
├── SoftwareItem (§4.3 — safety classification tree A/B/C)
├── SWComponent (§5.3 — SYSTEM → SUBSYSTEM → ITEM → UNIT)
│   ├── SWInterface (DATA / CONTROL / API / SIGNAL)
│   ├── SWComponentReqLink → Requirement
│   ├── SWComponentRiskLink → Risk
│   └── SWComponentTCLink → SystemTestCase
├── ArchitectureBaseline (versioned, signed-off, mirrors to CMBaseline)
├── DesignElement (§5.4 — linked to a SWComponent, optional self-nest)
├── SoftwareUnit (§5.5)
│   ├── CodeArtifact[]
│   ├── UnitTestCase + UnitTestResult
│   └── UnitRequirementLink / UnitRiskLink
├── IntegrationTestCase (§5.6) + IntegrationTestResult
├── SystemTestCase (§5.7) + SystemTestResult
├── Release (§5.8)
│   ├── ReleaseItem → Requirement | SystemTestCase | DesignElement
│   ├── parent_release_id           (§6.3.2 maintenance lineage)
│   ├── user/regulator_notification (§6.2.5)
│   ├── ReleaseSnapshot              (frozen JSON at approval)
│   ├── ReleaseArtifact[]
│   └── ReleaseChecklistItem[]
├── ChangeRequest (§6.2)
│   ├── modifies_released_software   (§6.2.3 trigger)
│   ├── effect_on_organization       (§6.2.3)
│   ├── effect_on_released_software  (§6.2.3)
│   ├── effect_on_interfacing_systems(§6.2.3)
│   └── ChangeImpact[] → Requirement | DesignElement | SystemTestCase
├── FeedbackItem (§6.2.1)
│   ├── source / severity / status (open vocabulary via /feedback/meta)
│   ├── adverse_event / spec_deviation (§6.2.1.2)
│   ├── safety_impact_assessment / change_needed (§6.2.1.3)
│   ├── escalated_problem_id → ProblemReport
│   └── escalated_change_request_id → ChangeRequest
├── ProblemReport → RootCause → CAPA → CAPAVerification (§9)
├── CMConfigItem + CMBaseline (§8)
├── Plan + PlanSection (§6.1 / §7 / §8.1 / §9 templates — shared engine)
├── SoftwareDevelopmentPlan (§5.1 — richer, has phases + roles)
├── RequirementsBaseline + RequirementCategoryBaseline (§5.2 two-tier)
├── ValidationRecord (USER reqs only)
└── DHFDocument (generated on demand — bundles everything)

Cross-cutting:
KnowledgeEntry · AuditLog · ElectronicSignature · TrainingRecord
User + Role + Permission + RolePermission
Attachment (polymorphic across all entities)
Document (Document Register — SOP / Plans / Technical / Development / Standards)
```

All primary keys are `UUID`. All timestamps are `DateTime(timezone=True)`. Status fields are `String`, not Enum (taxonomies stay open-vocabulary).

---

## Key Rules (enforced in backend)

| Constraint | Where |
|---|---|
| `Requirement.parent_id` chain must match `RequirementCategory.parent_id` chain | `compliance/dev/requirements/router.py` |
| `Requirement.type` references `RequirementCategory.name` for that project | same |
| `readable_id` auto-generated: prefix-NNN per category per project | `_next_readable_id()` per module |
| `DesignElement.component_id` links to a §5.3 SWComponent (was the ARCH/DETAILED tier — removed) | `compliance/dev/design/model.py` |
| `RequirementDesignLink` allowed only on SOFTWARE requirements (leaf categories) | `compliance/dev/design/router.py` |
| `ValidationRecord` must link to a USER requirement | `compliance/dev/validation/router.py` |
| `Risk.risk_level` computed: S × P ≤ 4 LOW, ≤ 9 MEDIUM, else HIGH | `compliance/risk/risks/model.py:_compute_level` |
| `KnowledgeEntry` global entries auto-seeded if missing on startup | `platform/knowledge/seed_data.py` |
| Approving a Release requires an `ElectronicSignature` (meaning=APPROVAL) | `compliance/release/router.py` |
| Approving a CR that `modifies_released_software` requires all 3 §6.2.3 fields | `compliance/change_control/router.py` |
| `Release.parent_release_id` must point to a same-project RELEASED row | `compliance/release/router.py:create_release` |
| Stale `project_id` in active-project hook → backend returns 404, frontend auto-clears | `compliance/dev/requirements/router.py:_ensure_builtins` + `useActiveProject.ts` |

---

## API Structure

All routes are prefixed with `/api/v1`. Interactive Swagger at `http://localhost:8000/docs`. Full endpoint reference: [`docs/developer/api-reference.md`](docs/developer/api-reference.md).

| Module | Prefix | Key endpoints |
|---|---|---|
| auth | `/auth` | `POST /login` (form-encoded), `POST /register` |
| projects | `/projects` | CRUD |
| requirements | `/requirements` | CRUD + `/categories` CRUD + `/baselines/` + `/category-baselines/` + `POST /upload` (Excel) |
| software_items | `/software-items` | §4.3 CRUD + `/compliance` check |
| sdp | `/sdp` | §5.1 SDP CRUD + sections / phases / roles + status transition |
| architecture | `/architecture` | §5.3 components + interfaces + baselines + `/component-types` taxonomy |
| design | `/design` | `/elements` CRUD + `/links` CRUD |
| units | `/units` | §5.5 CRUD + code artifacts + test cases + results |
| integration_tests | `/integration-tests` | §5.6 CRUD + results + `/coverage/{project_id}` |
| system_testing | `/system-testing` | §5.7 CRUD + results + `/coverage/{project_id}` + `/release/{release_id}/readiness` |
| validation | `/validation` | `/records` CRUD (USER reqs only) |
| traceability | `/traceability` | `GET /{project_id}` → V-model tree |
| impact | `/impact-analysis` | `GET /{requirement_id}` |
| feedback | `/feedback` | §6.2.1 CRUD + `/meta` + `/evaluate` + `/escalate` + `/close` |
| change_control | `/change-control` | CRUD + status transitions (with §6.2.3 gate) |
| release | `/release` | CRUD + transitions + items + `/readiness` + `/notify` (§6.2.5) |
| risks | `/risks` | CRUD + controls + residual + dashboard + categories + safety profile |
| config_mgmt | `/config-mgmt` | Items + baselines + `/release-check/{project_id}` |
| capa | `/capa` | Problem reports + root causes + CAPAs + verifications |
| plans | `/plans` | Plan engine (MAINTENANCE / RISK_MGMT / CONFIG_MGMT / PROBLEM_RESOLUTION / custom) |
| dhf | `/dhf` | `POST /generate/{project_id}?release_id=…` + document CRUD |
| audit | `/audit` | `/logs` (read-only) |
| esign | `/esign` | `/sign` (21 CFR Part 11) |
| documents | `/documents` | Document Register CRUD |
| knowledge | `/knowledge` | Global + project CRUD + copy-to-project |
| ai | `/ai` | `POST /generate-requirements` (Claude) |
| roles · users · training · attachments · approval | standard CRUD |

---

## IEC 62304 clause → module mapping

| Clause | Backend module | Frontend page |
|---|---|---|
| §4.3 | `compliance/dev/software_items` | `/software-items` |
| §4.4 Legacy software | `compliance/dev/software_items` (`is_legacy` + `legacy_assessment`) + `compliance/plans` (LEGACY_SOFTWARE) | `/software-items` + `/plans/custom/legacy-software` |
| §5.1 | `compliance/dev/sdp` + `compliance/plans` | `/sdp`, `/plans/maintenance`, … |
| §5.2 | `compliance/dev/requirements` | `/requirements` |
| §5.3 | `compliance/dev/architecture` | `/architecture` |
| §5.4 | `compliance/dev/design` | `/design` |
| §5.5 | `compliance/dev/units` | `/units` |
| §5.6 | `compliance/dev/integration_tests` | `/integration-tests` |
| §5.7 | `compliance/dev/system_testing` | `/system-testing` |
| §5.8 | `compliance/release` | `/release` |
| §6.1 | `compliance/plans` (`plan_type=MAINTENANCE`) | `/plans/maintenance` |
| §6.2.1 | `compliance/maintenance/feedback` | `/feedback` |
| §6.2.2 | `feedback` → `compliance/problems/capa` | `/feedback` → `/capa` |
| §6.2.3 | `compliance/change_control` (post-release fields) | `/change-control` |
| §6.2.4 | `compliance/change_control` (esign + permission) | `/change-control` |
| §6.2.5 | `compliance/release` (`PATCH /notify`) | `/release` |
| §6.3.1 | existing §5 modules (re-run) | various |
| §6.3.2 | `compliance/release` (`parent_release_id`) | `/release` |
| §7.1 software-contribution-to-hazards | `compliance/risk/risks/RiskContribution` | `/risks` (Contributions section) |
| §7.2 risk control measures + §5.3 component link | `compliance/risk/risks/RiskControl.component_id` | `/risks` (Controls tab) |
| §7.3 closed-loop verification evidence | `compliance/risk/risks/VerificationEvidence` | `/risks` (Evidence sub-list) |
| §7.4 auto-trigger on CR APPROVED + modifies_released_software | `compliance/change_control/router → risks/router.trigger_risk_reevaluation` | `/risks` (Re-evaluation Inbox) |
| Cyber-ready risk register (IEC 81001-5-1 / AAMI TIR57) | `compliance/risk/risks/Risk.risk_class` | `/risks` (class filter) |
| §7 / ISO 14971 (overall) | `compliance/risk/risks` | `/risks` |
| §8 | `compliance/config/config_mgmt` (RBAC + audit on all writes) | `/config-mgmt` |
| §8.2.2 SOUP identification | `compliance/config/config_mgmt` (`item_type=SOUP` first-class) | `/config-mgmt` (SOUP §8.2.2 filter chip + per-card badge) |
| §9 | `compliance/problems/capa` (RBAC + audit on all writes) | `/capa` |
| §9.6 Problem trend analysis | `compliance/problems/capa` (in-memory aggregation `TrendAnalysisPanel`) | `/capa` (top-of-page panel: severity / status / top root causes · MTTR · trend alert) |
| DHF | `compliance/dhf` | `/dhf` |

---

## AI Requirements Generation

```python
# POST /api/v1/ai/generate-requirements
# Body: { project_id, product_description, focus_area? }
# Returns: { requirements: [{type, title, description, rationale}], categories, tokens_used, model }
```

- Uses `claude-haiku-4-5-20251001` (fast + cheap, ~$0.001/request).
- Reads project's `RequirementCategory` list — generates for **all** custom types, not hardcoded USER/SYSTEM/SOFTWARE.
- Context = project knowledge entries + global standards summaries + project SOP/Plans docs.
- `ANTHROPIC_API_KEY` must be set in `backend/.env`.

---

## Knowledge Base

- `KnowledgeEntry` with `is_global=True` — visible to all projects, auto-seeded from `platform/knowledge/seed_data.py`.
- Seeding is idempotent (keyed by standard + clause_ref + title) — safe to run repeatedly.
- Built-in entries cover IEC 62304 §4–§9, ISO 14971, IEC 62366, ISO 13485, FDA 21 CFR 820, EU MDR Annex I + checklists.
- All entries (global + project) fully editable via UI.
- Snapshot committed to `backend/fixtures/knowledge_base.sql` — auto-imported by `setup.sh`.
- After UI changes: `bash export_knowledge.sh && git add backend/fixtures/knowledge_base.sql`.

---

## Frontend Conventions

- All pages are `"use client"` components using `useState` + `useEffect`.
- API calls go through `src/lib/api.ts` — never `fetch()` directly in a page.
- **Inline styles only** (no CSS files, no Tailwind, no styled-components). Style constants at bottom of each page file.
- No external UI library dependencies.
- Sidebar fires `CustomEvent("medsoft:project_changed")` + writes `localStorage("medsoft_active_project")` on project change.
- `useActiveProject` hook **verifies cached project still exists** on mount (auto-clears stale IDs from re-seeds).
- Pages with `useSearchParams` must be wrapped in `<Suspense>`.
- Mermaid diagrams: use `import("mermaid")` dynamic import; never static.
- **No hardcoded dynamic data.** Pull taxonomies (sources, severities, statuses, component types) from `/meta` endpoints. Fall back to `item.source` raw value when not in the taxonomy.
- Next.js route groups (parens-wrapped folders) preserve URLs — file system is `(compliance)/(maintenance)/feedback/page.tsx`, URL is `/feedback`.

---

## Adding a New Module

Step-by-step in [`docs/developer/adding-a-module.md`](docs/developer/adding-a-module.md). The short form:

1. **Backend**: create `app/modules/<section>/<name>/{__init__,model,schema,router}.py`.
2. **Register** router in `app/main.py`.
3. **Import** model in `alembic/env.py`.
4. **Write migration**: new file in `alembic/versions/` with correct `down_revision`.
5. **Run**: `alembic upgrade head`.
6. **Permissions**: add `(NAME, "desc")` tuples to `seed_phase4.py` `ALL_PERMISSIONS`; wire to roles.
7. **Frontend page**: create `src/app/(<section>)/<name>/page.tsx`.
8. **API client**: add `api.<name>.*` methods to `src/lib/api.ts`.
9. **Sidebar**: insert link in `NavSidebar.tsx` at the correct ascending-clause position.
10. **Seed**: extend `seed_architecture.py` or add a new `seed_section<N>.py` to `seed_all.py`.
11. **Docs**: add developer-side + user-side guides; update `mkdocs.yml` `nav`; update this file.

---

## Running Locally

```bash
# First time
bash setup.sh

# Backend (every time)
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload        # http://localhost:8000
# API docs: http://localhost:8000/docs

# Frontend (every time)
cd frontend && npm run dev           # http://localhost:3000

# Master seed (5 projects + all modules, wipes DB)
cd backend && source .venv/bin/activate
python seed_all.py

# After UI knowledge-base edits — update the fixture
bash export_knowledge.sh
git add backend/fixtures/knowledge_base.sql

# Docs — preview while editing
pip install mkdocs-material   # one-time
mkdocs serve                  # http://127.0.0.1:8002 (use 8002 to avoid the backend's :8000)
mkdocs build                  # emits static HTML into site/
```

---

## Migrations

```bash
cd backend && source .venv/bin/activate
alembic upgrade head                          # apply pending
alembic revision -m "describe change"          # new migration (hand-author preferred)
alembic downgrade -1                          # rollback one step
```

> **Migration footguns:**
> - When adding a Postgres ENUM via `op.create_table`, do **not** also call `op.execute("CREATE TYPE …")` — SQLAlchemy emits it. For `op.add_column` on an existing table, create the type first with `op.execute` and use `create_type=False`.
> - `Requirement.type` is a plain `String(50)`, **not** an Enum. Never use `.value` on it or compare against `RequirementType.xxx`. Use string literals.
> - Forward-only migrations (no implementable downgrade) are fine for destructive changes — document the reason in the docstring and raise `NotImplementedError` in `downgrade()`.

---

## Environment Variables

| File | Variable | Default |
|---|---|---|
| `backend/.env` | `DATABASE_URL` | `postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft` |
| `backend/.env` | `API_PREFIX` | `/api/v1` |
| `backend/.env` | `ANTHROPIC_API_KEY` | *(required for AI features)* |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` |

---

## Phases

| Phase | Status | Scope |
|---|---|---|
| 0 | ✅ Complete | Projects, Requirements, Hierarchy, Excel upload |
| 1 | ✅ Complete | Risk, Traceability tree, Categories |
| 2 | ✅ Complete | Design, Verification, Validation, Audit, Impact Analysis |
| 3 | ✅ Complete | Change Control, Release, DHF, Documents register |
| 4 | ✅ Complete | Auth (JWT), RBAC, Users, Training, Electronic Signatures |
| 5 | ✅ Complete | AI Requirements Generation, Knowledge Base, IEC 62304 §4.3 + §5.1–§5.8 deep |
| 6 | ✅ Complete | Module restructure (platform / compliance) · §6 Maintenance: Feedback Intake, escalation chains, §6.2.3 gate, §6.2.5 notifications, §6.3.2 lineage · §6.2.1.1 Monitor view · DHF §6 inclusion · seed_section6 · full docs suite (developer + user) with mkdocs-material |
| 7 | ✅ Complete | §7 Software Risk Management deepening: `risk_class` discriminator (SAFETY / SECURITY / SAFETY_SECURITY) for IEC 81001-5-1 cyber-readiness · §7.1 RiskContribution table (risk ↔ SoftwareItem / SWComponent) · §7.2 RiskControl gains `component_id` link to §5.3 · §7.3 closed-loop VerificationEvidence sub-table (PASS auto-flips control to VERIFIED) · §7.4 auto-trigger from CR APPROVED with `modifies_released_software` flags impacted risks for re-evaluation · re-evaluation inbox + outcome endpoint · seed_section7 with realistic data · DHF §7 inclusion · docs updated. |
| 7-audit | ✅ Complete | Cross-clause IEC 62304 audit sweep — production-readiness gap closure: §5.1 SDP RBAC on 14 write endpoints · §5.2 composite-SRS approval gate with clause-prefixed errors · §4.3 SWComponent safety_class value validation · §5.4 RequirementDesignLink restricted to leaf (SOFTWARE) categories · §5.6 integration coverage `safety_relevant_only` filter · §5.7 readiness gates for items linked + checklist initialized · §6.2.3 effect-of-change UI on `/change-control` + CR-creation RBAC · §6.2.5 release `notified_by_id` audit trail + notifier-name UI · DHF expanded with §4.4 legacy fields + §6.2.3 `change_requests` section + new summary counters. |
| 8 | ✅ Complete | Cybersecurity (IEC 81001-5-1) — new top-level "Cyber" sidebar group. **8A**: Cybersecurity Plan template (11 sections) + plan page wrapping PlanShell. **8B**: ThreatModel + Threat tables (STRIDE per §5.3 component, CHECK constraints on category + severity, DRAFT→IN_REVIEW→APPROVED lifecycle, `escalated_risk_id` back-FK to §7 risks). **8C**: VulnerabilityReport table (CVE/CVSS/severity/status, optional FKs to affected SOUP + §5.3 component, manual escalate-to-§7 endpoint that creates a Risk with `risk_class=SECURITY` and writes back the FK). **8D**: GET `/sbom/{project_id}` returns CycloneDX 1.5 JSON derived from §8.2.2 SOUP register + open vulnerabilities. Full backend RBAC + audit; frontend pages for `/threat-model`, `/vulnerabilities`, `/sbom`, `/plans/cybersecurity`. |
| 9 | ✅ Complete | Usability Engineering (IEC 62366-1) — new top-level "Use" sidebar group. Cross-regulator (EU MDR Annex I §14 + FDA Human Factors + Health Canada + TGA + PMDA + MHRA all accept this standard). **9A**: Usability Plan template (12 sections covering §5.1–§5.9 plus records retention) + UsabilityFile + UseScenario + UseError tables with bidirectional `escalated_risk_id` back-FK to a §7 Risk row with `risk_class=USABILITY` (the unified register's open-vocab discriminator). DRAFT → IN_REVIEW → APPROVED → OBSOLETE lifecycle matching SDP / Architecture Baselines. Full backend RBAC + audit; `/usability` page renders the §5.1 Use Specification editor + §5.4 scenario tree with inline error escalation. |

---

## Documentation

- **Project documentation lives in `docs/`.** Two trees:
  - `docs/developer/` — architecture, conventions, data model, API reference, IEC clause mapping. For contributors.
  - `docs/user/` — non-technical workflow guides per module + end-to-end walkthrough. For QA / RA / clinical engineers.
- **MkDocs** with mkdocs-material theme. `mkdocs serve` for live preview; `mkdocs build` for static HTML.
- The application sidebar has a **Help** button at the bottom — opens a role-aware popover:
  - **ADMIN / DEVELOPER** roles see both *User Guide* and *Developer Guide* links.
  - All other roles see only *User Guide*.
  - Links open the mkdocs-rendered HTML in a new tab.
- **Update docs before every commit.** Documentation is audit evidence — stale docs are worse than no docs.
