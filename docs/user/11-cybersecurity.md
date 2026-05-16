# Cybersecurity — User Guide

The **Cyber** sidebar group covers IEC 81001-5-1 — the international cybersecurity standard accepted by FDA, EU MDR, Health Canada, and other major regulators.

## Three things you do here

### 1. Write the Cybersecurity Plan
Open **Cyber → Cybersecurity Plan**. The 11-section template is pre-filled with the IEC 81001-5-1 lifecycle activities. Edit each section's body to match your organization's process; status the plan from DRAFT → IN_REVIEW → APPROVED to lock it.

### 2. Build the Threat Model (STRIDE)
Open **Cyber → Threat Model (STRIDE)**.

1. Click **Create** on the left panel to start a new threat model (give it a name and a version like `v1.0`).
2. Add threats one at a time:
   - Pick the STRIDE letter (S Spoofing / T Tampering / R Repudiation / I Info disclosure / D Denial of service / E Elevation of privilege).
   - Pick severity (LOW / MEDIUM / HIGH / CRITICAL).
   - Optionally link to a §5.3 architecture component.
   - Describe the threat and the planned mitigation.
3. As mitigations land, move threats from `IDENTIFIED` → `MITIGATED` or `ACCEPTED`.
4. When the threat model is complete, **Submit for Review** then **Approve** — the model becomes read-only. To record new threats later, create a new version.

### 3. Triage Vulnerabilities (CVE)
Open **Cyber → Vulnerabilities (CVE)**.

1. Log a finding: type the CVE ID (or leave blank for internal findings), title, CVSS score, severity band, and optionally link the affected SOUP entry.
2. Move the finding through `NEW` → `TRIAGED` → `MITIGATED`/`RESOLVED` as you investigate. `FALSE_POSITIVE` closes the row without further action.
3. If the vulnerability could harm a user, click **Escalate to §7 Risk (SECURITY)**, pick the requirement most impacted, and set severity / probability on the 1–5 scale. A Risk row is created in the §7 register with `risk_class=SECURITY` — from there it follows the same control + verification + re-evaluation flow as every other risk.

## Generate the SBOM at any time

Open **Cyber → SBOM (CycloneDX)** and click **Re-generate**. The page fetches a fresh CycloneDX 1.5 JSON document built from your §8.2.2 SOUP register and any open vulnerabilities. Click **Download .json** to save the file — auditors and downstream scanners can both consume it directly.

## How this fits with everything else

- Cyber threats and CVEs all funnel into the **single §7 risk register** — there is no separate "cyber risk file". Filter the register by `risk_class=SECURITY` to see only cyber risks.
- The SBOM is **derived** from your SOUP register. Add or version a SOUP entry in Config Management and the SBOM picks it up on the next generation.
- The Cybersecurity Plan is one of the plans in the **Docs → IEC 62304 Plans** group too — same place you keep the SDP, Maintenance Plan, etc.

## Tips

- Run a fresh threat model at the start of every major release. Reference the previous version in the new version's description.
- For long-life devices, set a recurring calendar reminder to re-pull the vulnerability feed for each SOUP entry. Even a SOUP that's been quiet for years can get a fresh CVE.
- Keep the SBOM attached to every release record. EU MDR auditors will ask for it; FDA increasingly expects it in Premarket submissions.
