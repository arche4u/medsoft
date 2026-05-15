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
