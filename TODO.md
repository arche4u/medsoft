# MedSoft — TODO

Audit dated 2026-05-08. Severity legend: **HIGH** = compliance/security/data-loss risk · **MED** = functionality gap · **LOW** = cleanup.

Phase status (per CLAUDE.md): Phases 0–5 complete. Phase 6 planned (PDF export, ERP, reporting). Modules added since: SW Architecture, SDP, Software Items, Units, Integration Tests, System Testing, Config Management, CAPA.

---

## A. Compliance & regulatory gaps (HIGH)

These break IEC 62304 traceability or RBAC expectations for a regulated platform.

- [ ] **A1. Audit logging absent in 9 modules.** ~~`sdp` ✓ done~~. ~~`requirements` ✓ done (CRUD + Excel upload + categories)~~. Still missing in: `testcases`, `risks`, `units`, `integration_tests`, `system_testing`, `config_mgmt`, `capa`, `architecture`, `software_items`. IEC 62304 §8/§9 require write-trail. Add `audit()` in every POST/PUT/DELETE.
- [ ] **A2. RBAC enforcement missing in newer modules.** `require_permission(...)` only used in `release`, `change_control`, `users`, `training`. All Phase 6 modules (`units`, `system_testing`, `architecture`, `sdp`, `capa`, `config_mgmt`, `risks`, `software_items`) accept writes from any authenticated user. Define permissions per module and gate the destructive endpoints.
- [ ] **A3. Release gate missing checks.** [release/router.py](backend/app/modules/release/router.py) currently gates SDP, training, system_testing, integration_tests, config_mgmt, CAPA, esign, exec PASS. Missing: software_items classification, architecture component APPROVED status, units Class C verification (currently checked indirectly via system_testing readiness only), validation records for USER reqs, DHF presence.
- [ ] **A4. DHF generator skips Phase 6 modules.** [dhf/router.py](backend/app/modules/dhf/router.py) now also embeds SDP (✓ done — `_serialize_sdp` helper sets the per-module pattern). Still missing: software units, architecture components/interfaces, software item safety classes, system + integration test reports, CAPA records, configuration baselines. Each new module follows the `_serialize_<name>(...)` shape added for SDP.
- [ ] **A5. Traceability tree incomplete.** [traceability/router.py](backend/app/modules/traceability/router.py) tree covers USER→SYSTEM→SOFTWARE + design + testcase + execution. Does not include software units, architecture components, integration test cases, system test cases, risk controls + residual risk, CAPA links. V-model trace breaks at the unit layer.
- [ ] **A6. Backend imports were broken on push.** Three routers imported `app.core.db` (does not exist) instead of `app.core.database`. Fixed in `e2f40aa`, but no test catches this — module import errors only surface at server start. Add a smoke test or CI step that imports `app.main` after every change.

## B. Wiring & integration (MED)

- [ ] **B1. AI generation limited to requirements.** [ai/router.py](backend/app/modules/ai/router.py) only has `/generate-requirements`. Add: `/generate-risks` (from SWR), `/generate-testcases` (from SWR/component), `/generate-root-causes` (from problem report).
- [ ] **B2. Knowledge base under-leveraged.** Used only by AI requirement generation. Other modules (risks, system_testing, capa, compliance checks) reference hardcoded constants instead of `KnowledgeEntry`. Make compliance rules / risk taxonomies / RCA categories knowledge-driven.
- [ ] **B3. Document register missing newer doc types.** `DOCUMENT_REGISTRY` in [documents/router.py](backend/app/modules/documents/router.py) has 34 canonical docs but is missing: Software Items Register, Configuration Management Audit Checklist, dedicated CAPA / Problem Resolution SOP entry. SOP-001..012 are present but generic.
- [ ] **B4. CAPA → Risk feedback loop not wired.** Per spec, problem reports impacting safety should trigger risk re-evaluation; module captures `affected_item_type=RISK` but doesn't flip the risk's `re_evaluation_required` flag. Wire `ProblemLink(linked_type=RISK)` to update `Risk.re_evaluation_required = True`.
- [ ] **B5. CAPA → Re-validation enforcement.** Spec requires that if CAPA affects code → re-run unit + integration tests; affects requirement → re-run system tests. Currently only the config_mgmt impact analysis tracks `revalidation_status`. CAPA verifications don't trigger or check downstream test re-runs.

## B-bonus. SRS versioning + signoff landed

✓ **B6. SDP + SRS now have IEC 62304 / 21 CFR Part 820 versioned approval with 3-stage signoff.**

- **Tables**: `requirements_baselines` + `requirements_baseline_items`. Snapshot freezes readable_id/type/title/description/parent per requirement at approval and survives later edits/deletions of live rows.
- **State machine** (mirrors SDP): DRAFT → IN_REVIEW → APPROVED → OBSOLETE. Forking an APPROVED baseline creates a new DRAFT and unlocks edits.
- **Lock**: live requirements + categories are locked from create/update/delete/upload when no DRAFT/IN_REVIEW baseline exists. Backend returns 400 with "fork the baseline" guidance via [requirements/lock.py](backend/app/modules/requirements/lock.py).
- **CM mirror**: every APPROVED baseline auto-creates a `CMBaseline` named `SRS v{version}` so it shows up under Config Management → Baselines.
- **3-stage signoff** ([backend/app/core/approval_signoff.py](backend/app/core/approval_signoff.py)): `ApprovalSignoffMixin` adds `prepared_by/at`, `reviewed_by/at`, `approved_by/at` to **both** SDP and `requirements_baselines`. `prepared_by` set on DRAFT→IN_REVIEW; `reviewed_by` + `approved_by` required on IN_REVIEW→APPROVED. `check_independence()` returns a non-blocking warning when reviewer == approver. Both transition endpoints now return a `{x, warnings: []}` envelope.
- **Frontend**: [SrsBaselineBar.tsx](frontend/src/app/requirements/SrsBaselineBar.tsx) shows the current signoff trail, version history table (clickable rows), approval form with reviewer + approver inputs, warning notice, and lock banner. [SrsHistoryDetail.tsx](frontend/src/app/requirements/SrsHistoryDetail.tsx) renders the frozen requirements of any past baseline plus a "Compare with" diff (added / removed / changed by `readable_id`). SDP page's ApprovalTab updated with the same 3-stage form.
- **PDFs**: shared `documentControlHtml` + `revisionHistoryHtml` helpers in [pdfExport.ts](frontend/src/lib/pdfExport.ts) — both SDP and SRS PDFs now print a Document Control block (prepared/reviewed/approved) at the top and a Revision History table at the end.

The same hybrid pattern (module-owned baseline + CM mirror + lock + signoff mixin + version history + diff) is the right shape for upcoming versioned artifacts: Risk Register (§7), Architecture (§5.3), System Test Plan (§5.8). Reuse this template — `ApprovalSignoffMixin` is already extracted.

## B-bonus2. SDLC change-impact propagation (partial — v1 landed)

**v1 (uncommitted) — landed for the Requirements→Requirements parent/child chain:**
- `Requirement.needs_review` + `needs_review_reason` columns (migration `f3a4b5c6d7e8`).
- `update_requirement` walks the parent_id chain downward when title/description changes and flags every descendant — works across categories (e.g. editing a USER req flags its SYSTEM + SOFTWARE descendants).
- `GET /requirements/{id}/impact-preview` returns the descendant list for the pre-edit confirmation modal.
- `POST /requirements/{id}/acknowledge-review` clears the flag (audit-logged).
- `GET /requirements/?needs_review=true` filter for SDLC monitoring.
- Frontend: ⚠ needs-review chip on each requirement row with an inline `ack` button. Project-wide `ChangeImpactPanel` banner at the top of the requirements page shows the count per category and an "Acknowledge all" action. Pre-edit `window.confirm` previews the impacted descendants before saving.

**Still queued (the broader SDLC propagation the user described):**

| Source change | Linked artifacts that should also be notified |
|---|---|
| SOFTWARE req edit | DesignElements (RequirementDesignLink), TestCases (TraceLink), Risks (partially wired), SoftwareUnits |
| DesignElement edit | Linked SOFTWARE reqs, TestCases, SoftwareUnits |
| Risk edit | Linked controls, residual risk, mitigation reqs |
| TestCase / verification edit | Linked SOFTWARE reqs |
| Architecture / Interface edit | Integration tests, components |

**To finish this** (user goal: *"whichever is linked, any changes should be notified and corrected in linked or below sections — easy to monitor complete SDLC"*): generalise the `needs_review` pattern into a small `change_impact` service that, given an entity, returns its downstream V-model artifacts. Hooks in every write endpoint that touches linkable artifacts. Project SDLC dashboard rolls up open acknowledgements across modules. "Still valid / needs change" per-row choice in the confirmation modal. Auto-fork downstream draft baselines when a category baseline already exists.

Best built after the Architecture (§5.3), Risk, TestCase modules get the same versioning treatment as SDP/SRS so "fork to acknowledge" works uniformly. Estimate: 3–4 hours after that.

## C. Seed & data (MED)

- [ ] **C1. Seed scripts don't populate Phase 6 modules.** ~~`SDP` ✓ done — `seed_comprehensive.py` now creates an APPROVED SDP per project via [app/modules/sdp/seed.py](backend/app/modules/sdp/seed.py)~~. Still missing seed data for: `SoftwareUnit`, `IntegrationTestCase`, `SystemTestCase`, `CMConfigItem`, `CMBaseline`, `CMChangeRequest`, `ProblemReport`, `CAPA`, `SWComponent`, `SWInterface`, `SoftwareItem`. Pattern: each module exports a `seed_*` helper from its own folder; `seed_comprehensive.py` calls them.
- [ ] **C2. Foreign keys without `ondelete`.** ~48 FKs lack `ondelete=` — including `requirements.parent_id`, `design_elements.parent_id`, `validation.related_requirement_id`, plus older release/training/dhf links. Migration `a1b2c3d4e5f6_fix_fk_cascade_deletes.py` patched some at the DB level but the SQLAlchemy models are still drifted. Re-align models so dev-time `Base.metadata.create_all` produces correct constraints.

## D. Frontend gaps (MED unless noted)

- [ ] **D1. Five pages still re-implement project context instead of using `useActiveProject()`.** ~~`sdp/page.tsx` ✓ done~~. Remaining: [capa/page.tsx](frontend/src/app/capa/page.tsx), [config-mgmt/page.tsx](frontend/src/app/config-mgmt/page.tsx), [units/page.tsx](frontend/src/app/units/page.tsx), [architecture/page.tsx](frontend/src/app/architecture/page.tsx), [integration-tests/page.tsx](frontend/src/app/integration-tests/page.tsx). Replace with the shared hook from [src/lib/useActiveProject.ts](frontend/src/lib/useActiveProject.ts).
- [ ] **D2. PDF export rolling out to all modules.** Shared helper landed at [frontend/src/lib/pdfExport.ts](frontend/src/lib/pdfExport.ts) (`printPdf`, `tableHtml`, `esc`). ✓ DHF (existing). ✓ SDP — [sdp/pdf.ts](frontend/src/app/sdp/pdf.ts). ✓ Requirements (SRS) — [requirements/pdf.ts](frontend/src/app/requirements/pdf.ts). Still pending: risks (Risk Register), testcases + verification (Test Reports), system-testing (System Test Report), config-mgmt (Baseline Report), traceability (TM), capa (Problem Resolution Report). Pattern per page: add `pdf.ts` sibling, build body HTML, call `printPdf({title, subtitle, bodyHtml})`.
- [ ] **D3. Silent fetch failures.** Many newer pages use `.catch(() => {})` in `useEffect` data loads (e.g. ReleaseBanner in capa/config-mgmt). Replace with a small error-state pattern so users see "failed to load" instead of empty UI.
- [ ] **D4. Permission-aware UI.** Frontend doesn't hide actions the user lacks permission for. Once **A2** lands, gate buttons (`Release`, `Approve CR`, `Verify CAPA`) by `permissions` from the auth token.

## E. Cleanup (LOW)

- [ ] **E5. SRS bar N+1: composite hydration.** [SrsBaselineBar.tsx](frontend/src/app/requirements/SrsBaselineBar.tsx) calls `baselines.list` then `baselines.get(id)` for each composite to get its components. Fold components into the list response (or return summaries with components inlined) so the page loads in a single round trip.

- [x] **E6. Remove hardcoded category builtins across the codebase.** ✓ Done. Category metadata is now the single source of truth for everything dynamic about a requirement category. Highlights:
  - New column `requirement_categories.readable_id_prefix` (migration `g4b5c6d7e8f9`). Backfilled URQ/SYS/SWR; new categories pick their own (defaults to first 3 letters of name).
  - Parent chain wired on category rows: SYSTEM.parent_id=USER, SOFTWARE.parent_id=SYSTEM per project. Migration backfills existing rows; `_ensure_builtins` keeps it consistent for new projects.
  - `_validate_hierarchy` in [requirements/router.py](backend/app/modules/requirements/router.py) walks `RequirementCategory.parent_id` — custom categories declare their own parent type via the same column.
  - `_next_readable_id` reads `category.readable_id_prefix` (with first-3-letters fallback).
  - Removed: `BUILTIN_TYPES`, `RequirementType` enum, `_READABLE_ID_PREFIXES`, `readable_id_prefix()` helper, the hardcoded `user_must_have_no_parent` schema validator, the hardcoded sort-order `{USER:0, SYSTEM:1, SOFTWARE:2}` in upload.
  - **Cross-module fixes:** [validation/router.py](backend/app/modules/validation/router.py) now allows any *root-category* requirement (not just literally USER); [change_control/router.py](backend/app/modules/change_control/router.py) auto-populates impacts from *leaf-category* requirements (not literally SOFTWARE); [traceability/router.py](backend/app/modules/traceability/router.py) rewritten to walk the category tree dynamically — works for any N-level project taxonomy.
  - **Frontend:** [api.ts](frontend/src/lib/api.ts) `RequirementCategory` gains `readable_id_prefix`; `create`/`update` methods accept it. [dashboard/page.tsx](frontend/src/app/projects/dashboard/page.tsx) FolderPanel takes `showPrefix` — Requirement Folders panel now has a "Prefix" input and shows each category's prefix chip in the list.
  - **Still outstanding:** Architecture module ([architecture/router.py](backend/app/modules/architecture/router.py)) still hardcodes SYSTEM/SUBSYSTEM/ITEM/UNIT — that's a separate refactor for §5.3 work.


- [ ] **E1. Duplicate seed scripts.** Six seed files (`seed.py`, `seed_phase2.py`, `seed_phase4.py`, `seed_test.py`, `seed_all.py`, `seed_comprehensive.py`). CLAUDE.md says `seed_all.py` is the recommended path but the others remain. Delete or fold into a single entrypoint with flags.
- [ ] **E2. Stale `Mapped[]` style vs `Column()` style.** Older models use `mapped_column` / `Mapped[uuid.UUID]`, newer ones use plain `Column`. Pick one — CLAUDE.md addendum to migration guide says "Column style (not Mapped)" but pre-Phase-6 modules are still Mapped.
- [ ] **E3. Mixed UUID-string handling in routers.** Some routers accept `uuid.UUID` path params, some accept `str` and `uuid.UUID(...)` inside. Standardize on path-typed UUIDs (FastAPI handles validation).
- [ ] **E4. Frontend `as React.CSSProperties` repetition.** Inline-style constants are duplicated across each page. Extract a tiny `styles.ts` with the common card/btn/input tokens (still inline-styled per CLAUDE.md, just imported).

## F. Phase 6 roadmap (planned)

Per CLAUDE.md:
- [ ] **F1. PDF export framework** — see **D2**.
- [ ] **F2. ERP integration** — out-of-scope for this audit; needs separate design doc (which ERP, what entities, push vs pull).
- [ ] **F3. Advanced reporting** — dashboard summarizing release readiness across all gates, single page.

---

## Quick wins (do first)

1. **A6** — add an import smoke test (5 min, prevents the next `app.core.db` regression).
2. **D1** — swap six pages to `useActiveProject()` (15 min, pure deletion).
3. **A1** — drop `audit()` calls into the 11 unaudited routers (1–2 h, mechanical).
4. **C1** — extend `seed_comprehensive.py` with Phase 6 demo data (2–4 h, makes the platform demo-able).

## Heavy lifts (plan separately)

- **A4** DHF expansion + **A5** Traceability tree expansion → both touch the same downstream pages and PDF rendering. Bundle.
- **A2** RBAC rollout → needs permission catalog decisions before code changes.
- **B4 + B5** CAPA feedback loops → cross-module side effects, write integration tests first.

## Verified vs assumed

The findings above were spot-checked against the codebase. A few claims from the audit subagents that turned out to be **wrong** (and are excluded above):
- "Validation page is orphaned in nav" — false; it's under the testcases group.
- "/projects/dashboard does not exist" — false; the directory is present.
- "Pages with `useSearchParams` not wrapped in Suspense" — false; `requirements`, `testcases`, `tracelinks` all wrap correctly.

If any item below seems wrong, grep before fixing — the audit is best-effort, not gospel.
