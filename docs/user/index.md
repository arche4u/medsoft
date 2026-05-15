# User Guide

This guide is for **end users** of the MedSoft Compliance Platform — QA engineers, regulatory affairs, clinical engineers, project managers, and anyone responsible for keeping medical-device software audit-ready under IEC 62304.

It's written in plain language. **No coding knowledge required.** Where a step involves a button or menu, the path is spelled out (e.g. *"Sidebar → Develop → Requirements"*).

## How to use this guide

If you're new to the platform, read these in order:

1. [Getting started](00-getting-started.md) — log in, pick a project, understand roles.
2. [Projects](01-projects.md) — what a project is and how it anchors everything else.
3. [Requirements (§5.2)](02-requirements.md) — capture what the software needs to do.
4. [Architecture & Design (§5.3–§5.4)](03-architecture.md) — describe how the software is built.
5. [Verification (§5.5–§5.7)](04-verification.md) — record that it does what it should.
6. [Release Management (§5.8)](05-release.md) — publish a version with all gates green.
7. [Feedback Intake (§6)](06-feedback.md) — capture post-market feedback and route problems.
8. [Risk Register (§7)](07-risks.md) — hazards, controls, residual risk.
9. [Configuration Management (§8)](08-config-mgmt.md) — items, baselines, change control.
10. [CAPA / Problem Resolution (§9)](09-capa.md) — record and resolve problems.
11. [Design History File](10-dhf.md) — generate the audit-ready DHF.
12. [End-to-end walkthrough](iec-62304-walkthrough.md) — one project's full journey through the standard.

## Sidebar overview

The left sidebar groups every page by IEC 62304 phase. You can collapse / expand each section.

```
Sidebar
├── Plan
│   ├── Projects
│   └── Dashboard
├── Develop                     ← IEC 62304 §4.3, §5.2–§5.7, §7
│   ├── Software Items (§4.3)
│   ├── Requirements (§5.2)
│   ├── Design
│   │   ├── SW Architecture (§5.3)
│   │   └── Detailed Design (§5.4)
│   ├── Verification
│   │   ├── Unit Verification (§5.5)
│   │   ├── Integration Tests (§5.6)
│   │   └── System Testing & Release (§5.7 + §5.8)
│   ├── Risk
│   │   └── Risk Register
│   ├── Maintenance
│   │   └── Feedback Intake (§6.2.1)
│   └── Traceability
│       ├── V-Model Tree
│       └── Validation Records
└── Docs                        ← Plans + change-control + records
    ├── IEC 62304 Plans
    │   ├── Dev Plan (§5.1)
    │   ├── Maintenance Plan (§6.1)
    │   ├── Risk Mgmt Plan (§7)
    │   ├── Config Mgmt Plan (§8.1)
    │   ├── Problem Resolution Plan (§9)
    │   └── Custom Plans
    ├── Change & Configuration
    │   ├── Change Requests
    │   └── Config Management
    ├── Problem Resolution
    │   └── CAPA
    ├── Release & DHF
    │   ├── Release Management
    │   └── DHF
    ├── Knowledge Base
    └── (Document Register · Training · Users · Audit · Login)
```

## Choosing a project

Most pages show data for **one project at a time**. The active project is set via the sidebar's project picker (top of the panel). Switching projects updates every screen automatically.

If you've never picked a project, pages show a "Select a project from the sidebar" message.

## Glossary of jargon

These terms come up across the platform — most are straight from the standards.

| Term | What it means |
|---|---|
| **IEC 62304** | The international standard for medical-device software lifecycle processes. The platform's organizing spine. |
| **Class A / B / C** | IEC 62304 safety classification. A = no injury possible. B = non-serious injury. C = serious injury or death possible. |
| **SOUP** | Software of Unknown Provenance — third-party libraries, OS components, drivers. Tracked separately because we didn't write them. |
| **DHF** | Design History File — the bundle of evidence that proves design controls were followed. Required by FDA 21 CFR 820.30(j). |
| **SRS** | Software Requirements Specification — the formal, baseline-able set of requirements. |
| **V-model** | The diagram that pairs each requirement with a test. User requirements ↔ validation; system requirements ↔ system tests; software requirements ↔ unit/integration tests. |
| **Risk control measure** | A change to the design, a protective feature, or a label/IFU that reduces risk. Defined by ISO 14971 §6.2. |
| **Residual risk** | The risk that remains after all control measures are in place. Must be evaluated and accepted. |
| **Vigilance / PMCF / PMS** | Post-market reporting. Vigilance = serious incidents to regulators. PMCF = post-market clinical follow-up. PMS = the broader surveillance system. |
| **Adverse event** | An undesired clinical outcome. Must be reported and is one of the §6.2.1.2 criteria for declaring feedback to be a "problem". |
| **Spec deviation** | The software did something different from what the specification says. Also a §6.2.1.2 problem criterion. |
| **CAPA** | Corrective And Preventive Action — the formal response to a problem report. |
| **Change Request (CR)** | A controlled request to change something. Must be analysed (§6.2.3) and approved (§6.2.4) before implementation. |
| **Baseline** | A frozen snapshot of a set of items (requirements, architecture, configuration). You release from a baseline, not from the live working state. |
| **E-signature** | A 21 CFR Part 11–compliant signature applied to an approval. Records who, when, and what was approved. |

## Who does what — typical roles

The platform supports six roles out of the box. Permissions are listed under [Users → Roles] when you have access.

| Role | What they typically do |
|---|---|
| **Admin** | Full access. Manages users, roles, and platform configuration. |
| **QA** | Reviews and approves. Records test results. Approves releases. Records §6.2.5 notifications. |
| **QARA** | Regulatory affairs / QA. Reviews requirements, manages risk file, owns the DHF generation. |
| **Developer** | Writes requirements, defines architecture and design, runs unit/integration tests. Logs feedback. |
| **Tester** | Executes tests and records results. Reads-only on most other modules. |
| **Reviewer** | Reads and approves changes. Cannot create or delete records. |

Your role is shown in the top-right of every page after login.
