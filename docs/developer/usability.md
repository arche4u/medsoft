# Usability Engineering (IEC 62366-1)

IEC 62366-1 is **cross-regulator** — one implementation satisfies:

- EU MDR Annex I §14
- FDA Human Factors and Usability Engineering guidance (2016)
- Health Canada Guidance Document — Human Factors
- TGA, PMDA, MHRA equivalents

## Module — `compliance/usability/`

Three-level hierarchy mirroring IEC 62366-1 §5.1–§5.4:

```
UsabilityFile (per project, versioned, DRAFT → IN_REVIEW → APPROVED → OBSOLETE)
├── §5.1 Use Specification: intended_users, intended_use_environment,
│       intended_medical_indication, operating_principle
└── UseScenario (per file, §5.4 hazard-related scenario)
    └── UseError (per scenario, foreseeable error with potential harm)
        └── escalated_risk_id → Risk (risk_class=USABILITY)
```

## Endpoints

```
GET    /usability/files?project_id={uuid}
POST   /usability/files
PUT    /usability/files/{id}                # status transitions live here
DELETE /usability/files/{id}                # DRAFT only

POST   /usability/files/{file_id}/scenarios
PUT    /usability/scenarios/{id}
DELETE /usability/scenarios/{id}

POST   /usability/scenarios/{scenario_id}/errors
PUT    /usability/errors/{id}
DELETE /usability/errors/{id}
POST   /usability/errors/{id}/escalate      # creates §7 Risk
```

APPROVED files are read-only — fork to a new version to add scenarios/errors.

## Escalation pattern

Use Errors escalate to the §7 risk register the same way Vulnerabilities (cyber) and Threats (cyber) do:

```
POST /usability/errors/{id}/escalate
{
  "requirement_id": "<uuid>",     # typically a USER requirement covering the use scenario
  "severity": 1-5,
  "probability": 1-5,
  "hazardous_situation": "..."    # optional
}
```

Creates a `Risk` row with `risk_class=USABILITY`, hazard `"Use error: <description>"`, and writes `UseError.escalated_risk_id = new_risk.id`. Idempotent.

## §7 unified risk register

The `Risk.risk_class` column is plain `String` (per project convention — taxonomies stay open-vocabulary). Adding the `USABILITY` value did NOT require a schema change. The filtered view at `/risks?risk_class=USABILITY` surfaces only usability risks, mirroring the `SECURITY` filter for cyber.

## Why this satisfies multiple regulators at once

| Regulator | Citation | Maps to |
|---|---|---|
| EU MDR | Annex I §14 General Safety + Performance Requirements | The §5.1 Use Specification + §5.4 scenarios + §5.9 summative evaluation are the §14(d-e) evidence |
| FDA | 21 CFR §820.30(c) + AAMI HE75 + Premarket guidance | Same UEF data, same §5.9 summative report |
| Health Canada | Guidance Document — Human Factors | Same UEF |
| TGA / PMDA / MHRA | Each cites IEC 62366-1 directly | Same UEF |

Build it once. Show it to whoever asks.

## What's not yet in 9 (deferred to a future phase)

- Formative + summative **evaluation runs** as separate entities — currently the plan template documents the process; the data tables for evaluation sessions + participants + results are not yet there. Recommended next step before claiming "full §5.5–§5.9 coverage".
- **Release readiness gate** for "summative evaluation passed" — would slot into `system_testing.router._compute_readiness()` next to the existing test-coverage gates.
