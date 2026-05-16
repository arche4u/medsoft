# Cybersecurity (IEC 81001-5-1)

The cybersecurity layer is a **top-level peer** to IEC 62304 in the sidebar, not nested inside it. It builds on top of two things that were already in place:

1. **§7 unified risk register** — already supports `risk_class=SECURITY` / `SAFETY_SECURITY` (and now `USABILITY` from [`usability.md`](usability.md)). Cyber threats and CVEs file safety-language risk entries in the same table.
2. **§8.2.2 SOUP register** — `CMConfigItem.item_type=SOUP` rows are the SBOM source of truth.

## Modules

| Module | Surface | Source |
|---|---|---|
| **Cybersecurity Plan** | `/plans/cybersecurity` | `compliance/plans/defaults.py` (`plan_type=CYBERSECURITY`, 11 sections) |
| **Threat Model (STRIDE)** | `/threat-model` | `compliance/cybersecurity/threat_model/` |
| **Vulnerability Intake (CVE)** | `/vulnerabilities` | `compliance/cybersecurity/vulnerabilities/` |
| **SBOM (CycloneDX)** | `/sbom` | `compliance/cybersecurity/sbom/` (derived view) |

## Threat Model — `compliance/cybersecurity/threat_model/`

**Entities**:

- `ThreatModel` — versioned per project, optionally bound to a `Release`. DRAFT → IN_REVIEW → APPROVED → OBSOLETE lifecycle (same as SDP / Architecture Baselines).
- `Threat` — STRIDE letter (CHECK constraint `S/T/R/I/D/E`), severity (CHECK constraint `LOW/MEDIUM/HIGH/CRITICAL`), status (`IDENTIFIED/MITIGATED/ACCEPTED/TRANSFERRED`), free-text mitigation, optional FK to a `SWComponent`, optional `escalated_risk_id` → `Risk`.

**Key endpoints**:

```
GET    /threat-model/models?project_id={uuid}
POST   /threat-model/models
PUT    /threat-model/models/{id}            # status transitions live here
DELETE /threat-model/models/{id}            # DRAFT only

POST   /threat-model/models/{id}/threats
PUT    /threat-model/threats/{id}
DELETE /threat-model/threats/{id}
```

APPROVED threat models become read-only — fork to a new version to record new threats.

## Vulnerability Intake — `compliance/cybersecurity/vulnerabilities/`

**Entity**: `VulnerabilityReport`. CVE ID + CVSS score + vector + severity band + status (`NEW/TRIAGED/MITIGATED/RESOLVED/FALSE_POSITIVE`). Optional FKs to `affected_soup_id` (a `CMConfigItem`) and `affected_component_id` (a `SWComponent`). Triage stamps `triaged_by_id` + `triaged_at` automatically when status leaves `NEW`.

**Escalation to §7**:

```
POST /vulnerabilities/{id}/escalate
{
  "requirement_id": "<uuid>",     # NOT NULL on Risk by schema
  "severity": 1-5,
  "probability": 1-5,
  "hazardous_situation": "..."    # optional, falls back to vuln description
}
```

Creates a `Risk` with `risk_class=SECURITY`, hazard `"Cybersecurity vulnerability: <cve_id>"`, and writes `VulnerabilityReport.escalated_risk_id = new_risk.id`. Idempotent — a second call returns 400. Deleting an escalated vulnerability is refused until the linked Risk is cleared.

## SBOM — `compliance/cybersecurity/sbom/`

No new table. `GET /sbom/{project_id}` returns CycloneDX 1.5 JSON:

- `bomFormat`, `specVersion`, `serialNumber` (random `urn:uuid:`), `metadata.timestamp`, `metadata.tools`, `metadata.component` (the project itself as a CycloneDX `application` component).
- `components[]` — every `CMConfigItem` with `item_type=SOUP` for the project. `bom-ref` = `soup:{uuid}`, name + version + (optional) `purl` from `reference_id`, optional description.
- `vulnerabilities[]` — every `VulnerabilityReport` for the project NOT in `FALSE_POSITIVE`, with `ratings[0]` mapped from `cvss_score`+`cvss_vector`+`severity_band`, `affects[].ref` back to the SOUP `bom-ref`, and `analysis.state` mapped from our status (`NEW/TRIAGED` → `in_triage`, `MITIGATED` → `resolved_with_pedigree`, `RESOLVED` → `resolved`, `FALSE_POSITIVE` → `false_positive`).

Response media type is `application/vnd.cyclonedx+json` with a `Content-Disposition` filename `sbom-<project>-YYYYMMDD.json`.

## Risk register integration

- Threats and Vulnerabilities both file safety-language risks in `risks/`. The single source of truth for risk acceptability stays in `Risk.severity × Risk.probability` per `_compute_level()`.
- Filter the register by `risk_class=SECURITY` to see only cyber risks (left sidebar quick-jump).
- §7.3 evidence + §7.4 re-evaluation work the same way for SECURITY risks as for SAFETY risks.

## RBAC

Cyber writes reuse the existing `CREATE_RISK` / `UPDATE_RISK` permissions — there is intentionally no separate `CREATE_THREAT` permission. The cyber-team role is modeled by granting these to a new role (rather than a new permission). This keeps the permission count manageable and lets QA/QARA who already have these roles do cyber triage without role changes.
