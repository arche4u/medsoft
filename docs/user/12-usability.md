# Usability Engineering — User Guide

The **Use** sidebar group covers IEC 62366-1, the international usability-engineering standard. **One Usability Engineering File (UEF) satisfies EU MDR Annex I §14, FDA Human Factors, Health Canada, TGA, PMDA, MHRA all at once.**

## Three things you do here

### 1. Write the Usability Plan
Open **Use → Usability Plan**. The 12-section template walks IEC 62366-1 §5.1–§5.9 plus records retention. Edit each section's body and approve the plan when ready.

### 2. Build the Usability Engineering File (UEF)
Open **Use → Usability File (UEF)**.

#### Step A — Capture the Use Specification (§5.1)

In the file detail panel, fill the four Use Specification fields:

- **Intended users** — clinical role, training level, expected expertise (e.g., "RN with IV-therapy certification, 1+ year ICU experience").
- **Intended use environments** — clinical setting(s) (e.g., "OR, ICU, NICU; ambient lighting 200-1500 lux; noisy alarm soundscape").
- **Intended medical indication** — what the device treats / diagnoses.
- **Operating principle** — how the device works, in plain language.

The Use Specification is the input every subsequent step references. Get it right first.

#### Step B — List hazard-related Use Scenarios (§5.4)

For each task where a user error could harm the patient:

1. Add a scenario (e.g., *"Set infusion rate during emergency"*).
2. Within the scenario, list every **foreseeable use error** — a step the user could misperform.
3. For each use error, record:
   - **Description** of the misstep.
   - **Potential harm** if it happens.
   - **Severity** (LOW / MEDIUM / HIGH / CRITICAL).
   - **Mitigation** (in-product control or process).

#### Step C — Escalate critical use errors to the §7 risk register

For HIGH or CRITICAL use errors, click **Escalate to §7** on the error card, pick a target requirement (typically a USER-tier requirement), set severity/probability on the 1-5 scale, and **Create Risk**. A risk row appears in the §7 register with `risk_class=USABILITY` — from there it follows the same control + verification + re-evaluation flow as every other risk.

### 3. Approve the file
When §5.1 is complete and every hazard-related scenario is documented, **Submit for Review** then **Approve** — the file becomes read-only. To record additional scenarios later, fork a new version.

## What about formative + summative evaluations?

The Usability Plan documents the process. The evaluation **runs** themselves (participants, results, pass/fail per task) are not yet first-class entities — they live in the Document Register or as attachments today. A future release will add a dedicated Evaluation table; for now, attach evaluation reports to the matching Usability File and reference them in §5.8 / §5.9 of the plan.

## How this fits with everything else

- Use errors funnel into the **single §7 risk register** — there is no separate "usability risk file". Filter the register by `risk_class=USABILITY` to see only usability risks.
- The Usability Plan is also in the **Docs → IEC 62304 Plans** group.
- Cyber threats (`risk_class=SECURITY`), safety risks (`risk_class=SAFETY`), and use errors (`risk_class=USABILITY`) all share the same controls / verification / re-evaluation machinery. Auditors see one risk file.

## Tips

- Write the §5.1 Use Specification with your clinical SME **before** any UI work starts. Every later step references it; getting it wrong means rework.
- Scenarios are not exhaustive of normal use — they are limited to **hazard-related** tasks. Don't model every keypress.
- Summative evaluation should use the production unit (or a high-fidelity prototype) with 15+ representative users **per distinct user group**. The IEC 62366-1 §5.9 results are the validation-grade evidence regulators ask for.
