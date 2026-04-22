import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import Document
from .schema import DocumentCreate, DocumentRead, DocumentUpdate

router = APIRouter(prefix="/documents", tags=["documents"])

# Default tags per document type
DEFAULT_TAGS: dict[str, list[str]] = {
    # Plans
    "SDP":    ["IEC62304", "ISO13485"],
    "SMP":    ["IEC62304", "ISO13485"],
    "SPRP":   ["IEC62304"],
    "SCP":    ["IEC62304", "ISO13485"],
    "SVP":    ["IEC62304"],
    "SBRP":   ["IEC62304", "ISO13485"],
    # Technical
    "SRS":    ["IEC62304"],
    "SADS":   ["IEC62304"],
    "SDDS":   ["IEC62304"],
    "SVPROT": ["IEC62304"],
    "SVREP":  ["IEC62304"],
    # Development
    "SBD":  ["IEC62304"],
    "SII":  ["IEC62304"],
    "CG":   ["IEC62304"],
    "SUTP": ["IEC62304"],
    "SUTR": ["IEC62304"],
    "SITP": ["IEC62304"],
    "SITR": ["IEC62304"],
    "SOUP": ["IEC62304"],
    "CRR":  ["IEC62304"],
    "VDD":  ["IEC62304"],
    "RHL":  ["IEC62304"],
    "UAL":  ["IEC62304"],
    "TM":   ["IEC62304"],
    # SOPs
    "SOP-001": ["IEC62304", "ISO13485"],
    "SOP-002": ["IEC62304"],
    "SOP-003": ["IEC62304"],
    "SOP-004": ["IEC62304"],
    "SOP-005": ["IEC62304"],
    "SOP-006": ["IEC62304"],
    "SOP-007": ["IEC62304"],
    "SOP-008": ["IEC62304", "ISO13485"],
    "SOP-009": ["IEC62304", "ISO13485"],
    "SOP-010": ["IEC62304", "ISO14971"],
    "SOP-011": ["IEC62304", "ISO13485"],
    "SOP-012": ["IEC62304", "ISO13485"],
}

# Canonical document registry — seeded on first project access
DOCUMENT_REGISTRY = [
    # Plans
    {"doc_type": "SDP",   "category": "PLANS",       "title": "Software Development Plan"},
    {"doc_type": "SMP",   "category": "PLANS",       "title": "Software Maintenance Plan"},
    {"doc_type": "SPRP",  "category": "PLANS",       "title": "Software Problem Resolution Plan"},
    {"doc_type": "SCP",   "category": "PLANS",       "title": "Software Configuration Plan"},
    {"doc_type": "SVP",   "category": "PLANS",       "title": "Software Verification Plan"},
    {"doc_type": "SBRP",  "category": "PLANS",       "title": "Software Build and Release Plan"},
    # Technical Documents
    {"doc_type": "SRS",   "category": "TECHNICAL",   "title": "Software Requirements Specification"},
    {"doc_type": "SADS",  "category": "TECHNICAL",   "title": "Software Architecture Design Specification"},
    {"doc_type": "SDDS",  "category": "TECHNICAL",   "title": "Software Detailed Design Specification"},
    {"doc_type": "SVPROT","category": "TECHNICAL",   "title": "Software Verification Protocol"},
    {"doc_type": "SVREP", "category": "TECHNICAL",   "title": "Software Verification Report"},
    # Development Documents
    {"doc_type": "SBD",   "category": "DEVELOPMENT", "title": "Software Build Document"},
    {"doc_type": "SII",   "category": "DEVELOPMENT", "title": "Software Installation Instructions"},
    {"doc_type": "CG",    "category": "DEVELOPMENT", "title": "Coding Guidelines"},
    {"doc_type": "SUTP",  "category": "DEVELOPMENT", "title": "Software Unit Test Protocol"},
    {"doc_type": "SUTR",  "category": "DEVELOPMENT", "title": "Software Unit Test Report"},
    {"doc_type": "SITP",  "category": "DEVELOPMENT", "title": "Software Integration Test Protocol"},
    {"doc_type": "SITR",  "category": "DEVELOPMENT", "title": "Software Integration Test Report"},
    {"doc_type": "SOUP",  "category": "DEVELOPMENT", "title": "SOUP List"},
    {"doc_type": "CRR",   "category": "DEVELOPMENT", "title": "Code Review Report"},
    {"doc_type": "VDD",   "category": "DEVELOPMENT", "title": "Version Description Document"},
    {"doc_type": "RHL",   "category": "DEVELOPMENT", "title": "Revision History Log"},
    {"doc_type": "UAL",   "category": "DEVELOPMENT", "title": "Unresolved Anomaly List"},
    {"doc_type": "TM",    "category": "DEVELOPMENT", "title": "Traceability Matrix"},
    # SOPs — aligned to IEC 62304:2006+A1:2016 clauses
    {
        "doc_type": "SOP-001", "category": "SOP",
        "title": "SOP: Software Development Planning",
        "description": (
            "IEC 62304 §5.1 — Software Development Planning\n\n"
            "PURPOSE: Establish and document a Software Development Plan (SDP) before development begins. "
            "The plan must address: software development lifecycle model, deliverables and their reviews, "
            "traceability methods, required standards and methods, configuration management approach, "
            "risk management activities, and problem resolution process.\n\n"
            "SCOPE: Applies to all software of safety class A, B, and C.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Define the SDLC model (waterfall, iterative, agile-gated) appropriate to the project.\n"
            "2. Identify all software items and their safety classification (Class A/B/C).\n"
            "3. Document standards, methods, and tools to be used (e.g., coding standards, review checklists).\n"
            "4. Plan integration with the system-level risk management process (ISO 14971).\n"
            "5. Establish a schedule with milestones for each lifecycle phase.\n"
            "6. Define deliverables, their content, and approval criteria.\n\n"
            "EXAMPLE CONTENT: SDP sections should include: Project overview, Software safety classification "
            "rationale, SDLC phases and entry/exit criteria, Roles and responsibilities, Traceability plan "
            "(URQ→SYS→SW→design→test), Configuration management approach, Risk management integration.\n\n"
            "OUTPUT: Approved Software Development Plan (SDP) document."
        ),
    },
    {
        "doc_type": "SOP-002", "category": "SOP",
        "title": "SOP: Software Requirements Analysis",
        "description": (
            "IEC 62304 §5.2 — Software Requirements Analysis\n\n"
            "PURPOSE: Define, document, and review the software requirements derived from the system "
            "requirements and risk control measures. Requirements must be testable, unambiguous, and traceable.\n\n"
            "SCOPE: All software safety classes. Class C requires formal review and approval.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Transform system requirements (SYS) into software requirements (SWR) with full traceability.\n"
            "2. Include functional, performance, interface, safety, and regulatory requirements.\n"
            "3. Document requirements for SOUP (Software of Unknown Provenance) components.\n"
            "4. Identify risk control measures that impose software requirements (from ISO 14971 risk file).\n"
            "5. Conduct requirements review — check completeness, correctness, testability, consistency.\n"
            "6. Obtain approval before proceeding to design.\n\n"
            "EXAMPLE CONTENT: Each SWR should specify: unique ID (SWR-NNN), description, source "
            "(system req or risk control), acceptance criterion, safety class impact, and test method.\n\n"
            "OUTPUT: Approved Software Requirements Specification (SRS)."
        ),
    },
    {
        "doc_type": "SOP-003", "category": "SOP",
        "title": "SOP: Software Architectural Design",
        "description": (
            "IEC 62304 §5.3 — Software Architectural Design\n\n"
            "PURPOSE: Transform software requirements into a documented software architecture that identifies "
            "all software items, their interfaces, and the segregation of safety-critical components.\n\n"
            "SCOPE: Required for Class B and C. Class A: simplified architecture documentation acceptable.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Partition software into software items (modules, components, subsystems).\n"
            "2. Define interfaces between software items and with external hardware/systems.\n"
            "3. Identify software items that implement risk control measures — mark as safety-critical.\n"
            "4. Ensure segregation: Class C items must be isolated from lower-class items.\n"
            "5. Document the architecture in SADS (Software Architecture Design Specification).\n"
            "6. Verify architecture satisfies all software requirements — update traceability matrix.\n\n"
            "EXAMPLE CONTENT: Architecture diagram, component list with safety class, interface table, "
            "SOUP dependency list, architectural decisions and rationale, requirements-to-component mapping.\n\n"
            "OUTPUT: Approved Software Architecture Design Specification (SADS)."
        ),
    },
    {
        "doc_type": "SOP-004", "category": "SOP",
        "title": "SOP: Software Detailed Design",
        "description": (
            "IEC 62304 §5.4 — Software Detailed Design\n\n"
            "PURPOSE: Elaborate the software architecture into detailed designs for each software unit, "
            "with sufficient detail that the unit can be implemented and verified without further design.\n\n"
            "SCOPE: Required for Class B and C software items.\n\n"
            "KEY ACTIVITIES:\n"
            "1. For each software item identified in architecture, produce unit-level design.\n"
            "2. Specify unit interfaces, data structures, algorithms, and error handling.\n"
            "3. Identify SOUP components and document their functional requirements and anomaly lists.\n"
            "4. Document external interfaces (hardware drivers, APIs, protocols).\n"
            "5. Review detailed design for correctness, completeness, and testability.\n"
            "6. Update traceability: SWR → Architecture → Unit design.\n\n"
            "EXAMPLE CONTENT: SDDS sections per module: purpose, inputs/outputs, data flow, error conditions, "
            "pseudocode or flowcharts, database schema, API contracts, coding constraints.\n\n"
            "OUTPUT: Approved Software Detailed Design Specification (SDDS)."
        ),
    },
    {
        "doc_type": "SOP-005", "category": "SOP",
        "title": "SOP: Software Unit Implementation & Verification",
        "description": (
            "IEC 62304 §5.5 — Software Unit Implementation and Verification\n\n"
            "PURPOSE: Implement software units according to the detailed design and verify each unit "
            "meets its design before integration. Includes code reviews and unit testing.\n\n"
            "SCOPE: Class B and C: formal unit testing and review required. Class A: verification at discretion.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Implement each unit following documented coding guidelines (naming, structure, defensiveness).\n"
            "2. Conduct code review against detailed design — document findings in Code Review Report (CRR).\n"
            "3. Perform unit testing: define test cases from unit design, execute, record results in SUTR.\n"
            "4. For Class C: additionally apply one or more of: branch coverage analysis, data/control flow "
            "analysis, or static analysis.\n"
            "5. Resolve all critical findings before integration.\n"
            "6. Document acceptable anomalies in Unresolved Anomaly List (UAL).\n\n"
            "EXAMPLE CONTENT: Unit test protocol must include: test ID, unit under test, input conditions, "
            "expected output, pass/fail criteria, actual result, and tester signature.\n\n"
            "OUTPUT: Code Review Report (CRR), Software Unit Test Protocol (SUTP), Software Unit Test Report (SUTR)."
        ),
    },
    {
        "doc_type": "SOP-006", "category": "SOP",
        "title": "SOP: Software Integration & Integration Testing",
        "description": (
            "IEC 62304 §5.6 — Software Integration and Integration Testing\n\n"
            "PURPOSE: Integrate software units/items into the complete software system according to the "
            "integration plan, and verify that integrated items work correctly together.\n\n"
            "SCOPE: All safety classes. Rigor scales with class (A: informal, B/C: formal protocols).\n\n"
            "KEY ACTIVITIES:\n"
            "1. Define integration strategy: bottom-up, top-down, or incremental build sequence.\n"
            "2. Create Software Integration Test Protocol (SITP) covering interface tests and error paths.\n"
            "3. Execute integration tests, record results in Software Integration Test Report (SITR).\n"
            "4. Test all software item interfaces — verify data formats, timing, error propagation.\n"
            "5. Verify SOUP components behave as documented in their anomaly lists.\n"
            "6. Resolve integration anomalies; document unresolved items in UAL with justification.\n\n"
            "EXAMPLE CONTENT: SITP should cover: interface test cases, boundary conditions, error injection, "
            "SOUP integration checks, performance under load, regression tests after defect fixes.\n\n"
            "OUTPUT: Software Integration Test Protocol (SITP), Software Integration Test Report (SITR)."
        ),
    },
    {
        "doc_type": "SOP-007", "category": "SOP",
        "title": "SOP: Software System Testing",
        "description": (
            "IEC 62304 §5.7 — Software System Testing\n\n"
            "PURPOSE: Test the complete software system against all software requirements, including "
            "functional, performance, safety, and regulatory requirements.\n\n"
            "SCOPE: All safety classes. Class C: requires formal protocol with traceability to all SWRs.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Develop Software Verification Plan (SVP) covering all test approaches for system-level verification.\n"
            "2. Create Software Verification Protocol (SVPROT) with test cases traceable to each SWR.\n"
            "3. Execute tests in a controlled environment that represents the intended use environment.\n"
            "4. Record all results in Software Verification Report (SVREP) — pass/fail with evidence.\n"
            "5. Verify all risk control measures have been tested (link to risk register).\n"
            "6. Regression test after any defect correction.\n"
            "7. Confirm 100% requirements coverage before release.\n\n"
            "EXAMPLE CONTENT: Each test case must trace to one or more SWRs. Test environment must be "
            "documented. Deviations require non-conformance report (NCR) and disposition.\n\n"
            "OUTPUT: Approved Software Verification Protocol (SVPROT) and Software Verification Report (SVREP)."
        ),
    },
    {
        "doc_type": "SOP-008", "category": "SOP",
        "title": "SOP: Software Release",
        "description": (
            "IEC 62304 §5.8 — Software Release\n\n"
            "PURPOSE: Ensure all verification activities are complete, document the released software "
            "version, and archive all development artifacts for the Design History File (DHF).\n\n"
            "SCOPE: All safety classes. Formal release record required for all classes.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Confirm all planned verification activities are complete and documented.\n"
            "2. Confirm all known anomalies are evaluated — critical ones resolved, others documented in UAL.\n"
            "3. Create Version Description Document (VDD): software version, build configuration, "
            "known limitations, installation instructions.\n"
            "4. Archive all lifecycle documents in the DHF: SDP, SRS, SADS, SDDS, SUTR, SITR, SVREP, UAL, VDD.\n"
            "5. Obtain formal release approval (electronic signature from authorized personnel).\n"
            "6. Tag the software baseline in the version control system.\n\n"
            "EXAMPLE CONTENT: Release checklist should cover: verification complete?, anomalies evaluated?, "
            "VDD created?, DHF archived?, regulatory submission ready?, configuration baseline tagged?\n\n"
            "OUTPUT: Approved Version Description Document (VDD), Release record, DHF archive."
        ),
    },
    {
        "doc_type": "SOP-009", "category": "SOP",
        "title": "SOP: Software Maintenance",
        "description": (
            "IEC 62304 §6 — Software Maintenance\n\n"
            "PURPOSE: Establish a maintenance plan to manage post-release software modifications, "
            "monitor field feedback, evaluate impact of changes, and implement modifications safely.\n\n"
            "SCOPE: All safety classes. Triggered by: user feedback, defect reports, regulatory changes, "
            "OS/SOUP updates, or intentional improvements.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Establish and maintain a Software Maintenance Plan (SMP) before product release.\n"
            "2. Monitor customer feedback and field reports for safety-related issues.\n"
            "3. For each modification: classify as bug-fix or enhancement; assess impact on safety class.\n"
            "4. Conduct impact analysis: which requirements, design elements, and tests are affected?\n"
            "5. If a modification affects safety: re-execute relevant portions of the SDLC.\n"
            "6. Update all affected lifecycle documents; archive updated DHF.\n"
            "7. Communicate changes to users as required by regulations.\n\n"
            "EXAMPLE CONTENT: Maintenance log entries: date, problem/change description, root cause, "
            "impact assessment, fix summary, verification performed, documents updated, release version.\n\n"
            "OUTPUT: Updated SMP, Problem Reports, Change Requests, updated DHF for each maintenance release."
        ),
    },
    {
        "doc_type": "SOP-010", "category": "SOP",
        "title": "SOP: Software Risk Management",
        "description": (
            "IEC 62304 §7 — Software Risk Management (in context of ISO 14971)\n\n"
            "PURPOSE: Identify software contributions to hazardous situations, define and implement "
            "software risk control measures, and verify their effectiveness.\n\n"
            "SCOPE: All software items that contribute to hazardous situations (typically Class B and C).\n\n"
            "KEY ACTIVITIES:\n"
            "1. Participate in system-level risk analysis (ISO 14971 FMEA/FTA) to identify software-caused hazards.\n"
            "2. Analyse software items for potential failure modes (incorrect output, timing failure, crash).\n"
            "3. Define software risk control measures — translate into software requirements (SWR).\n"
            "4. Evaluate risk control measures for effectiveness and potential new risks introduced.\n"
            "5. Document software risk items in the project Risk Register with severity × probability.\n"
            "6. Verify all risk control measures are implemented and tested (trace risk → SWR → test).\n"
            "7. Review residual risk — confirm overall residual risk is acceptable.\n\n"
            "EXAMPLE CONTENT: Risk item record: Hazard ID, hazardous situation, software failure mode, "
            "severity (1-5), probability (1-5), risk level, control measure, verification reference, status.\n\n"
            "OUTPUT: Software risk items in Risk Register, Risk Control Measures documented as SWRs, "
            "verified in SVREP."
        ),
    },
    {
        "doc_type": "SOP-011", "category": "SOP",
        "title": "SOP: Software Configuration Management",
        "description": (
            "IEC 62304 §8 — Software Configuration Management\n\n"
            "PURPOSE: Identify, control, and track all software configuration items; manage changes "
            "in a controlled manner; ensure reproducibility of any released software build.\n\n"
            "SCOPE: All safety classes. The formality scales with class — Class C requires full CM.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Identify all configuration items (CIs): source code, build scripts, test scripts, "
            "third-party libraries (SOUP), documentation, and tools.\n"
            "2. Establish version control: unique version identifiers for each CI and each baseline.\n"
            "3. Document a Software Configuration Plan (SCP) — tools, branching strategy, baselines.\n"
            "4. Control changes: all changes go through Change Request (CR) process before implementation.\n"
            "5. Maintain configuration status accounting: current status of all CIs and baselines.\n"
            "6. Perform configuration audits at release: verify build reproduces exactly from tagged baseline.\n"
            "7. Maintain SOUP List with version, license, known anomalies, and verification evidence.\n\n"
            "EXAMPLE CONTENT: CM plan defines: repository structure, branch naming (main/dev/release), "
            "tag format (v1.2.3), baseline names, SOUP tracking spreadsheet, audit checklist.\n\n"
            "OUTPUT: Software Configuration Plan (SCP), SOUP List, Revision History Log (RHL), "
            "configuration audit records."
        ),
    },
    {
        "doc_type": "SOP-012", "category": "SOP",
        "title": "SOP: Software Problem Resolution",
        "description": (
            "IEC 62304 §9 — Software Problem Resolution\n\n"
            "PURPOSE: Establish a process for reporting, investigating, classifying, and resolving "
            "software problems found during development or post-release. Ensure problems are evaluated "
            "for safety impact and feedback loops inform risk management.\n\n"
            "SCOPE: All safety classes. All anomalies must be tracked; safety-related ones require "
            "formal evaluation and may trigger regulatory reporting.\n\n"
            "KEY ACTIVITIES:\n"
            "1. Prepare a Problem Report (PR) for every anomaly found in review, testing, or field use.\n"
            "2. Classify each problem: severity (Critical/Major/Minor), safety impact (Yes/No), "
            "and source (design, code, requirements, SOUP).\n"
            "3. Investigate root cause; record findings in the PR.\n"
            "4. Determine disposition: fix in current release, fix in next release, or accept with rationale.\n"
            "5. For safety-critical problems: notify risk management team; update risk register if needed.\n"
            "6. Implement fix; re-verify affected functionality; update UAL if not fixed.\n"
            "7. Advise customers of safety-related problems per regulatory requirements (MDR/FDA 21 CFR 806).\n\n"
            "EXAMPLE CONTENT: PR fields: PR-ID, date, reporter, description, reproduction steps, severity, "
            "safety impact, root cause, fix description, fix version, verification reference, closure date.\n\n"
            "OUTPUT: Problem Reports, updated UAL, Corrective Actions, updated Risk Register if applicable."
        ),
    },
]


async def _ensure_documents(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Seed all canonical document records for a project if not present yet."""
    existing_rows = (
        await db.execute(
            select(Document).where(Document.project_id == project_id)
        )
    ).scalars().all()
    existing_map = {doc.doc_type: doc for doc in existing_rows}
    for entry in DOCUMENT_REGISTRY:
        default_tags = DEFAULT_TAGS.get(entry["doc_type"], [])
        if entry["doc_type"] not in existing_map:
            db.add(Document(
                project_id=project_id,
                doc_type=entry["doc_type"],
                category=entry["category"],
                title=entry["title"],
                status="NOT_STARTED",
                description=entry.get("description"),
                tags=default_tags,
            ))
        else:
            doc = existing_map[entry["doc_type"]]
            if doc.description is None and entry.get("description"):
                doc.description = entry["description"]
            if not doc.tags and default_tags:
                doc.tags = default_tags


@router.get("/", response_model=list[DocumentRead])
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_documents(db, project_id)
    await db.commit()
    q = select(Document).where(Document.project_id == project_id)
    if category:
        q = q.where(Document.category == category.upper())
    q = q.order_by(Document.category, Document.doc_type)
    return (await db.execute(q)).scalars().all()


@router.get("/{doc_id}", response_model=DocumentRead)
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.post("/", response_model=DocumentRead, status_code=201)
async def create_document(body: DocumentCreate, db: AsyncSession = Depends(get_db)):
    doc = Document(**body.model_dump())
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.put("/{doc_id}", response_model=DocumentRead)
async def update_document(doc_id: uuid.UUID, body: DocumentUpdate, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.delete(doc)
    await db.commit()
