# Feedback Intake (§6)

Where post-market signals enter the platform. IEC 62304 §6.2.1 mandates that feedback on released software is **monitored, documented, evaluated**, and (if it's a problem) routed into the §9 problem-resolution process.

**Develop → Maintenance → Feedback Intake**

## What counts as "feedback"

Anything reported about released software from any channel:

| Channel | Examples |
|---|---|
| **Customer Support** | Help-desk tickets, phone calls from clinical sites |
| **Vigilance** | Mandatory regulatory reports (EU vigilance, FDA MDR) |
| **PMCF** (Post-Market Clinical Follow-up) | Surveys, clinician interviews, registry data |
| **Field Service** | Service-technician reports from on-site visits |
| **Internal** | QA / engineering internal observations |
| **Literature** | Published papers, conference proceedings, journal articles |
| **Social Media** | Public posts, forums, complaints visible online |
| **Regulatory** | Notified Body queries, FDA RFIs, competent-authority requests |
| **Custom** (Other) | Project-defined channels (e.g. *STAKEHOLDER_INTERVIEW*) |

The platform's source list is **open vocabulary** — any project can add a custom channel.

## Workflow

Each feedback item moves through five states:

```
NEW ─► UNDER_REVIEW ─► EVALUATED ─► ESCALATED ─► CLOSED
                       │                │
                       └─ if not a       └─ link to ProblemReport (§6.2.2)
                          problem, also       OR ChangeRequest (§6.2.3)
                          CLOSED with
                          rationale
```

### Log a new item

Click `+ New Feedback`:

- **Source** — pick from the 8 channels or type a custom one.
- **Severity** — COSMETIC / MINOR / MAJOR / SAFETY.
- **Reporter** — name / role / contact.
- **Affected version** — e.g. `v1.0.0`.
- **Summary** — one-line description.
- **Description** — full details (who, what, when, repro steps).
- **Adverse event** — checkbox. §6.2.1.2 makes this a problem-determining criterion.
- **Spec deviation** — checkbox. Same.

Click `Log feedback`. Item appears at the top of the list in `NEW` state.

### Triage (`Under Review`)

Click a card to open the detail panel. Status drops to `UNDER_REVIEW` while you investigate.

### Evaluate (§6.2.1.2 + §6.2.1.3)

Click the **Evaluate §6.2.1.2** tab:

- **Is this a problem?** Yes / No / undecided. This is the formal §6.2.1.2 determination.
- **Evaluation notes** — what the evaluation found.
- **Evaluated by** — name + role.
- **Safety impact assessment (§6.2.1.3)** — how does this affect the safety of released software? Triggers a risk re-evaluation in §7 when filled.
- **Change needed?** Yes / No / undecided.

Click `Save evaluation`. Status moves to `EVALUATED`.

### Escalate (§6.2.2 / §6.2.3)

Once `EVALUATED`, click the **Escalate §6.2.2** tab:

- **Escalate to**:
  - **Problem Report (§9 CAPA)** — for software defects → routes to the §9 problem-resolution process.
  - **Change Request (§6.3)** — for enhancements or fixes that need a controlled change → routes through §6.2.3 impact analysis.
- **Extra notes** (optional).

Click `Create linked …`. The platform:

- Creates the new ProblemReport (or ChangeRequest).
- Pre-fills its title with `[FB-NNN]` for provenance.
- Embeds the §6.2.1.3 safety assessment in the description.
- Maps severity (COSMETIC/MINOR → LOW, MAJOR → HIGH, SAFETY → CRITICAL).
- For ChangeRequests, auto-sets `modifies_released_software=true` so the §6.2.3 gate engages.

Feedback status moves to `ESCALATED` with the linked entity ID stored. Click the link in the detail panel to jump to the new record.

### Close

For non-actionable items (user error, duplicate, cosmetic-only, out of scope, regulator query already resolved):

Click the **Close** tab → enter a closure rationale → `Close feedback`.

## Triage view (default tab)

Top section: counts by status (5 cards) + filters by status and severity.

Bottom split: list on the left, detail on the right. Click a card to open detail. Click `+ New Feedback` for the create modal.

## Monitor view (§6.2.1.1)

The Monitor tab activates the **§6.2.1.1 monitoring obligation** — "monitor feedback on medical device software released for intended use."

```
Adverse events  Spec deviations  Open SAFETY  Escalated CAPA  Escalated CR
       1               2               1              1               1

§6.1(b) recurring-defect alert — 1 cluster above the 30-day threshold

Feedback volume by severity — last 90 days (weekly)
██▌ ▌  ▌█ █ ▌█ ▌ ▌█▌ █▌█ ▌█▌ █▌    [stacked bars by severity]

Channel mix — 6 items total
[================== bar showing proportions ==================]
■ Customer Support  3        ■ PMCF              2        ■ Vigilance  1

Severity counts
  COSMETIC: 0   MINOR: 1   MAJOR: 4   SAFETY: 1
```

The **recurring-defect alert** implements the §6.1(b) "criteria for determining whether feedback is a problem" — if ≥ 3 NEW or UNDER_REVIEW items share the same `affected_version` OR the same source channel within 30 days, an alert appears so a trend review can be opened.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Monitor feedback | §6.2.1.1 |
| Document feedback | §6.2.1.2 |
| Evaluate whether feedback is a problem | §6.2.1.2 |
| Safety-impact assessment of a problem | §6.2.1.3 |
| Escalate to problem resolution process | §6.2.2 |
| Escalate to change control | §6.2.3 |
| Recurring-defect criteria | §6.1(b) |
| MDR §83 PMS feedback channels | EU MDR |
| FDA MDR (Medical Device Reporting) | 21 CFR 803 |
