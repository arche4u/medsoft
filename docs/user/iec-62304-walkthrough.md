# End-to-end walkthrough

One project's full journey from creation to a released v1.0.0 with a generated DHF. Use this as a template for your own projects.

We'll use a hypothetical *Patient Vital Signs Monitor* (Class B, IEC 62304).

---

## 1. Create the project

**Plan → Projects → `+ New Project`**

- Name: `Patient Vital Signs Monitor`
- Description: `Bedside multi-parameter monitor (SpO₂, NIBP, ECG, EtCO₂). IEC 62304 Class B.`

Click **Create**. The project becomes your active project.

---

## 2. Classify safety (§4.3)

**Develop → Software Items → `+ New Software Item`**

Add the root SoftwareItem for the system:

- Name: `Vital Signs Monitor Software`
- Item type: `SYSTEM`
- Safety class: `B`
- Classification justification: `Failure could result in non-serious patient injury (delayed clinical response to deteriorating patient).`

Decompose into sub-items: *Alarms*, *Display*, *Data Acquisition*, *Connectivity*. Each gets its own classification (Alarms = B, Display = A, etc.).

---

## 3. Define the Software Development Plan (§5.1)

**Docs → IEC 62304 Plans → Dev Plan (§5.1) → `+ New SDP`**

- Version: `1.0`
- Safety class: `B`
- Title: `Vital Signs Monitor — SDP v1.0`

The platform pre-fills 6 default sections. Edit each, then walk the signoff trail:

1. Status `DRAFT` → fill in Prepared by → status `IN_REVIEW`.
2. Status `IN_REVIEW` → fill in Reviewed by → status `IN_REVIEW`.
3. Status `IN_REVIEW` → fill in Approved by → status `APPROVED`.

---

## 4. Capture requirements (§5.2)

**Develop → Requirements**

Add the **USER** requirements:

```
URQ-001  Clinician shall configure 2–8 waveform tiles on a 15" touchscreen
URQ-002  Clinician shall set per-parameter high/low alarm limits
URQ-003  Device shall provide colour-coded LED bar (green/yellow/red)
...
```

Then **SYSTEM** requirements under each USER:

```
URQ-001
   ├── SYS-001  Display rendering subsystem
   └── SYS-002  Touchscreen input subsystem
```

Then **SOFTWARE** under each SYSTEM:

```
SYS-001
   ├── SWR-001  Waveform tile layout engine
   └── SWR-002  Touchscreen gesture driver
```

When done, create a **composite SRS baseline v1.0** and walk it through the signoff trail.

---

## 5. Design the architecture (§5.3 + §5.4)

**Develop → Design → SW Architecture**

Add SWComponents:

```
SYSTEM: Vital Signs Monitor
   ├── SUBSYSTEM: Display
   │     ├── ITEM: Waveform Renderer
   │     └── ITEM: Status LED Driver
   ├── SUBSYSTEM: Alarms
   │     ├── ITEM: Limit Manager
   │     └── ITEM: Audio Engine
   ├── SUBSYSTEM: Data Acquisition
   └── SUBSYSTEM: Connectivity
```

For each component:
- Assign safety class (Alarms = B, Display = A, etc.).
- Link the requirements it implements.
- Link any risks it could cause.

Add **SWInterfaces** between components (e.g. *Data Acquisition → Alarm Limit Manager* via the **DATA** type).

Run the Compliance tab — every Class B/C component must have requirements + risks + system tests linked.

Promote the architecture through DRAFT → IN_REVIEW → APPROVED as a baseline.

**Develop → Design → Detailed Design** — add §5.4 design elements under each component.

---

## 6. Identify risks (§7)

**Develop → Risk → Risk Register**

For each SOFTWARE requirement that could cause harm, add a Risk:

```
Hazard: False high HR alarm
Hazardous situation: Patient with pacemaker spikes triggers HR algorithm
Harm: Alarm fatigue → clinician silences real alarm later
Severity: 4   Probability: 3   Level: HIGH

Controls:
  1. INHERENT_SAFETY  Pacemaker-spike detection algorithm (verified by SYS-T-008)
  2. PROTECTIVE_MEASURE  Alarm-fatigue dashboard for clinicians
  3. INFORMATION_FOR_SAFETY  IFU section §5.4 — pacemaker-mode setup

Residual: Severity 4 × Probability 1 = LOW   Accepted by Dr. R. Hill, 2026-02-10
```

---

## 7. Define units (§5.5) and integration tests (§5.6)

**Develop → Verification → Unit Verification**

For each Class B/C unit add a SoftwareUnit (with code artifact links) + unit test cases. Record results.

**Develop → Verification → Integration Tests**

For each SWInterface, add at least one IntegrationTestCase verifying the interface contract. Record results.

---

## 8. Define system tests (§5.7)

**Develop → Verification → System Testing & Release**

For each SYSTEM or SOFTWARE requirement, add a SystemTestCase. Cover end-to-end behaviour. Record results.

Watch the **Coverage** rollup turn green: 25/25 covered · 100% pass.

---

## 9. Define plans (§6.1 / §7 / §8.1 / §9)

**Docs → IEC 62304 Plans** — fork the default templates for:

- Maintenance Plan (§6.1)
- Risk Management Plan (§7)
- Config Management Plan (§8.1)
- Problem Resolution Plan (§9)

Walk each through the signoff trail.

---

## 10. Build the release (§5.8)

**Docs → Release & DHF → Release Management → `+ New Release`**

- Version: `v1.0.0`
- Supersedes: *(none — first release)*

Add release items (the system tests, requirements, design elements this release contains evidence for).

Move DRAFT → UNDER_REVIEW. The Approval form appears. QA fills in approver name + comments → click Approve. Status moves to APPROVED.

The Readiness check turns green when all gates pass. Click **→ RELEASED**. The platform captures a frozen snapshot and locks the release.

---

## 11. Communicate the release (§6.2.5)

On the RELEASED release detail panel:

**Record user notification**:
```
Summary: Release v1.0.0 of Vital Signs Monitor published. Field-safety
notice issued via customer email + distributor portal. OTA update
available; older firmware remains supported for 90 days. Customers
asked to acknowledge receipt within 14 days.
```

**Record regulator notification**:
```
Summary: Submitted change summary + safety impact evaluation to relevant
Notified Body and FDA pre-submission inbox per §6.2.5 / MDR §92.
Acknowledgement received.
```

---

## 12. Post-market intake (§6.2.1)

Days/weeks/months pass. Customer support logs a ticket:

**Develop → Maintenance → Feedback Intake → `+ New Feedback`**

```
Source:        CUSTOMER_SUPPORT
Reporter:      ICU charge nurse — St. Mary's
Affected:      v1.0.0
Severity:      MAJOR
Summary:       Touchscreen unresponsive after 14+ hour continuous use
Description:   Reports of touchscreen becoming unresponsive after long
               shifts. Power cycle restores function. Suspect heap
               fragmentation.
Spec deviation: ✓
```

QA opens the card → **Evaluate** tab:

```
Is this a problem? Yes
Evaluation notes: Reproduced internally; 18-hour soak test shows heap
                  exhaustion in WaveformRenderer.
Safety impact:    Touchscreen unresponsive means clinician can't silence
                  alarms or check trends → potential delayed response.
Change needed?    Yes
```

Click **Save evaluation**. Status moves to `EVALUATED`.

QA clicks **Escalate** → escalates to a Problem Report → a CAPA process kicks off automatically. The feedback's status moves to `ESCALATED`.

---

## 13. Cycle through §9 → §6.3 → release v1.1.0

Engineering investigates the problem report, adds root causes (DESIGN: heap-allocation pattern in WaveformRenderer; PROCESS: missing soak test in §5.6 integration suite), defines two CAPAs (corrective: rewrite allocator; preventive: add soak test to integration suite). Both are completed and verified.

A new Change Request is opened (escalated from the feedback) with `modifies_released_software=true`. The three §6.2.3 fields are filled in:

```
Effect on organization:    Engineering 2 sprints, QA 1 sprint, support
                           team prepares advisory.
Effect on released sw:     v1.0.0 firmware patched; OTA channel pushes
                           v1.1.0. Backward-compatible.
Effect on interfaces:      No protocol changes. Central station, EMR, and
                           Wi-Fi gateway untouched.
```

QA approves the CR with an electronic signature. Engineering implements.

A new Release v1.1.0 is built with `parent_release_id` linking to v1.0.0 — the platform shows the chip `← v1.0.0`. All gates green → RELEASED. User + regulator notifications recorded.

---

## 14. Generate the DHF

**Docs → Release & DHF → DHF → `Generate DHF`**

Pick release **v1.1.0** in the dropdown → click **Generate**.

The DHF appears with:

- Summary cards: 35 requirements · 25 system tests · 6 feedback items · 1 CAPA escalation · maintenance plan approved · 2 releases with both notifications recorded.
- Traceability Matrix: 35 rows — each USER requirement, with columns for design / unit / integration / system / risk / validation links.
- All sections expanded.

The auditor downloads the JSON (or, when available, the PDF).

---

## What this gives you

A complete, audit-ready record from idea (§5.1 SDP) to released-and-maintained software (§5.8 + §6) with every regulated step captured **by the platform**, not by a separate paperwork exercise. The DHF is generated in seconds because it's live data, not a parallel document.
