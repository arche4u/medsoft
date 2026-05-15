# Risk Register (§7 / ISO 14971)

The platform implements **ISO 14971** risk management with **IEC 62304 §7** software-specific extensions. Every hazard, control measure, and residual-risk assessment lives in one place.

**Develop → Risk → Risk Register**

> **Note:** §7 is currently a working register and will be deepened in upcoming work to make it the **central cross-cutting layer** for software + cybersecurity + system risk under one ISO 14971 + AAMI TIR57 framework. This page describes the current behaviour.

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

Each risk is **linked to one requirement** (typically the SOFTWARE requirement whose behaviour creates the hazard).

## Add a risk

`+ New Risk`:

- **Linked requirement** — required.
- **Category** — optional (per-project categories like *Cybersecurity*, *Usability*, *Performance*).
- **Hazard** — the dangerous condition (e.g. *Incorrect drug dose calculation*).
- **Hazardous situation** — the circumstance where the hazard manifests (e.g. *Pump in bolus mode with door closed during programming*).
- **Harm** — the patient outcome (e.g. *Over-delivery → adverse drug event*).
- **Severity** (1–5)
- **Probability** (1–5)
- **Mitigation** — short narrative (the formal controls come next).

Click **Create**.

## Risk control measures (§7.2)

Open a risk → tab **Controls** → `+ Add Control`. Each control has:

- **Control type** — ISO 14971 §6.2 has three:
  - **INHERENT_SAFETY** — design out the hazard (preferred).
  - **PROTECTIVE_MEASURE** — guards, alarms, barriers.
  - **INFORMATION_FOR_SAFETY** — labels, warnings, IFU text (last resort).
- **Description** — what the control is.
- **Linked requirement** — the requirement that implements the control.
- **Linked system test** — the §5.7 test that verifies the control works.
- **Implementation status** — PROPOSED → IMPLEMENTED → VERIFIED.
- **Verification notes** — evidence the control is in place and works.

A control is **verified** when its status is VERIFIED and the linked system test passes.

## Residual risk (§6.4 / §7.4)

After all controls are in place, the residual risk must be re-scored and accepted:

Open a risk → tab **Residual Risk** → fill in:

- **Residual severity / probability** — after controls.
- **Residual risk level** — auto-computed.
- **Rationale** — why the residual risk is acceptable.
- **Accepted?** — checkbox.
- **Accepted by** — name + role.

When `is_accepted=true`, the risk status moves to `ACCEPTED`.

## Risk dashboard

The dashboard view (top of the page) shows:

```
Total: 8
By level:       HIGH 2   MEDIUM 4   LOW 2
By status:      OPEN 0   IN_CONTROL 3   ACCEPTED 5   CLOSED 0
Re-evaluation:  0 requiring re-eval

Heatmap (severity × probability):
                  Probability →
              1     2     3     4     5
Sev 1     [   ] [   ] [   ] [   ] [   ]
Sev 2     [   ] [ 1 ] [   ] [   ] [   ]
Sev 3     [   ] [ 2 ] [ 1 ] [   ] [   ]
Sev 4     [   ] [   ] [ 2 ] [ 1 ] [   ]
Sev 5     [   ] [   ] [ 1 ] [   ] [   ]

Controls:       12 total · 10 verified
Residual:       5 of 5 accepted
```

## Safety profile (§4.3)

Each project has **one** Software Safety Profile (`Develop → Risk → Safety Profile`) that declares:

- **IEC 62304 software class** (A / B / C) for the overall system.
- **Rationale** — narrative justifying the classification.
- **RPN scale** — typically 1–5 for severity and probability.
- **Severity definitions** — explicit thresholds (e.g. *Sev 5 = patient death*).
- **Probability definitions** — explicit thresholds (e.g. *Prob 5 = ≥10⁻³ per use*).
- **ISO 14971 aligned** — confirms methodology.
- **Software failure assumption** — IEC 62304 §4.3 explicit assumption ("software can fail in any way").
- **Approved by + review date**.

## Categories

Each project has a custom risk-category taxonomy (e.g. *Patient Safety*, *Cybersecurity*, *Usability*). Edit via the **Categories** sub-tab.

## Filtering

The list supports:

- By risk level (HIGH / MEDIUM / LOW)
- By status (OPEN / IN_CONTROL / ACCEPTED / CLOSED)
- By category
- By linked requirement

`/risks?level=HIGH` is a URL shortcut.

## Risk re-evaluation triggers (§7.4 — current behaviour)

The platform marks a risk as `re_evaluation_required` when:

- A linked requirement is edited.
- A linked CR with `modifies_released_software=true` is approved.
- A feedback item with a `safety_impact_assessment` is escalated and references this risk in the assessment text.

The triggers will be deepened in upcoming §7 work to make re-evaluation a first-class workflow.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Analysis of software contributing to hazardous situations | §7.1 |
| Risk control measures | §7.2 |
| Verification of risk control measures | §7.3 |
| Risk management of software changes | §7.4 |

| Activity | ISO 14971 clause |
|---|---|
| Risk management process | §4 |
| Risk analysis (hazard → situation → harm) | §5 |
| Risk control measures | §6.2 |
| Residual risk evaluation | §6.4 |
| Overall residual risk | §7 |
| Production / post-production information | §10 |
