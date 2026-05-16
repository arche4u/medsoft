# IEC 62304 clause → module mapping

A flat table auditors can use to navigate the codebase by clause.

## IEC 62304 clauses

| Clause | Title | Backend module | Frontend page | Notes |
|---|---|---|---|---|
| §4.3 | Software safety classification | `compliance/dev/software_items/` | `/software-items` | Tree with Class A/B/C |
| §4.4 | Legacy software | `compliance/dev/software_items/` (`is_legacy`, `legacy_assessment`) + `compliance/plans/` (`plan_type=LEGACY_SOFTWARE`) | `/software-items` + `/plans/custom/legacy-software` | Flag + assessment text covers §4.4(a)-(d); plan template carries the manufacturer's process |
| §5.1 | Software development planning | `compliance/dev/sdp/` + `compliance/plans/` | `/sdp`, `/plans/maintenance`, … | Versioned signed-off plan |
| §5.2 | Software requirements analysis | `compliance/dev/requirements/` | `/requirements` | Two-tier versioning |
| §5.2.6 | Verify software requirements | `compliance/dev/traceability/` | `/traceability` | V-model tree + matrix |
| §5.3 | Software architectural design | `compliance/dev/architecture/` | `/architecture` | Components + Interfaces + Baselines |
| §5.3.6 | Verify software architecture | `compliance/dev/architecture/` (compliance endpoint) | `/architecture` | Per-component compliance check |
| §5.4 | Software detailed design | `compliance/dev/design/` | `/design` | Linked to §5.3 components |
| §5.5 | Software unit implementation + verification | `compliance/dev/units/` | `/units` | Units + tests + results |
| §5.6 | Software integration + integration testing | `compliance/dev/integration_tests/` | `/integration-tests` | Per-interface ITC + results |
| §5.7 | Software system testing | `compliance/dev/system_testing/` | `/system-testing` | STC + readiness gates |
| §5.8 | Software release | `compliance/release/` | `/release` | Lifecycle + snapshots + e-signatures |
| §6.1 | Establish maintenance plan | `compliance/plans/` (`plan_type=MAINTENANCE`) | `/plans/maintenance` | 11-section template covering (a)–(f) |
| §6.2.1 | Monitor + document + evaluate feedback | `compliance/maintenance/feedback/` | `/feedback` | Triage funnel + Monitor view |
| §6.2.1.1 | Monitor feedback | `feedback/` (Monitor tab) | `/feedback` (Monitor §6.2.1.1 tab) | Trend chart + recurring-defect detection |
| §6.2.1.2 | Document + evaluate feedback | `feedback/` (PATCH `/evaluate`) | `/feedback` (Evaluate tab) | `is_problem`, `adverse_event`, `spec_deviation` |
| §6.2.1.3 | Evaluate problem-report safety impact | `feedback/` + `risks/` | `/feedback` (Evaluate tab) | `safety_impact_assessment`, `change_needed` |
| §6.2.2 | Use problem-resolution process | `feedback/` (PATCH `/escalate`) + `compliance/problems/capa/` | `/feedback` → `/capa` | Auto-creates ProblemReport |
| §6.2.3 | Analyse change requests | `compliance/change_control/` | `/change-control` | `modifies_released_software` + effect-of fields |
| §6.2.4 | Change request approval | `compliance/change_control/` | `/change-control` | Existing esign + permission gate |
| §6.2.5 | Communicate to users + regulators | `compliance/release/` (PATCH `/notify`) | `/release` | User + regulator notification audit trail |
| §6.3.1 | Use established process to implement modification | `compliance/change_control/` + §5 modules | various | Existing V-model re-run |
| §6.3.2 | Re-release modified software system | `compliance/release/` | `/release` | `parent_release_id` lineage |
| §7 | Software risk management (ISO 14971 + IEC 81001-5-1 + IEC 62366-1) | `compliance/risk/risks/` | `/risks` | Unified register hosts SAFETY / SECURITY / SAFETY_SECURITY / USABILITY via `risk_class` |
| §7.1 | Analysis of software contributing to hazardous situations | `risks/` (`RiskContribution`) | `/risks` (Contributions section) | M:N — Risk ↔ SoftwareItem / SWComponent |
| §7.2 | Risk control measures | `risks/` (`RiskControl` + `component_id`) | `/risks` (Controls tab) | INHERENT_SAFETY / PROTECTIVE_MEASURE / INFORMATION_FOR_SAFETY + §5.3 component link |
| §7.3 | Verification of risk control measures | `risks/` (`VerificationEvidence` closed-loop) | `/risks` (Evidence sub-list per control) | Multi-evidence; PASS auto-flips control to VERIFIED |
| §7.4 | Risk management of software changes (auto-trigger) | `change_control/router.transition_change_request` calls `risks/router.trigger_risk_reevaluation` | `/risks` (Re-evaluation Inbox) | CR APPROVED + modifies_released_software → flag all linked risks |
| §8 | Software configuration management process | `compliance/config/config_mgmt/` (RBAC+audit on all writes) | `/config-mgmt` | Items + baselines + SOUP filter |
| §8.2.2 SOUP identification | `compliance/config/config_mgmt/` (`item_type=SOUP`) | `/config-mgmt` (SOUP §8.2.2 type filter chip + chip on cards) | First-class SOUP register surface |
| §8.1 | Configuration management planning | `compliance/plans/` (`plan_type=CONFIG_MGMT`) | `/plans/config-mgmt` | Plan template |
| §8.2 | Configuration identification | `config_mgmt/` (`CMConfigItem`) | `/config-mgmt` | Items with version + hash |
| §8.3 | Configuration change control | `change_control/` + `config_mgmt/` | `/change-control`, `/config-mgmt` | Linked workflows |
| §9 | Software problem resolution process | `compliance/problems/capa/` (RBAC+audit on all writes) | `/capa` | ProblemReport → RootCause → CAPA → Verification |
| §9.6 Analyse problems for trends | `compliance/problems/capa/` (in-memory aggregation in `TrendAnalysisPanel`) | `/capa` (top of page) | By severity / by status / top root causes · MTTR · ≥3 OPEN problems sharing a root-cause type triggers a trend alert |
| §9.* | Plan + workflow | `compliance/plans/` (`plan_type=PROBLEM_RESOLUTION`) | `/plans/problem-resolution` | Plan template |

## Adjacent standards

| Standard / clause | Module |
|---|---|
| **ISO 14971** risk-management file | `compliance/risk/risks/` (full risk register) |
| **ISO 13485** Quality Management System | knowledge base entries (process-layer, not the platform itself) |
| **FDA 21 CFR Part 820** Design Controls | DHF generator (`compliance/dhf/`), Document Register (`platform/documents/`) |
| **FDA 21 CFR Part 820.30(j)** Design History File | `compliance/dhf/` — bound DHF with traceability matrix |
| **FDA 21 CFR Part 11** Electronic Records / Signatures | `platform/esign/` — applied to release approval + CR approval |
| **EU MDR Annex I + §83–§92** Technical File + PMS + Vigilance | DHF + Feedback Intake + Change Control + Release notification |
| **EU MDR Annex I §14** Usability | `compliance/usability/` — Usability Engineering File (IEC 62366-1 satisfies §14) |
| **IEC 81001-5-1** Cybersecurity | `compliance/cybersecurity/` — Threat Model (STRIDE) + Vulnerability Intake (CVE) + SBOM (CycloneDX) + Cybersecurity Plan |
| **IEC 81001-5-1 §6.2** Threat modeling | `compliance/cybersecurity/threat_model/` — STRIDE per §5.3 SWComponent · `escalated_risk_id` back-FK to §7 risk register |
| **IEC 81001-5-1 §6.3** Vulnerability management | `compliance/cybersecurity/vulnerabilities/` — `POST /vulnerabilities/{id}/escalate` creates a §7 Risk with `risk_class=SECURITY` |
| **IEC 81001-5-1 SBOM** | `compliance/cybersecurity/sbom/` — `GET /sbom/{project_id}` returns CycloneDX 1.5 JSON derived from §8.2.2 SOUP register + open vulnerabilities |
| **AAMI TIR57** Risk for Cybersecurity | `risks/` — `risk_class=SECURITY`/`SAFETY_SECURITY` discriminator integrated into the unified ISO 14971 / IEC 81001-5-1 risk file |
| **IEC 62366-1** Usability engineering | `compliance/usability/` — UsabilityFile (§5.1 Use Specification) + UseScenario (§5.4) + UseError with `escalated_risk_id` back-FK to §7 risks (`risk_class=USABILITY`). Accepted by EU MDR §14, FDA Human Factors, Health Canada, TGA, PMDA, MHRA. |

## "Where do you implement §X.Y?" template answer

When asked at audit, this lets you walk the path from clause to running code:

```
Clause:        IEC 62304 §6.2.3 — Analyse Change Requests
Backend:       backend/app/modules/compliance/change_control/router.py:transition_change_request
               (validates the four §6.2.3 fields before APPROVED)
Model fields:  modifies_released_software, effect_on_organization,
               effect_on_released_software, effect_on_interfacing_systems
Frontend:      frontend/src/app/(compliance)/(release)/change-control/page.tsx
Test:          create a change request with modifies_released_software=true and
               try to APPROVE without filling the three effect fields — backend
               returns 400 with a §6.2.3-referenced error message.
Evidence:      AuditLog entry (entity_type='ChangeRequest', action='UPDATE')
               + ElectronicSignature (entity_type=CHANGE_REQUEST, meaning=APPROVAL)
```
