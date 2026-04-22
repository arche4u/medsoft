"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Doc, DocumentStatus, Requirement } from "@/lib/api";

// ── Section definitions per doc_type ─────────────────────────────────────────

type DocSection = {
  id: string;
  title: string;
  iecRef: string;
  guidance: string;
  reqFilter?: "USER" | "SYSTEM" | "SOFTWARE"; // live requirements list for this section
};

const SECTION_DEFS: Record<string, DocSection[]> = {
  SDP: [
    {
      id: "development_processes",
      title: "1. Development Processes",
      iecRef: "IEC 62304 §5.1.1 (a)",
      guidance:
        "Define the software development life cycle (SDLC) model being used (e.g., V-Model, Waterfall, Agile with IEC 62304 compliance overlay). Specify development phases, entry and exit criteria for each phase, and role responsibilities. For safety class B/C software, include rationale for the chosen model.",
    },
    {
      id: "documentation_deliverables",
      title: "2. Documentation and Deliverables",
      iecRef: "IEC 62304 §5.1.1 (b)",
      guidance:
        "List all documents, records, and software outputs to be produced during development. Include document owner, required review/approval level, and planned completion milestone. Examples: SRS, SADS, SDDS, SOUP list, unit test protocol, integration test protocol, verification report, release notes.",
    },
    {
      id: "traceability",
      title: "3. Traceability",
      iecRef: "IEC 62304 §5.1.1 (c), §9.5",
      guidance:
        "Define how software requirements (URQ/SYS/SWR), risk controls from the risk management file (ISO 14971), design elements, and verification results are traced across the lifecycle. Specify the traceability matrix structure, tooling used, and frequency of traceability review.",
    },
    {
      id: "configuration_management",
      title: "4. Configuration and Change Management",
      iecRef: "IEC 62304 §8",
      guidance:
        "Define procedures for identifying, versioning, and controlling all software configuration items (SCIs): source code, build artifacts, test scripts, and documentation. Describe the change control process, baseline management, version labelling convention, and how changes are reviewed and approved before implementation.",
    },
    {
      id: "problem_resolution",
      title: "5. Problem Resolution",
      iecRef: "IEC 62304 §9",
      guidance:
        "Define procedures for identifying, recording, evaluating, resolving, and closing software problems and anomalies discovered during development, testing, or post-release. Include severity classification criteria, escalation paths, re-test requirements, and linkage to the change request process.",
    },
    {
      id: "integration",
      title: "6. Integration",
      iecRef: "IEC 62304 §5.6",
      guidance:
        "Describe the software integration strategy (e.g., bottom-up, incremental, continuous integration). Specify which software units are integrated in each build, the integration test approach, acceptance criteria for each integration stage, and how integration test results are recorded and reviewed.",
    },
    {
      id: "risk_management",
      title: "7. Risk Management",
      iecRef: "IEC 62304 §4.3, ISO 14971",
      guidance:
        "State the software safety class (A, B, or C) with justification based on the risk analysis outcome. Describe how the safety class determines the rigor and completeness requirements for each development activity. Reference the Risk Management Plan and explain how software risk controls are identified, implemented, and verified.",
    },
  ],
  SMP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §6.1",
      guidance:
        "Define the scope of software maintenance activities for this product. State whether this plan covers corrective maintenance (bug fixes), adaptive maintenance (OS/SOUP updates), perfective maintenance (enhancements), and preventive maintenance. Identify the software items in scope, their safety class, and the regulatory framework under which maintenance is performed (IEC 62304, MDR, FDA 21 CFR Part 820).",
    },
    {
      id: "feedback_monitoring",
      title: "2. Feedback and Problem Monitoring",
      iecRef: "IEC 62304 §6.1",
      guidance:
        "Describe how post-market feedback is collected and monitored. Identify all feedback channels: customer support tickets, vigilance reports, post-market clinical follow-up (PMCF), field service reports, and complaint handling. Specify the responsible role, review frequency, and criteria for escalating a feedback item to a formal Problem Report or Change Request. Reference the Problem Resolution SOP (SOP-012).",
    },
    {
      id: "modification_request",
      title: "3. Modification Request Process",
      iecRef: "IEC 62304 §6.2.1",
      guidance:
        "Define the process for submitting and approving modification requests. Include: request submission form/template, required fields (description, justification, affected components, safety impact), triage and prioritisation criteria, approval authority, and linkage to the Change Control process (SCP). Describe how modification requests are tracked from submission to resolution.",
    },
    {
      id: "impact_analysis",
      title: "4. Impact Analysis",
      iecRef: "IEC 62304 §6.2.2",
      guidance:
        "For each approved modification request, document the impact analysis process. This includes: identifying which software items, requirements, design elements, and test cases are affected; re-evaluating the software safety class if the modification may introduce new hazards; assessing impact on SOUP components; and determining which SDLC activities must be re-executed. Record the analysis outcome before implementation begins.",
    },
    {
      id: "modification_implementation",
      title: "5. Modification Implementation",
      iecRef: "IEC 62304 §6.2.3",
      guidance:
        "Describe how modifications are implemented following the appropriate SDLC activities as determined by the impact analysis. For safety-critical changes, re-execute the full development cycle (requirements → design → implementation → unit test → integration test → system test). For minor fixes, define the minimum set of activities required. Specify the branch strategy, code review requirements, and approval gates before merging.",
    },
    {
      id: "change_verification",
      title: "6. Verification of Modifications",
      iecRef: "IEC 62304 §6.2.4",
      guidance:
        "Define how modifications are verified before release. This includes: regression testing scope (full suite vs. targeted), confirmation that all affected requirements are re-tested, re-execution of affected integration and system tests, and update of the Traceability Matrix. Specify who approves the verification results and what records must be updated in the DHF.",
    },
    {
      id: "maintenance_release",
      title: "7. Maintenance Release Process",
      iecRef: "IEC 62304 §6.2.5",
      guidance:
        "Define the process for releasing a maintenance update. Include: release readiness checklist (all verifications complete, anomalies evaluated, VDD updated), version increment scheme (major/minor/patch), regulatory notification requirements for substantial modifications (MDR Article 120 / FDA 21 CFR 807.81), customer notification, archive of updated DHF, and rollback procedure if deployment issues arise.",
    },
  ],

  SPRP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §9",
      guidance:
        "Define the scope of this Software Problem Resolution Plan. State that it applies to all software anomalies, defects, and non-conformances discovered during development, verification, validation, post-market surveillance, or customer use. Identify the products and software versions in scope. Reference the applicable regulatory requirements (IEC 62304 Clause 9, ISO 13485 §8.3, MDR §92).",
    },
    {
      id: "problem_identification",
      title: "2. Problem Identification and Reporting",
      iecRef: "IEC 62304 §9.1",
      guidance:
        "Describe how software problems are identified and formally reported. Define the Problem Report (PR) template fields: unique PR-ID, date, reporter, product version, description of observed behaviour, expected behaviour, reproduction steps, environment details, initial severity classification (Critical/Major/Minor), and initial safety impact assessment (Yes/No/Under investigation). Specify who is authorised to raise a PR and the target response time by severity.",
    },
    {
      id: "investigation_analysis",
      title: "3. Problem Investigation and Root Cause Analysis",
      iecRef: "IEC 62304 §9.2",
      guidance:
        "Define the process for investigating reported problems. Include: triage meeting frequency and participants, root cause analysis methods (5-Why, fault tree, Ishikawa), expected investigation timeline by severity, escalation criteria (e.g., patient safety risk → immediate escalation to risk management), and documentation requirements for investigation findings. Specify when an Advisory Notice to customers is required during investigation.",
    },
    {
      id: "resolution_approval",
      title: "4. Problem Resolution and Disposition",
      iecRef: "IEC 62304 §9.3",
      guidance:
        "Define valid dispositions for a problem report: (a) Fix — implement a code/design correction; (b) Workaround documented — documented temporary mitigation; (c) Won't fix with justification — risk acceptable, anomaly added to UAL; (d) Duplicate — reference parent PR. Specify approval authority for each disposition type. For safety-related problems, require sign-off by the Quality Manager and update of the Risk Register.",
    },
    {
      id: "tracking_trending",
      title: "5. Tracking and Trend Analysis",
      iecRef: "IEC 62304 §9.4",
      guidance:
        "Define how open problem reports are tracked to closure. Specify the PR tracking tool, required status fields (Open, In Progress, Resolved, Verified, Closed), target resolution timelines by severity, and reporting cadence (e.g., weekly defect dashboard). Describe trend analysis activities: periodic review for recurring defect categories, modules with high defect density, or escalating post-market reports. Define thresholds that trigger a formal CAPA.",
    },
    {
      id: "resolution_verification",
      title: "6. Verification of Resolution",
      iecRef: "IEC 62304 §9.5",
      guidance:
        "Describe how the resolution of each problem is independently verified before the PR is closed. Include: re-test requirements (minimum regression test scope, reproduction of original failure scenario), review of the fix by a reviewer other than the implementer, confirmation that related test cases are updated, and traceability update (PR → fix commit → test case → verification record). Specify who approves closure and what evidence must be on file.",
    },
    {
      id: "advisory_customer_notification",
      title: "7. Advisory Notices and Regulatory Reporting",
      iecRef: "IEC 62304 §9.6, MDR Art. 87, FDA 21 CFR 806",
      guidance:
        "Define the criteria and process for issuing an Advisory Notice or Field Safety Corrective Action (FSCA) to customers. Include: safety-related problem classification criteria, decision authority, required content of the advisory notice (product, affected versions, problem description, risk assessment, required action), distribution list, and regulatory body notification requirements. Specify record retention requirements.",
    },
  ],

  SCP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §8.1",
      guidance:
        "Define the scope of this Software Configuration Plan. Identify all software products, components, and associated documentation items subject to configuration control. State the applicable standards (IEC 62304 Clause 8, ISO 13485 §4.2.4) and the software safety classes of items in scope. Identify the configuration management (CM) tooling to be used (e.g., Git for source control, Jira for change tracking, this platform for document control).",
    },
    {
      id: "configuration_identification",
      title: "2. Configuration Identification",
      iecRef: "IEC 62304 §8.1.1",
      guidance:
        "Define the scheme for uniquely identifying all Configuration Items (CIs). CIs must include: source code modules and packages, executable files and build outputs, test scripts and test data, SOUP components (libraries, frameworks, OS), development and build tools (with version), and all lifecycle documents. Define the version numbering scheme (e.g., MAJOR.MINOR.PATCH for software; revision letter A/B/C for documents). Specify how CIs are labelled in the repository and document management system.",
    },
    {
      id: "change_control",
      title: "3. Change Control Process",
      iecRef: "IEC 62304 §8.1.2",
      guidance:
        "Define the process for requesting, evaluating, approving, and implementing changes to controlled CIs. Include: Change Request (CR) submission form and required fields, Change Control Board (CCB) composition and meeting frequency, impact assessment criteria (safety class affected, scope of re-testing required), approval authority levels (e.g., minor fix = lead developer approval; safety-critical change = CCB approval), and the process for emergency changes. Define how changes are linked to the originating Problem Report or enhancement request.",
    },
    {
      id: "configuration_status",
      title: "4. Configuration Status Accounting",
      iecRef: "IEC 62304 §8.1.3",
      guidance:
        "Describe how the current status of all CIs and change requests is tracked and reported. Include: required fields in the CM status log (CI name, version, baseline, status, open CRs), reporting frequency and audience, and how CI status is communicated to the development team. Specify the baseline naming convention (e.g., DEV-BASELINE-1.0, RELEASE-BASELINE-1.0) and how baselines are tagged in source control.",
    },
    {
      id: "configuration_audit",
      title: "5. Configuration Evaluation and Audit",
      iecRef: "IEC 62304 §8.1.4",
      guidance:
        "Define the configuration audit activities to be performed before each software release. Include: functional configuration audit (verify that delivered software matches the approved requirements and test results), physical configuration audit (verify that the build is reproducible from the tagged baseline), audit checklist, roles responsible for conducting and approving the audit, and how audit findings are documented and resolved.",
    },
    {
      id: "soup_management",
      title: "6. SOUP Management",
      iecRef: "IEC 62304 §8.1.2, §7.1.3",
      guidance:
        "Define how Software of Unknown Provenance (SOUP) components are identified, evaluated, and controlled. Include: the SOUP List format (component name, supplier, version, licence, intended function, anomaly list source, evaluation date), criteria for selecting SOUP (licence compatibility, supplier support, known defect rate), process for evaluating SOUP anomaly lists, and change control for SOUP upgrades (re-assessment of integration impact, regression testing, UAL update).",
    },
    {
      id: "tools_environment",
      title: "7. Development Tools and Environment Control",
      iecRef: "IEC 62304 §8.1.1, §5.1.4",
      guidance:
        "Identify all development, build, test, and documentation tools used in the software lifecycle. For each tool, document: name, version, supplier, purpose, and whether tool qualification is required (required when a tool error could introduce an undetected defect in safety-critical software). Define how the build environment is controlled (e.g., locked Docker image, pinned dependency file) to ensure reproducibility. Describe how tool versions are updated and the impact assessed.",
    },
  ],

  SVP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Verification Objectives",
      iecRef: "IEC 62304 §5.1.6, §5.7.1",
      guidance:
        "Define the scope of this Software Verification Plan. List the software items and software versions subject to verification. State the verification objectives aligned with the software safety class: Class A — confirm software requirements are met; Class B — additionally verify architecture and integration; Class C — additionally apply rigorous unit verification, coverage analysis, and formal design review. Identify the standards and regulations driving the verification requirements (IEC 62304, ISO 14971, applicable MDR/FDA guidance).",
    },
    {
      id: "verification_strategy",
      title: "2. Verification Strategy and Methods",
      iecRef: "IEC 62304 §5.7.1",
      guidance:
        "Define the overall verification approach and the mix of methods to be applied. Methods include: inspection and review (requirements, design, code), static analysis (linters, MISRA checking, complexity metrics), dynamic testing (unit, integration, system), and formal verification where required. For each software safety class, define which methods are mandatory. Describe how verification evidence will be documented (protocols, reports, review records) and linked to requirements via the Traceability Matrix.",
    },
    {
      id: "requirements_verification",
      title: "3. Verification of Software Requirements",
      iecRef: "IEC 62304 §5.2.7",
      guidance:
        "Describe how each software requirement (SWR-NNN) will be verified. For each requirement, specify the verification method (test, analysis, inspection, demonstration), the responsible role, the acceptance criterion, and the reference to the test case or review record. Confirm that all risk-related requirements (from the Risk Management File) have a corresponding verification activity. Define the target requirements coverage metric (typically 100% for Class C).",
    },
    {
      id: "architecture_verification",
      title: "4. Verification of Software Architecture",
      iecRef: "IEC 62304 §5.3.6",
      guidance:
        "Define how the software architecture (SADS) will be verified. Verification activities must confirm: all software requirements are allocated to software items; software item interfaces are correctly defined; the architecture is consistent with the system architecture; safety-critical software items are appropriately segregated (particularly for Class C); and the architecture implements all required risk control measures. Specify the review checklist to be used, reviewer qualifications, and record format.",
    },
    {
      id: "unit_integration_testing",
      title: "5. Unit and Integration Test Plan",
      iecRef: "IEC 62304 §5.5.3, §5.6.4",
      guidance:
        "Define the unit testing and integration testing approach. For unit testing: specify the test framework to be used, target code coverage metric (e.g., branch coverage ≥80% for Class B, ≥100% for Class C safety-critical units), test data management, and pass/fail criteria. For integration testing: define the integration sequence, interface test cases, error injection scenarios, and SOUP integration verification approach. Specify how unit and integration test results are recorded and reviewed.",
    },
    {
      id: "system_testing",
      title: "6. Software System Test Plan",
      iecRef: "IEC 62304 §5.7.2 – §5.7.4",
      guidance:
        "Define the system-level software verification approach. This includes: test environment specification (hardware configuration, OS version, test data sets), test case structure (ID, objective, preconditions, steps, expected result, pass/fail criterion), traceability from test cases to software requirements, performance and stress testing approach (where applicable), boundary condition and negative testing, and usability-related verification. Specify who executes system tests, who reviews results, and approval authority.",
    },
    {
      id: "regression_testing",
      title: "7. Regression Testing Strategy",
      iecRef: "IEC 62304 §5.7.5",
      guidance:
        "Define the regression testing strategy for use after defect fixes, code changes, or SOUP updates. Include: criteria for selecting the regression test scope (full regression vs. targeted based on impact analysis), automated vs. manual test mix, regression test frequency (per build, per sprint, per release), and how regression failures are handled. Specify the minimum regression test set that must pass before any release candidate is approved.",
    },
    {
      id: "acceptance_criteria",
      title: "8. Verification Completion and Acceptance Criteria",
      iecRef: "IEC 62304 §5.7.4, §5.8.1",
      guidance:
        "Define the criteria that must be met before verification is considered complete and the software can proceed to release. Include: 100% of planned test cases executed; all Critical and Major anomalies resolved or formally accepted with justification; open anomalies documented in the Unresolved Anomaly List (UAL) with risk assessment; Traceability Matrix showing full coverage; all review records approved; and verification report (SVREP) completed and signed off by the responsible approver.",
    },
  ],

  SBRP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §5.8, §5.1.1",
      guidance:
        "Define the scope of this Software Build and Release Plan. Identify the software products, versions, and target platforms covered. State the objectives: reproducible builds, controlled release packaging, traceability from source to deployed artefact, and compliance with IEC 62304 §5.8 release requirements. Identify the roles responsible for build execution, release packaging, and release approval.",
    },
    {
      id: "build_environment",
      title: "2. Build Environment and Tool Control",
      iecRef: "IEC 62304 §5.1.4, §8.1.1",
      guidance:
        "Define the controlled build environment to ensure reproducibility. Specify: operating system and version, compiler/interpreter version, build tool version (e.g., CMake, Make, npm, Maven), dependency management tool and lock file (e.g., package-lock.json, requirements.txt with pinned versions), and any build-time environment variables. Describe how the build environment is version-controlled (e.g., Dockerfile, CI pipeline definition) and how deviations are detected and handled. State the requirement that the release build must be produced from a clean, tagged baseline.",
    },
    {
      id: "build_process",
      title: "3. Build Process and Automation",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "Document the step-by-step build process from source code to deliverable artefact. Include: source checkout from tagged baseline, dependency resolution, compilation/transpilation steps, static analysis gate (must pass before proceeding), automated unit test execution (must pass), artefact packaging and signing (if applicable), and generation of the Software Bill of Materials (SBOM). Describe the CI/CD pipeline stages and required gate checks at each stage. Define what constitutes a build failure and the escalation process.",
    },
    {
      id: "release_prerequisites",
      title: "4. Release Prerequisites and Readiness Checklist",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "Define the conditions that must be satisfied before a software release is authorised. The release readiness checklist must include: all planned verification activities complete (unit, integration, system tests executed and passed); Software Verification Report (SVREP) approved; all Critical and Major anomalies resolved; Unresolved Anomaly List (UAL) reviewed and accepted; Traceability Matrix complete and reviewed; SOUP List current; regulatory submission complete (if applicable); and release approval obtained from the authorised release authority.",
    },
    {
      id: "release_documentation",
      title: "5. Release Documentation",
      iecRef: "IEC 62304 §5.8.2, §5.8.3",
      guidance:
        "Define the documentation that must be produced and approved for each release. Required documents: Version Description Document (VDD) — software version, build configuration, list of changes since last release, known limitations, installation/upgrade instructions; Release Notes — customer-facing summary of changes and known issues; Updated UAL; Configuration audit record confirming the build matches the tagged baseline. Specify who authors and approves each document, and the required lead time before release.",
    },
    {
      id: "archive_baseline",
      title: "6. Archive and Configuration Baseline",
      iecRef: "IEC 62304 §5.8.4, §8.1.3",
      guidance:
        "Define the archiving requirements for each software release. The release archive must include: tagged source code baseline in version control; compiled release artefacts (binaries, packages); complete set of lifecycle documents (SRS, SADS, SDDS, SUTR, SITR, SVREP, VDD, UAL); test execution records; SOUP List; build environment specification; and change history. Specify the storage location, access controls, retention period (typically lifetime of the product plus applicable regulatory period, e.g., 10 years for EU MDR), and backup procedure.",
    },
    {
      id: "distribution_deployment",
      title: "7. Distribution and Deployment",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Define how the released software is distributed to its intended environment. Include: distribution channel (e.g., secure download portal, physical media, OTA update), integrity verification mechanism (hash or digital signature), installation procedure (step-by-step, with validation checks), rollback procedure in case of installation failure, and record of each deployment (system ID, version installed, date, installer identity). For regulated devices, specify any required regulatory notifications prior to distribution (e.g., MDR notification for substantial modifications).",
    },
    {
      id: "post_release_monitoring",
      title: "8. Post-Release Monitoring",
      iecRef: "IEC 62304 §6.1, ISO 14971 §9",
      guidance:
        "Define the post-market surveillance activities that follow each software release. Include: monitoring channels (customer support, vigilance reporting, social media, scientific literature), review frequency, criteria for declaring a safety-related field issue, escalation to a Field Safety Corrective Action (FSCA) or Advisory Notice, and the linkage to the Problem Resolution process (SPRP) and Risk Management File update. Reference the Post-Market Surveillance Plan required under MDR Article 84.",
    },
  ],

  SRS: [
    {
      id: "scope_context",
      title: "1. Scope and System Context",
      iecRef: "IEC 62304 §5.2.1",
      guidance:
        "Describe the scope of the software system and its intended use environment. Identify the hardware platform, target users, and any interfaces to external systems (e.g., EHR, nurse call, device communication). State the software safety class and reference the Risk Management Plan.",
    },
    {
      id: "user_requirements",
      title: "2. User Requirements",
      iecRef: "IEC 62304 §5.2.2",
      guidance:
        "User requirements capture the needs of clinicians, operators, and patients. Each USER requirement (URQ-NNN) must be traceable to system and software requirements. The live list below is drawn directly from the Requirements module.",
      reqFilter: "USER",
    },
    {
      id: "system_requirements",
      title: "3. System Requirements",
      iecRef: "IEC 62304 §5.2.3",
      guidance:
        "System requirements refine user needs into measurable, testable system-level behaviours. Each SYSTEM requirement (SYS-NNN) must trace to a USER requirement. The live list below is drawn directly from the Requirements module.",
      reqFilter: "SYSTEM",
    },
    {
      id: "software_requirements",
      title: "4. Software Requirements",
      iecRef: "IEC 62304 §5.2.4 – §5.2.6",
      guidance:
        "Software requirements define the functionality, performance, and safety constraints that software must satisfy. Each SOFTWARE requirement (SWR-NNN) must trace to a SYSTEM requirement and, where applicable, to a risk control measure from the Risk Management File.",
      reqFilter: "SOFTWARE",
    },
    {
      id: "interface_requirements",
      title: "5. Interface Requirements",
      iecRef: "IEC 62304 §5.2.5",
      guidance:
        "Define all software interfaces: hardware drivers, communication protocols (e.g., CAN, SPI, UART, HL7, FHIR), external APIs, and user interface frameworks. Specify data formats, timing constraints, error handling, and failure mode behaviour for each interface.",
    },
    {
      id: "risk_requirements",
      title: "6. Risk-Related Requirements",
      iecRef: "IEC 62304 §5.2.6, ISO 14971 §6",
      guidance:
        "List software requirements that directly implement risk control measures from the Risk Management File. For each, state the hazard being mitigated, the residual risk level, and the verification method. Confirm alignment with the Risk Management Plan.",
    },
    {
      id: "requirements_traceability",
      title: "7. Requirements Traceability",
      iecRef: "IEC 62304 §5.2.7, §9.5",
      guidance:
        "Summarise the traceability approach for this document. Confirm that all USER requirements trace to SYSTEM requirements, all SYSTEM requirements trace to SOFTWARE requirements, and that software requirements are linked to design elements, test cases, and (where applicable) risk controls. Reference the Traceability Matrix document.",
    },
  ],

  // ── Development Documents ────────────────────────────────────────────────────

  SBD: [
    {
      id: "build_overview",
      title: "1. Build Overview and Identification",
      iecRef: "IEC 62304 §5.8.1, §8.1.1",
      guidance:
        "Identify the software product, release version, and build number documented in this record. State the date and time of the build, the person responsible for executing it, and the source code baseline tag (version control commit hash or tag) from which it was produced. Confirm that the build was performed from a clean, unmodified working tree and that no uncommitted changes were present.",
    },
    {
      id: "build_environment",
      title: "2. Build Environment Specification",
      iecRef: "IEC 62304 §5.1.4, §8.1.1",
      guidance:
        "Document the exact build environment used. Include: host operating system name and version, compiler or interpreter name and version, build tool name and version (e.g., CMake 3.28, Gradle 8.4, npm 10.2), all significant environment variables, and any container or VM image identifier if a containerised build system is used. The purpose is to ensure the build is reproducible — another engineer with this specification should be able to recreate the identical binary artefact.",
    },
    {
      id: "build_instructions",
      title: "3. Build Instructions and Steps",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "Provide step-by-step instructions to reproduce the build. Include: repository checkout command with the exact tag or commit, dependency resolution command (e.g., npm ci, pip install -r requirements.txt), compile or package command, any post-build signing or packaging steps, and the location of the resulting artefacts. Note any manual steps that cannot be automated and the risk controls applied to ensure they are performed correctly.",
    },
    {
      id: "build_artefacts",
      title: "4. Build Artefacts and Checksums",
      iecRef: "IEC 62304 §5.8.2, §8.1.3",
      guidance:
        "List all artefacts produced by this build: executables, libraries, packages, firmware images, installation files, and associated resources. For each artefact, record the file name, file size, SHA-256 checksum, and storage location. These checksums serve as the integrity reference for distribution and installation verification. Confirm that all artefacts listed here match those included in the release package.",
    },
    {
      id: "build_verification",
      title: "5. Build Verification and Gate Checks",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "Record the results of all automated gate checks executed during the build pipeline. Include: static analysis results (pass/fail, number of warnings, suppressed findings with justification), automated unit test results (pass/fail, number of tests, coverage percentage), and any security or licence scan results. State the overall build gate status. If any gate failed, document the disposition (waived with justification, or build rejected) before the build may proceed to release.",
    },
  ],

  SII: [
    {
      id: "scope_prerequisites",
      title: "1. Scope and Prerequisites",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "State the product name, version, and target deployment environment covered by these instructions. List all hardware prerequisites (minimum processor, RAM, storage, OS version, network requirements), software prerequisites (required runtimes, databases, middleware), and required permissions or access credentials. Specify whether this is a fresh installation or an upgrade from a previous version. Identify the intended installer audience (end user, IT administrator, field engineer) and any required training or qualification.",
    },
    {
      id: "pre_installation",
      title: "2. Pre-Installation Checks",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Define all checks that must be completed before installation begins. Include: verification of hardware and OS compatibility, backup of existing patient data and configuration (for upgrades), shutdown of conflicting services, verification of installer package integrity (checksum comparison against the released SHA-256 value from the VDD), availability of rollback media or procedure, and confirmation that the installation window is approved by the relevant stakeholders (e.g., clinical informatics, IT change management).",
    },
    {
      id: "installation_procedure",
      title: "3. Installation Procedure",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Provide the complete step-by-step installation procedure, written for the identified installer audience. Each step should include the action to be performed, expected outcome, and how to confirm the step completed successfully. Include screenshots or command-line examples where helpful. Clearly distinguish between mandatory steps and optional configuration steps. Flag any step that requires a decision and provide criteria for each path.",
    },
    {
      id: "post_installation",
      title: "4. Post-Installation Verification",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Define the checks that must be performed to confirm a successful installation. Include: application startup check (no error messages), version confirmation (confirm installed version matches the intended release version), smoke test procedure (minimum functional tests that exercise critical paths), configuration validation (confirm site-specific parameters are correctly applied), and connectivity verification (if the system integrates with external systems). Document the expected outcome for each check.",
    },
    {
      id: "rollback_uninstall",
      title: "5. Rollback and Uninstallation",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Provide the rollback procedure to restore the previous software version if the installation fails or post-installation verification does not pass. Include: step-by-step rollback instructions, expected duration, data integrity considerations (particularly for database migrations), and verification steps to confirm the rollback was successful. Also document the full uninstallation procedure for end-of-life decommissioning, including data export and secure data erasure requirements.",
    },
    {
      id: "known_issues",
      title: "6. Known Issues and Limitations",
      iecRef: "IEC 62304 §5.8.3",
      guidance:
        "List any known issues or limitations of this software version that affect installation or deployment. For each issue: state the symptom, conditions under which it occurs, affected configurations, and the recommended workaround. Reference the corresponding Unresolved Anomaly List (UAL) entry for traceability. Confirm that none of the listed issues present an unacceptable patient safety risk (per the UAL risk assessment).",
    },
  ],

  CG: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §5.5.1",
      guidance:
        "State the scope of these coding guidelines: which programming languages, platforms, and software items they apply to. Identify the safety classes of software items covered (Class A, B, or C) and note any stricter requirements that apply for Class C. Reference applicable external coding standards adopted (e.g., MISRA C:2012, MISRA C++:2008, CERT C, ISO/IEC 9899). Define the enforcement mechanism (automated linting in CI pipeline, code review checklist, static analysis tool).",
    },
    {
      id: "naming_conventions",
      title: "2. Naming Conventions",
      iecRef: "IEC 62304 §5.5.1",
      guidance:
        "Define naming conventions for all code identifiers. Include rules for: files and modules (e.g., snake_case, kebab-case), classes and types (e.g., PascalCase), functions and methods (e.g., camelCase with verb prefix), constants and enumerations (e.g., SCREAMING_SNAKE_CASE), variables (distinguish local, instance, global with prefix or scope), and test identifiers (e.g., test_<unit>_<scenario>_<expectedResult>). Provide examples for each category. State the naming rules for safety-critical functions so they are immediately identifiable.",
    },
    {
      id: "structure_complexity",
      title: "3. Code Structure and Complexity Limits",
      iecRef: "IEC 62304 §5.5.1, §5.5.4",
      guidance:
        "Define structural rules to maintain readable, testable, and maintainable code. Include: maximum cyclomatic complexity per function (e.g., ≤10 for Class B, ≤5 for Class C safety-critical functions), maximum function length in lines (e.g., ≤50 lines), maximum file length (e.g., ≤500 lines), maximum nesting depth (e.g., ≤4 levels), prohibition on functions with more than a defined number of parameters (e.g., ≤5), and single-responsibility principle enforcement. Justify limits in terms of testability and defect prevention.",
    },
    {
      id: "error_handling",
      title: "4. Error Handling and Defensive Programming",
      iecRef: "IEC 62304 §5.5.1, §4.3",
      guidance:
        "Define mandatory error handling patterns. Include: all return values from functions must be checked (no silent discards); input validation at all external interfaces (user input, API responses, hardware sensor data); defined behaviour for out-of-range inputs (return error code, log event, enter safe state — not undefined behaviour); prohibition of null/None dereferences without prior null check; use of assertions for internal invariants; and exception/signal handling strategy. For safety-critical code (Class B/C): define the safe-state behaviour for each identified failure mode.",
    },
    {
      id: "safety_constraints",
      title: "5. Safety-Critical Coding Constraints",
      iecRef: "IEC 62304 §5.5.1, §4.3, MISRA",
      guidance:
        "List programming constructs that are prohibited or restricted in safety-critical software items. Examples: no dynamic memory allocation after initialisation (use static allocation or memory pools); no recursion; no goto statements; no unreachable code; no implicit type conversions that could cause truncation or sign errors; no use of deprecated or unsafe library functions (e.g., strcpy, gets, rand without seeding); no floating-point equality comparisons; and no reliance on compiler-specific undefined behaviour. Each prohibition must include a rationale linked to a failure mode or standard requirement.",
    },
    {
      id: "documentation_requirements",
      title: "6. Code Documentation Requirements",
      iecRef: "IEC 62304 §5.5.1",
      guidance:
        "Define the mandatory inline documentation standard. Include: file-level header (module name, purpose, author, IEC 62304 references, safety class); function/method header (purpose, parameters with types and valid ranges, return values and error codes, side effects, safety class, associated SWR or risk control IDs); inline comments for non-obvious logic, hardware register manipulation, timing-critical sections, and any deliberate deviation from coding guidelines (with justification). Prohibit comments that merely restate the code — comments must explain why, not what.",
    },
    {
      id: "review_enforcement",
      title: "7. Review and Enforcement Process",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Define how compliance with these coding guidelines is enforced. Include: automated checks run in the CI pipeline before code review (linter, static analyser, complexity checker) with pass gates; code review checklist referencing each guideline section; reviewer qualifications and independence requirements (for Class C: reviewer must not be the author); process for documenting and approving guideline deviations (e.g., for legacy code or third-party integration constraints); and periodic guideline review schedule to incorporate lessons learned.",
    },
  ],

  SUTP: [
    {
      id: "scope_objectives",
      title: "1. Scope and Test Objectives",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Identify the software units under test: list each unit (module, class, function group) by name, version, and safety class. State the test objectives: confirm each unit meets its design specification (SDDS); achieve the required coverage metric (define target: e.g., statement coverage ≥80% for Class B; branch coverage ≥100% for Class C safety-critical units); verify all error paths are exercised; and confirm no regressions from previous unit test baselines. Reference the Software Verification Plan (SVP) for context.",
    },
    {
      id: "test_environment",
      title: "2. Test Environment and Tools",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Define the unit test execution environment. Include: test framework name and version (e.g., pytest 8.1, JUnit 5.10, Google Test 1.14), code coverage tool name and version, mock/stub framework (if used), hardware or simulator environment (for embedded targets), and any test infrastructure services (e.g., in-memory database, mock HTTP server). State how the test environment is controlled and how test environment versions are recorded. For safety-critical units, justify use of mocks/stubs and document their limitations.",
    },
    {
      id: "entry_criteria",
      title: "3. Test Items and Entry Criteria",
      iecRef: "IEC 62304 §5.5.3, §5.1.6",
      guidance:
        "List each software unit to be tested and confirm that entry criteria are satisfied before testing begins. Entry criteria: unit detailed design (SDDS section) reviewed and approved; unit implementation complete; coding guidelines review passed; no Critical build errors; unit test cases reviewed and approved. For each unit, state the version under test, the responsible developer, and the responsible tester (must differ for Class C).",
    },
    {
      id: "test_cases",
      title: "4. Test Cases",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Document each test case for every unit under test. Required fields per test case: Test Case ID (e.g., TC-UNIT-001), unit under test, associated design requirement (SDDS section), test description, preconditions and setup, input data (including boundary values and invalid inputs), expected output or behaviour, pass/fail criterion, and traceability to software requirement (SWR-NNN) where applicable. Ensure test cases cover: normal operation, boundary conditions, invalid inputs, error injection, and reset/recovery behaviour.",
    },
    {
      id: "exit_criteria",
      title: "5. Exit Criteria and Sign-off",
      iecRef: "IEC 62304 §5.5.5, §5.1.6",
      guidance:
        "Define the conditions that must be met for unit testing to be considered complete. Include: all test cases executed; pass rate meets threshold (define, e.g., 100% pass for safety-critical units); coverage metric target achieved; all failures documented as Problem Reports with disposition; coverage report reviewed by test lead; and test protocol and results approved by the responsible engineer and QA reviewer. Upon completion, this protocol transitions to a Software Unit Test Report (SUTR).",
    },
  ],

  SUTR: [
    {
      id: "test_summary",
      title: "1. Test Execution Summary",
      iecRef: "IEC 62304 §5.5.5",
      guidance:
        "Provide an executive summary of the unit test execution. State: software product and version tested, test protocol reference (SUTP ID and version), test execution date range, tester(s) name and role, total test cases planned, total executed, passed, failed, and blocked. Include a summary statement of whether the exit criteria defined in the SUTP were met.",
    },
    {
      id: "test_environment_used",
      title: "2. Test Environment Used",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Confirm the test environment used matches the specification in the SUTP. Document any deviations from the planned environment with justification and impact assessment. Record the exact versions of: test framework, coverage tool, compiler, OS, and hardware or simulator. Note any environment anomalies observed during testing and their resolution.",
    },
    {
      id: "test_results",
      title: "3. Test Results by Unit",
      iecRef: "IEC 62304 §5.5.5",
      guidance:
        "For each unit tested, record: number of test cases passed/failed/blocked, achieved code coverage (statement, branch, MC/DC where applicable), any test cases that were deferred (with justification and PR reference), and a pass/fail verdict for the unit. Attach or reference the machine-generated test execution log and coverage report as objective evidence. For failed test cases, provide a brief description of the failure and the PR number raised.",
    },
    {
      id: "anomalies",
      title: "4. Anomalies and Problem Reports",
      iecRef: "IEC 62304 §9.1",
      guidance:
        "List all anomalies (unexpected behaviours, test failures, tool warnings that could mask defects) discovered during unit testing. For each anomaly: PR ID, test case that revealed it, description of observed vs. expected behaviour, severity, root cause (if known at this stage), and current disposition (open, fixed-in-progress, resolved-pending-retest, or accepted-in-UAL). Confirm all Critical and Major anomalies are resolved or have an approved plan before exit criteria can be declared met.",
    },
    {
      id: "coverage_analysis",
      title: "5. Coverage Analysis",
      iecRef: "IEC 62304 §5.5.4",
      guidance:
        "Present the code coverage results for each unit. Include a table with: unit name, coverage type measured (statement/branch/MC-DC), target percentage, achieved percentage, and verdict. For any unit not meeting the target, provide a justified explanation (e.g., dead code confirmed by analysis, defensive error-handling code not triggerable without hardware fault). Attach the full coverage report as an appendix. For Class C safety-critical units falling short of target, document the compensating control applied.",
    },
    {
      id: "conclusion",
      title: "6. Conclusion and Approval",
      iecRef: "IEC 62304 §5.5.5",
      guidance:
        "State the overall conclusion: whether unit testing has been completed satisfactorily and all exit criteria met (or document any accepted deviations). Provide the approver's name, role, and date. For regulated products this signature constitutes objective evidence that unit verification is complete. Reference this report in the Traceability Matrix and update the DHF index.",
    },
  ],

  SITP: [
    {
      id: "scope_objectives",
      title: "1. Scope and Integration Objectives",
      iecRef: "IEC 62304 §5.6.1",
      guidance:
        "Identify the software items being integrated in this protocol, the integration stage (e.g., sprint integration, full system integration), and the build baseline under test. State the integration test objectives: verify that software items communicate correctly across defined interfaces; confirm that data formats, timing, and error propagation behave as specified in the SADS; verify SOUP components integrate as documented; and confirm no regression from previous integration baseline. Reference the Software Verification Plan (SVP) and the integration strategy defined in the SDP.",
    },
    {
      id: "integration_sequence",
      title: "2. Integration Sequence and Dependencies",
      iecRef: "IEC 62304 §5.6.1",
      guidance:
        "Document the planned integration sequence. Describe the integration strategy (bottom-up, top-down, incremental, or big-bang) with justification. Provide a dependency diagram or table showing which software items must be integrated before others. For each integration stage, list: the items being combined, the stubs or drivers required (and their version), the interfaces activated in this stage, and the subset of test cases executed at each stage.",
    },
    {
      id: "test_environment",
      title: "3. Test Environment",
      iecRef: "IEC 62304 §5.6.3",
      guidance:
        "Specify the integration test environment: hardware configuration (processor, memory, peripheral devices or simulators), operating system version, network configuration, external system simulators or real systems connected, and the integration test framework used. Identify any differences from the target production environment and assess their impact on test validity. For safety-class B/C: justify that the test environment is sufficiently representative of the intended use environment.",
    },
    {
      id: "interface_test_cases",
      title: "4. Interface Test Cases",
      iecRef: "IEC 62304 §5.6.3",
      guidance:
        "Document all interface test cases. For each interface identified in the SADS: Test Case ID, interface under test (producer ↔ consumer), message or data type, normal operation test (valid data, expected response), boundary condition tests (maximum/minimum values, empty payloads), and error scenario tests (malformed data, timeout, connection failure). Each test case must reference the architectural interface it exercises and its associated software requirement (SWR-NNN) where applicable.",
    },
    {
      id: "error_injection",
      title: "5. Error Injection and Fault Tolerance Tests",
      iecRef: "IEC 62304 §5.6.3, §4.3",
      guidance:
        "Define test cases that verify the system's response to fault conditions. Include: loss of communication with external systems (verify graceful degradation and error reporting); invalid or out-of-range data from external interfaces (verify rejection and logging); resource exhaustion scenarios (memory, file handles, database connections); hardware fault simulation (if applicable); and SOUP component failure simulation. For safety-critical interfaces, verify that failures result in a defined safe state rather than undefined behaviour.",
    },
    {
      id: "exit_criteria",
      title: "6. Exit Criteria and Sign-off",
      iecRef: "IEC 62304 §5.6.5, §5.1.6",
      guidance:
        "Define the conditions required to declare integration testing complete. Include: all planned test cases executed; pass rate meets threshold; all interface test failures documented as Problem Reports with disposition; SOUP integration confirmed; no Critical open anomalies; and test results reviewed and approved by test lead and QA. Upon completion, this protocol transitions to a Software Integration Test Report (SITR).",
    },
  ],

  SITR: [
    {
      id: "test_summary",
      title: "1. Test Execution Summary",
      iecRef: "IEC 62304 §5.6.5",
      guidance:
        "Provide a summary of the integration test execution. State: product version and build number, test protocol reference (SITP ID and version), execution date range, tester(s) and their role, total test cases planned/executed/passed/failed/blocked, and whether exit criteria from the SITP were met. Note the integration stages completed.",
    },
    {
      id: "test_environment_used",
      title: "2. Test Environment Used",
      iecRef: "IEC 62304 §5.6.3",
      guidance:
        "Confirm the test environment matches the specification in the SITP. Document any deviations, their justification, and impact on test validity. Record exact versions of hardware, OS, simulators, and all connected systems. Note any environment instability observed during testing and corrective actions taken.",
    },
    {
      id: "test_results",
      title: "3. Test Results by Interface",
      iecRef: "IEC 62304 §5.6.5",
      guidance:
        "For each interface tested, record: pass/fail verdict per test case, observed behaviour where it differs from expected, screenshot or log excerpt as objective evidence (reference attachment), and PR number for any failed test cases. Provide a pass rate summary per integration stage. Note any test cases that could not be executed (blocked) with justification.",
    },
    {
      id: "anomalies",
      title: "4. Anomalies and Problem Reports",
      iecRef: "IEC 62304 §9.1",
      guidance:
        "List all anomalies discovered during integration testing. For each: PR ID, test case ID, interface affected, description of failure, severity, root cause analysis summary, and disposition. Confirm all Critical and Major anomalies are resolved, regression-tested, and the fix verified before exit criteria are declared. Document accepted anomalies in the UAL with risk assessment.",
    },
    {
      id: "conclusion",
      title: "5. Conclusion and Approval",
      iecRef: "IEC 62304 §5.6.5",
      guidance:
        "State the overall conclusion — whether integration testing passed all exit criteria. Note any accepted deviations with justification. Provide approver name, role, and signature date. Reference this report in the Traceability Matrix and DHF. This report is a prerequisite for proceeding to Software System Testing (SVPROT/SVREP).",
    },
  ],

  SOUP: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §8.1.2, §7.1.3",
      guidance:
        "State the purpose of this SOUP List: to identify and document all Software of Unknown Provenance used in the product — third-party libraries, open-source components, operating system components, middleware, and any commercial off-the-shelf (COTS) software incorporated into the deliverable. State the product name, version, and safety class. Explain the evaluation criteria used to accept each SOUP component and the ongoing monitoring obligations.",
    },
    {
      id: "soup_entries",
      title: "2. SOUP Component Entries",
      iecRef: "IEC 62304 §8.1.2",
      guidance:
        "For each SOUP component, document the following fields: Component Name; Supplier/Author; Version or commit hash; Licence type (and confirm licence compatibility with the product's distribution model); Intended function within the product (how it is used); Software items that depend on it; Functional requirements placed on the SOUP (what behaviour is relied upon); Known anomaly list source (e.g., CVE database, supplier release notes, GitHub issues); Last anomaly list review date; Evaluation outcome (Accepted / Conditional / Rejected); and risk class contribution (does failure of this SOUP contribute to a hazardous situation?).",
    },
    {
      id: "evaluation_criteria",
      title: "3. SOUP Evaluation and Selection Criteria",
      iecRef: "IEC 62304 §7.1.3",
      guidance:
        "Define the criteria applied when selecting and evaluating SOUP components. Include: licence compatibility assessment; supplier reputation and support lifecycle; historical defect rate and known CVE severity history; availability and quality of documentation; compatibility with target platform; testability (can anomalies be detected by integration testing?); and availability of the anomaly list. For safety-class B/C: additionally assess whether the SOUP has been used in previously approved medical devices (documented market history) as evidence of reliability.",
    },
    {
      id: "anomaly_list_references",
      title: "4. Known Anomaly Lists and CVE Monitoring",
      iecRef: "IEC 62304 §7.1.3",
      guidance:
        "For each SOUP component, identify the authoritative source of its known anomaly list (e.g., CVE/NVD for open-source components, vendor release notes for commercial components). Document the review frequency (at minimum at each product release), the date of last review, and any anomalies identified that affect the product. For each relevant anomaly: CVE or issue ID, severity (CVSS score if applicable), impact assessment on product safety and functionality, and disposition (mitigated by code, accepted with justification, or drives a new risk control measure in ISO 14971 Risk File).",
    },
    {
      id: "change_history",
      title: "5. SOUP Change History",
      iecRef: "IEC 62304 §8.1.2",
      guidance:
        "Maintain a change log for this SOUP List. For each revision, record: revision number, date, component(s) added/updated/removed, reason for change (e.g., security patch, feature upgrade, licence change), impact assessment performed, re-integration testing reference, and approver. When a SOUP component is upgraded, confirm that the anomaly list was re-reviewed for the new version and that integration tests covering the SOUP were re-executed.",
    },
  ],

  CRR: [
    {
      id: "review_overview",
      title: "1. Review Overview and Identification",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Identify this code review record: CRR ID, product name, software item(s) reviewed, version or commit range, review date, review type (peer review, formal inspection, automated tool review), review author, and reviewer(s). Confirm that the reviewer is independent of the code author (required for Class C software items). State the review objectives: verify conformance to coding guidelines, design specification (SDDS), and IEC 62304 requirements.",
    },
    {
      id: "review_scope",
      title: "2. Review Scope and Checklist",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "Define the scope of this review: list the files, modules, or functions reviewed, and the total lines of code in scope. Reference the applicable coding guidelines (CG) version used as the review standard. Record the review checklist items checked, including: coding guideline compliance, naming conventions, complexity limits, error handling completeness, safety-critical constraint compliance, comment quality, and traceability (every function traceable to a SDDS section or SWR).",
    },
    {
      id: "findings",
      title: "3. Review Findings",
      iecRef: "IEC 62304 §5.5.3, §9.1",
      guidance:
        "List all findings raised during the review. For each finding: Finding ID, severity (Critical / Major / Minor / Observation), file name and line number, description of the issue, the guideline or requirement violated, and the recommended resolution. Critical findings (e.g., unhandled null pointer in safety-critical path, incorrect boundary check, deviation from mandatory coding constraint) must be resolved before the unit proceeds to unit testing. Minor findings and observations may be tracked as improvement items.",
    },
    {
      id: "resolution",
      title: "4. Finding Resolution Status",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "For each finding raised in Section 3, record the resolution: action taken by the developer, commit reference where the fix was applied, and date resolved. For findings dispositioned as 'Accepted — not fixed', provide a written justification and confirm that the residual risk is acceptable. All Critical findings must show a resolution commit reference. The reviewer must confirm that the resolution adequately addresses the finding before signing off.",
    },
    {
      id: "conclusion",
      title: "5. Review Conclusion and Approval",
      iecRef: "IEC 62304 §5.5.3",
      guidance:
        "State the review outcome: Pass (no open Critical or Major findings), Pass with Conditions (conditions specified and tracked), or Fail (must be re-reviewed after fixes). Record the reviewer's name, role, and date. For Class C items, both the reviewer and the QA representative must approve. Reference this CRR in the Traceability Matrix and DHF. Attach the automated static analysis report as supporting evidence.",
    },
  ],

  VDD: [
    {
      id: "version_identification",
      title: "1. Software Version Identification",
      iecRef: "IEC 62304 §5.8.2",
      guidance:
        "Uniquely identify the software version described in this document. Include: product name, version number (MAJOR.MINOR.PATCH following semantic versioning or your defined scheme), build number, release date, and source code baseline tag (commit hash or tag in version control). State the software safety class and applicable regulatory framework. This document is the authoritative record that links the installed version to all lifecycle artefacts.",
    },
    {
      id: "changes",
      title: "2. Changes Since Previous Version",
      iecRef: "IEC 62304 §5.8.2, §6.2.1",
      guidance:
        "Provide a complete list of changes included in this release relative to the immediately preceding released version. Categorise each change as: New Feature, Enhancement, Bug Fix (corrective maintenance), Security Fix, SOUP Update, or Regulatory/Compliance. For each change: unique Change ID or PR ID, brief description, affected software items, safety classification of the change (does it affect any safety-critical function?), and verification reference (test case ID that was executed to verify the change).",
    },
    {
      id: "known_limitations",
      title: "3. Known Limitations and Open Anomalies",
      iecRef: "IEC 62304 §5.8.3, §9.5",
      guidance:
        "Summarise the known limitations of this release. Reference the Unresolved Anomaly List (UAL) and list any anomalies that are present in this release with: UAL entry ID, brief description, conditions under which the anomaly occurs, severity, safety impact assessment (confirmed not a safety risk, or risk control measure applied), and planned resolution version. Confirm that all listed anomalies have been formally accepted by the Release Authority with documented justification.",
    },
    {
      id: "configuration_baseline",
      title: "4. Configuration Baseline",
      iecRef: "IEC 62304 §5.8.4, §8.1.3",
      guidance:
        "Identify the exact configuration that constitutes this release. Include: source code tag in version control, SOUP component versions (reference the SOUP List version), build tool versions, build environment specification (reference the SBD), and the set of lifecycle documents approved for this release (SRS, SADS, SDDS, SVPROT, SVREP, SUTR, SITR, UAL, all with version numbers). This baseline must be reproducible: the release binary must be regenerable from the source tag using the specified build environment.",
    },
    {
      id: "installation_notes",
      title: "5. Installation and Upgrade Notes",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Summarise any version-specific installation or upgrade considerations. Reference the full Software Installation Instructions (SII) for the complete procedure. Highlight: any breaking changes that affect upgrade compatibility, required database migration scripts, configuration parameter changes, dependencies on hardware firmware versions, and post-upgrade verification steps specific to this version. State the supported upgrade paths (e.g., direct upgrade supported from v2.x only; v1.x requires intermediate upgrade to v2.0 first).",
    },
    {
      id: "compatibility",
      title: "6. Compatibility and Qualification Notes",
      iecRef: "IEC 62304 §5.8.5",
      guidance:
        "Document the compatibility matrix for this release: supported hardware platforms and firmware versions, supported operating system versions, compatible versions of integrated external systems, and any known incompatibilities. For regulated markets, note the regulatory submission status (e.g., EU MDR technical file updated, FDA 510(k) not required for this change, CE mark maintained). Provide contact information for reporting post-market problems.",
    },
  ],

  RHL: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §8.1.3",
      guidance:
        "State the purpose of this Revision History Log: to provide a complete, chronological record of all approved changes to the software product and its associated lifecycle documents. This log supports configuration status accounting (IEC 62304 §8.1.3), demonstrates that all changes were controlled and approved, and provides an audit trail for regulatory inspections. Identify the product and the version range covered by this document.",
    },
    {
      id: "revision_table",
      title: "2. Revision History",
      iecRef: "IEC 62304 §8.1.3",
      guidance:
        "Maintain the revision history table with the following columns for each change: Revision / Version Number; Date; Author; Change Request or Problem Report reference (CR-NNN or PR-NNN); Brief description of change; Software items affected (modules, files, documents); Approval authority name and date. Entries must be added for every approved change, including: new feature implementation, defect corrections, SOUP updates, documentation updates, and regulatory-driven changes. Do not delete or modify past entries — this is a permanent record.",
    },
    {
      id: "document_revision_index",
      title: "3. Document Revision Index",
      iecRef: "IEC 62304 §8.1.3",
      guidance:
        "Provide a cross-reference table of all controlled lifecycle documents and their current approved revision, the date last revised, and the change that drove the last revision. This enables a reviewer to quickly determine whether any document is out of date relative to the current software version. Include: SDP, SRS, SADS, SDDS, SCP, SPRP, SVP, SBRP, SMP, SOUP List, all test protocols and reports, VDD, and UAL.",
    },
  ],

  UAL: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §5.8.1, §9.5",
      guidance:
        "Define the purpose of this Unresolved Anomaly List: to formally document all known software anomalies (defects, non-conformances, deviations from specification) that are present in the released software but have not been corrected in this release. IEC 62304 §5.8.1 requires that all anomalies be evaluated prior to release — this document provides the evidence that evaluation has been performed and that each unresolved anomaly has been accepted with justification. Identify the product name and version this list applies to.",
    },
    {
      id: "anomaly_entries",
      title: "2. Anomaly Entries",
      iecRef: "IEC 62304 §5.8.1, §9.5",
      guidance:
        "Document each unresolved anomaly with the following fields: Anomaly ID (PR-NNN); Date first identified; Source (unit test, integration test, system test, post-market); Description of the anomaly (observed behaviour vs. expected behaviour); Conditions under which it occurs (frequency, trigger conditions); Software item(s) affected; Severity (Critical / Major / Minor) — note: Critical anomalies must be resolved before release; Safety impact assessment (does this anomaly contribute to a hazardous situation?); Disposition (accepted with justification, workaround documented, deferred to next release); Planned resolution version; and Risk control measure applied (if safety impact is not None).",
    },
    {
      id: "risk_assessment",
      title: "3. Risk Assessment of Unresolved Anomalies",
      iecRef: "IEC 62304 §4.3, ISO 14971",
      guidance:
        "For each anomaly with a non-None safety impact, provide a formal risk assessment. Using the ISO 14971 risk framework, document: the hazardous situation that could result from the anomaly, the probability of occurrence (considering frequency of the triggering condition and the probability of harm given the condition), the severity of harm, the resulting risk level, and the risk control measure applied. Confirm that residual risk is acceptable per the project's risk acceptance criteria. This assessment must be reviewed and approved by the Risk Manager.",
    },
    {
      id: "acceptance_justification",
      title: "4. Acceptance Justification",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "For each anomaly accepted for release without correction, provide a written justification. Acceptable justifications include: the anomaly only occurs in configurations or usage modes that are outside the intended use; the anomaly has no impact on safety or effectiveness; a documented workaround is available and communicated to users; correction would require changes disproportionate to the benefit given the low risk; or correction is scheduled for the next planned release within an acceptable timeframe. Each justification must be reviewed and approved by the Quality Manager and (for safety-impacting anomalies) the Risk Manager.",
    },
    {
      id: "review_approval",
      title: "5. Review and Release Approval",
      iecRef: "IEC 62304 §5.8.1",
      guidance:
        "Record the formal review and approval of this UAL prior to release. Provide: reviewer name and role, review date, confirmation that all anomaly risk assessments have been reviewed, confirmation that no Critical safety anomalies are present, and approval to proceed to release. This approval is a mandatory prerequisite in the release readiness checklist (SBRP). Both the QA Manager and the designated Release Authority must sign off.",
    },
  ],

  TM: [
    {
      id: "scope_purpose",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304 §5.1.1 (c), §9.5",
      guidance:
        "Define the scope and purpose of this Traceability Matrix. IEC 62304 requires bidirectional traceability throughout the software development lifecycle: from system requirements down to software requirements, architectural design, detailed design, implementation, and test cases — and back upward to confirm nothing was implemented without a requirement and nothing was required without a test. Identify the product, version, and the lifecycle artefacts covered by this matrix. State how the matrix is maintained (manually in this document, or automatically extracted from the platform).",
    },
    {
      id: "req_to_design",
      title: "2. Requirements to Design Traceability",
      iecRef: "IEC 62304 §5.3.5, §5.4.4",
      guidance:
        "Provide a matrix linking each software requirement (SWR-NNN) to the architectural design element (SADS section or component name) that implements it, and further to the detailed design unit (SDDS section). For each row: SWR ID, requirement title, SADS component, SDDS unit, and coverage status (Covered / Partially Covered / Not Covered). All SWRs must be covered. Flag any SWR with no design allocation — these represent gaps that must be resolved before proceeding to implementation. The live design data from this platform can be exported to populate this section.",
    },
    {
      id: "req_to_test",
      title: "3. Requirements to Test Case Traceability",
      iecRef: "IEC 62304 §5.7.2, §5.5.3",
      guidance:
        "Provide a matrix linking each software requirement (SWR-NNN) to the test case(s) that verify it. For each row: SWR ID, requirement title, test case IDs (unit test, integration test, and/or system test), test type, and verification status (Not Tested / In Progress / Pass / Fail). All SWRs must have at least one test case. For safety-class C, confirm that each safety-critical SWR is covered by a system-level test case. Flag any SWR with no test case as a gap requiring resolution before the verification report (SVREP) can be approved.",
    },
    {
      id: "risk_to_req",
      title: "4. Risk Controls to Requirements Traceability",
      iecRef: "IEC 62304 §5.2.6, ISO 14971 §6.3",
      guidance:
        "Provide a matrix linking each software risk control measure (from the ISO 14971 Risk Management File) to the software requirement(s) that implement it, and to the test case(s) that verify the control is effective. For each row: Risk ID, hazard description, risk control measure description, implementing SWR ID(s), verification test case ID(s), and verification status. This matrix is critical evidence for the residual risk assessment — unverified risk controls cannot be counted as effective mitigations.",
    },
    {
      id: "traceability_summary",
      title: "5. Traceability Summary and Gap Analysis",
      iecRef: "IEC 62304 §9.5",
      guidance:
        "Summarise the traceability coverage metrics: total SWRs, percentage with design allocation, percentage with at least one test case, total risk controls, percentage verified. List all identified traceability gaps — SWRs without design allocation, SWRs without test cases, risk controls without verification — along with the responsible owner and planned resolution date. This summary is reviewed at each project milestone gate and must show 100% coverage before the software can be submitted for release.",
    },
  ],
};

// Generic fallback for other doc types that don't have defined sections
function buildGenericSection(docType: string): DocSection[] {
  return [
    {
      id: "scope",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304",
      guidance: `Describe the scope and purpose of this ${docType} document.`,
    },
    {
      id: "content",
      title: "2. Content",
      iecRef: "IEC 62304",
      guidance: "Enter the main content of this document.",
    },
    {
      id: "references",
      title: "3. References",
      iecRef: "IEC 62304",
      guidance: "List related documents, standards, and regulatory references.",
    },
  ];
}

function getSections(docType: string): DocSection[] {
  return SECTION_DEFS[docType] ?? buildGenericSection(docType);
}

// ── Status badge (inline) ─────────────────────────────────────────────────────
const STATUS_META: Record<DocumentStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: "Not Started", color: "#6b7280", bg: "#f3f4f6" },
  DRAFT:       { label: "Draft",       color: "#b45309", bg: "#fef3c7" },
  IN_REVIEW:   { label: "In Review",   color: "#1d4ed8", bg: "#dbeafe" },
  APPROVED:    { label: "Approved",    color: "#15803d", bg: "#dcfce7" },
  OBSOLETE:    { label: "Obsolete",    color: "#991b1b", bg: "#fee2e2" },
};

// ── Live requirements block (read-only, for SRS sections) ────────────────────

const REQ_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  USER:     { label: "USER",     color: "#1565c0", bg: "#e3f2fd" },
  SYSTEM:   { label: "SYSTEM",  color: "#2e7d32", bg: "#e8f5e9" },
  SOFTWARE: { label: "SOFTWARE",color: "#6a1b9a", bg: "#f3e5f5" },
};

function RequirementsListBlock({ projectId, reqType }: { projectId: string; reqType: "USER" | "SYSTEM" | "SOFTWARE" }) {
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    api.requirements.list(projectId, reqType)
      .then(r => { setReqs(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId, reqType]);

  const meta = REQ_TYPE_META[reqType] ?? REQ_TYPE_META.USER;

  return (
    <div style={{
      border: `1px solid ${meta.color}30`,
      borderRadius: 6,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        background: meta.bg,
        borderBottom: `1px solid ${meta.color}30`,
        padding: "8px 14px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          background: meta.color, color: "#fff",
          fontSize: 11, fontWeight: 700, borderRadius: 3, padding: "2px 8px",
        }}>{meta.label}</span>
        <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>
          Requirements — live from database
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {loading ? "loading…" : `${reqs.length} item${reqs.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 13 }}>Loading requirements…</div>
      ) : reqs.length === 0 ? (
        <div style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
          No {reqType} requirements found. Add them in the Requirements module.
        </div>
      ) : (
        reqs.map((r, i) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "8px 14px",
            background: i % 2 === 0 ? "#fff" : "#fafafa",
            borderBottom: i < reqs.length - 1 ? "1px solid #f3f4f6" : "none",
          }}>
            <span style={{
              fontFamily: "monospace", fontWeight: 700, fontSize: 12,
              color: meta.color, flexShrink: 0, minWidth: 72,
            }}>{r.readable_id}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{r.title}</div>
              {r.description && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{r.description}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Section editor (contentEditable) ─────────────────────────────────────────

function SectionEditor({
  section,
  initialHtml,
  onChange,
  onFocus,
  projectId,
}: {
  section: DocSection;
  initialHtml: string;
  onChange: (id: string, html: string) => void;
  onFocus: (id: string) => void;
  projectId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Set innerHTML once on mount from saved content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginBottom: 36, scrollMarginTop: 100 }} id={`sec-${section.id}`}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
          {section.title}
        </h2>
        <span style={{
          fontSize: 11, color: "#6b7280", background: "#f3f4f6",
          padding: "2px 8px", borderRadius: 4, fontFamily: "monospace",
        }}>
          {section.iecRef}
        </span>
      </div>

      {/* Guidance callout */}
      <div style={{
        background: "#f0f9ff", border: "1px solid #bae6fd",
        borderLeft: "3px solid #0ea5e9", borderRadius: "0 6px 6px 0",
        padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "#0c4a6e",
        lineHeight: 1.55,
      }}>
        {section.guidance}
      </div>

      {/* Live requirements list (SRS sections with reqFilter) */}
      {section.reqFilter && projectId && (
        <RequirementsListBlock projectId={projectId} reqType={section.reqFilter} />
      )}

      {/* Additional notes label for req sections */}
      {section.reqFilter && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          Additional Notes
        </div>
      )}

      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => onFocus(section.id)}
        onInput={() => {
          if (editorRef.current) onChange(section.id, editorRef.current.innerHTML);
        }}
        style={{
          minHeight: 120,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          padding: "12px 14px",
          fontSize: 14,
          lineHeight: 1.7,
          color: "#111827",
          outline: "none",
          background: "#fff",
          fontFamily: "Georgia, serif",
          cursor: "text",
        }}
        onFocusCapture={() => {
          if (editorRef.current) editorRef.current.style.border = "1px solid #3b82f6";
          if (editorRef.current) editorRef.current.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)";
        }}
        onBlurCapture={() => {
          if (editorRef.current) editorRef.current.style.border = "1px solid #d1d5db";
          if (editorRef.current) editorRef.current.style.boxShadow = "none";
        }}
        data-placeholder="Start writing this section…"
      />
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ onSave, saving, saved }: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  function cmd(command: string, value?: string) {
    document.execCommand(command, false, value ?? "");
  }

  const fmtBtn = (label: string, command: string, val?: string, title?: string) => (
    <button
      key={command + (val ?? "")}
      title={title ?? label}
      onMouseDown={e => { e.preventDefault(); cmd(command, val); }}
      style={toolbarBtnStyle}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: "#fff", borderBottom: "1px solid #e5e7eb",
      display: "flex", alignItems: "center", gap: 2, padding: "6px 20px",
      flexWrap: "wrap",
    }}>
      {/* Format buttons */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("B", "bold", undefined, "Bold (Ctrl+B)")}
        {fmtBtn("I", "italic", undefined, "Italic (Ctrl+I)")}
        {fmtBtn("U", "underline", undefined, "Underline (Ctrl+U)")}
      </div>

      <div style={dividerStyle} />

      {/* Block format */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("H1", "formatBlock", "h1", "Heading 1")}
        {fmtBtn("H2", "formatBlock", "h2", "Heading 2")}
        {fmtBtn("H3", "formatBlock", "h3", "Heading 3")}
        {fmtBtn("¶", "formatBlock", "p", "Normal paragraph")}
      </div>

      <div style={dividerStyle} />

      {/* Lists */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("• List", "insertUnorderedList", undefined, "Bullet list")}
        {fmtBtn("1. List", "insertOrderedList", undefined, "Numbered list")}
      </div>

      <div style={dividerStyle} />

      {/* Font size */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("A-", "fontSize", "2", "Small text")}
        {fmtBtn("A", "fontSize", "3", "Normal text")}
        {fmtBtn("A+", "fontSize", "5", "Large text")}
      </div>

      <div style={dividerStyle} />

      {fmtBtn("— Line", "insertHorizontalRule", undefined, "Horizontal rule")}

      {/* Save status */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {saved && !saving && (
          <span style={{ fontSize: 12, color: "#10b981" }}>✓ Saved</span>
        )}
        {!saved && !saving && (
          <span style={{ fontSize: 12, color: "#f59e0b" }}>Unsaved changes</span>
        )}
        {saving && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>Saving…</span>
        )}
        <button onClick={onSave} disabled={saving || saved} style={{
          ...actionBtnStyle,
          background: saved ? "#f3f4f6" : "#1e40af",
          color: saved ? "#9ca3af" : "#fff",
          cursor: saved ? "default" : "pointer",
        }}>
          Save
        </button>
      </div>
    </div>
  );
}

// ── Section nav (left panel) ──────────────────────────────────────────────────

function SectionNav({ sections, active, description }: {
  sections: DocSection[];
  active: string | null;
  description?: string | null;
}) {
  const [refOpen, setRefOpen] = useState(false);

  return (
    <nav style={{ position: "sticky", top: 50, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        Sections
      </div>
      {sections.map(s => (
        <a
          key={s.id}
          href={`#sec-${s.id}`}
          style={{
            display: "block", padding: "5px 10px", borderRadius: 6,
            fontSize: 13, color: active === s.id ? "#1e40af" : "#374151",
            background: active === s.id ? "#eff6ff" : "transparent",
            textDecoration: "none", borderLeft: `3px solid ${active === s.id ? "#3b82f6" : "transparent"}`,
            marginBottom: 2, lineHeight: 1.4,
          }}
        >
          {s.title}
        </a>
      ))}

      {description && (
        <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
          <button
            onClick={() => setRefOpen(o => !o)}
            style={{
              width: "100%", background: refOpen ? "#fffbeb" : "#fefce8",
              border: "1px solid #fcd34d", borderRadius: 6,
              padding: "7px 10px", cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 13 }}>📖</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#92400e", flex: 1 }}>
              IEC 62304 Reference
            </span>
            <span style={{ fontSize: 11, color: "#b45309" }}>{refOpen ? "▾" : "▸"}</span>
          </button>

          {refOpen && (
            <div style={{
              marginTop: 6, background: "#fffbeb",
              border: "1px solid #fde68a", borderRadius: 6,
              padding: "12px 12px",
              maxHeight: 480, overflowY: "auto",
            }}>
              <pre style={{
                margin: 0, fontSize: 11, color: "#374151",
                whiteSpace: "pre-wrap", fontFamily: "inherit",
                lineHeight: 1.65,
              }}>{description}</pre>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

// ── Preview overlay ───────────────────────────────────────────────────────────

function PreviewModal({
  doc,
  sections,
  content,
  onClose,
  onDownload,
}: {
  doc: Doc;
  sections: DocSection[];
  content: Record<string, string>;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(3px)", zIndex: 100,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "32px 16px", overflow: "auto",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 8, width: "100%", maxWidth: 820,
        boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
      }} onClick={e => e.stopPropagation()}>
        {/* Preview toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 20px", borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb", borderRadius: "8px 8px 0 0",
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: "#374151" }}>
            Preview — {doc.title}
          </span>
          <button onClick={onDownload} style={{ ...actionBtnStyle, background: "#1e40af", color: "#fff" }}>
            ↓ Download PDF
          </button>
          <button onClick={onClose} style={{ ...actionBtnStyle, background: "#f3f4f6", color: "#374151" }}>
            Close
          </button>
        </div>

        {/* Document content */}
        <div style={{ padding: "40px 48px" }}>
          {/* Document header */}
          <div style={{ borderBottom: "2px solid #1e40af", paddingBottom: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginBottom: 4 }}>
              {doc.doc_type}
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: 24, color: "#111827", fontWeight: 700 }}>
              {doc.title}
            </h1>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280" }}>
              {doc.version && <span>Version: {doc.version}</span>}
              <span>Status: {STATUS_META[doc.status as DocumentStatus]?.label ?? doc.status}</span>
            </div>
          </div>

          {/* Sections */}
          {sections.map(s => (
            <div key={s.id} style={{ marginBottom: 32 }}>
              <h2 style={{
                fontSize: 15, fontWeight: 700, color: "#1e3a5f",
                margin: "0 0 4px", borderBottom: "1px solid #e5e7eb", paddingBottom: 6,
              }}>
                {s.title}
              </h2>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginBottom: 10 }}>
                {s.iecRef}
              </div>
              {content[s.id] ? (
                <div
                  style={{ fontSize: 14, lineHeight: 1.8, color: "#374151", fontFamily: "Georgia, serif" }}
                  dangerouslySetInnerHTML={{ __html: content[s.id] }}
                />
              ) : (
                <p style={{ color: "#d1d5db", fontSize: 14, fontStyle: "italic", margin: 0 }}>
                  [Section not yet completed]
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main editor inner ─────────────────────────────────────────────────────────

function EditDocumentInner() {
  const params   = useSearchParams();
  const router   = useRouter();
  const docId    = params.get("id");

  const [doc, setDoc]         = useState<Doc | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(true);
  const [preview, setPreview] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    api.documents.get(docId).then(d => {
      setDoc(d);
      try {
        setContent(d.content ? JSON.parse(d.content) : {});
      } catch {
        setContent({});
      }
      setLoading(false);
    });
  }, [docId]);

  const handleChange = useCallback((sectionId: string, html: string) => {
    setContent(prev => ({ ...prev, [sectionId]: html }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!doc || saved) return;
    setSaving(true);
    try {
      const updated = await api.documents.update(doc.id, {
        content: JSON.stringify(content),
        status: doc.status === "NOT_STARTED" ? "DRAFT" : doc.status,
      });
      setDoc(updated);
      setSaved(true);
    } catch (e: any) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }, [doc, content, saved]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  function handleDownload() {
    if (!doc) return;
    const sections = getSections(doc.doc_type);
    const sectionHtml = sections.map(s => `
      <div class="section">
        <div class="sec-ref">${s.iecRef}</div>
        <h2>${s.title}</h2>
        ${content[s.id] || '<p class="empty">[Section not completed]</p>'}
      </div>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.title}</title>
  <style>
    @page { margin: 25mm 20mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; }
    .doc-header { border-bottom: 2pt solid #1e40af; padding-bottom: 12pt; margin-bottom: 28pt; }
    .doc-type { font-family: monospace; font-size: 9pt; color: #6b7280; margin-bottom: 4pt; }
    h1 { font-size: 20pt; margin: 0 0 6pt; color: #111827; }
    .meta { font-size: 10pt; color: #6b7280; }
    .section { margin-bottom: 28pt; page-break-inside: avoid; }
    .sec-ref { font-family: monospace; font-size: 8pt; color: #9ca3af; margin-bottom: 3pt; }
    h2 { font-size: 13pt; color: #1e3a5f; margin: 0 0 8pt; border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 4pt; }
    p { margin: 0 0 8pt; }
    ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
    li { margin-bottom: 3pt; }
    h3 { font-size: 11pt; font-weight: bold; margin: 10pt 0 4pt; }
    .empty { color: #d1d5db; font-style: italic; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-type">${doc.doc_type}</div>
    <h1>${doc.title}</h1>
    <div class="meta">
      ${doc.version ? `Version: ${doc.version} &nbsp;|&nbsp; ` : ""}
      Status: ${STATUS_META[doc.status as DocumentStatus]?.label ?? doc.status} &nbsp;|&nbsp;
      Generated: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
    </div>
  </div>
  ${sectionHtml}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Allow pop-ups to download as PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  if (loading || !doc) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#9ca3af" }}>
        {!docId ? "No document ID provided." : "Loading…"}
      </div>
    );
  }

  const sections = getSections(doc.doc_type);
  const smeta    = STATUS_META[doc.status as DocumentStatus] ?? STATUS_META.NOT_STARTED;
  const filled   = sections.filter(s => content[s.id]?.trim()).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Top header bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <Link href="/documents" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          ← Document Register
        </Link>
        <span style={{ color: "#d1d5db" }}>|</span>
        <span style={{
          fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 4,
        }}>{doc.doc_type}</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111827", flex: 1 }}>{doc.title}</span>

        <span style={{
          fontSize: 12, background: smeta.bg, color: smeta.color,
          padding: "3px 10px", borderRadius: 20, fontWeight: 600,
        }}>{smeta.label}</span>

        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {filled}/{sections.length} sections filled
        </span>

        <button onClick={() => setPreview(true)} style={{ ...actionBtnStyle, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>
          Preview
        </button>
        <button onClick={handleDownload} style={{ ...actionBtnStyle, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
          ↓ Download PDF
        </button>
      </div>

      {/* Format toolbar */}
      <Toolbar onSave={handleSave} saving={saving} saved={saved} />

      {/* Body */}
      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "28px 24px", gap: 32 }}>
        {/* Section nav */}
        <div style={{ width: 210, flexShrink: 0 }}>
          <SectionNav sections={sections} active={activeSection} description={doc.description} />
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {sections.map(s => (
            <SectionEditor
              key={s.id}
              section={s}
              initialHtml={content[s.id] ?? ""}
              onChange={handleChange}
              onFocus={setActiveSection}
              projectId={doc.project_id}
            />
          ))}

          {/* Bottom save */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
            <button onClick={handleSave} disabled={saving || saved} style={{
              ...actionBtnStyle, fontSize: 14, padding: "9px 24px",
              background: saved ? "#f3f4f6" : "#1e40af",
              color: saved ? "#9ca3af" : "#fff",
              cursor: saved ? "default" : "pointer",
            }}>
              {saving ? "Saving…" : saved ? "Saved" : "Save Document"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          doc={doc}
          sections={sections}
          content={content}
          onClose={() => setPreview(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

export default function EditDocumentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <EditDocumentInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const toolbarBtnStyle: React.CSSProperties = {
  padding: "4px 9px", border: "1px solid #e5e7eb", borderRadius: 5,
  background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13,
  fontWeight: 500, lineHeight: 1.4, minWidth: 28, textAlign: "center",
};
const actionBtnStyle: React.CSSProperties = {
  padding: "6px 14px", border: "none", borderRadius: 6,
  cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const dividerStyle: React.CSSProperties = {
  width: 1, height: 20, background: "#e5e7eb", margin: "0 4px", flexShrink: 0,
};
