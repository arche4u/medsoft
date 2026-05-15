# Architecture & Detailed Design (§5.3 + §5.4)

Once requirements are in place, you describe **how the software is built**. IEC 62304 §5.3 covers the architecture (components + their interfaces), and §5.4 covers detailed design (how each component is realised).

## §5.3 Software Architecture

### Components

A **SWComponent** is one piece of the software architecture. Components form a tree:

```
SYSTEM       (top-level software system — one per project)
   └── SUBSYSTEM         (major functional grouping)
         └── ITEM        (deployable software item)
               └── UNIT  (lowest testable unit)
```

The tree depth is up to your project; small projects might stop at SUBSYSTEM, large ones go all the way to UNIT.

**Develop → Design → SW Architecture**

### Add a component

Click `+ New Component`. Fill in:

- **Name** — descriptive (e.g. *Alarm Escalation Engine*).
- **Description** — what this component does in the system.
- **Type** — SYSTEM / SUBSYSTEM / ITEM / UNIT (the parent must be one level up).
- **Parent** — required for non-SYSTEM components.
- **Safety class** — A / B / C per IEC 62304 §4.3.
- **Rationale** — why this safety class is justified.

You can also attach:

- **Linked requirements** — the §5.2 requirements this component implements.
- **Linked risks** — ISO 14971 risks this component contributes to.
- **Linked system tests** — §5.7 tests that verify this component's behaviour.

### Interfaces

A **SWInterface** is a connection between two components. It has:

- **Source / target components** — who talks to whom.
- **Interface type** — DATA / CONTROL / API / SIGNAL.
- **Description** — what crosses the interface.
- **Data format** — JSON, FHIR, HL7, binary, etc.
- **Communication method** — synchronous call, message queue, shared memory, etc.
- **Safety relevance** — boolean flag (highlighted in red in the tree if true).
- **Data flows** — named pieces of data on this interface, each with type / frequency / criticality.

### Diagrams (Mermaid)

Each component can have a **Mermaid diagram** showing its internal structure or its place in the larger architecture. The platform renders Mermaid live.

### Compliance check (§5.3.6)

Each component has a **Compliance** tab showing per-rule checks for that component's safety class:

```
Rule                                     Required   Satisfied
─────────────────────────────────────────────────────────────
Has description                              ✓         ✓
Safety class assigned                        ✓         ✓
At least one interface defined               ✓         ✓     (Class B/C)
All interfaces have descriptions             ✓         ✓     (Class B/C)
Requirements linked                          ✓         ✓     (Class B/C)
Risks linked (ISO 14971)                     ✓         ✓     (Class B/C)
System tests linked (§5.7)                   ✓         ✓     (Class B/C)
Safety-relevant interfaces flagged           ✓         ✓     (Class C)
```

A component is *compliant* only when every required rule for its safety class is satisfied.

### Architecture Baselines

Like requirements, the architecture isn't "released" loose — it goes through DRAFT → IN_REVIEW → APPROVED → OBSOLETE as a versioned baseline.

**Develop → Design → SW Architecture → tab "Baselines"**:

- `+ New Baseline` creates a draft.
- Fill in the signoff trail (Prepared by → Reviewed by → Approved by).
- Move the status forward when each step is signed.
- Once APPROVED, the architecture is **locked** — edits require a new draft baseline.
- Approval automatically mirrors the baseline as a CM Baseline under [Config Management](08-config-mgmt.md).

## §5.4 Detailed Design

**Develop → Design → Detailed Design**

Each **Design Element** belongs to exactly one §5.3 component (`component_id`). Elements can nest under another element of the same component for sub-detail.

Add a design element:

- **Component** — the §5.3 SWComponent this design details.
- **Title** — what's being described.
- **Description** — the design narrative.
- **Diagram source** — optional Mermaid block.

**Linking to requirements:** From the detail panel, attach the §5.2 software requirements this design element realises. The links populate the V-Model Tree.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Decompose software into components | §5.3.2 |
| Identify interfaces | §5.3.4 |
| Identify safety class per component | §4.3 + §5.3.5 |
| Verify architecture (compliance check) | §5.3.6 |
| Detailed design of each component | §5.4 |
| Lock architecture at release | §5.3 + §8.3 (CM baseline) |
