# Verification (§5.5, §5.6, §5.7)

IEC 62304 splits verification into three levels matching the architecture decomposition. Each has its own register, its own results, and its own coverage rollup.

## §5.5 Unit Verification

Unit-level implementation and verification of the lowest level of the software architecture.

**Develop → Verification → Unit Verification**

A **Software Unit** is a piece of the implementation that gets verified in isolation. Each unit has:

- **Name** — typically the module / class / function name in the code.
- **Component** — the §5.3 SWComponent this unit lives inside.
- **Programming language** — Python / C / TypeScript / etc.
- **Repository URL** — link to the code.
- **File path** — source location.
- **Safety class** — A / B / C (Class C units require formal unit tests; Class A/B may use review).
- **Status** — DRAFT / IMPLEMENTED / VERIFIED.

Each unit can have:

- **Code artifacts** — commits, build outputs, review records.
- **Unit test cases** — named tests with expected outcome.
- **Linked requirements / risks** — what the unit implements.

### Recording a unit-test result

From a unit's detail panel, expand a test case and click `Record Result`. Choose PASS / FAIL / BLOCKED, paste output or evidence, and save. The latest result drives the unit's status chip.

## §5.6 Integration Tests

Verification that components work together across their interfaces.

**Develop → Verification → Integration Tests**

Each **IntegrationTestCase** is scoped to a §5.3 interface:

- **Interface** — which interface this test exercises.
- **Test type** — FUNCTIONAL / PERFORMANCE / SAFETY / etc.
- **Latency threshold (ms)** — optional perf budget; readiness check fails if exceeded.
- **Linked requirements / risks** — what the test covers.

Record results the same way as units. The **Coverage** view shows per-interface coverage rollups.

## §5.7 System Testing

End-to-end behaviour testing at the system level — what an external auditor or user would test.

**Develop → Verification → System Testing & Release**

Each **SystemTestCase** covers one or more requirements:

- **Primary requirement** — the main SYSTEM or SOFTWARE requirement under test.
- **Additional requirements** — other requirements also covered.
- **Test type** — FUNCTIONAL / PERFORMANCE / SAFETY / USABILITY / REGRESSION / SECURITY.
- **Safety relevance** — boolean flag; safety-relevant tests are surfaced separately in the readiness check.
- **Preconditions / Test steps / Expected result** — the test plan.

Record results: PASS / FAIL with logs + actual result + executed-by signature.

### Coverage rollup

**System Testing → tab "Coverage"** shows:

```
Total requirements (SYSTEM + SOFTWARE):  25
Covered:                                 25  (100.0%)
Uncovered:                                0
Total system tests:                      25
Passed:                                  25  (100.0%)
Failed:                                   0
Not run:                                  0
```

USER requirements are excluded from this rollup — they're validated, not system-tested. See [Validation Records](#validation-records-vs-verification) below.

### Release readiness

For a given release, the platform computes a multi-gate readiness check:

```
Gate                                    Status   Detail
──────────────────────────────────────────────────────
SDP                                       ✓      v1.0 APPROVED
SRS composite baseline                    ✓      v1.0 APPROVED
Architecture baseline                     ✓      v1.0 APPROVED
SYSTEM/SOFTWARE coverage                  ✓      25/25 covered
System tests passing                      ✓      All passing
USER requirements validated               ✓      10/10 PASSED
Interface coverage (§5.6)                 ✓      3/3 covered
Class C unit verification                 ✓      All Class C units verified
Risks under control (§7)                  ✓      No OPEN HIGH risks
CAPA gate                                 ✓      No unresolved CAPAs
Configuration management gate (§8)        ✓      Pre-release baseline locked
```

All gates must be green before the release can move to RELEASED. The platform blocks the transition otherwise.

## Validation Records (vs. Verification)

**Verification** answers: *Was the software built correctly?* (Tests against the spec — §5.5/§5.6/§5.7.)

**Validation** answers: *Did we build the right software?* (Confirmation that USER requirements are actually met — typically clinical or usability evidence.)

**Develop → Traceability → Validation Records**

Each ValidationRecord links to **one USER requirement** and carries a description + status (PLANNED / PASSED / FAILED). Records are surfaced separately from the verification tests because USER requirements aren't system-tested — they're validated through clinical study, usability testing, etc.

## V-Model Tree

**Develop → Traceability → V-Model Tree**

A collapsible tree that walks each USER requirement down to its SYSTEM children, then SOFTWARE children, with their design elements + system tests + latest results at each leaf. Risks are inlined at every level.

This is the single best view auditors use to confirm coverage.

## IEC 62304 mapping

| Activity | IEC clause |
|---|---|
| Define software units | §5.5.1 |
| Unit verification (test or review per Class) | §5.5.2 |
| Unit acceptance criteria | §5.5.3 |
| Integration testing | §5.6.1 – §5.6.3 |
| Anomaly evaluation | §5.6.7 |
| System testing | §5.7.1 |
| Anomaly evaluation in system testing | §5.7.2 |
| Verification of software system test sufficiency | §5.7.4 |
