"""
Global knowledge base seed entries.
Written as plain-English summaries and compliance guidance — not copied from standards.
Safe to distribute. Grows over time.
"""

GLOBAL_ENTRIES = [

    # ── IEC 62304 ─────────────────────────────────────────────────────────────

    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§4",
        "sort_order": 10,
        "title": "IEC 62304 §4 — Software Safety Classification",
        "summary": "Classify software as Class A, B, or C based on potential harm if it fails.",
        "tags": ["safety", "classification", "planning"],
        "content": """## Software Safety Classification (§4)

IEC 62304 requires all medical device software to be classified before development begins.

### Classes
| Class | Definition | Documentation burden |
|-------|-----------|----------------------|
| A | No injury or damage possible if software fails | Minimal |
| B | Non-serious injury possible | Moderate |
| C | Death or serious injury possible | Full lifecycle documentation |

### Classification Rules
- Determined by the **worst-case harm** if the software fails
- Risk management (ISO 14971) drives the classification
- If a software item contributes to Class C risk, the whole system may be Class C
- Classification must be documented and approved before architecture begins

### Key Requirements
- Document the classification rationale with reference to ISO 14971 risk analysis
- All SOUP (Software of Unknown Provenance) must also be classified
- Re-evaluate classification whenever requirements change significantly

### Compliance Checklist
- [ ] Software safety class assigned (A/B/C)
- [ ] Classification rationale documented with risk reference
- [ ] Approved by quality/regulatory team
- [ ] SOUP items classified separately
- [ ] Re-classification triggered on scope change""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.1",
        "sort_order": 11,
        "title": "IEC 62304 §5.1 — Software Development Planning",
        "summary": "Define the development lifecycle, processes, tools, standards, and deliverables before coding starts.",
        "tags": ["planning", "lifecycle", "process"],
        "content": """## Software Development Planning (§5.1)

A Software Development Plan (SDP) must be established before development begins.

### Required Plan Contents
- Development lifecycle model (Waterfall, Agile, V-model, etc.)
- Standards and methods to be used
- Development environment (tools, languages, frameworks)
- Configuration management approach
- Problem resolution process
- Risk management references (to ISO 14971 plan)
- Deliverables and review milestones

### For Class B & C
- Integrated software risk management activities
- Unit verification planning
- Integration testing strategy

### Key Requirements
- Plan must be maintained throughout the project
- Deviations from plan must be documented and approved
- Configuration management system must be identified

### Compliance Checklist
- [ ] Software Development Plan (SDP) created
- [ ] Lifecycle model defined
- [ ] Development tools and environment documented
- [ ] Configuration management system specified
- [ ] Plan reviewed and approved""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.2",
        "sort_order": 12,
        "title": "IEC 62304 §5.2 — Software Requirements Analysis",
        "summary": "Define and document all functional, performance, safety, and interface requirements before design.",
        "tags": ["requirements", "analysis", "safety"],
        "content": """## Software Requirements Analysis (§5.2)

All software requirements must be defined, documented, and reviewed before architectural design begins.

### Requirement Types Required
- **Functional requirements** — what the software shall do
- **Performance requirements** — speed, accuracy, timing, memory
- **Interface requirements** — hardware, other software, users, external systems
- **Safety requirements** — derived directly from ISO 14971 risk analysis
- **Security requirements** — data protection, access control
- **Usability requirements** — derived from IEC 62366 usability analysis
- **SOUP requirements** — performance and interface requirements for third-party software

### Key Rules
- Every safety requirement must trace back to a risk control in the ISO 14971 risk file
- Requirements must be uniquely identified (enable traceability)
- Ambiguous or unverifiable requirements must be resolved before design
- Requirements must be reviewed and approved

### Traceability
Each software requirement must be traceable to:
- System requirement or design input
- Test case (verification)
- Risk control measure (if safety-related)

### Compliance Checklist
- [ ] All requirement types addressed
- [ ] Safety requirements linked to risk controls
- [ ] Requirements uniquely identified (readable IDs)
- [ ] Requirements reviewed and approved
- [ ] Traceability matrix started""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.3",
        "sort_order": 13,
        "title": "IEC 62304 §5.3 — Software Architectural Design",
        "summary": "Decompose software into items/units; identify SOUP; document interfaces between items.",
        "tags": ["architecture", "design", "SOUP"],
        "content": """## Software Architectural Design (§5.3)

The architecture transforms requirements into a software structure that can be implemented and tested.

### Required Deliverables
- Software Architecture Document (SAD) / Architecture Design Specification (ADS)
- Decomposition of software into software items and units
- Identification of all SOUP (third-party libraries, OS, frameworks)
- Interface definitions between all software items
- Hardware/software interface definition

### For Class C (additionally)
- Segregation between software items that could harm safety
- Architectural mechanisms to prevent failures from propagating

### SOUP Documentation Required
- Name, manufacturer, version
- Functional and performance requirements placed on SOUP
- Hardware and software requirements of SOUP
- Known anomalies list (from manufacturer)

### Key Rules
- Architecture must demonstrate that all requirements can be implemented
- Safety-critical items must be identifiable and traceable
- Architecture must be reviewed and approved

### Compliance Checklist
- [ ] Software decomposed into items/units
- [ ] All SOUP identified and documented
- [ ] Interfaces between items defined
- [ ] Architecture verified against requirements
- [ ] Class C: segregation of safety-critical items documented""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.4",
        "sort_order": 14,
        "title": "IEC 62304 §5.4 — Software Detailed Design",
        "summary": "Elaborate each software unit to a level sufficient for implementation — algorithms, data structures, interfaces.",
        "tags": ["design", "detailed", "units"],
        "content": """## Software Detailed Design (§5.4)

Detailed design refines the architecture into implementable units.

### Required for Each Software Unit
- Detailed algorithm descriptions
- Data structures and their relationships
- Error handling approach
- Interface specifications (inputs, outputs, pre/post conditions)

### Class C Additional Requirements
- Formal specification of safety-critical algorithms
- Detailed interface contracts

### Traceability
- Each software unit traces to one or more software items from architecture
- Each unit's design traces to the requirements it implements

### Compliance Checklist
- [ ] Detailed design documented for all units
- [ ] Error handling defined
- [ ] Design reviewed against requirements
- [ ] Traceability from units to requirements maintained""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.5",
        "sort_order": 15,
        "title": "IEC 62304 §5.5 — Software Unit Implementation & Verification",
        "summary": "Write code to the detailed design; verify each unit meets its requirements via review or testing.",
        "tags": ["implementation", "coding", "unit-testing", "verification"],
        "content": """## Software Unit Implementation and Verification (§5.5)

### Implementation Requirements
- Code must implement the detailed design
- Code must comply with the defined coding standards
- Document any deviations from design with rationale

### Unit Verification (Class B & C)
Each software unit must be verified by one or more of:
- Code review / inspection
- Static analysis
- Unit testing

### Unit Testing Requirements (Class C)
- Unit tests must have defined pass/fail criteria
- Test coverage goals should be defined (statement, branch)
- Tests must be documented and repeatable

### Coding Standards
The coding standard must address:
- Naming conventions
- Comment requirements
- Complexity limits
- Error handling patterns
- Prohibited constructs (e.g. dynamic memory in safety-critical paths)

### Compliance Checklist
- [ ] Coding standard defined and followed
- [ ] Unit verification method chosen per safety class
- [ ] Unit test results documented
- [ ] Code review records maintained
- [ ] Static analysis results reviewed""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.6",
        "sort_order": 16,
        "title": "IEC 62304 §5.6 — Software Integration & Integration Testing",
        "summary": "Combine software units into items; test interfaces and interactions between integrated components.",
        "tags": ["integration", "testing", "interfaces"],
        "content": """## Software Integration and Integration Testing (§5.6)

### Integration Process
- Units are integrated progressively (bottom-up, top-down, or big-bang per plan)
- Integration sequence documented in Software Integration Plan

### Integration Testing
- Tests verify interactions between software items
- Interface testing: correct data passing, error propagation, timing
- SOUP integration: verify SOUP behaves as required in the system context

### Integration Test Documentation
- Test cases with inputs, expected outputs, pass/fail criteria
- Test results linked to test cases
- Anomalies resolved before system testing

### Compliance Checklist
- [ ] Integration sequence documented
- [ ] Integration test plan created
- [ ] Integration tests executed and results recorded
- [ ] All anomalies resolved or risk-assessed
- [ ] SOUP behaviour verified in integration context""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.7",
        "sort_order": 17,
        "title": "IEC 62304 §5.7 — Software System Testing",
        "summary": "Test the complete software system against all software requirements in a representative environment.",
        "tags": ["system-testing", "validation", "requirements"],
        "content": """## Software System Testing (§5.7)

System testing verifies that the integrated software system meets all software requirements.

### Test Coverage
- All software requirements must be covered by at least one system test
- Safety requirements require dedicated test cases
- Regression testing required after any change

### Test Environment
- Representative of the intended deployment environment
- Hardware-in-the-loop where required (embedded systems)
- Test data must be representative of real-world use

### Test Documentation
- Software Verification Test Protocol (SVTP) — planned tests
- Software Verification Test Report (SVTR) — results and pass/fail

### Anomaly Handling
- All test failures must be logged as problem reports
- Problem reports tracked to resolution before release
- Re-testing required after fixes

### Compliance Checklist
- [ ] System test plan covers all requirements
- [ ] Test environment documented
- [ ] Test results recorded against each test case
- [ ] All anomalies resolved
- [ ] Regression testing performed after fixes""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§5.8",
        "sort_order": 18,
        "title": "IEC 62304 §5.8 — Software Release",
        "summary": "Formally release and archive the software version with all required documentation complete.",
        "tags": ["release", "configuration", "baseline"],
        "content": """## Software Release (§5.8)

### Pre-Release Checklist
- All software requirements verified (system testing complete)
- All anomalies resolved or formally risk-accepted
- Software configuration baseline established
- All required documentation complete and approved
- Known anomaly list prepared for labelling/IFU if applicable

### Release Documentation
- Software version identifier (unique, traceable)
- List of software items and their versions (SBOM-like)
- Known anomalies and residual risks
- Reference to the configuration management system

### Labelling
- Software version must appear on device labelling
- For serious unresolved anomalies: disclose in IFU

### Compliance Checklist
- [ ] All tests passed (or anomalies risk-accepted)
- [ ] Configuration baseline tagged in version control
- [ ] Release documentation package compiled
- [ ] Known anomaly list prepared
- [ ] Software release approved and signed off""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§6",
        "sort_order": 19,
        "title": "IEC 62304 §6 — Software Maintenance",
        "summary": "Control post-release changes: problem reports, change requests, re-verification, and new releases.",
        "tags": ["maintenance", "change-control", "problem-resolution"],
        "content": """## Software Maintenance (§6)

Maintenance covers all activities after the software is released into production.

### Problem Reporting
- All post-release problems must be logged with severity assessment
- Problems must be evaluated for patient safety impact
- Serious problems may trigger field safety corrective actions (recalls)

### Change Management
- Changes follow the full development lifecycle (requirements → design → code → test)
- Impact analysis required: what else could this change affect?
- Re-verification scope determined by impact analysis

### New Releases
- Each maintenance release follows §5.8 release process
- Version control maintained throughout

### Regulatory Notification
- Substantial changes to software may require regulatory re-submission (FDA, MDR)
- Define criteria for "substantial change" in the maintenance plan

### Compliance Checklist
- [ ] Problem reporting process defined
- [ ] Change control process documented
- [ ] Impact analysis performed for each change
- [ ] Re-verification scope defined
- [ ] Post-market surveillance linked to software maintenance""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§7",
        "sort_order": 20,
        "title": "IEC 62304 §7 — Software Risk Management",
        "summary": "Identify software-related hazards, assess risks, implement controls, and verify effectiveness.",
        "tags": ["risk", "safety", "hazard", "ISO14971"],
        "content": """## Software Risk Management (§7)

Software risk management is performed as part of the overall ISO 14971 process.

### Process
1. Identify hazardous situations caused by software failures
2. Assess probability and severity (risk level)
3. Implement risk controls (requirements, design measures, alerts)
4. Verify controls are effective
5. Evaluate residual risk acceptability

### Software-Specific Hazards
- Incorrect output / calculation errors
- Timing failures (too slow, too fast, wrong sequence)
- Data corruption or loss
- Incorrect user interface feedback
- SOUP failure / unexpected behaviour
- Security vulnerabilities with safety impact

### Risk Controls in Software
- Input validation and range checking
- Watchdog timers and safety interlocks
- Redundancy and diversity
- Defensive programming patterns
- Alarm and alert systems

### Traceability
Every risk control measure must trace to:
- The hazard it mitigates
- A software requirement implementing the control
- A test case verifying the control works

### Compliance Checklist
- [ ] Software failure modes identified
- [ ] Risk controls defined as software requirements
- [ ] Risk controls verified by testing
- [ ] Residual risks documented and approved
- [ ] Risk management file references software risk activities""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§8",
        "sort_order": 21,
        "title": "IEC 62304 §8 — Software Configuration Management",
        "summary": "Track and control all software items, documents, tools, and baselines throughout the lifecycle.",
        "tags": ["configuration", "version-control", "baseline", "SOUP"],
        "content": """## Software Configuration Management (§8)

### Configuration Items to Control
- Source code (all modules, libraries, build scripts)
- Compiled binaries and firmware images
- Software requirements and design documents
- Test cases and test results
- SOUP items (name, version, source)
- Development tools (compiler version, IDE, etc.)
- Configuration files and parameters

### Baseline Management
- Baselines created at key milestones (requirements complete, design approved, release)
- Baselines must be reproducible (able to rebuild identical output)
- Only approved changes allowed after a baseline is established

### Change Control
- All changes to controlled items tracked via change requests
- Changes reviewed and approved before implementation
- Audit trail of what changed, by whom, when, and why

### Tools
- Version control system (Git, SVN, etc.) mandatory
- Issue tracking system for problem reports
- Build system capable of reproducible builds

### Compliance Checklist
- [ ] All software items identified and under version control
- [ ] SOUP versions locked and documented
- [ ] Baseline process defined
- [ ] Change control process active
- [ ] Build reproducibility verified""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62304", "clause_ref": "§9",
        "sort_order": 22,
        "title": "IEC 62304 §9 — Software Problem Resolution",
        "summary": "Log, investigate, and resolve all software problems; track to closure; assess safety impact.",
        "tags": ["problem-resolution", "defects", "anomalies"],
        "content": """## Software Problem Resolution (§9)

### Problem Report Process
1. Log the problem (description, version, environment, severity)
2. Investigate root cause
3. Classify severity and patient safety impact
4. Define and implement fix
5. Verify fix
6. Close the problem report

### Severity Classification
| Level | Criteria |
|-------|---------|
| Critical | Patient safety risk or regulatory non-compliance |
| Major | Significant loss of function, no safe workaround |
| Minor | Limited impact, workaround available |

### For Safety-Critical Problems
- Notify regulatory affairs immediately
- Consider field safety corrective action (FSCA)
- Document risk assessment even if no action taken

### Metrics (for production readiness)
- Open/closed problem trend
- Mean time to resolution by severity
- Escaped defect rate (problems found after release)

### Compliance Checklist
- [ ] Problem reporting system in place
- [ ] All problems classified for safety impact
- [ ] Resolution verified before closure
- [ ] Trend analysis performed
- [ ] Critical problems escalated to regulatory team""",
    },

    # ── ISO 14971 ─────────────────────────────────────────────────────────────

    {
        "category": "STANDARD_CLAUSE", "standard": "ISO14971", "clause_ref": "§4-5",
        "sort_order": 30,
        "title": "ISO 14971 §4-5 — Risk Analysis & Evaluation",
        "summary": "Identify hazards and hazardous situations; estimate probability and severity; evaluate acceptability.",
        "tags": ["risk", "hazard", "severity", "probability"],
        "content": """## Risk Analysis and Evaluation (ISO 14971 §4-5)

### Risk Analysis Process
1. **Intended use** — document the device's intended purpose and users
2. **Hazard identification** — list all foreseeable hazards (energy, biological, chemical, software)
3. **Hazardous situations** — combine hazards with use scenarios
4. **Risk estimation** — Severity × Probability = Risk Level

### Severity Scale (example)
| Level | Score | Description |
|-------|-------|-------------|
| Negligible | 1 | No injury |
| Minor | 2 | Reversible injury |
| Serious | 3 | Irreversible injury |
| Critical | 4 | Life-threatening |
| Catastrophic | 5 | Death |

### Probability Scale (example)
| Level | Score | Frequency |
|-------|-------|-----------|
| Improbable | 1 | < 1 per 10⁶ uses |
| Remote | 2 | 1 per 10⁵ uses |
| Occasional | 3 | 1 per 10⁴ uses |
| Probable | 4 | 1 per 10³ uses |
| Frequent | 5 | > 1 per 100 uses |

### Risk Acceptability
Define in the Risk Management Plan:
- Acceptable: risk is as low as reasonably practicable (ALARP)
- Broadly acceptable: no further reduction required
- Unacceptable: must implement controls

### Compliance Checklist
- [ ] Intended use documented
- [ ] All hazards systematically identified
- [ ] Risk estimation performed for each hazardous situation
- [ ] Risk acceptability criteria defined in Risk Management Plan
- [ ] Risk evaluation completed before risk controls defined""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "ISO14971", "clause_ref": "§6",
        "sort_order": 31,
        "title": "ISO 14971 §6 — Risk Control",
        "summary": "Reduce unacceptable risks using inherent safety, protective measures, or information for safety.",
        "tags": ["risk-control", "mitigation", "safety"],
        "content": """## Risk Control (ISO 14971 §6)

### Control Hierarchy (apply in order)
1. **Inherent safety by design** — eliminate hazard at source
2. **Protective measures** — guards, alarms, automatic shutoffs
3. **Information for safety** — warnings in IFU, labelling

### For Software Risk Controls
- Input range validation
- Watchdog timers
- Redundant calculations with cross-check
- Fail-safe defaults
- User confirmation prompts for critical actions
- Audit logging of safety-critical events

### Verification
Every risk control must be verified:
- Define acceptance criteria before testing
- Test must demonstrate the control is effective
- Test results documented in risk management file

### Residual Risk
After controls applied:
- Estimate residual risk level
- Compare to acceptability criteria
- Document acceptance rationale
- Sum residual risks for overall residual risk evaluation

### Compliance Checklist
- [ ] Risk controls defined for all unacceptable risks
- [ ] Controls prioritised per hierarchy
- [ ] Controls implemented as verifiable requirements
- [ ] Effectiveness of each control verified
- [ ] Residual risks evaluated and accepted""",
    },
    {
        "category": "STANDARD_CLAUSE", "standard": "ISO14971", "clause_ref": "§7-9",
        "sort_order": 32,
        "title": "ISO 14971 §7-9 — Overall Residual Risk & Post-Market",
        "summary": "Evaluate the overall residual risk; conduct risk management review; monitor post-market.",
        "tags": ["residual-risk", "post-market", "review"],
        "content": """## Overall Residual Risk, Review, and Post-Market (ISO 14971 §7-9)

### Overall Residual Risk (§7)
- Sum all residual risks and evaluate acceptability as a whole
- Consider benefit-risk analysis if residual risk is not broadly acceptable
- Clinical data, literature, and post-market data can support benefit claims
- Document overall residual risk acceptance by senior management

### Risk Management Review (§8)
Before release, verify:
- Risk management plan has been followed
- Overall residual risk is acceptable
- All risk control measures are implemented and verified
- New risks introduced by risk controls have been evaluated

### Post-Market Surveillance (§9)
- Collect and review post-market data (complaints, literature, incidents)
- Evaluate whether new hazards have emerged
- Update risk management file if new risks identified
- Trigger corrective action if risk acceptability is exceeded

### Compliance Checklist
- [ ] Overall residual risk evaluated
- [ ] Benefit-risk documented if needed
- [ ] Risk management review completed pre-release
- [ ] Post-market surveillance plan references risk management
- [ ] Process to update risk file from post-market data""",
    },

    # ── IEC 62366 ─────────────────────────────────────────────────────────────

    {
        "category": "STANDARD_CLAUSE", "standard": "IEC62366", "clause_ref": "§5",
        "sort_order": 40,
        "title": "IEC 62366 §5 — Usability Engineering Process",
        "summary": "Apply a structured process to identify use errors; design for safe and effective use.",
        "tags": ["usability", "human-factors", "use-error", "UI"],
        "content": """## Usability Engineering Process (IEC 62366 §5)

### Process Overview
1. Identify intended users, uses, and use environments
2. Identify use-related hazards (use errors and misuse)
3. Define usability requirements
4. Design and evaluate user interface
5. Summative (validation) usability evaluation

### Use-Related Hazards
For each critical task:
- What could go wrong? (use error)
- What are the consequences? (hazard)
- How can the UI prevent or mitigate the error?

### Formative Evaluation (iterative design)
- Low-fidelity prototypes → heuristic evaluation
- Medium-fidelity → expert walkthrough
- High-fidelity → user testing with representative users

### Summative Evaluation (pre-market)
- Conducted with representative users
- Simulated or actual use environment
- Pass/fail criteria pre-defined
- Results documented in Usability Evaluation Report

### Critical Tasks
Tasks where use error could cause harm must be:
- Specifically tested in summative evaluation
- Mitigated in UI design
- Documented in usability file

### Compliance Checklist
- [ ] Intended users and use environments defined
- [ ] Use-related hazards identified
- [ ] Usability requirements defined
- [ ] Formative evaluations conducted and documented
- [ ] Summative evaluation completed with representative users
- [ ] Usability file compiled""",
    },

    # ── ISO 13485 ─────────────────────────────────────────────────────────────

    {
        "category": "STANDARD_CLAUSE", "standard": "ISO13485", "clause_ref": "§7.3",
        "sort_order": 50,
        "title": "ISO 13485 §7.3 — Design and Development",
        "summary": "Plan, control, and document design inputs, outputs, reviews, verification, validation, and changes.",
        "tags": ["design-control", "quality", "verification", "validation"],
        "content": """## Design and Development (ISO 13485 §7.3)

ISO 13485 §7.3 is the quality management framework for design control. IEC 62304 provides the technical detail for software.

### Design Planning (§7.3.2)
- Document design stages, reviews, responsibilities, interfaces
- Update the plan as design progresses

### Design Inputs (§7.3.3)
- Functional, performance, safety, regulatory requirements
- Risk management outputs
- Previous device feedback
- Inputs must be reviewed and approved

### Design Outputs (§7.3.4)
- Documents and artefacts that enable manufacturing/implementation
- Meet design inputs
- Define acceptance criteria
- Approved before release to manufacturing/implementation

### Design Review (§7.3.5)
- Formal reviews at planned stages
- Participants include all functions affected
- Problems and required actions documented

### Design Verification (§7.3.6)
- Confirms outputs meet inputs
- Objective evidence required (test results, analysis)

### Design Validation (§7.3.7)
- Confirms device meets intended use in real or simulated conditions
- Clinical evaluation may be required
- Performed on final or representative device

### Design Transfer (§7.3.8)
- Procedures for transferring design to production verified

### Design Changes (§7.3.9)
- Changes identified, reviewed, verified, validated, approved before implementation

### Compliance Checklist
- [ ] Design and development plan created
- [ ] Design inputs documented and approved
- [ ] Design outputs defined with acceptance criteria
- [ ] Design reviews scheduled and records kept
- [ ] Verification and validation planned and executed
- [ ] Design changes controlled""",
    },

    # ── FDA ───────────────────────────────────────────────────────────────────

    {
        "category": "REGULATORY", "standard": "FDA", "clause_ref": "21 CFR Part 820",
        "sort_order": 60,
        "title": "FDA 21 CFR Part 820 — Quality System Regulation",
        "summary": "FDA's design control requirements for medical devices sold in the US market.",
        "tags": ["FDA", "US", "design-control", "quality"],
        "content": """## FDA 21 CFR Part 820 — Quality System Regulation

### Design Controls (§820.30)
Required for Class II and III devices (and Class I with design controls).

**Design and Development Planning** — documented plan, defined responsibilities
**Design Input** — device requirements documented and approved
**Design Output** — meets inputs, defined acceptance criteria
**Design Review** — formal reviews, documented results
**Design Verification** — confirms outputs meet inputs
**Design Validation** — confirms device meets user needs
**Design Transfer** — ensures design can be correctly produced
**Design Changes** — controlled, reviewed, approved

### Software-Specific Guidance
FDA recognises IEC 62304 as a consensus standard.
- FDA guidance: "Guidance for the Content of Premarket Submissions for Software Contained in Medical Devices"
- Level of concern: Minor, Moderate, Major (similar to IEC 62304 Class A/B/C)

### 510(k) Software Documentation
- Level of concern determination
- Software description
- Device hazard analysis
- Software requirements specification
- Architecture design chart
- Software design specification
- Testing documentation (unit, integration, system)
- Revision level history
- Unresolved anomalies list

### Compliance Checklist
- [ ] Level of concern determined and documented
- [ ] Design controls applied per §820.30
- [ ] Software documentation package prepared
- [ ] Unresolved anomalies list prepared
- [ ] 510(k) software documentation checklist completed""",
    },

    # ── MDR ───────────────────────────────────────────────────────────────────

    {
        "category": "REGULATORY", "standard": "MDR", "clause_ref": "Annex I",
        "sort_order": 70,
        "title": "EU MDR Annex I — General Safety and Performance Requirements",
        "summary": "Essential requirements for devices placed on the EU market under Regulation 2017/745.",
        "tags": ["MDR", "EU", "CE-marking", "GSPR"],
        "content": """## EU MDR Annex I — General Safety and Performance Requirements (GSPR)

All medical devices placed on the EU market must meet the GSPRs in MDR Annex I.

### Key Software-Relevant GSPRs

**GSPR 14 — Devices incorporating software**
- Software must be designed to ensure repeatability, reliability, performance
- Software to minimise risk of use errors
- Software must be validated according to latest state of the art

**GSPR 17 — Electronic programmable systems**
- Hardware and software must be designed for reliability
- Software must be designed to prevent incorrect functioning
- Minimum IT security requirements per §17.4

**GSPR 23 — Label and IFU**
- Unique Device Identifier (UDI) required
- Software version on label

### Technical Documentation Requirements
Under MDR, technical documentation must include:
- Software lifecycle documentation (IEC 62304)
- Risk management file (ISO 14971)
- Usability engineering file (IEC 62366)
- Clinical evaluation

### Notified Body
- Class IIa, IIb, III devices require Notified Body assessment
- Software can determine device class under MDR Rule 11

### Compliance Checklist
- [ ] GSPR checklist completed (map each requirement to evidence)
- [ ] Technical documentation package compiled
- [ ] UDI implementation planned
- [ ] Notified Body engaged if required
- [ ] Declaration of Conformity prepared""",
    },

    # ── Checklists ────────────────────────────────────────────────────────────

    {
        "category": "CHECKLIST", "standard": "IEC62304", "clause_ref": None,
        "sort_order": 80,
        "title": "IEC 62304 Pre-Release Readiness Checklist",
        "summary": "Complete this checklist before releasing any software version to production.",
        "tags": ["release", "checklist", "readiness"],
        "content": """## IEC 62304 Pre-Release Readiness Checklist

### Documentation
- [ ] Software Development Plan approved
- [ ] Software Requirements Specification approved
- [ ] Architecture Design Document approved
- [ ] Detailed Design Document approved (Class C)
- [ ] Coding Standard defined and followed
- [ ] SOUP list complete with versions and known anomalies

### Testing
- [ ] Unit verification complete (review or test records)
- [ ] Integration test protocol executed
- [ ] System test protocol executed against all requirements
- [ ] All test results pass (or anomalies risk-accepted)
- [ ] Regression testing complete for any late changes

### Risk Management
- [ ] Software failure modes assessed
- [ ] Risk controls implemented as requirements
- [ ] Risk controls verified by testing
- [ ] Residual risks documented and accepted
- [ ] Overall residual risk evaluation complete

### Configuration Management
- [ ] All source code tagged in version control
- [ ] Build is reproducible from the tag
- [ ] Software BOM (SOUP versions) finalised
- [ ] Configuration baseline documented

### Problem Resolution
- [ ] All open problem reports reviewed
- [ ] No critical/major unresolved problems
- [ ] Known anomaly list prepared for release notes

### Approvals
- [ ] Software release reviewed by quality assurance
- [ ] Release approved by responsible person
- [ ] Regulatory affairs notified of release""",
    },
    {
        "category": "CHECKLIST", "standard": "ISO14971", "clause_ref": None,
        "sort_order": 81,
        "title": "ISO 14971 Risk Management File Checklist",
        "summary": "Contents required in the risk management file before device release.",
        "tags": ["risk", "checklist", "release"],
        "content": """## ISO 14971 Risk Management File Checklist

### Risk Management Plan
- [ ] Scope and device description
- [ ] Responsibilities assigned
- [ ] Risk acceptability criteria defined (qualitative or quantitative)
- [ ] Verification activities defined
- [ ] Post-market surveillance references

### Risk Analysis
- [ ] Intended use and foreseeable misuse documented
- [ ] Hazard identification performed (FMEA, FTA, or equivalent)
- [ ] Hazardous situations defined for each hazard
- [ ] Probability and severity estimated for each situation
- [ ] Initial risk levels recorded

### Risk Evaluation
- [ ] Each risk evaluated against acceptability criteria
- [ ] Unacceptable risks clearly identified

### Risk Control
- [ ] Controls defined for all unacceptable risks
- [ ] Control hierarchy applied (inherent → protective → information)
- [ ] Controls implemented as design requirements or process controls
- [ ] New risks introduced by controls evaluated

### Risk Control Verification
- [ ] Each control has defined verification criteria
- [ ] Verification evidence linked to each control

### Overall Residual Risk
- [ ] All residual risks summed and evaluated
- [ ] Overall risk acceptable
- [ ] Benefit-risk documented if needed

### Risk Management Review
- [ ] Pre-release review completed
- [ ] All items in this checklist confirmed complete
- [ ] Signed off by responsible person""",
    },
]
