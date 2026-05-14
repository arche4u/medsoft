# MedSoft — TODO

Audit updated 2026-05-14. Severity legend: **HIGH** = compliance/security/data-loss risk · **MED** = functionality gap · **LOW** = cleanup.

Phase status: Phases 0–5 complete. Phase 6 in progress.
Modules added since Phase 5: SW Architecture (§5.3), SDP (§5.1), Software Items (§4.3), Units (§5.5), Integration Tests (§5.6), System Testing (§5.7), Config Management (§8), CAPA (§9), Attachments (polymorphic), Plans (§6/§7/§8/§9 — done), Custom Plans.

---

## CURRENT SPRINT (2026-05-14)

### Plans module (IEC 62304 §6 / §7 / §8 / §9) — DONE
- [x] Backend: model, schema, router, defaults
- [x] Wire: alembic/env.py import + migration `l3h4i5j6k7l8` + main.py register
- [x] Frontend: shared `PlanShell` + dedicated pages — `/plans/maintenance`, `/plans/risk-mgmt`, `/plans/config-mgmt`, `/plans/problem-resolution`
- [x] SDP (§5.1) refactored onto the same shared component (`@/components/plan/shared`)
- [x] NavSidebar: flat "IEC 62304 Plans" group in Docs section
- [x] PDF export built into `PlanShell` header for all plan pages
- [x] Custom plans: `/plans` management page + `/plans/custom/[type]` dynamic workspace

### §5.4 Design Elements — DONE
- [x] Design module restructured: elements link to `sw_components` (migration `k8f9a0b1c2d3` applied; `type`/`category_id` dropped, `design_categories` table removed)
- [x] Seed design elements linked to components (`seed_architecture.py` — 38 elements / 5 projects, parent/component consistency verified)
- [x] CRUD verified on component-linked schema (create, nested create, cross-component rejection, update, link, parent-delete-detaches-child)
- [x] Frontend `/design` page renders end-to-end, grouped by §5.3 component

### §4.3–§5.4 fix-up — DONE
- [x] Audit logging added to `software_items`, `architecture` (+ baseline_router), `design` routers — all writes log `user_id`
- [x] RBAC: `require_permission()` on all write endpoints of `software_items`, `architecture` (+ baselines), `requirements`, `design`. New permissions `*_SOFTWARE_ITEM`, `*_ARCHITECTURE` seeded + wired to roles
- [x] §4.3 inheritance-driven classification: child inherits parent's safety class; a lower class requires `classification_justification` (backend 400 + frontend gate)
- [x] `architecture/page.tsx` ported to `useActiveProject()` hook
- [x] NavSidebar reordered to ascending IEC 62304 clause: Classification (§4.3) → Requirements (§5.2) → Design (§5.3/§5.4) → Verification (§5.5–§5.7) → Risk (§7)

### §5.5 Software Unit Implementation & Verification — DONE
- [x] Audit logging + RBAC on `units` router (new `*_SOFTWARE_UNIT` permissions; `record_result` gated by `EXECUTE_TEST`)
- [x] §5.5.5 Class C verification gate confirmed (coverage ≥ 80% required for Class C in `_run_compliance` + `transition_status` to VERIFIED)
- [x] Seed data: `_seed_software_units` in `seed_architecture.py` — 17 units / 5 projects, each with code artifact + 2 passing unit tests w/ coverage + requirement trace link
- [x] Fixed pre-existing `MissingGreenlet` bug — `db.refresh()` expired `lazy="selectin"` relationships; replaced with `_reload_unit`/`_reload_testcase` re-select
- [x] CRUD + status gates + frontend `/units` verified end-to-end

### §5.6 Software Integration & Integration Testing — DONE
- [x] Audit logging + RBAC on `integration_tests` router (new `*_INTEGRATION_TEST` permissions; `record_result` gated by `EXECUTE_TEST`)
- [x] Fixed the same `MissingGreenlet` bug (`db.refresh` → `_reload_test` re-select)
- [x] Seed data: `_seed_integration_tests` in `seed_architecture.py` — 15 tests / 5 projects, one per §5.3 interface, each with a passing result (latency under threshold, data-integrity PASS) + requirement trace link
- [x] Latency-threshold validation confirmed (PASS over threshold → 400) + frontend `/integration-tests` verified

### §5.7 Software System Testing — DONE
- [x] Audit logging + RBAC on `system_testing` router — system-test endpoints use new `*_SYSTEM_TEST` permissions; release-management endpoints (checklist / artifacts / snapshot) gated by existing `CREATE_RELEASE`; `record_result` gated by `EXECUTE_TEST`
- [x] Fixed the same `MissingGreenlet` bug (`db.refresh` → `_reload_test` re-select)
- [x] Seed data: `_seed_system_tests` in `seed_architecture.py` — 30 tests / 5 projects (6 per project), one per SOFTWARE requirement, each with a passing result; safety-relevant tests trace to a project hazard
- [x] CRUD + RBAC + frontend `/system-testing` verified

### §5.8 Software Release — DONE
- [x] RBAC: `create_release` / `add_release_item` / `delete_release_item` now require `CREATE_RELEASE`; `transition_release` keeps its inline per-target-status checks (APPROVE_RELEASE / PUBLISH_RELEASE) — correct, since REVIEWER approves without holding CREATE_RELEASE
- [x] Audit logging completed — `add_release_item` / `delete_release_item` now logged (create/transition already were); all four confirmed firing
- [x] Seed data: `_seed_release_baselines` in `seed_architecture.py` — a configuration-baseline snapshot (IEC 62304 §8.3) + BUILD/RELEASE_NOTES/SBOM artifacts for each of the 10 existing releases (releases + 75 items were already seeded by `seed_comprehensive.py`)
- [x] §5.7 release-management endpoints (checklist / artifacts / snapshot) now exercise end-to-end against seeded release data; RBAC verified
- [x] No `MissingGreenlet` bug — `ReleaseRead` carries no relationships; `get_release` uses explicit `selectinload`

**IEC 62304 §5 (Development process) — §5.1 through §5.8 all complete.**

### Release readiness — bug fixes + V-model coverage — DONE
- [x] Fixed `system_testing` 500s — `Risk.project_id` doesn't exist (risks join through `requirements`); fixed in `_compute_readiness` + `capture_snapshot` (matches the earlier seed-script fix)
- [x] Fixed DHF generator 500 — referenced `DesignElement.type`, a column dropped in the §5.4 restructure (`k8f9a0b1c2d3`); now uses `component_id`
- [x] `get_coverage` is V-model-correct — system-test coverage counts SYSTEM + SOFTWARE requirements only; USER requirements are *validated*, not system-tested
- [x] `_compute_readiness` — added "All USER requirements validated" gate (checks PASSED `ValidationRecord`s); fixed gate 7 which checked a non-existent `RESOLVED` risk status (now ACCEPTED/CLOSED, the real terminal states)
- [x] Built `/validation` page — backend + API existed but had no UI; IEC 62304 §5.7 / ISO 13485 design validation
- [x] Electrosurgical Generator: complete-release fixture — all 9 readiness gates green (25/25 system-test coverage, 10/10 USER validated, HIGH risks resolved, checklist complete)

### Cleanup + seed pipeline — DONE
- [x] Removed orphaned `seed_test.py`; untracked `tsconfig.tsbuildinfo` + `.gitignore` rule; removed redundant `/impact` page (impact analysis lives in the Trace Matrix "impact spider")
- [x] NavSidebar reorganised by IEC 62304 clause: Classification (§4.3) → Requirements (§5.2) → Design (§5.3/§5.4) → Verification (§5.5–§5.7) → Risk (§7); "Test & Trace" split into "Test Register" + "Traceability"; Docs "Change Control" grab-bag split into Change & Configuration / Problem Resolution / Release & DHF
- [x] `seed_all.py` reordered (comprehensive → phase4 → architecture) so e-signature seeding can resolve users; `_seed_capa` + `_seed_esign` added; verified `seed_all.py` reproduces the full dataset

### Next
- §6 Maintenance / §8 Configuration Management / §9 Problem Resolution, or continue section A (A1 audit logging still open for `testcases`, `risks`, `config_mgmt`, `capa`).

---

## A. Compliance & regulatory gaps (HIGH)

- [ ] **A1. Audit logging absent.** ✓ Done: `units`, `architecture`, `software_items`, `design`, `requirements`, `integration_tests`, `system_testing`, `release`. Still missing in: `testcases`, `risks`, `config_mgmt`, `capa`. IEC 62304 §8/§9 require write-trail. Add `audit()` in every POST/PUT/DELETE.
- [ ] **A2. RBAC enforcement missing in newer modules.** ✓ Done: `software_items`, `architecture` (+ baselines), `requirements`, `design`, `units`, `integration_tests`, `system_testing`, `release`. Still open: `testcases`, `risks`, `verification`, `validation`, `config_mgmt`, `capa`. Pattern: new `*_<MODULE>` permissions in `seed_phase4.py` + `require_permission()` on writes.
- [ ] **A3. Release gate missing checks.** [release/router.py](backend/app/modules/release/router.py) gates SDP, training, system_testing, integration_tests, config_mgmt, CAPA, esign, exec PASS. Missing: software_items classification, architecture component APPROVED status, units Class C verification, validation records for USER reqs, DHF presence, Plans APPROVED status.
- [ ] **A4. DHF generator skips Phase 6 modules.** [dhf/router.py](backend/app/modules/dhf/router.py) embeds SDP but still missing: software units, architecture components/interfaces, software item safety classes, system + integration test reports, CAPA records, configuration baselines, Plans. Each new module follows the `_serialize_<name>(...)` shape.
- [ ] **A5. Traceability tree incomplete.** [traceability/router.py](backend/app/modules/traceability/router.py) covers USER→SYSTEM→SOFTWARE + design + testcase + execution. Missing: software units, architecture components, integration/system test cases, risk controls + residual risk, CAPA links.
- [ ] **A6. Import smoke test missing.** Module import errors only surface at server start. Add a smoke test or CI step that imports `app.main` after every change. (`smoke_test.py` partially covers this — extend it.)

## B. Wiring & integration (MED)

- [ ] **B1. AI generation limited to requirements.** Add: `/generate-risks` (from SWR), `/generate-testcases` (from SWR/component), `/generate-root-causes` (from problem report).
- [ ] **B2. Knowledge base under-leveraged.** Used only by AI requirement generation. Other modules (risks, system_testing, capa, compliance checks) reference hardcoded constants.
- [ ] **B3. Document register missing newer doc types.** Missing: Software Items Register, Configuration Management Audit Checklist, CAPA / Problem Resolution SOP, Plans Register entries (Maintenance Plan, Risk Mgmt Plan, Config Mgmt Plan, Problem Resolution Plan).
- [ ] **B4. CAPA → Risk feedback loop not wired.** `ProblemLink(linked_type=RISK)` should flip `Risk.re_evaluation_required = True`.
- [ ] **B5. CAPA → Re-validation enforcement.** CAPA verifications don't trigger or check downstream test re-runs.

### Done
- [x] **B6. SRS versioning + signoff.** Two-tier SRS baselines, DRAFT→IN_REVIEW→APPROVED→OBSOLETE, fork/lock, CM mirror, 3-stage signoff mixin, version history + diff, PDF document control block.
- [x] **B7. Architecture baseline.** Versioned approval, signoff, lock, CM mirror — mirrors SDP/SRS pattern.

## B-bonus. SDLC change-impact propagation (partial — v1 landed)

**v1 landed for Requirements→Requirements chain:**
- `Requirement.needs_review` + `needs_review_reason` columns (migration `f3a4b5c6d7e8`).
- Parent-chain propagation on title/description edit; `GET /requirements/{id}/impact-preview`; `POST /requirements/{id}/acknowledge-review`; `GET /requirements/?needs_review=true`.
- Frontend: ⚠ chip + inline ack + `ChangeImpactPanel` banner.

**Still queued:**

| Source change | Linked artifacts to notify |
|---|---|
| SOFTWARE req edit | DesignElements (RequirementDesignLink), TestCases (TraceLink), Risks, SoftwareUnits |
| DesignElement edit | Linked SOFTWARE reqs, TestCases, SoftwareUnits |
| Risk edit | Linked controls, residual risk, mitigation reqs |
| Architecture / Interface edit | Integration tests, components |

To finish: generalise `needs_review` into a `change_impact` service. Best built after Architecture, Risk, TestCase modules get same versioning treatment as SDP/SRS.

## C. Seed & data (MED)

- [ ] **C1. Seed scripts don't populate Phase 6 modules.** ✓ done: SDP, `SWComponent`/`SWInterface` (`seed_architecture.py`), `SoftwareItem` + req/risk links (`_seed_software_items` — §4.3 inheritance tree, 35 items), `SoftwareUnit` + `CodeArtifact` + `UnitTestCase`/`UnitTestResult` (`_seed_software_units`), `IntegrationTestCase` + `IntegrationTestResult` (`_seed_integration_tests`), `SystemTestCase` + `SystemTestResult` + `STRiskLink` (`_seed_system_tests`), `ReleaseSnapshot` + `ReleaseArtifact` (`_seed_release_baselines` — `Release`/`ReleaseItem` were already seeded by `seed_comprehensive.py`). Still missing: `CMConfigItem`, `CMBaseline`, `CMChangeRequest`, `ProblemReport`, `CAPA`, Plans.

## C-bonus. Version control coverage (MED)

- [ ] **C3. Versioned baselines only on §5.1/§5.2/§5.3.** Full document version control (DRAFT→IN_REVIEW→APPROVED→OBSOLETE, fork-to-new-version, signoff, lock, CM-mirror) exists for SDP (§5.1), SRS/Requirements (§5.2), Architecture (§5.3). **Not** on §4.3 software items, §5.4 design elements, §5.5 units, §5.6 integration tests, §5.7 system tests — those have at most a single-record `status` field (§4.3, §5.5), no versioning/fork/baseline. To make version control uniform through §5.7, extend the SDP/SRS baseline pattern to those modules.
- [ ] **C2. Foreign keys without `ondelete`.** ~48 FKs lack `ondelete=` — models drifted from DB. Re-align models so `Base.metadata.create_all` produces correct constraints.

## D. Frontend gaps (MED)

- [ ] **D1. Pages re-implement project context instead of `useActiveProject()`.** ✓ done: [architecture/page.tsx](frontend/src/app/architecture/page.tsx). Remaining: [capa/page.tsx](frontend/src/app/capa/page.tsx), [config-mgmt/page.tsx](frontend/src/app/config-mgmt/page.tsx), [units/page.tsx](frontend/src/app/units/page.tsx), [integration-tests/page.tsx](frontend/src/app/integration-tests/page.tsx).
- [ ] **D2. PDF export rolling out.** Shared helper at [pdfExport.ts](frontend/src/lib/pdfExport.ts). ✓ DHF · ✓ SDP · ✓ SRS. Pending: risks (Risk Register), testcases + verification (Test Reports), system-testing, config-mgmt (Baseline Report), traceability (TM), capa, **plans**.
- [ ] **D3. Silent fetch failures.** Many pages use `.catch(() => {})`. Replace with error-state pattern.
- [ ] **D4. Permission-aware UI.** Gate buttons by `permissions` from auth token once **A2** lands.

## E. Cleanup (LOW)

- [ ] **E1. Duplicate seed scripts.** Six seed files remain. Fold into single entrypoint with flags.
- [ ] **E2. Stale `Mapped[]` vs `Column()` style.** Pre-Phase-6 modules use `Mapped`; newer ones use `Column`. Pick one.
- [ ] **E3. Mixed UUID-string handling in routers.** Standardize on path-typed UUIDs.
- [ ] **E4. Frontend `as React.CSSProperties` repetition.** Extract a tiny `styles.ts` with common tokens.
- [ ] **E5. SRS bar N+1.** Fold components into list response.
- [x] **E6. Remove hardcoded category builtins.** ✓ Done — `readable_id_prefix` column, parent chain, dynamic hierarchy.

## F. Phase 6 roadmap

- [ ] **F1. PDF export framework** — see **D2**.
- [ ] **F2. ERP integration** — needs separate design doc.
- [ ] **F3. Advanced reporting** — release-readiness dashboard across all gates.
- [ ] **F4. §5.4 Design Elements end-to-end** — component-linked schema live, seed + frontend verification needed.

---

## Quick wins (do first)

1. **A6** — extend `smoke_test.py` to import `app.main` (5 min).
2. **D1** — swap 5 pages to `useActiveProject()` (15 min, pure deletion).
3. **A1** — add `audit()` to 9 unaudited routers (1–2 h, mechanical).
4. **C1** — extend `seed_comprehensive.py` with Phase 6 demo data.

## Heavy lifts (plan separately)

- **A4 + A5** DHF expansion + Traceability tree — bundle, touch same pages/PDF.
- **A2** RBAC rollout — needs permission catalog decisions first.
- **B4 + B5** CAPA feedback loops — write integration tests first.
- **B-bonus full** SDLC change-impact — after Architecture/Risk/TestCase versioning done.
