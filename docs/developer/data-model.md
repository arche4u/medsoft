# Data model

High-level entity-relationship overview, grouped by IEC 62304 clause.

## Anchor entity

**Project** (`platform/projects`) — every regulated entity FKs to a project. Multi-project tenancy is built in from the start.

```
Project (id, name, description)
   ├── Requirement[]
   ├── Risk[]                            (via Requirement)
   ├── SoftwareItem[]
   ├── SWComponent[]                     (architecture)
   ├── DesignElement[]
   ├── SoftwareUnit[]
   ├── IntegrationTestCase[]
   ├── SystemTestCase[]
   ├── Release[]
   ├── ChangeRequest[]
   ├── FeedbackItem[]
   ├── ProblemReport[]
   ├── CMConfigItem[]
   ├── Plan[]
   ├── Document[]
   ├── ValidationRecord[]
   └── DHFDocument[]
```

## §4.3 — Software safety classification

```
SoftwareItem (id, project_id, parent_id, name, safety_class A|B|C, classification_justification, status)
   ├── SoftwareItemRequirementLink[]   → Requirement
   └── SoftwareItemRiskLink[]          → Risk
SoftwareSafetyProfile (id, project_id, iec62304_class, rpn_scale, …)   one per project
```

## §5.1 — Software Development Plan

```
SoftwareDevelopmentPlan (id, project_id, version, status, lifecycle_model, safety_class, title, …)
   ├── SDPSection[]
   ├── SDPLifecyclePhase[]
   └── SDPProjectRole[]
```

The richer §5.1 SDP keeps its own module (lifecycle phases + roles are SDP-specific); §6.1/§7/§8.1/§9 plans share the generic `Plan` engine instead.

## §5.2 — Requirements

```
Requirement (id, project_id, type, readable_id, parent_id, title, description, needs_review)
RequirementCategory (id, project_id, name, label, color, parent_id, readable_id_prefix, is_builtin)
   ── tree built dynamically from parent_id chain — no hardcoded USER→SYSTEM→SOFTWARE
RequirementCategoryBaseline (per-category versioned approval)
   └── RequirementCategoryBaselineItem[]   frozen snapshots
RequirementsBaseline / RequirementsBaselineItem
   ── composite SRS that pins specific category-baseline versions
```

## §5.3 — Architecture

```
SWComponent (id, project_id, parent_id, name, component_type SYSTEM|SUBSYSTEM|ITEM|UNIT, safety_class, status, version)
   ├── SWComponentReqLink[]    → Requirement
   ├── SWComponentRiskLink[]   → Risk
   └── SWComponentTCLink[]     → SystemTestCase   (was testcase_id; renamed in production migration)
SWInterface (id, project_id, source_component_id, target_component_id, interface_type DATA|CONTROL|API|SIGNAL, safety_relevant)
   └── SWDataFlow[]
ArchitectureBaseline (id, project_id, version, status DRAFT|IN_REVIEW|APPROVED|OBSOLETE, signoff trail)
   ├── ArchitectureBaselineComponent[]   frozen
   └── ArchitectureBaselineInterface[]   frozen
```

## §5.4 — Detailed Design

```
DesignElement (id, project_id, component_id, parent_id, readable_id, title, description, diagram_source Mermaid)
RequirementDesignLink (requirement_id, design_element_id)
```

§5.4 was restructured: design elements no longer carry their own ARCHITECTURE/DETAILED tier — they hang off a §5.3 SWComponent via `component_id`.

## §5.5 — Software Units

```
SoftwareUnit (id, project_id, component_id, name, safety_class, programming_language, repository_url, file_path, status)
   ├── CodeArtifact[]                Source files / commits / build outputs
   ├── UnitTestCase[]
   │     └── UnitTestResult[]
   ├── UnitRequirementLink[]
   └── UnitRiskLink[]
```

## §5.6 — Integration Tests

```
IntegrationTestCase (id, project_id, interface_id, name, test_type, latency_threshold_ms, …)
   ├── IntegrationTestResult[]
   ├── ITCRequirementLink[]
   └── ITCRiskLink[]
```

## §5.7 — System Tests

```
SystemTestCase (id, project_id, requirement_id, name, test_type FUNCTIONAL|PERFORMANCE|SAFETY|USABILITY|REGRESSION|SECURITY, safety_relevance)
   ├── SystemTestResult[]
   ├── STAdditionalReqLink[]   additional requirements covered
   └── STRiskLink[]
```

## §5.8 — Release Management

```
Release (id, project_id, version, status DRAFT|UNDER_REVIEW|APPROVED|RELEASED)
   ├── ReleaseItem[]            → Requirement | SystemTestCase | DesignElement
   ├── ReleaseArtifact[]
   ├── ReleaseChecklistItem[]
   ├── ReleaseSnapshot          one JSON blob captured at approval
   ├── parent_release_id        §6.3.2 maintenance lineage
   ├── user_notification_sent + summary + at      §6.2.5
   └── regulator_notification_sent + summary + at §6.2.5
```

## §6 — Software Maintenance

```
FeedbackItem (id, project_id, readable_id, source, reporter, summary, description, affected_version,
              severity COSMETIC|MINOR|MAJOR|SAFETY, adverse_event, spec_deviation,
              status NEW|UNDER_REVIEW|EVALUATED|ESCALATED|CLOSED, is_problem, evaluation_notes,
              safety_impact_assessment, change_needed,
              escalated_problem_id → ProblemReport,
              escalated_change_request_id → ChangeRequest,
              closure_rationale)
```

§6.1 Maintenance Plan is a `Plan` row with `plan_type="MAINTENANCE"`.

## §6.2 / §6.3 — Change Control

```
ChangeRequest (id, project_id, title, description, status OPEN|IMPACT_ANALYSIS|APPROVED|REJECTED|IMPLEMENTED,
               modifies_released_software,                  §6.2.3 trigger
               effect_on_organization,                      §6.2.3
               effect_on_released_software,                 §6.2.3
               effect_on_interfacing_systems)               §6.2.3
   └── ChangeImpact[]   → Requirement | DesignElement | SystemTestCase
```

## §7 — Risk Register (ISO 14971 + IEC 62304 §7 + IEC 81001-5-1)

```
Risk (id, requirement_id, hazard, hazardous_situation, harm,
      severity, probability, risk_level LOW|MEDIUM|HIGH,
      risk_class SAFETY|SECURITY|SAFETY_SECURITY,                        ← IEC 81001-5-1 + AAMI TIR57
      status OPEN|IN_CONTROL|RE_EVALUATION_REQUIRED|ACCEPTED|CLOSED,
      evaluation_notes,
      re_evaluation_required bool,                                        ← §7.4 flag
      re_evaluation_reason text,                                          ← §7.4 audit
      re_evaluation_triggered_at tstz,                                    ← §7.4 audit
      last_re_evaluated_at tstz, last_re_evaluated_by str)                ← §7.4 audit
   ├── RiskControl[]      §7.2
   │     ├── control_type INHERENT_SAFETY|PROTECTIVE_MEASURE|INFORMATION_FOR_SAFETY
   │     ├── implementation_status PROPOSED|IMPLEMENTED|VERIFIED        (auto-flip via §7.3)
   │     ├── requirement_id (FK), system_test_id (FK)
   │     ├── component_id (FK sw_components)                              ← §7.2 — code location
   │     └── VerificationEvidence[]                                       ← §7.3 closed loop
   │           ├── evidence_type SYSTEM_TEST|INTEGRATION_TEST|UNIT_TEST|REVIEW|INSPECTION|ANALYSIS|EXTERNAL_REF
   │           ├── one of: system_test_id | integration_test_id | unit_test_id | external_reference
   │           └── result PASS|FAIL, verified_by, verified_at
   ├── RiskContribution[]  §7.1                                           ← who contributes to the hazard
   │     └── exactly one of: software_item_id | component_id
   └── ResidualRisk        severity, probability, risk_level, is_accepted, accepted_by, accepted_at  (ISO 14971 §6.4)
RiskCategory (id, project_id, name, label, color, is_builtin)
SoftwareSafetyProfile (id, project_id, iec62304_class A|B|C, rpn_scale, severity/probability_definitions, software_failure_assumption)
```

**§7.4 auto-trigger** lives in `compliance/change_control/router.py:transition_change_request`:
when a ChangeRequest with `modifies_released_software=true` transitions to APPROVED, the
helper `risks/router.py:trigger_risk_reevaluation(db, risk_ids, reason)` is called over
every Risk whose linked Requirement appears in the CR's `ChangeImpact` rows. The flag is
cleared via `POST /risks/{id}/re-evaluate`.

## §8 — Configuration Management

```
CMConfigItem (id, project_id, name, item_type, version, hash, location, status)
CMBaseline (id, project_id, version, status, parent_baseline_id, baseline_type)
   └── CMBaselineItem[]   → CMConfigItem
```

## §9 — Problem Resolution (CAPA)

```
ProblemReport (id, project_id, title, description, severity LOW|MEDIUM|HIGH|CRITICAL,
               source, reported_by, status OPEN|INVESTIGATING|RESOLVED|CLOSED, related_release_id)
   ├── ProblemLink[]      → Requirement | Risk | TestCase | Component | ConfigItem
   ├── RootCause[]
   └── CAPA[]
         └── CAPAVerification[]
```

## DHF — Design History File

```
DHFDocument (id, project_id, name, generated_at, file_path, content JSON)
```

`content` is a structured JSON snapshot of *everything* at generation time: requirements, design, all tests, releases, plans, CAPAs, feedback, traceability matrix, …. When generated at release time it carries `bound_release: {id, version, status}` so the DHF revision is forever tied to a specific release version.

## Cross-cutting (platform)

```
User · Role · Permission · RolePermission
AuditLog (entity_type, entity_id, action CREATE|UPDATE|DELETE, actor_id, timestamp, details)
ElectronicSignature (entity_type, entity_id, meaning APPROVAL|REVIEW|RELEASE, user_id, signed_at)
TrainingRecord (user_id, training_topic, completed_at, valid_until)
Attachment (entity_type, entity_id, filename, content_type, size_bytes, file_path)
KnowledgeEntry (project_id?, is_global, category, standard, clause_ref, title, content)
Document (project_id, doc_type, category PLANS|TECHNICAL|DEVELOPMENT|STANDARDS, title, status, version, content)
Plan (project_id, plan_type, version, status DRAFT|IN_REVIEW|APPROVED|OBSOLETE, safety_class, signoff trail)
   └── PlanSection[]
```

## Rules enforced in the backend

| Constraint | Where |
|---|---|
| `Requirement.parent_id` chain must match `RequirementCategory.parent_id` chain | `requirements/router.py` validators |
| `ValidationRecord` must link to a `USER` requirement | `validation/router.py` |
| `Risk.risk_level` is computed: `severity × probability ≤ 4 LOW`, `≤ 9 MEDIUM`, else `HIGH` | `risks/model.py:_compute_level` |
| `readable_id` auto-generated per category per project: `URQ-001`, `SYS-001`, `SWR-001`, `FB-001`, … | `_next_readable_id()` per module |
| `KnowledgeEntry` global entries auto-seeded if missing on startup | `knowledge/seed_data.py` |
| Approving a Release requires an `ElectronicSignature` with `meaning=APPROVAL` | `release/router.py` |
| Approving a CR that `modifies_released_software` requires all three §6.2.3 effect fields | `change_control/router.py` |
| §6.3.2: a Release's `parent_release_id` must point to a same-project RELEASED row | `release/router.py:create_release` |
