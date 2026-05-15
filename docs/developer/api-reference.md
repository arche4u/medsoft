# API Reference

All endpoints sit under `/api/v1`. JWT bearer auth required on everything except `/auth/login` and `/health`. Interactive OpenAPI docs at `http://localhost:8000/docs`.

This page lists endpoint groups by IEC clause. For full request/response shapes, run the app and read `/docs` — it's auto-generated and always current.

## Auth & Identity (`platform/`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Username + password → JWT (form-encoded body) |
| GET / POST / PUT / DELETE | `/users` | User accounts |
| GET / POST / PUT / DELETE | `/roles` | Roles + role↔permission mapping |
| GET | `/roles/permissions` | List all defined permissions |
| GET | `/audit/logs` | Audit log (filterable) |
| POST | `/esign/sign` | Apply a 21 CFR Part 11 electronic signature |
| GET / POST / PUT / DELETE | `/training` | Training records |

## Knowledge & Reference

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/knowledge` | Standards reference library (global + project) |
| POST | `/ai/generate-requirements` | Claude API-backed requirement generation |
| GET / POST / PUT / DELETE | `/documents` | Document Register (SOP / Plans / Technical) |
| POST | `/attachments/upload` | Upload a file attached to any entity |

## Projects

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/projects` | Project CRUD |

## §4.3 — Software Items

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/software-items` | Safety-classification tree |
| GET | `/software-items/{id}/compliance` | Per-item §4.3 compliance check |
| PUT | `/software-items/{id}/risks` | Set risk links |
| PUT | `/software-items/{id}/requirements` | Set requirement links |

## §5.1 — Software Development Plan

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/sdp` | SDP CRUD |
| POST | `/sdp/{id}/fork` | Fork a new version |
| PUT | `/sdp/{id}/status` | Transition (DRAFT→IN_REVIEW→APPROVED→OBSOLETE) |
| POST / PUT / DELETE | `/sdp/{id}/sections` | Sections |
| POST / PUT / DELETE | `/sdp/{id}/phases` | Lifecycle phases |
| POST / PUT / DELETE | `/sdp/{id}/roles` | Project roles |
| GET | `/sdp/{id}/compliance` | §5.1 compliance check |

## §5.2 — Requirements

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/requirements` | Requirement CRUD |
| GET / POST / PUT / DELETE | `/requirements/categories` | Per-project category taxonomy |
| GET / POST / PUT / DELETE | `/requirements/category-baselines` | Per-category versioned baselines |
| PUT | `/requirements/category-baselines/{id}/status` | Transition |
| GET / POST / PUT / DELETE | `/requirements/baselines/` | Composite SRS baselines |
| POST | `/requirements/upload` | Bulk import from Excel |

## §5.3 — Architecture

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/architecture` | Component CRUD |
| GET | `/architecture/tree/{project_id}` | Full tree |
| GET | `/architecture/component-types` | SYSTEM/SUBSYSTEM/ITEM/UNIT taxonomy |
| GET / POST / PUT / DELETE | `/architecture/interfaces` | Interfaces |
| POST / DELETE | `/architecture/interfaces/{id}/data-flows` | Data flows |
| GET | `/architecture/{id}/compliance` | §5.3.6 verification |
| PUT | `/architecture/{id}/system-tests` | Link §5.7 tests |
| PUT | `/architecture/{id}/status` | Transition (DRAFT→REVIEW→APPROVED) |
| GET / POST / PUT / DELETE | `/architecture/baselines/` | Architecture baselines |
| PUT | `/architecture/baselines/{id}/status` | Baseline transitions |

## §5.4 — Detailed Design

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/design/elements` | Design element CRUD |
| GET / POST / DELETE | `/design/links` | Requirement ↔ design links |

## §5.5 — Software Units

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/units` | Software unit CRUD |
| POST / PUT / DELETE | `/units/{unit_id}/code-artifacts` | Code artifact entries |
| POST / PUT / DELETE | `/units/{unit_id}/testcases` | Unit test cases |
| POST | `/units/testcases/{id}/results` | Record a test result |

## §5.6 — Integration Tests

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/integration-tests` | ITC CRUD |
| POST | `/integration-tests/{id}/results` | Record a result |
| PUT | `/integration-tests/{id}/requirements` | Link requirements |
| PUT | `/integration-tests/{id}/risks` | Link risks |
| GET | `/integration-tests/coverage/{project_id}` | Coverage rollup |

## §5.7 — System Testing

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/system-testing` | STC CRUD |
| POST | `/system-testing/{id}/results` | Record a result |
| PUT | `/system-testing/{id}/requirements` | Link additional requirements |
| PUT | `/system-testing/{id}/risks` | Link risks |
| GET | `/system-testing/coverage/{project_id}` | Coverage rollup |
| GET | `/system-testing/release/{id}/readiness` | Multi-gate release readiness check |

## §5.8 — Release Management

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/release/releases` | Release CRUD (POST accepts `parent_release_id`) |
| GET | `/release/releases/{id}` | Release detail with items |
| PATCH | `/release/releases/{id}/transition` | DRAFT→UNDER_REVIEW→APPROVED→RELEASED |
| PATCH | `/release/releases/{id}/notify` | **§6.2.5** record user/regulator notification |
| GET | `/release/releases/{id}/readiness` | Test-pass readiness |
| POST / DELETE | `/release/items` | Add/remove release items |
| POST / GET | `/approvals` | Generic approval workflow |

## §6.2.1 — Feedback Intake

| Method | Path | Purpose |
|---|---|---|
| GET | `/feedback/meta` | Source / severity / status taxonomies |
| GET / POST / PUT / DELETE | `/feedback` | Feedback CRUD |
| PATCH | `/feedback/{id}/evaluate` | §6.2.1.2 evaluation + §6.2.1.3 safety assessment |
| PATCH | `/feedback/{id}/escalate` | §6.2.2 → ProblemReport / §6.2.3 → ChangeRequest |
| PATCH | `/feedback/{id}/close` | Close with rationale |

## §6.2 / §6.3 — Change Control

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT | `/change-control/requests` | Change request CRUD |
| PATCH | `/change-control/requests/{id}/transition` | State transitions (with §6.2.3 gate) |
| POST / DELETE | `/change-control/impacts` | Impact rows |

## §7 — Risk Register (ISO 14971)

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/risks/` | Risk CRUD |
| PUT | `/risks/{id}/status` | Risk lifecycle transitions |
| GET / POST / PUT / DELETE | `/risks/{risk_id}/controls` | Control measures |
| PUT | `/risks/controls/{id}` | Update control (incl. VERIFIED state) |
| GET / PUT | `/risks/{risk_id}/residual` | Residual risk assessment |
| GET | `/risks/dashboard/{project_id}` | Dashboard rollups |
| GET / POST / PUT / DELETE | `/risks/categories` | Risk categories |
| GET / POST / PUT | `/risks/safety-profile` | Per-project safety profile |

## §8 — Configuration Management

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/config-mgmt/items` | Configuration items |
| GET / POST / PUT / DELETE | `/config-mgmt/baselines` | Baselines |
| POST / DELETE | `/config-mgmt/baselines/{id}/items` | Items in a baseline |
| POST | `/config-mgmt/baselines/{id}/release` | Lock baseline for release |
| GET | `/config-mgmt/release-check/{project_id}` | Pre-release CM gate |

## §9 — CAPA / Problem Resolution

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/capa/problem-reports` | Problem reports |
| GET / POST / DELETE | `/capa/problems/{id}/root-causes` | Root causes |
| GET / POST / PUT / DELETE | `/capa/capas` | CAPA actions |
| POST | `/capa/capas/{id}/verifications` | Verification entries |
| GET | `/capa/release-check/{project_id}` | Pre-release CAPA gate |

## Plans (§6.1 / §7 / §8.1 / §9 templates)

| Method | Path | Purpose |
|---|---|---|
| GET | `/plans/types` | All plan types (built-in + custom slugs) |
| GET / POST / PUT / DELETE | `/plans/` | Plan CRUD |
| POST | `/plans/{id}/fork` | Fork new version |
| PUT | `/plans/{id}/status` | DRAFT→IN_REVIEW→APPROVED→OBSOLETE |
| POST / PUT / DELETE | `/plans/{id}/sections` | Plan sections |
| GET | `/plans/{id}/compliance` | Per-plan compliance check |

## Cross-cutting (V-model + DHF + impact)

| Method | Path | Purpose |
|---|---|---|
| GET | `/validation/records` | USER-requirement validation records |
| GET | `/traceability/{project_id}` | Full V-model tree (req → design → test) |
| GET | `/impact-analysis/{requirement_id}` | Spider chart of downstream artefacts |
| POST | `/dhf/generate/{project_id}?release_id=…` | Generate a DHF (optionally bound to a release) |
| GET | `/dhf/documents` | List historical DHFs |
| GET | `/dhf/documents/{id}` | Retrieve DHF content |
