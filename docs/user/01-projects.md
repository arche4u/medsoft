# Projects

A **project** is the container for one medical-device software product. Every requirement, design element, test, risk, feedback item, release, and DHF belongs to exactly one project.

## When to create a new project

- A new product (e.g. *Patient Vital Signs Monitor*).
- A major new variant that needs its own design history (e.g. paediatric vs. adult monitor).
- A standalone software-only product (SaMD).

A new firmware revision of an existing product does **not** need a new project — it's a [new Release](05-release.md) of the existing project.

## Create a project

**Plan → Projects → `+ New Project`**

Fill in:

- **Name** — what the product is called publicly.
- **Description** — short summary (regulatory intended use is helpful here).

Click **Create**. The new project appears in the list and is automatically set as your active project.

## Anatomy of the dashboard

**Plan → Dashboard** shows a rollup of the active project. Typical cards:

```
┌────────────────────┬────────────────────┬────────────────────┐
│ Requirements       │ Risks              │ Tests              │
│      35            │      8             │      32            │
│ 10U · 10S · 15SW   │ HIGH / MED         │ 4 unit · 3 itc ·   │
│                    │                    │ 25 system          │
└────────────────────┴────────────────────┴────────────────────┘
┌────────────────────┬────────────────────┬────────────────────┐
│ Releases           │ Feedback (§6)      │ DHF                │
│   v1.0.0 ✓         │ 6 items            │ Generate DHF →     │
│   v1.1.0 draft     │ 1 escalated        │                    │
└────────────────────┴────────────────────┴────────────────────┘
```

Click any card to jump to that module.

## Project lifecycle

A project doesn't have a formal status field — it lives for the life of the product. The **Releases** within a project are what move from DRAFT to RELEASED.

## Deleting a project

**Caution.** Deleting a project removes everything attached to it: requirements, design, tests, releases, feedback, audit log. There is no undo.

To delete (Admin only):

1. Plan → Projects.
2. Click the project's `⋯` menu.
3. Choose **Delete**.
4. Confirm in the modal.

For regulated, in-use projects you almost never want this — archive instead by simply ceasing to add new releases.

## Multi-project tips

- **Switching projects clears your detail-panel selections.** The list view repopulates.
- **The active project is per-browser-tab.** Open two tabs to view two projects side by side.
- **localStorage caches the active project.** If a project gets deleted, the platform auto-detects and resets your selection on next page load.

## IEC 62304 mapping

| Activity | IEC clause | Where |
|---|---|---|
| Project intended use, scope | §5.1 SDP | [Walkthrough](iec-62304-walkthrough.md) |
| Project safety classification | §4.3 | [Walkthrough](iec-62304-walkthrough.md) |
| Project requirements baseline | §5.2 | [Requirements](02-requirements.md) |
| Project release history | §5.8 / §6.3.2 | [Releases](05-release.md) |
