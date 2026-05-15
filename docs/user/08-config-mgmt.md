# Configuration Management (§8)

IEC 62304 §8 requires that every software item under configuration control is **uniquely identified**, **baselined** at release, and **change-controlled** thereafter.

**Docs → Change & Configuration → Config Management**

## Configuration items

A **CMConfigItem** is anything that goes into the released software bundle:

- Source code (modules, packages).
- Build outputs (binaries, container images, firmware blobs).
- Third-party libraries (**SOUP** — Software of Unknown Provenance).
- Configuration files, scripts, data files.
- Documentation that ships with the product.

Each item has:

- **Name** — descriptive.
- **Item type** — SOURCE / BINARY / SOUP / CONFIG / DOC / SCRIPT.
- **Version** — semver, commit hash, or version string.
- **Hash** — content hash (SHA-256) for integrity.
- **Location** — URL or repository path.
- **Status** — UNDER_DEVELOPMENT / RELEASED / OBSOLETE.

## Add a configuration item

`+ New Config Item`. Most fields are free-text — fill in what your release process actually uses.

## Baselines

A **CMBaseline** is a frozen set of CMConfigItems. Typical baselines:

- Per release (`v1.0.0 release baseline`).
- Per milestone (`UAT baseline`, `pre-release baseline`).
- Per integration build (`nightly 2026-03-15`).

Each baseline has:

- **Version** — string identifier.
- **Status** — DRAFT / LOCKED / RELEASED / OBSOLETE.
- **Baseline type** — DEVELOPMENT / RELEASE / ARCHIVE.
- **Parent baseline** — what this baseline supersedes.
- **Items** — the snapshot of CMConfigItem + their pinned versions.

## Workflow

```
DRAFT ──► LOCKED ──► RELEASED
            │
            └── add/remove items in DRAFT, then move to LOCKED
                (LOCKED means items can't be modified; only LOCKED baselines
                 can be RELEASED through the release endpoint)
```

The §5.3 architecture-baseline approval and §5.2 SRS-baseline approval automatically **mirror** themselves as CM baselines so the auditor sees one consistent record.

## Pre-release CM gate

Before a Release can move to RELEASED, the platform calls a **CM release-check** that verifies:

- A LOCKED baseline exists for the release version.
- All items in the baseline have a non-NULL hash + version.
- No items are in UNDER_DEVELOPMENT status.

If anything's off, the Release readiness gate stays red.

## §8.1 Configuration Management Plan

The platform's plan template covers:

1. Purpose and Scope
2. Configuration Identification — how items are uniquely identified (incl. SOUP)
3. Change Control — workflow + roles
4. Configuration Status Accounting — how history is preserved
5. Tools and Repositories — what we use
6. Roles and Responsibilities

**Docs → IEC 62304 Plans → Config Mgmt Plan (§8.1)** to view / edit.

## Status accounting

Every change to a CMConfigItem or CMBaseline is written to the **audit log** with actor + timestamp + entity + action. Auditors can pull this log via **Docs → Audit**.

## SOUP

> **Note:** A dedicated SOUP register module is planned. Currently SOUP is tracked as CMConfigItems with `item_type=SOUP`. When the SOUP register lands, it will add:
>
> - CVE feed integration (auto-import vulnerability disclosures)
> - License tracking
> - Version-upgrade tracking
> - Direct link to the §6.1(f) Maintenance Plan procedures for evaluating SOUP upgrades / patches / obsolescence
>
> This is part of the planned **Cybersecurity (IEC 81001-5-1)** work, since SOUP is the foundation for the SBOM.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Configuration management process | §8 |
| Configuration management planning | §8.1 |
| Configuration item identification | §8.2 |
| Configuration item version + hash | §8.2.1 |
| SOUP identification | §8.2.2 |
| Change request management | §8.3 |
| Change request approval | §8.3.2 + §6.2.4 |
| Configuration status accounting | §8.4 (via audit log) |
