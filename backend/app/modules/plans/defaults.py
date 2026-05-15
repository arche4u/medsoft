"""Built-in IEC 62304 plan-type catalog + default section templates.

Each built-in plan type seeds an IEC 62304-aligned set of sections at creation
time; thereafter every section is fully editable per plan. Custom plan types
are created with a single placeholder section the author fills in.
"""

from typing import TypedDict


class SectionDef(TypedDict, total=False):
    section_number: str
    section_name: str
    content: str
    sort_order: int
    # True means the section is mandatory audit evidence and cannot be removed
    # or left empty. Used by templates where IEC 62304 makes the section a
    # hard requirement (e.g. §4.4(d) gap analysis for legacy software).
    required: bool


class PlanTypeDef(TypedDict):
    key: str
    label: str
    iec_clause: str
    description: str
    sections: list[SectionDef]


def _sections(*pairs: tuple) -> list[SectionDef]:
    """Section tuples → ordered SectionDef list.

    Each tuple is `(number, name, content)` or `(number, name, content, required)`.
    The 4-tuple form marks the section as mandatory audit evidence.
    """
    out: list[SectionDef] = []
    for i, pair in enumerate(pairs):
        if len(pair) == 4:
            num, name, content, required = pair
            section: SectionDef = {
                "section_number": num,
                "section_name": name,
                "content": content,
                "sort_order": i + 1,
                "required": bool(required),
            }
        else:
            num, name, content = pair
            section = {
                "section_number": num,
                "section_name": name,
                "content": content,
                "sort_order": i + 1,
            }
        out.append(section)
    return out


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
            ("2", "Maintenance Process",
             "The maintenance process and its activities, entry/exit criteria, and the staff responsible. "
             "Feedback (problem reports, change requests) is received, recorded, and evaluated under §6.1."),
            ("3", "Problem and Modification Analysis",
             "Each problem report is analysed for its effect on safety; change requests are evaluated and "
             "approved before implementation, per §6.2. Records link the problem to its resolution."),
            ("4", "Modification Implementation",
             "Approved modifications are implemented using the §5 development process (or a defined subset), "
             "re-verified, and the affected configuration items re-baselined, per §6.3."),
            ("5", "Roles and Responsibilities",
             "Maintenance roles — who triages problem reports, who approves changes, who verifies and releases."),
            ("6", "Records and Traceability",
             "Where maintenance records are kept and how problem reports, change requests, modifications, and "
             "re-verification evidence are traced end to end."),
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
    "LEGACY_SOFTWARE": {
        "key": "LEGACY_SOFTWARE",
        "label": "Legacy Software Plan",
        "iec_clause": "4.4",
        "description": (
            "IEC 62304 §4.4 — strategy for software developed before the standard applied. "
            "Establishes the risk-based assessment that justifies which §5 sub-clauses are "
            "(and are not) applied to the legacy item, and what objective evidence supports "
            "continued use."
        ),
        "sections": _sections(
            ("1", "Purpose and Scope",
             "Identifies the legacy software item(s) covered by this plan, the rationale for treating "
             "them as legacy under IEC 62304 §4.4, and the software safety class of each item per §4.3."),
            ("2", "Continued Use Justification",
             "Per §4.4(a) — the justification for the continued use of the legacy software, including its "
             "history of use, the version under consideration, and any field experience or post-market data."),
            ("3", "Risk Assessment",
             "Per §4.4(b)–(c) — risk-based assessment of the legacy software's contribution to hazardous "
             "situations, including identification of any anomalies that affect safety. References the project "
             "risk management file (ISO 14971) and the §7 software risk register."),
            ("4", "Existing Objective Evidence",
             "The objective evidence already available for the legacy item (existing requirements, design "
             "documents, test results, configuration records, problem-report history) and gaps relative to "
             "what IEC 62304 §5 would require for a freshly-developed item."),
            ("5", "Risk Control and Additional Activities",
             "Per §4.4(c) — the additional verification, validation, configuration management, or risk "
             "control activities required to bring residual risk to an acceptable level, and how each is "
             "linked to the safety class of the item."),
            ("6", "Gap Analysis — §5 Sub-clauses Applied vs. Not Applied",
             "MANDATORY per IEC 62304 §4.4(d). For each §5 sub-clause (5.1 Planning through 5.8 Release), "
             "state whether the activity is applied to the legacy software, partially applied, or not applied, "
             "with a documented risk-based rationale for every non-application. For Class B and Class C legacy "
             "software this gap analysis is mandatory audit evidence — the rationale must reference the safety "
             "class, the hazardous situations identified in §3, and the additional activities defined in §5. A "
             "missing or empty gap analysis is a non-conformity finding under §4.4(d) and prevents release.",
             True),
            ("7", "Configuration Management and Records",
             "How the legacy software item is placed under configuration management per §8, including "
             "identification of its baseline version, SOUP components, and the location of all records "
             "supporting this plan."),
            ("8", "Roles and Responsibilities",
             "Who authors the legacy assessment, who reviews the gap analysis, who approves the plan, and "
             "who is accountable for maintaining the evidence over the device lifecycle."),
        ),
    },
}


def custom_plan_sections(label: str) -> list[SectionDef]:
    """A single placeholder section for a custom (non-built-in) plan type."""
    return _sections(
        ("1", "Purpose and Scope",
         f"Describe the purpose, scope, and applicable IEC 62304 / ISO 14971 clauses for the {label}."),
    )
