# Design History File (DHF)

The **DHF** is the auditor-facing bundle that proves design controls were followed. The platform generates it on demand from the live data — no separate authoring, no possibility of drift between "the system" and "the record".

**Docs → Release & DHF → DHF**

## What's in a DHF

When you click **Generate DHF**, the platform emits one JSON document containing every regulated artefact:

- **SDP §5.1** — the active approved Software Development Plan with all sections, phases, roles.
- **§4.3 Software Items** — full safety-classification tree.
- **§5.2 Requirements** — every requirement + linked design + linked risks.
- **§5.2 SRS composite baseline** — frozen requirement snapshot at approval.
- **§5.3 Architecture** — components + interfaces + approved baseline.
- **§5.4 Design Elements** — detailed design linked to components.
- **§5.5 Software Units** — units + tests + code artifacts + latest results.
- **§5.6 Integration Tests** — tests + interface coverage + latest results.
- **§5.7 System Tests** — tests + latest results + safety relevance.
- **§5.8 Releases** — all releases with §6.3.2 lineage and §6.2.5 notifications.
- **§5.8 Release artifacts + snapshots**.
- **§6.1 Maintenance Plan** — the approved plan + 11 sections.
- **§6.2.1 Feedback Items** — full log with evaluation + safety + escalation links.
- **§7 Risk Register** — every risk + controls + residual.
- **§8 Configuration Management** — CM items + CM baselines.
- **§9 Problem Reports + CAPAs + Verifications**.
- **Traceability Matrix** — one row per requirement, columns for design / unit / integration / system tests / risks / validation.
- **21 CFR Part 11 Electronic Signatures** — every release approval / CR approval signature with timestamp + actor.
- **Validation Records** — for USER requirements.

Plus summary counters: total requirements, components, units, tests, releases, feedback escalated to CAPA, maintenance plan approved, releases with user/regulator notifications, …

## Generate a DHF

`Generate DHF` button at the top of the page. Two options:

- **Unbound DHF** — captures the current state of the project, not tied to a specific release. Named `DHF-<project_id>-<timestamp>`.
- **Bound to a release** — pick a release version from the dropdown. The DHF carries `bound_release: {id, version, status}` and is named `DHF-rel-<version>-<timestamp>`. **Recommended at release time** — auditors can trace a specific DHF revision to its release version.

Click **Generate**. The document is created, stored, and opened in the viewer.

## View past DHFs

The list on the left shows historical DHFs sorted by generation date. Click any entry to load it.

```
DHF-rel-v1.0.0-20260513120422       Bound to v1.0.0     13 May 2026 12:04
DHF-rel-v0.9.0-20260213094011       Bound to v0.9.0     13 Feb 2026 09:40
DHF-c105...26b2-20260105031022      Unbound             05 Jan 2026 03:10
```

DHFs are immutable once generated. Re-generate to capture a new point-in-time snapshot.

## Sections in the viewer

The DHF viewer expands the JSON into navigable sections that mirror the IEC 62304 clause order. Each section is a table with the relevant rows.

The **Summary** card at the top shows counters; the **Traceability Matrix** card shows the FDA 21 CFR 820.30(j) coverage view.

## Download

`Download JSON` — raw structured payload (for regulatory submissions or for ingestion by audit tools).

`Download PDF` *(planned)* — formatted print-ready PDF.

## What auditors typically look at

| Auditor question | Where in the DHF |
|---|---|
| "Show me your traceability matrix" | The Traceability Matrix card |
| "Show me your approved SDP" | The §5.1 SDP section |
| "How did this requirement get tested?" | The Traceability Matrix row for that requirement |
| "What's the chain of versions for this product?" | The Releases section (parent_release_id lineage) |
| "How are you handling post-market feedback?" | The Feedback Items section + Maintenance Plan |
| "Show me a problem and its resolution" | The Problem Reports section + Root Causes + CAPAs |
| "Who approved the release?" | The Electronic Signatures section |
| "How did you communicate the change to users?" | The Releases section — user_notification_summary |

## IEC 62304 / FDA mapping

| Activity | Clause |
|---|---|
| Design History File requirement | **FDA 21 CFR 820.30(j)** |
| Software lifecycle documentation | IEC 62304 §5.1 + §5.2 + §5.3 + §5.4 + §5.5 + §5.6 + §5.7 + §5.8 |
| Maintenance records | IEC 62304 §6.2 + §6.3 |
| Risk management file | ISO 14971 §3 |
| Configuration management records | IEC 62304 §8 |
| Problem resolution records | IEC 62304 §9 |
| Electronic signatures | FDA 21 CFR Part 11 |
| Post-market communication records | IEC 62304 §6.2.5 + EU MDR §83–§92 |
