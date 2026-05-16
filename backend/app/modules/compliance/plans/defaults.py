"""Built-in IEC 62304 plan-type catalog + default section templates.

Each built-in plan type seeds an IEC 62304-aligned set of sections at creation
time; thereafter every section is fully editable per plan. Custom plan types
are created with a single placeholder section the author fills in.
"""

from typing import TypedDict


class SectionDef(TypedDict):
    section_number: str
    section_name: str
    content: str
    sort_order: int


class PlanTypeDef(TypedDict):
    key: str
    label: str
    iec_clause: str
    description: str
    sections: list[SectionDef]


def _sections(*pairs: tuple[str, str, str]) -> list[SectionDef]:
    """(number, name, content) tuples → ordered SectionDef list."""
    return [
        {"section_number": num, "section_name": name, "content": content, "sort_order": i + 1}
        for i, (num, name, content) in enumerate(pairs)
    ]


# ── Built-in plan types (IEC 62304 §6 / §7 / §8 / §9) ────────────────────────

PLAN_TYPES: dict[str, PlanTypeDef] = {
    "MAINTENANCE": {
        "key": "MAINTENANCE",
        "label": "Software Maintenance Plan",
        "iec_clause": "6.1",
        "description": "IEC 62304 §6.1 — establishes the software maintenance process.",
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Defines the process for maintaining the released software in compliance with IEC 62304 §6. "
             "Applies to all post-release modifications, including corrective, adaptive, and perfective changes."),
            ("2", "Feedback Procedures (§6.1.a)",
             "Procedures for receiving, documenting, evaluating, resolving, and tracking feedback arising "
             "after release of the medical device software. Feedback channels include customer support, "
             "vigilance reports, post-market clinical follow-up (PMCF), field service, regulator inquiries, "
             "literature, and social media. All feedback is logged in the Feedback Intake module with a "
             "defined SLA for triage and escalation."),
            ("3", "Problem Determination Criteria (§6.1.b)",
             "Criteria for determining whether a feedback item is considered a problem under §6.2.1.2: "
             "(a) actual or potential adverse events; (b) any deviation from specifications, including "
             "safety-related performance, intended-use claims, or regulatory commitments; (c) recurring "
             "customer-reported defects above the trend threshold defined in §9 Problem Resolution Plan."),
            ("4", "Risk Management Process (§6.1.c)",
             "How the software risk management process (Plan §7) is invoked when a feedback item is "
             "classified as a problem: re-evaluate the affected risk(s), re-assess residual risk, and "
             "update risk control measures and verification evidence as required."),
            ("5", "Problem Resolution Process (§6.1.d)",
             "How the software problem resolution process (Plan §9) is invoked to analyse and resolve "
             "problems arising after release. Each problem report links back to the originating Feedback "
             "Item for provenance and traceability."),
            ("6", "Configuration Management Process (§6.1.e)",
             "How the software configuration management process (Plan §8.1) governs modifications to the "
             "released software system: baseline forking, change control workflow, and re-release "
             "baseline capture under §8."),
            ("7", "SOUP and Patch Procedures (§6.1.f)",
             "Procedures to evaluate and implement upgrades, bug fixes, patches, and obsolescence of SOUP "
             "(Software of Unknown Provenance). Each SOUP change triggers a §6.2.3 impact analysis, "
             "regression testing, and risk-management review before re-release."),
            ("8", "Modification Implementation (§6.3)",
             "Approved modifications are implemented using the §5 development process — the manufacturer "
             "identifies and performs the Clause 5 activities that need to be repeated. Modifications are "
             "re-released per §5.8, either as a full re-release or a modification kit."),
            ("9", "Communication to Users and Regulators (§6.2.5)",
             "How approved change requests that affect released software are communicated to users and "
             "regulators: notification channels, content requirements, and the audit trail captured per "
             "release in the Release module."),
            ("10", "Roles and Responsibilities",
             "Maintenance roles — who triages feedback, who evaluates problems for safety impact, who "
             "approves CRs that modify released software, who notifies users and regulators, who verifies "
             "and re-releases."),
            ("11", "Records and Traceability",
             "Where maintenance records are kept and how feedback items, problem reports, change requests, "
             "modifications, and re-verification evidence are traced end to end through the DHF."),
        ),
    },
    "RISK_MGMT": {
        "key": "RISK_MGMT",
        "label": "Software Risk Management Plan",
        "iec_clause": "7",
        "description": "IEC 62304 §7 — software risk management, aligned with ISO 14971.",
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Defines how software-related risk is managed within the overall ISO 14971 risk management "
             "process, covering IEC 62304 §7 for all software items in the project."),
            ("2", "Risk Management Process",
             "How software risk management integrates with the device-level ISO 14971 file: inputs, outputs, "
             "review points, and the risk management file location."),
            ("3", "Software Contributing to Hazardous Situations",
             "The method for identifying software items that could contribute to a hazardous situation, "
             "including potential causes and sequences of events, per §7.1."),
            ("4", "Risk Control Measures",
             "How risk control measures are defined and implemented in software, and how each measure is "
             "traced to the hazardous situation it mitigates, per §7.2."),
            ("5", "Verification of Risk Control Measures",
             "How the implementation and effectiveness of each software risk control measure is verified, "
             "per §7.3."),
            ("6", "Risk Management of Software Changes",
             "How changes (including SOUP changes) are analysed for new or changed hazardous situations and "
             "risk control measures, per §7.4."),
        ),
    },
    "CONFIG_MGMT": {
        "key": "CONFIG_MGMT",
        "label": "Software Configuration Management Plan",
        "iec_clause": "8.1",
        "description": "IEC 62304 §8 — software configuration management process.",
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Defines the configuration management process for the software, identifying which items are "
             "placed under configuration control, per IEC 62304 §8."),
            ("2", "Configuration Identification",
             "How configuration items — including SOUP — are uniquely identified, and how baselines are "
             "established and labelled, per §8.1."),
            ("3", "Change Control",
             "How changes to configuration items are requested, evaluated, approved, implemented, and "
             "verified; the link between change requests and the resulting baseline, per §8.2."),
            ("4", "Configuration Status Accounting",
             "How the history and current state of configuration items and change requests are recorded and "
             "made retrievable, per §8.3."),
            ("5", "Tools and Repositories",
             "The version control system, build tooling, and artifact repositories used, and any tool "
             "qualification considerations."),
            ("6", "Roles and Responsibilities",
             "Who owns the configuration management process, who approves baselines, and who audits "
             "configuration status."),
        ),
    },
    "LEGACY_SOFTWARE": {
        "key": "LEGACY_SOFTWARE",
        "label": "Legacy Software §4.4 Plan",
        "iec_clause": "4.4",
        "description": "IEC 62304 §4.4 — handling of software systems that were not developed under this standard.",
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Identify the legacy software system(s) covered by this plan. State that the items "
             "flagged as `is_legacy=true` on the Software Items page are governed by this plan rather "
             "than the full §5 development lifecycle, per IEC 62304 §4.4."),
            ("2", "Continuous Monitoring (§4.4(a))",
             "Procedures for continuously monitoring incidents arising from the use of the legacy "
             "software. Links to the Feedback Intake module (§6.2.1) which is the operational tool: "
             "every legacy item's `affected_version` should map to a feedback-channel watch list. "
             "Frequency of trend review and the threshold for declaring a problem are defined here."),
            ("3", "Change Impact Assessment (§4.4(b))",
             "When a change is proposed against a legacy software item, the manufacturer uses this "
             "standard to assess the impact: §6.2.3 post-release impact analysis is mandatory on the "
             "change request (organization · released software · interfacing systems). The §7.4 "
             "auto-trigger flags every linked risk for re-evaluation."),
            ("4", "Risk-based Decision (§4.4(c))",
             "Criteria for deciding whether the standard (or which subset) applies to the legacy "
             "software. Typical criteria: safety classification (Class A/B/C), patient harm potential, "
             "remaining service life, post-market incident history, regulatory commitments. The "
             "decision is recorded on the SoftwareItem.legacy_assessment field."),
            ("5", "Rationale Documentation (§4.4(d))",
             "Where the risk-based decision rationale is stored. Each legacy SoftwareItem carries its "
             "rationale in `legacy_assessment`. The rationale is reviewed at least annually and on "
             "any change request that modifies the legacy item."),
            ("6", "Gap Analysis (optional but recommended)",
             "For each §5 sub-clause not applied to the legacy software, the manufacturer documents "
             "the rationale (typically risk-based) and any compensating controls. The gap analysis "
             "becomes a permanent attachment under the SoftwareItem and is reviewed at the same "
             "frequency as the legacy_assessment field."),
            ("7", "Re-classification of Legacy Items",
             "If a legacy software item is materially modified, it may exit legacy status and "
             "re-enter the full §5 lifecycle. Procedure for re-classification (criteria, approval, "
             "documentation update) is defined here."),
            ("8", "Roles and Responsibilities",
             "Who owns legacy assessment · who monitors PMS for legacy items · who approves change "
             "impact assessments for legacy software · who approves re-classification."),
        ),
    },
    "USABILITY": {
        "key": "USABILITY",
        "label": "Usability Engineering Plan (IEC 62366-1)",
        "iec_clause": "62366-1",
        "description": (
            "IEC 62366-1 — Usability engineering for medical devices. Cross-"
            "regulator: EU MDR Annex I §14, FDA Human Factors guidance, "
            "Health Canada, TGA, PMDA, MHRA all accept this standard as the "
            "common spec for use-error management."
        ),
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Identifies the device(s), the medical indication, the user populations, "
             "and the use environments in scope of usability engineering. References "
             "the §4.3 software safety classification — Class B/C devices require the "
             "full §5.1–§5.9 process; Class A devices may apply a subset with documented "
             "rationale."),
            ("2", "Use Specification (§5.1)",
             "Documents intended users (clinical role, training, expected expertise), "
             "intended use environments (clinical setting, home, ambulance, OR, ICU), "
             "intended medical indication, and the device's operating principle in "
             "lay terms. The Use Specification is the input every subsequent step "
             "references; it is captured on the Usability File page."),
            ("3", "User-Interface Characteristics (§5.2)",
             "Identifies UI elements related to safety — alarms, status indicators, "
             "control inputs, navigation paths, default values. Each safety-related "
             "characteristic is tracked back to a §5.3 SWComponent or a §5.4 design "
             "element so the V-model trace stays intact."),
            ("4", "Hazard Identification (§5.3)",
             "Known and foreseeable hazards and hazardous situations from user "
             "interaction. These feed the §7 risk register as `risk_class=USABILITY` "
             "rows (the unified register already supports SAFETY / SECURITY / "
             "SAFETY_SECURITY / USABILITY discriminators)."),
            ("5", "Hazard-related Use Scenarios (§5.4)",
             "Step-by-step descriptions of the user tasks where a use error could "
             "lead to harm. Each scenario lists the task chain, the foreseeable use "
             "errors, and the resulting potential harm. Captured on the Use Scenarios "
             "page; each Use Error escalates to a §7 Risk so the controls flow "
             "through the existing closed-loop verification."),
            ("6", "Evaluation Methods (§5.5)",
             "How formative evaluations (early, iterative — typically 5-8 representative "
             "users, think-aloud protocol) and the summative evaluation (15+ representative "
             "users per distinct user group, validation-grade) will be performed. "
             "Defines test environments, simulation level (low-fidelity prototype vs "
             "final production unit), and acceptance criteria."),
            ("7", "User-Interface Specification (§5.6)",
             "The formal UI spec — visual design, control labelling, defaults, alarm "
             "priorities and presentations, error-recovery flows. Links to the §5.4 "
             "design elements that implement each spec section."),
            ("8", "Evaluation Plan (§5.7)",
             "Per-evaluation: protocol, participant criteria, data collection method, "
             "pass/fail criteria, analysis plan, reporting template. The summative "
             "evaluation's pass criteria gate the §5.8 release readiness."),
            ("9", "Formative Evaluation (§5.8)",
             "How formative results feed back into the UI specification and the "
             "hazard list. Each finding becomes either: a UI-spec change (tracked "
             "via §6.2.3 change request), a new Use Error (tracked here), or both."),
            ("10", "Summative Evaluation (§5.9)",
             "The final validation evaluation against the §5.6 UI specification. "
             "A documented summative-pass is a gate on the §5.8 release. Failures "
             "block release until the §5.8 sub-loop is re-run."),
            ("11", "Roles and Responsibilities",
             "Usability engineer (owner); clinical SME (use-spec input); risk owner "
             "(§7 escalation); test pilot (formative); independent evaluator (summative). "
             "Wired through the existing RBAC roles (READ_RISK / UPDATE_RISK / "
             "READ_DESIGN / UPDATE_DESIGN already in place)."),
            ("12", "Records and Retention",
             "Each Usability Engineering File (UEF) version is retained for the device "
             "lifetime + the regulator-mandated period (typically 10 years post-last-"
             "placement in EU MDR; 2 years post-last-sale + expected lifetime under "
             "FDA). The Document Register module owns the storage."),
        ),
    },
    "CYBERSECURITY": {
        "key": "CYBERSECURITY",
        "label": "Cybersecurity Plan (IEC 81001-5-1)",
        "iec_clause": "81001-5-1",
        "description": (
            "IEC 81001-5-1 — health software cybersecurity activities across the "
            "product lifecycle. Pairs with IEC 62304 §7 (risk_class=SECURITY) and "
            "extends it for threat-led design, SBOM management, vulnerability "
            "intake, and post-market cyber monitoring."
        ),
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Scope of the cybersecurity programme: the device under test, the "
             "connected ecosystem (networks, paired apps, cloud services), and the "
             "regulatory regimes in play (IEC 81001-5-1, AAMI TIR57, FDA Premarket "
             "Cybersecurity Guidance, EU NIS2 where applicable). State which "
             "software items are in scope and the relationship to the §7 risk "
             "register entries flagged `risk_class=SECURITY` or `SAFETY_SECURITY`."),
            ("2", "Roles and Responsibilities",
             "The security owner, the threat-model facilitator, the vulnerability "
             "triage owner, the SBOM custodian, the post-market cyber-monitor on-call. "
             "Each role's permissions are wired to the RBAC roles (`READ_RISK`, "
             "`UPDATE_RISK`, `CREATE_PROBLEM_REPORT`)."),
            ("3", "Secure Development Activities",
             "Coding standards, dependency-pinning policy, code review with a "
             "security checklist, static analysis, dynamic analysis. Reference the "
             "§5.5 unit-test gates and the §5.6 integration-test gates that already "
             "execute on every CR."),
            ("4", "Threat Modelling",
             "STRIDE per §5.3 architecture component; cadence (per release and on "
             "every architecture change); facilitator; recording threats and "
             "mitigations against the relevant SWComponent. Threats with non-trivial "
             "residual risk are escalated into the §7 risk register with "
             "`risk_class=SECURITY` and the threat ID in the rationale."),
            ("5", "SBOM Generation and Upkeep",
             "Source of truth is the §8.2.2 SOUP register. Generation is automatic "
             "from CMConfigItem rows where `item_type=SOUP` and is exported as "
             "CycloneDX JSON at every release. The SBOM is signed and attached to "
             "the §5.8 release artifacts. Updates: new SOUP entry, version bump, "
             "or vendor patch all require a SBOM re-export."),
            ("6", "Vulnerability Monitoring and Triage",
             "Inputs: NVD / vendor advisories / CERT bulletins / customer reports. "
             "Each CVE that matches a SOUP entry is logged as a Vulnerability "
             "Report which auto-creates a §7 Risk with `risk_class=SECURITY` and "
             "the CVE ID as the trigger. Triage SLA by CVSS band; controls are "
             "tracked the same as any §7 control."),
            ("7", "Security Testing",
             "Per release: dependency scan (clean state); fuzzing of external "
             "interfaces (§5.3 `safety_relevant=true` interfaces are mandatory); "
             "authentication/authorization regression tests in §5.7 system tests. "
             "Penetration test cadence and scope are defined here."),
            ("8", "Release Cybersecurity Criteria",
             "A release does not pass the §5.8 readiness gate if any SECURITY risk "
             "is `HIGH` and not in `ACCEPTED`/`CLOSED` status, OR if the SBOM "
             "differs from what was attached to the prior release without a "
             "documented rationale."),
            ("9", "Post-market Monitoring",
             "PMS for cyber: feedback channel `CYBER_REPORT`, advisory inbox, "
             "telemetry signals. The §6.2.5 user/regulator notification flow is "
             "the channel for disclosure of cyber incidents."),
            ("10", "Coordinated Vulnerability Disclosure",
             "Security.txt + reporting email; acknowledgement SLA; embargo policy; "
             "credit. The disclosure timeline is recorded on the relevant "
             "Vulnerability Report."),
            ("11", "Training and Awareness",
             "Mandatory secure-coding training (cadence); threat-modelling workshop "
             "(per major version); table-top exercise on incident response (annual). "
             "Each is tracked through the existing Training module."),
        ),
    },
    "PROBLEM_RESOLUTION": {
        "key": "PROBLEM_RESOLUTION",
        "label": "Software Problem Resolution Plan",
        "iec_clause": "9",
        "description": "IEC 62304 §9 — software problem resolution process.",
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Defines the process for resolving problems detected in the software and its activities, "
             "per IEC 62304 §9, for all software items and SOUP."),
            ("2", "Problem Reporting",
             "How problems are reported and recorded as problem reports — including type, scope, criticality, "
             "and the information required to investigate, per §9.1."),
            ("3", "Investigation and Analysis",
             "How problem reports are investigated, the cause determined, and the relevance to safety "
             "evaluated; how the investigation outcome is documented, per §9.2."),
            ("4", "Change Request and Approval",
             "How problem resolution leads to a change request, how affected parties are advised, and how "
             "changes are approved before implementation, per §9.3–§9.4."),
            ("5", "Verification and Trend Analysis",
             "How problem resolutions are verified, how the change control process is used, and how problem "
             "report trends are analysed for systemic issues, per §9.5–§9.8."),
            ("6", "Roles and Responsibilities",
             "Who triages problem reports, who performs the investigation, who approves resolutions, and who "
             "performs trend analysis."),
        ),
    },
}


def custom_plan_sections(label: str) -> list[SectionDef]:
    """A single placeholder section for a custom (non-built-in) plan type."""
    return _sections(
        ("1", "Purpose and Scope",
         f"Describe the purpose, scope, and applicable IEC 62304 / ISO 14971 clauses for the {label}."),
    )
