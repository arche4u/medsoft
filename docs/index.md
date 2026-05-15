# MedSoft Compliance Platform — Documentation

Medical-device software compliance platform aligned to **IEC 62304**, with risk management per **ISO 14971** and cybersecurity planned per **IEC 81001-5-1**.

This documentation site has two audiences. (Non-technical users typically arrive at this page already inside the *User Guide* tree where the Developer Guide link below is hidden by design.)

| If you are… | Start here |
|---|---|
| A **developer** working on the codebase | Developer Guide (see sidebar — visible in the full `/manual/` build) |
| A **user** (QA, RA, engineer) using the application | [User Guide](user/index.md) |

---

## What this platform does

| IEC 62304 clause | Module | Purpose |
|---|---|---|
| §4.3 | Software Items | Safety-classification tree (A / B / C) per IEC 62304 §4.3 |
| §5.1 | Software Development Plan (SDP) | Versioned, signed-off lifecycle plan |
| §5.2 | Requirements | USER → SYSTEM → SOFTWARE hierarchy with category baselines |
| §5.3 | Architecture | SWComponents + Interfaces + approved baselines |
| §5.4 | Detailed Design | Design elements linked to architecture components |
| §5.5 | Software Units | Unit register + unit tests + code-artifact links |
| §5.6 | Integration Tests | Interface-level test cases + results |
| §5.7 | System Testing | End-to-end test cases + readiness gates |
| §5.8 | Release Management | Release lifecycle, snapshots, e-signatures, readiness |
| §6.1 | Maintenance Plan | Plan template covering §6.1(a)–(f) sub-clauses |
| §6.2.1 | Feedback Intake | Post-market surveillance funnel + safety evaluation |
| §6.2.2 | Escalation to CAPA | One-click feedback → Problem Report |
| §6.2.3 | CR Impact Analysis | Effect-on-org / -released / -interfaces gate |
| §6.2.5 | User & Regulator Notification | Communication audit trail |
| §6.3.2 | Maintenance Release Lineage | parent_release_id linkage |
| §7 | Risk Register (ISO 14971) | Hazards, controls, residual risk |
| §8 | Configuration Management | CMConfigItem + CMBaseline + status accounting |
| §9 | Problem Resolution (CAPA) | Problem reports, root causes, corrective actions |
| 21 CFR 820.30(j) | DHF (Design History File) | Auditor-ready bundle of everything above |

---

## Standards covered

- **IEC 62304** — Medical device software lifecycle processes
- **ISO 14971** — Risk management for medical devices
- **ISO 13485** — Quality management systems (process layer)
- **FDA 21 CFR Part 820** — Quality System Regulation (Design Controls)
- **FDA 21 CFR Part 11** — Electronic records / electronic signatures
- **EU MDR** — Medical Device Regulation (Technical File, PMS, Vigilance)
- **IEC 81001-5-1** — Cybersecurity (*planned — not yet implemented*)
