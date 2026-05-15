# Risk Register (§7 / ISO 14971)

The Risk Register implements **IEC 62304 §7** (software risk management) on top of an **ISO 14971** hazard-analysis chain. Every hazard, control measure, verification evidence, and residual-risk assessment lives in one place — and the same register hosts cybersecurity risk (per **IEC 81001-5-1** + **AAMI TIR57**) under a `risk_class` discriminator so safety and security live in one ISO 14971 file.

**Develop → Risk → Risk Register**

## Risk class

Every risk carries a `risk_class`:

| Class | What it means |
|---|---|
| **SAFETY** *(default)* | Classical software-safety risk — a software failure could contribute to a hazardous situation. |
| **SECURITY** | Cybersecurity risk — a vulnerability could be exploited but doesn't directly create a safety hazard. |
| **SAFETY_SECURITY** | The bridge case AAMI TIR57 emphasises: a security compromise could *cause* a safety hazard (e.g. authentication bypass → unauthorised dose change). |

The Risk Register has tabs / chips at the top to filter by class. Cybersecurity vulnerabilities (when the IEC 81001-5-1 module lands) will FK into the same `risks` table — there's no separate cyber risk store.

## A risk record (ISO 14971 chain)

Every risk captures the standard hazard analysis chain:

```
Hazard ──► Hazardous Situation ──► Harm
```

Plus initial scoring:

- **Severity** (1–5) — what could happen to the patient.
- **Probability** (1–5) — how likely.
- **Risk level** — auto-computed: severity × probability ≤ 4 = LOW, ≤ 9 = MEDIUM, else HIGH.
- **Status** — OPEN / IN_CONTROL / RE_EVALUATION_REQUIRED / ACCEPTED / CLOSED.

Each risk is **linked to one requirement** (typically the SOFTWARE requirement whose behaviour creates the hazard) — that's the V-model traceability spine.

## Add a risk

`+ New Risk`:

- **Linked requirement** — required.
- **Risk class** — SAFETY (default) / SECURITY / SAFETY_SECURITY.
- **Category** — optional (per-project user-defined risk-folder taxonomy).
- **Hazard** — the dangerous condition (e.g. *Incorrect drug dose calculation*).
- **Hazardous situation** — the circumstance where the hazard manifests.
- **Harm** — the patient outcome.
- **Severity / Probability** (1–5 each).
- **Mitigation** — short narrative (formal controls come below).

Click **Create**.

## §7.1 — Analysis of software contributing to hazardous situations

For each risk you can now record **which software items and architecture components contribute to the hazardous situation**. This is the §7.1 explicit traceability that auditors expect — instead of just *"software can fail in any way"*, you can answer *"which software items are implicated by this hazard?"*

In the risk detail panel → **Contributions** section → `+ Add Contribution`:

- **Kind** — Software Item (§4.3) *or* SWComponent (§5.3).
- **Item** — dropdown of the project's existing items / components.
- **Notes** — narrative explaining *how* this item contributes.

The bidirectional view ("which risks does this software item carry?") shows up on the Software Items page too.

## §7.2 — Risk control measures

Open a risk → **Controls** tab → `+ Add Control`. Each control has:

- **Control type** — ISO 14971 §6.2 prefers in this order:
  - **INHERENT_SAFETY** — design out the hazard.
  - **PROTECTIVE_MEASURE** — guards, alarms, barriers, runtime checks.
  - **INFORMATION_FOR_SAFETY** — labels, warnings, IFU text (last resort).
- **Description** — what the control is.
- **Linked requirement** — the requirement that implements the control.
- **Linked system test** — the §5.7 test that demonstrates the control works.
- **Linked component (§5.3)** — *new* — the SWComponent where this control actually lives in code. One click from "where in the architecture is this safety logic?" to the answer.
- **Implementation status** — PROPOSED → IMPLEMENTED → VERIFIED.

The status `VERIFIED` is now driven by §7.3 evidence (next section) — you don't set it manually.

## §7.3 — Verification of risk control measures (closed loop)

Each control carries a list of **verification evidence**. The control auto-flips to `VERIFIED` when at least one PASS evidence row is present; if all PASS evidence is later deleted, it rolls back to `IMPLEMENTED`.

Below each control → **`+ Verification Evidence`** opens a modal:

- **Evidence type**:
  - SYSTEM_TEST → pick from the project's §5.7 system tests.
  - INTEGRATION_TEST → pick from §5.6.
  - UNIT_TEST → pick from §5.5.
  - REVIEW — design / code review record.
  - INSPECTION — inspection record.
  - ANALYSIS — analytical evidence.
  - EXTERNAL_REF — free-text URL / document reference (vendor reports, third-party certifications, regulatory documents).
- **Result** — PASS or FAIL. PASS auto-verifies the control; FAIL rolls it back from VERIFIED if previously verified.
- **Notes** — narrative (test conditions, methods, edge cases).
- **Verified by** — name + role.

The evidence list per control surfaces every verification activity that ever fired against this control. Auditors see the full closed loop without having to cross-reference test results elsewhere.

## §7.4 — Risk management of software changes

When a Change Request that **modifies released software** (`modifies_released_software=true`) is APPROVED, the platform **automatically flags every risk whose linked requirement is in the CR's impact list** for re-evaluation. The flag carries the reason ("CR 'Foot-pedal latency fix' approved 2026-05-15") and a timestamp, so QA/RA always know *why* the risk needs another look.

### Re-evaluation Inbox

A dedicated **"Needs re-evaluation"** filter at the top of the Risk Register surfaces flagged risks:

```
RE-EVALUATION INBOX (2)
┌───────────────────────────────────────────────────────────────────┐
│ [HIGH][SAFETY_SECURITY]  Mode table corruption in EEPROM          │
│ Hazardous situation: Configuration data corrupted → wrong limits  │
│ Trigger: CR 'Foot-pedal latency fix' approved 2026-05-15          │
│ Triggered at: 2026-05-13 14:22                                    │
│                                              [Re-evaluate →]      │
└───────────────────────────────────────────────────────────────────┘
```

### Recording a re-evaluation

Click **Re-evaluate**. The modal asks:

- **Notes** *(required)* — what the re-evaluation concluded. Appended to the risk's `evaluation_notes` with a date stamp.
- **Re-evaluated by** — name + role.
- **Severity / Probability** *(optional)* — if the re-evaluation concluded the risk score has changed.
- **New status** *(optional)* — change the lifecycle status (e.g. IN_CONTROL if it remains under control, CLOSED if the risk no longer applies).

Submitting:

1. Clears the `re_evaluation_required` flag.
2. Records `last_re_evaluated_at` + `last_re_evaluated_by` (visible in the risk detail panel).
3. Updates score + status if provided.
4. Writes an audit log entry.

The historical "what triggered this re-evaluation" stays on the risk for the audit trail.

### Other triggers

Beyond CR APPROVED, you can also manually flag a risk for re-evaluation from its detail panel (`Flag for re-evaluation` button) — useful when a feedback safety assessment surfaces a previously-accepted risk.

## Residual risk (ISO 14971 §6.4)

After all controls are VERIFIED, re-score the residual risk:

Open a risk → tab **Residual Risk** → fill in:

- **Residual severity / probability** — after controls.
- **Residual risk level** — auto-computed.
- **Rationale** — why the residual risk is acceptable.
- **Accepted?** — checkbox.
- **Accepted by** — name + role.

When `is_accepted=true`, the risk status auto-advances to `ACCEPTED`.

## Risk dashboard

Top of the page:

```
Total: 8                        Class:    SAFETY 6  SECURITY 1  SAFETY_SECURITY 1
By level:   HIGH 2  MED 4  LOW 2    Status:   OPEN 0  IN_CONTROL 1  ACCEPTED 5  RE_EVAL 2
Heatmap (severity × probability):    Controls:  12 total · 10 verified
                                      Residual:  5 of 5 accepted

[Heatmap grid]                        §7.4 re-evaluation: 2 risks need re-eval
                                                            [Open inbox →]
```

## Safety profile (§4.3)

Each project has **one** Software Safety Profile (`Develop → Risk → Safety Profile`) declaring:

- **IEC 62304 software class** (A / B / C) for the system overall.
- **Classification rationale**.
- **RPN scale**.
- **Severity / Probability definitions**.
- **ISO 14971 aligned** confirmation.
- **Software failure assumption** — IEC 62304 §4.3 explicit ("software can fail in any way").
- **Approved by + review date**.

## Categories

Each project has a custom risk-category taxonomy (e.g. *Patient Safety*, *Cybersecurity*, *Usability*, *Off-label use*). Edit via the **Categories** sub-tab.

## Filtering

The list supports:

- By risk **class** (SAFETY / SECURITY / SAFETY_SECURITY).
- By **level** (HIGH / MEDIUM / LOW).
- By **status** (OPEN / IN_CONTROL / ACCEPTED / CLOSED / RE_EVALUATION_REQUIRED).
- By **category**.
- By **linked requirement**.
- By **`needs re-evaluation`** flag (the §7.4 inbox).

URL shortcuts:

- `/risks?level=HIGH`
- `/risks?class=SECURITY`
- `/risks?needs_reevaluation=true`

## §7 → §6 → §9 flow (post-market loop)

The whole loop, in order:

1. **§6.2.1 Feedback** comes in → triage.
2. **§6.2.1.3** safety impact assessment is recorded — surfaces which risks might be affected.
3. Feedback **§6.2.2 escalates** → creates a CAPA Problem Report or a Change Request.
4. **§6.2.3** post-release impact analysis is filled on the CR.
5. **§6.2.4** approves the CR (esign + permission).
6. **§7.4 auto-trigger** fires → every Risk linked to an impacted requirement is flagged.
7. QA/RA open the **Re-evaluation Inbox** → record the outcome per risk.
8. **§5** development re-runs (units / integration / system / release).
9. **§5.8 + §6.3.2** new release published, supersedes the prior version.
10. **§6.2.5** users + regulators notified.
11. DHF re-generated → captures every step.

## IEC 62304 mapping

| Activity | IEC clause | Where in the platform |
|---|---|---|
| Analysis of software contributing to hazardous situations | §7.1 | Risk → Contributions section |
| Risk control measures | §7.2 | Risk → Controls tab |
| Verification of risk control measures (closed loop) | §7.3 | Control → Verification Evidence sub-list |
| Risk management of software changes (auto-trigger) | §7.4 | Re-evaluation Inbox, fed by Change Control |

| Activity | ISO 14971 clause |
|---|---|
| Risk management process | §4 |
| Risk analysis (hazard → situation → harm) | §5 |
| Risk control measures + hierarchy | §6.2 |
| Verification of risk control implementation + effectiveness | §6.3 |
| Residual risk evaluation | §6.4 |
| Overall residual risk | §7 |
| Production / post-production information | §10 |

| Adjacent standard | What it adds |
|---|---|
| **IEC 81001-5-1** | Cybersecurity in the same risk file via `risk_class`. |
| **AAMI TIR57** | The SAFETY_SECURITY class for cross-cutting hazards. |
| **MDR §83–§86** | The PMS feedback loop into §7.4 re-evaluation. |
