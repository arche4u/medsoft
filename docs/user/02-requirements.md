# Requirements (§5.2)

Where you capture **what the software needs to do**. IEC 62304 §5.2 requires that software requirements derive from system requirements, which derive from user needs. The platform models this as a three-tier tree, with custom categories allowed.

## The three-tier model

```
USER requirements           "The clinician shall configure …"
   └── SYSTEM requirements  "The system shall expose a configuration service that …"
         └── SOFTWARE       "The configuration service module shall …"
```

- **USER** requirements come from the clinical need. They get validated (not verified).
- **SYSTEM** requirements decompose USER requirements into product-level capabilities. They get verified by system tests (§5.7).
- **SOFTWARE** requirements decompose SYSTEM requirements into implementable behaviour. They get verified by unit (§5.5) + integration (§5.6) tests.

Each project can add **custom categories** under any tier (e.g. *PERFORMANCE*, *CYBERSECURITY*, *USABILITY*). The platform doesn't hardcode the three names.

## Add a requirement

**Develop → Requirements → `+ New Requirement`**

Fill in:

- **Type** — pick from the dropdown (USER / SYSTEM / SOFTWARE or your custom categories).
- **Parent** — required for non-root categories. The parent must be of the category one level up (SYSTEM under USER; SOFTWARE under SYSTEM).
- **Title** — short, imperative ("The system shall…").
- **Description** — full requirement text.

Click **Create**. The platform auto-assigns a **readable ID** like `URQ-001`, `SYS-001`, `SWR-001` (the prefix is configurable per category).

## The hierarchy tree

Switch to the **Tree** view to see the parent-child chain visually:

```
URQ-001  Waveform display with configurable layout
   ├── SYS-001  Display rendering subsystem
   │     ├── SWR-001  Waveform tile layout engine
   │     └── SWR-002  Touchscreen gesture driver
   └── SYS-002  Touchscreen input subsystem
         └── SWR-003  Multi-touch gesture handler
```

Click any requirement to open the detail panel, where you can edit, attach risks, link tests, or attach files.

## Bulk import

For migrating from Excel or another tool:

1. Prepare an Excel file with columns: `type`, `title`, `description`, `parent_readable_id` (optional).
2. **Develop → Requirements → `Upload Excel`**.
3. Select the file. The platform validates and shows a summary before committing.

## Baselines (§5.2 versioning)

Requirements aren't released loose — they're released as **baselines** (frozen snapshots). The platform has two tiers:

1. **Category baselines** — one per category (USER baseline v1.0, SYSTEM baseline v1.0, etc.). Each moves through its own DRAFT → IN_REVIEW → APPROVED → OBSOLETE workflow with prepared / reviewed / approved signoff.
2. **Composite SRS baseline** — a manifest that pins specific category-baseline versions (e.g. SRS v1.0 pins USER@v1.0 + SYSTEM@v1.0 + SOFTWARE@v1.0).

When a category baseline is APPROVED, requirements of that category are **locked** for editing. A new draft baseline must be forked to make changes.

## Add a baseline

**Develop → Requirements → tab "Baselines"**:

1. Click **`+ New Composite Baseline`**.
2. Pick a version (e.g. `v1.0`).
3. For each category, select which approved category-baseline version to pin.
4. Move through the signoff trail (Prepared by → Reviewed by → Approved by).

Once APPROVED, the baseline can't be edited (only forked) and the requirements are locked.

## Categories

Each project has its own requirement-category list. Default ones (USER / SYSTEM / SOFTWARE) are auto-seeded on first project visit. Add custom ones via the **Categories** sub-tab.

A category has:

- **Name** — short uppercase key (e.g. `PERFORMANCE`).
- **Label** — human-readable display (e.g. *Performance Requirements*).
- **Color** — chip color in the UI.
- **Parent** — the category's parent in the hierarchy (or none for root categories).
- **Readable-ID prefix** — three-letter code for auto-generated IDs (e.g. `PRF-001`).

## Linking to design and tests

From the requirement's detail panel:

- **Add design link** — connects this requirement to a §5.4 design element.
- **Add system test** — connects to a §5.7 system test case.
- **Add risk** — connects to an ISO 14971 risk entry.
- **Attach files** — upload supporting documents (specs, mock-ups, references).

These links power the V-Model Tree, the traceability matrix, and the DHF.

## AI-assisted generation

If your project has product description and Knowledge Base entries set up:

**Develop → Requirements → `✨ AI Generate`**

The platform sends your project's context (product description, KB entries, plans) to Claude and proposes a structured set of requirements covering USER / SYSTEM / SOFTWARE tiers. You review and accept or edit before they're saved.

(Requires `ANTHROPIC_API_KEY` to be set in the backend.)

## IEC 62304 mapping

| What you're doing | IEC clause |
|---|---|
| Capturing user needs | §5.2.1 |
| Decomposing into system requirements | §5.2.2 |
| Decomposing into software requirements | §5.2.3 |
| Two-tier baseline approval (per-category + composite) | §5.2.5 |
| Verifying requirements with the V-Model Tree | §5.2.6 |
| Updating requirements via §6.3 change control | §5.2.6 + §6.2 |
