"""Default SDP content seeded based on safety class (IEC 62304 §5.1)."""

from typing import TypedDict


class SectionDef(TypedDict):
    section_number: str
    section_name: str
    content: str
    sort_order: int


class PhaseDef(TypedDict):
    phase_name: str
    phase_order: int
    entry_criteria: str
    exit_criteria: str
    activities: str
    required_for_class: str


class RoleDef(TypedDict):
    role_name: str
    responsibilities: str
    required_for_class: str
    sort_order: int


# ── Default sections (all classes) ───────────────────────────────────────────

SECTIONS: list[SectionDef] = [
    {
        "section_number": "1",
        "section_name": "Purpose and Scope",
        "content": (
            "This Software Development Plan (SDP) defines the processes, activities, "
            "tasks, and responsibilities for the development and maintenance of the software "
            "system in compliance with IEC 62304. It applies to all software items in the project "
            "and establishes the framework within which all software development activities shall occur."
        ),
        "sort_order": 1,
    },
    {
        "section_number": "2",
        "section_name": "Software Development Lifecycle Model",
        "content": (
            "The project adopts the V-Model software development lifecycle, which provides explicit "
            "traceability between development phases and their corresponding verification/validation activities. "
            "Each development phase has defined entry criteria, exit criteria, and required deliverables. "
            "The lifecycle model is selected based on the safety classification of the software system."
        ),
        "sort_order": 2,
    },
    {
        "section_number": "3",
        "section_name": "Development Environment",
        "content": (
            "Describe the hardware, software tools, programming languages, compilers, version control systems, "
            "and build environment used during development. Include tool qualification requirements per IEC 62304 §6.1. "
            "\n\n- Version Control: [e.g., Git]\n- IDE: [e.g., VS Code]\n- Language: [e.g., Python 3.x]\n"
            "- Build System: [e.g., Docker]\n- Issue Tracker: [e.g., Jira]"
        ),
        "sort_order": 3,
    },
    {
        "section_number": "4",
        "section_name": "Software Development Standards and Methods",
        "content": (
            "Applicable standards:\n"
            "- IEC 62304: Medical Device Software – Software Lifecycle Processes\n"
            "- ISO 14971: Application of Risk Management to Medical Devices\n"
            "- IEC 62366: Usability Engineering for Medical Devices\n\n"
            "Coding standards, naming conventions, and static analysis requirements shall be documented "
            "in the project coding standard document. All code must be peer reviewed before merge."
        ),
        "sort_order": 4,
    },
    {
        "section_number": "5",
        "section_name": "Software Configuration Management",
        "content": (
            "All software artifacts shall be placed under configuration management (CM). "
            "This includes source code, test scripts, build scripts, and documentation. "
            "\n\nCM activities include:\n"
            "- Identification: Unique identifiers for all CM items\n"
            "- Change control: Formal change request and approval process\n"
            "- Version control: All changes tracked with author, date, and rationale\n"
            "- Build management: Reproducible builds from tagged baselines\n"
            "- Release management: Formal release process with signed approval"
        ),
        "sort_order": 5,
    },
    {
        "section_number": "6",
        "section_name": "Software Problem Resolution",
        "content": (
            "All identified software problems shall be recorded, classified, and resolved per IEC 62304 §9. "
            "Problem reports shall include: description, severity, impact assessment, corrective action, "
            "and verification of fix. Problems affecting safety shall trigger re-evaluation of associated risks."
        ),
        "sort_order": 6,
    },
    {
        "section_number": "7",
        "section_name": "Software Architecture and Design",
        "content": (
            "The software architecture shall decompose the system into software items with defined interfaces. "
            "Each software item shall be assigned a safety class per IEC 62304 §4.3. "
            "Architecture documentation shall include component diagrams, data flow diagrams, "
            "and interface specifications. Design decisions that affect safety shall be documented "
            "with their rationale."
        ),
        "sort_order": 7,
    },
    {
        "section_number": "8",
        "section_name": "Testing Strategy",
        "content": (
            "Testing shall be performed at four levels:\n"
            "1. Unit Testing — individual software units tested in isolation\n"
            "2. Integration Testing — software items tested as integrated assemblies\n"
            "3. System Testing — complete software system tested against requirements\n"
            "4. Acceptance/Validation Testing — USER requirements validated with representative users\n\n"
            "Test cases shall be traced to requirements. All tests must be executed and documented "
            "before product release."
        ),
        "sort_order": 8,
    },
    {
        "section_number": "9",
        "section_name": "Software Risk Management",
        "content": (
            "Software risk management is performed in accordance with ISO 14971 and IEC 62304 §4.2. "
            "For Class C software items, a 100% software failure assumption is applied (§7.4.2). "
            "\n\nRisk management activities include:\n"
            "- Hazard identification and analysis\n"
            "- Risk estimation (severity × probability)\n"
            "- Risk controls (design, protective measures, labeling)\n"
            "- Residual risk evaluation and acceptance\n"
            "- Post-market surveillance and re-evaluation"
        ),
        "sort_order": 9,
    },
    {
        "section_number": "10",
        "section_name": "Traceability",
        "content": (
            "Bidirectional traceability shall be maintained throughout the software lifecycle:\n"
            "USER requirements → SYSTEM requirements → SOFTWARE requirements → "
            "Design elements → Test cases → Test executions.\n\n"
            "Traceability to risk controls shall also be maintained. "
            "The traceability matrix shall be reviewed at each phase gate and prior to release."
        ),
        "sort_order": 10,
    },
    {
        "section_number": "11",
        "section_name": "Maintenance and Post-Market",
        "content": (
            "Software maintenance activities shall follow IEC 62304 §6. "
            "All changes to released software shall be managed through the formal change control process. "
            "The impact of changes on safety shall be assessed before implementation. "
            "Post-market surveillance feedback shall be reviewed for safety implications."
        ),
        "sort_order": 11,
    },
]


# ── Default phases by safety class ───────────────────────────────────────────

PHASES: list[PhaseDef] = [
    {
        "phase_name": "Software Requirements Analysis",
        "phase_order": 1,
        "entry_criteria": "Project requirements (USER level) approved; stakeholders identified",
        "exit_criteria": "All SOFTWARE requirements documented, reviewed, and baselined",
        "activities": "Elicit requirements; classify by type; assign readable IDs; peer review",
        "required_for_class": "ABC",
    },
    {
        "phase_name": "Software Architecture Design",
        "phase_order": 2,
        "entry_criteria": "Software requirements baselined; safety classification assigned",
        "exit_criteria": "Architecture document approved; software items decomposed with safety classes",
        "activities": "Decompose system into software items; define interfaces; assign safety classes; architecture review",
        "required_for_class": "BC",
    },
    {
        "phase_name": "Detailed Design",
        "phase_order": 3,
        "entry_criteria": "Architecture design approved",
        "exit_criteria": "Detailed design document approved; all software units specified",
        "activities": "Design software units; specify algorithms and data structures; design review",
        "required_for_class": "C",
    },
    {
        "phase_name": "Implementation",
        "phase_order": 4,
        "entry_criteria": (
            "Architecture design approved (Class B); Detailed design approved (Class C); "
            "Development environment configured"
        ),
        "exit_criteria": "All software units implemented; code review completed; static analysis passed",
        "activities": "Write code; conduct peer code reviews; static analysis; document inline",
        "required_for_class": "ABC",
    },
    {
        "phase_name": "Unit Testing",
        "phase_order": 5,
        "entry_criteria": "Software units implemented; unit test plan approved",
        "exit_criteria": "All unit tests passed; coverage requirements met; results documented",
        "activities": "Execute unit tests; record results; investigate failures; re-test after fixes",
        "required_for_class": "BC",
    },
    {
        "phase_name": "Integration Testing",
        "phase_order": 6,
        "entry_criteria": "All software items implemented and unit tested",
        "exit_criteria": "All integration tests passed; interface verification complete",
        "activities": "Assemble software items; execute integration tests; verify interfaces; document results",
        "required_for_class": "BC",
    },
    {
        "phase_name": "System Testing",
        "phase_order": 7,
        "entry_criteria": "Integration complete; system test plan approved",
        "exit_criteria": "All system tests passed; requirements traceability verified; test report approved",
        "activities": "Execute system tests against requirements; verify all requirements covered; review traceability matrix",
        "required_for_class": "ABC",
    },
    {
        "phase_name": "Validation",
        "phase_order": 8,
        "entry_criteria": "System testing complete; validation plan approved",
        "exit_criteria": "All USER requirements validated; validation report signed",
        "activities": "Validate USER requirements with representative users/scenarios; document results; obtain sign-off",
        "required_for_class": "ABC",
    },
    {
        "phase_name": "Release",
        "phase_order": 9,
        "entry_criteria": (
            "All tests passed; risk controls verified; residual risks accepted; "
            "SDP approved; traceability complete"
        ),
        "exit_criteria": "Release package approved and signed; software baseline tagged in version control",
        "activities": "Readiness review; final documentation; release approval; configuration baseline; archive",
        "required_for_class": "ABC",
    },
]


# ── Default roles ─────────────────────────────────────────────────────────────

ROLES: list[RoleDef] = [
    {
        "role_name": "Software Development Lead",
        "responsibilities": (
            "Responsible for overall software development execution. Manages the development team, "
            "ensures IEC 62304 compliance, reviews and approves key deliverables, and acts as primary "
            "contact for regulatory and quality matters."
        ),
        "required_for_class": "ABC",
        "sort_order": 1,
    },
    {
        "role_name": "Software Developer",
        "responsibilities": (
            "Implements software units per design specifications. Conducts peer code reviews, "
            "writes unit tests, performs static analysis, and documents implementation decisions. "
            "Raises problem reports for defects."
        ),
        "required_for_class": "ABC",
        "sort_order": 2,
    },
    {
        "role_name": "Software Test Engineer",
        "responsibilities": (
            "Authors and executes test cases at all levels (unit, integration, system). "
            "Maintains test traceability to requirements. Documents test results and "
            "raises defect reports. Ensures test coverage meets SDP requirements."
        ),
        "required_for_class": "ABC",
        "sort_order": 3,
    },
    {
        "role_name": "Quality Assurance",
        "responsibilities": (
            "Audits software development activities for IEC 62304 compliance. "
            "Reviews and approves key documents (SDP, requirements, test plans). "
            "Manages the non-conformance process and tracks corrective actions."
        ),
        "required_for_class": "BC",
        "sort_order": 4,
    },
    {
        "role_name": "Risk Manager",
        "responsibilities": (
            "Leads software risk management activities per ISO 14971. "
            "Facilitates hazard analysis, reviews risk controls, evaluates residual risks, "
            "and maintains the risk management file. Approves risk acceptance decisions."
        ),
        "required_for_class": "BC",
        "sort_order": 5,
    },
    {
        "role_name": "Regulatory Affairs",
        "responsibilities": (
            "Ensures regulatory compliance throughout development. Reviews documentation for "
            "submission readiness, interfaces with notified bodies, manages the technical file, "
            "and advises on applicable regulations (MDR, FDA, etc.)."
        ),
        "required_for_class": "C",
        "sort_order": 6,
    },
]
