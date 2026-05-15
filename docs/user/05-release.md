# Release Management (§5.8 + §6.3)

A **release** is a versioned snapshot of the software, approved and ready to ship. IEC 62304 §5.8 governs the release; §6.3 governs maintenance releases.

**Docs → Release & DHF → Release Management**

## Release lifecycle

```
DRAFT ──► UNDER_REVIEW ──► APPROVED ──► RELEASED
```

You move forward one step at a time. Each step has gates the platform enforces.

| State | What it means | What's required to move to the next state |
|---|---|---|
| DRAFT | Building the release; items can be added/removed | Nothing — you can move to UNDER_REVIEW any time |
| UNDER_REVIEW | Reviewers approve via [Approvals](#approvals) | At least one electronic signature with meaning=APPROVAL |
| APPROVED | Frozen; passed approval | Pre-release readiness gates (see below) |
| RELEASED | Published; immutable | (Terminal — fork a new release to make further changes) |

## Create a release

`+ New Release` on the left panel:

- **Version** — e.g. `v1.0.0`, `v1.1.0`. The platform pre-fills the next minor bump.
- **Supersedes** — *§6.3.2 maintenance-release lineage*. Optional. Pick a prior **RELEASED** version that this release supersedes. Required for maintenance releases. The link is shown as a chip `← v1.0.0` on the release card and in the DHF.

Click **Create Release**.

## Add release items

When status is DRAFT, you can attach items the release covers:

- **System Test** — the §5.7 system test cases this release contains evidence for.
- **Requirement** — the §5.2 requirements this release implements.
- **Design Element** — the §5.4 design components this release ships.

These items populate the **§5.8 baseline snapshot** captured at approval time.

## Readiness gates

When the release is in APPROVED state, the right panel shows the pre-release readiness check. All gates must be green to publish:

```
✓ Approved SDP exists
✓ All SYSTEM/SOFTWARE requirements have system tests
✓ No failed system tests
✓ All USER requirements have a passing validation record
✓ All interfaces have integration tests
✓ Class C unit verification complete
✓ Risks under control
✓ Configuration management gate clear
✓ No unresolved CAPAs
```

If any gate is red, the **Publish** button is disabled and the gate name links you to the page where you can fix it.

## Approvals

While UNDER_REVIEW, the right panel shows an Approval form:

- **Approver name**
- **Comments** (optional)
- **APPROVE** / **REJECT** buttons

Each approval writes a 21 CFR Part 11 electronic signature.

## Publishing (RELEASED)

Click `→ RELEASED` when all gates are green. The platform:

1. Verifies an esign exists.
2. Re-runs all readiness gates server-side.
3. Captures a **release snapshot** — a frozen JSON copy of every requirement, design element, test, risk, CM item at this moment.
4. Records the publish timestamp.
5. Locks the release (no further edits).

Once published, you can [generate a DHF](10-dhf.md) bound to this release version.

## §6.2.5 — User & Regulator Notification

After a release is RELEASED, the §6.2.5 panel appears on the release detail page. Per IEC 62304 §6.2.5, **users and regulators must be informed** about changes to released software.

```
§6.2.5 Communication to Users and Regulators
┌──────────────────────────┬──────────────────────────┐
│ User notification        │ Regulator notification   │
│ ✓ recorded               │ ✓ recorded               │
│ "Release v1.0.0 publish  │ "Submitted change        │
│ ed; field-safety notice  │ summary + safety impact  │
│ issued via email …"      │ to Notified Body + FDA"  │
│ 2026-05-13 14:22         │ 2026-05-13 16:08         │
└──────────────────────────┴──────────────────────────┘
```

To record a notification:

1. Pick audience (**User** / **Regulator**).
2. Enter a summary (channels used, content sent, acknowledgements expected).
3. Click `Record …Notification`.

Recorded timestamps appear in the DHF and the audit log.

## §6.3.2 — Maintenance Release Lineage

When a release supersedes a prior RELEASED version, the chip `← v1.0.0` shows on:

- The release list card
- The detail panel header
- The DHF (releases table)

The chain is queryable: v1.0.0 → v1.1.0 → v1.2.0 → … forms a graph rather than relying on string-version ordering.

## Release artifacts

Each release can carry artifacts:

- **Build outputs** — version, hash, artifact reference.
- **External references** — JIRA tickets, GitHub releases, external documents.
- **Per-item version pins** — what version of each item went into this release.

Visible on the release detail panel.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Pre-release verification check | §5.8.1 + §5.8.2 |
| Release of software system | §5.8.3 |
| Documentation and archive of release | §5.8.4 + §5.8.7 |
| Configuration management baseline at release | §5.8.6 + §8.2 |
| Re-release modifications (maintenance) | §6.3.2 |
| Communicate to users + regulators | §6.2.5 |
| 21 CFR Part 11 e-signature on approval | (FDA Part 11 + ISO 13485) |
