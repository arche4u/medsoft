const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("medsoft_auth") ?? "null")?.access_token ?? null; }
  catch { return null; }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("medsoft_auth");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Core types ────────────────────────────────────────────────────────────────
export type Project     = { id: string; name: string; description: string | null; created_at: string };
export type ReqType     = string;  // open: USER | SYSTEM | SOFTWARE | custom
export type RequirementCategory = {
  id: string; project_id: string;
  name: string; label: string; color: string;
  is_builtin: boolean; sort_order: number;
  /** Used to generate readable_ids (URQ-001, REG-001…). Optional on read
   *  for legacy rows; new categories should set it explicitly. */
  readable_id_prefix: string | null;
  parent_id: string | null;
};
export type Requirement = {
  id: string; project_id: string; type: string; readable_id: string;
  parent_id: string | null; title: string; description: string | null;
  /** Cross-category change-impact: set when an ancestor was edited. */
  needs_review?: boolean;
  needs_review_reason?: string | null;
  created_at: string;
};

/** Returned by GET /requirements/{id}/impact-preview — descendants that would
 *  be flagged needs_review if this requirement is edited. */
export type ChangeImpactPreview = {
  requirement_id: string;
  readable_id: string;
  type: string;
  descendants: {
    id: string;
    readable_id: string;
    type: string;
    title: string;
    needs_review: boolean;
  }[];
  total: number;
  by_type: Record<string, number>;
};
export type Risk = {
  id: string; requirement_id: string; category_id: string | null;
  title: string | null; hazard: string; hazardous_situation: string; harm: string;
  severity: number; probability: number; risk_level: string; mitigation: string | null;
  status: string; evaluation_notes: string | null; re_evaluation_required: boolean;
  controls: RiskControl[]; residual_risk: ResidualRisk | null;
};
export type RiskControl = {
  id: string; risk_id: string; control_type: string; description: string;
  requirement_id: string | null; system_test_id: string | null;
  implementation_status: string; verification_notes: string | null;
  created_at: string; updated_at: string;
};
export type ResidualRisk = {
  id: string; risk_id: string; severity: number; probability: number; risk_level: string;
  rationale: string | null; is_accepted: boolean; accepted_by: string | null;
  accepted_at: string | null; created_at: string; updated_at: string;
};
export type RiskDashboard = {
  total: number; by_level: Record<string, number>; by_status: Record<string, number>;
  re_evaluation_count: number; heatmap: { severity: number; probability: number; count: number }[];
  controls_total: number; controls_verified: number; residual_accepted: number;
};
export type SafetyProfile = {
  id: string; project_id: string;
  iec62304_class: string;
  classification_rationale: string | null;
  rpn_scale: number;
  severity_definitions: string | null;
  probability_definitions: string | null;
  iso14971_aligned: boolean;
  software_failure_assumption: boolean;
  sdp_section_reference: string | null;
  approved_by: string | null;
  review_date: string | null;
  created_at: string; updated_at: string;
};

// ── Phase 2 types ─────────────────────────────────────────────────────────────
// IEC 62304 §5.4 detailed design — each element details a §5.3 SWComponent
// (component_id) and may sub-nest under another element of the same component.
export type DesignElement     = { id: string; project_id: string; component_id: string; parent_id: string | null; readable_id: string | null; title: string; description: string | null; diagram_source: string | null; created_at: string };
export type DesignLink        = { id: string; requirement_id: string; design_element_id: string };
export type RiskCategory      = { id: string; project_id: string; name: string; label: string; color: string; sort_order: number; is_builtin: boolean; created_at: string; updated_at: string };
export type ValidationStatus  = "PLANNED" | "PASSED" | "FAILED";
export type ValidationRecord  = { id: string; project_id: string; related_requirement_id: string; description: string; status: ValidationStatus; created_at: string };
export type AuditLog          = { id: string; entity_type: string; entity_id: string; action: "CREATE" | "UPDATE" | "DELETE"; timestamp: string; actor_name: string | null; details: string | null };

export type ImpactResult = {
  requirement: { id: string; type: string; title: string; description: string | null };
  children_requirements: { id: string; type: string; title: string }[];
  linked_design_elements: { id: string; readable_id: string | null; title: string; description: string | null }[];
  linked_system_tests: { id: string; name: string }[];
  latest_executions: { system_test_id: string; system_test_name: string; status: string | null; executed_at: string | null }[];
};

export type TreeNode = {
  id: string; type: ReqType; title: string; description: string | null;
  risks: { id: string; hazard: string; harm: string; severity: number; probability: number; risk_level: string }[];
  children?: TreeNode[];
  design_elements?: { id: string; readable_id: string | null; title: string }[];
  system_tests?: { id: string; name: string; latest_execution: { status: string; executed_at: string } | null }[];
};

export type UploadSummary = { total_added: number; total_skipped: number; added: { title: string; type: string }[]; skipped: { title: string; reason: string }[] };

// ── SRS baseline (IEC 62304 §5.2 — two-tier versioned approval) ──────────────
//
// Per-category baselines (USER/SYSTEM/SOFTWARE/custom) move through their own
// DRAFT → IN_REVIEW → APPROVED → OBSOLETE lifecycle. The composite SRS is a
// release manifest that pins specific category-baseline versions and goes
// through the same lifecycle at the project level.

export type ReqBaselineStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";

/** Three-stage signoff trail (prepared / reviewed / approved). */
export type ApprovalSignoff = {
  prepared_by: string | null; prepared_at: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
};

/** Frozen requirement snapshot inside a category baseline. */
export type RequirementCategoryBaselineItem = {
  id: string; baseline_id: string; requirement_id: string | null;
  readable_id: string; type: string; title: string;
  description: string | null; parent_readable_id: string | null;
};

export type RequirementCategoryBaselineSummary = ApprovalSignoff & {
  id: string; project_id: string;
  category_name: string; version: string; status: ReqBaselineStatus;
  item_count: number; created_at: string;
};

export type RequirementCategoryBaseline = ApprovalSignoff & {
  id: string; project_id: string;
  category_name: string; version: string; status: ReqBaselineStatus;
  review_notes: string | null;
  items: RequirementCategoryBaselineItem[];
  created_at: string; updated_at: string;
};

export type RequirementCategoryBaselineTransitionResult = {
  baseline: RequirementCategoryBaseline;
  warnings: string[];
};

/** One pinning in a composite SRS manifest. */
export type RequirementsBaselineComponent = {
  id: string;
  composite_baseline_id: string;
  category_baseline_id: string;
  category_baseline: RequirementCategoryBaselineSummary;
};

export type CompositeBaselineSummary = ApprovalSignoff & {
  id: string; project_id: string; version: string; status: ReqBaselineStatus;
  cm_baseline_id: string | null;
  component_count: number;
  created_at: string;
};

export type CompositeBaseline = ApprovalSignoff & {
  id: string; project_id: string; version: string; status: ReqBaselineStatus;
  review_notes: string | null;
  cm_baseline_id: string | null;
  components: RequirementsBaselineComponent[];
  created_at: string; updated_at: string;
};

export type CompositeBaselineTransitionResult = {
  composite: CompositeBaseline;
  warnings: string[];
};

/** Per-category lock state — UI walks this to render lock banners. */
export type CategoryLockEntry = {
  category_name: string;
  is_locked: boolean;
  locked_by_baseline_id: string | null;
  locked_by_version: string | null;
  has_open_draft: boolean;
  open_draft_id: string | null;
  open_draft_version: string | null;
  open_draft_status: string | null;
};

export type RequirementsLockState = { categories: CategoryLockEntry[] };

// ── Phase 4 types ─────────────────────────────────────────────────────────────
export type AuthTokenResponse = { access_token: string; token_type: string; user_id: string; name: string; email: string; role: string; permissions: string[] };
export type RoleRead       = { id: string; name: string; description: string | null; permissions: string[] };
export type PermissionRead = { id: string; name: string; description: string | null };
export type UserRead       = { id: string; name: string; email: string; role_id: string; is_active: boolean; created_at: string; role_name: string | null };
export type ESignEntityType = "CHANGE_REQUEST" | "RELEASE" | "VALIDATION";
export type ESignMeaning    = "APPROVAL" | "REVIEW" | "AUTHORSHIP";
export type ESignRead       = { id: string; user_id: string; entity_type: ESignEntityType; entity_id: string; meaning: ESignMeaning; signed_at: string; ip_address: string | null; comments: string | null; signer_name: string | null; signer_email: string | null };
export type TrainingRecord  = { id: string; user_id: string; training_name: string; description: string | null; completed_at: string; valid_until: string; is_valid: boolean };

// ── Phase 3 types ─────────────────────────────────────────────────────────────
export type ChangeRequestState = "OPEN" | "IMPACT_ANALYSIS" | "APPROVED" | "REJECTED" | "IMPLEMENTED";
export type ChangeRequest = {
  id: string; project_id: string; title: string; description: string | null;
  status: ChangeRequestState;
  // IEC 62304 §6.2.3 — post-release impact analysis fields. Required before
  // APPROVED transition when `modifies_released_software` is true.
  modifies_released_software: boolean;
  effect_on_organization: string | null;
  effect_on_released_software: string | null;
  effect_on_interfacing_systems: string | null;
  created_at: string;
};
export type ChangeImpact = {
  id: string; change_request_id: string;
  impacted_requirement_id: string | null;
  impacted_design_id: string | null;
  impacted_system_test_id: string | null;
  impact_description: string | null;
};
export type ChangeRequestDetail = ChangeRequest & { impacts: ChangeImpact[] };

export type ApprovalEntityType = "CHANGE" | "RELEASE";
export type ApprovalDecision   = "APPROVED" | "REJECTED";
export type Approval = {
  id: string; entity_type: ApprovalEntityType; entity_id: string;
  approver_name: string; decision: ApprovalDecision; comments: string | null; timestamp: string;
};

export type ReleaseStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "RELEASED";
export type Release = {
  id: string; project_id: string; version: string; status: ReleaseStatus;
  // IEC 62304 §6.2.5 — communicate to users and regulators audit trail.
  user_notification_sent: boolean;
  user_notification_summary: string | null;
  user_notified_at: string | null;
  regulator_notification_sent: boolean;
  regulator_notification_summary: string | null;
  regulator_notified_at: string | null;
  // IEC 62304 §6.3.2 — link to predecessor RELEASED version.
  parent_release_id: string | null;
  created_at: string;
};
export type ReleaseItem = { id: string; release_id: string; requirement_id: string | null; system_test_id: string | null; design_element_id: string | null };
export type ReleaseDetail = Release & { items: ReleaseItem[] };
export type ReadinessCheck = { ready: boolean; total_system_tests: number; passed: number; not_passed: string[] };

export type DHFDocument = { id: string; project_id: string; name: string; generated_at: string; file_path: string | null; content: string | null };

// ── IEC 62304 §6.2.1 — Feedback Intake (post-market surveillance) ───────────
export type FeedbackStatus = "NEW" | "UNDER_REVIEW" | "EVALUATED" | "ESCALATED" | "CLOSED";

export type FeedbackItem = {
  id: string;
  project_id: string;
  readable_id: string;
  source: string;
  reporter: string | null;
  reported_at: string | null;
  summary: string;
  description: string | null;
  affected_version: string | null;
  severity: string;
  adverse_event: boolean;
  spec_deviation: boolean;
  is_problem: boolean | null;
  status: FeedbackStatus;
  evaluation_notes: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  safety_impact_assessment: string | null;
  change_needed: boolean | null;
  closure_rationale: string | null;
  escalated_problem_id: string | null;
  escalated_change_request_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type FeedbackMeta = {
  sources:    { name: string; label: string; color: string }[];
  severities: { name: string; label: string; color: string }[];
  statuses:   { name: string; label: string; color: string }[];
};

// ── Documents module ─────────────────────────────────────────────────────────
export type DocumentStatus   = "NOT_STARTED" | "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";
export type DocumentCategory = "PLANS" | "TECHNICAL" | "DEVELOPMENT";
export type Doc = {
  id: string; project_id: string; doc_type: string; category: string;
  title: string; status: DocumentStatus; version: string | null;
  notes: string | null; content: string | null; description: string | null;
  tags: string[];
  created_at: string; updated_at: string;
};

export type KnowledgeEntry = {
  id: string;
  project_id: string | null;
  is_global: boolean;
  category: string;
  standard: string | null;
  clause_ref: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// ── System Testing & Release Management (IEC 62304 §5.8) ─────────────────────
export type STTestType = "FUNCTIONAL" | "PERFORMANCE" | "SAFETY" | "USABILITY" | "REGRESSION" | "SECURITY";

export type STResult = {
  id: string; test_case_id: string;
  execution_date: string; result: "PASS" | "FAIL";
  logs: string | null; actual_result: string | null;
  defects_found: string | null; executed_by: string | null;
  created_at: string;
};

export type SystemTestCase = {
  id: string; project_id: string; requirement_id: string | null;
  name: string; description: string | null;
  test_type: STTestType;
  preconditions: string | null; test_steps: string | null; expected_result: string | null;
  safety_relevance: boolean;
  results: STResult[];
  latest_result: string | null;
  additional_requirement_ids: string[];
  risk_ids: string[];
  created_at: string; updated_at: string;
};

export type RequirementCoverageItem = {
  requirement_id: string; readable_id: string; title: string; req_type: string;
  test_count: number; latest_result: string | null; is_covered: boolean; has_pass: boolean;
};

export type ProjectTestCoverage = {
  project_id: string; total_requirements: number;
  covered_requirements: number; uncovered_requirements: number;
  coverage_pct: number; total_tests: number;
  passed: number; failed: number; not_run: number; pass_rate: number;
  requirements: RequirementCoverageItem[];
  release_blocked: boolean; release_block_reasons: string[];
};

export type ReleaseArtifact = {
  id: string; release_id: string;
  artifact_type: string; reference_id: string;
  version: string | null; label: string | null;
  created_at: string;
};

export type ReleaseChecklistItem = {
  id: string; release_id: string;
  item_name: string; category: string; status: string;
  evidence_link: string | null; notes: string | null;
  is_auto: boolean; sort_order: number;
  created_at: string; updated_at: string;
};

export type ReleaseGateResult = {
  gate: string; label: string; passed: boolean; detail: string; blocking: boolean;
};

export type ReleaseReadiness = {
  release_id: string; project_id: string;
  is_ready: boolean;
  gates: ReleaseGateResult[];
  blocking_failures: string[];
};

export type ReleaseSnapshotRead = {
  release_id: string; captured_at: string | null;
  snapshot: {
    release_version: string; captured_at: string;
    requirements: { id: string; readable_id: string; type: string; title: string }[];
    risks: { id: string; hazard: string; risk_level: string; status: string }[];
    software_units: { id: string; name: string; safety_class: string; status: string }[];
    architecture_components: { id: string; name: string; component_type: string; safety_class: string; status: string }[];
    system_tests: { id: string; name: string; type: string; latest_result: string | null }[];
    counts: { requirements: number; risks: number; units: number; system_tests: number };
  };
};

// ── Integration Testing (IEC 62304 §5.7) ─────────────────────────────────────
export type ITCTestType = "DATA_FLOW" | "CONTROL" | "ERROR_HANDLING" | "TIMING" | "SECURITY" | "REGRESSION";

export type ITCResult = {
  id: string; test_case_id: string;
  execution_date: string; result: "PASS" | "FAIL";
  logs: string | null; latency_ms: number | null;
  data_integrity_check: string | null;
  executed_by: string | null; error_details: string | null;
  created_at: string;
};

export type IntegrationTestCase = {
  id: string; project_id: string;
  interface_id: string | null;
  source_component_id: string | null;
  target_component_id: string | null;
  name: string; description: string | null;
  test_type: ITCTestType; preconditions: string | null;
  test_steps: string | null; expected_result: string | null;
  safety_relevance: boolean;
  latency_threshold_ms: number | null;
  results: ITCResult[];
  latest_result: string | null;
  requirement_ids: string[]; risk_ids: string[];
  created_at: string; updated_at: string;
};

export type InterfaceCoverageItem = {
  interface_id: string; interface_name: string;
  source_component: string; target_component: string;
  interface_type: string; safety_relevant: boolean;
  test_count: number; latest_result: string | null;
  has_error_handling_test: boolean; has_pass: boolean;
  latency_ok: boolean; is_covered: boolean;
  coverage_gap: string | null;
};

export type ProjectCoverage = {
  project_id: string; total_interfaces: number;
  covered_interfaces: number; uncovered_interfaces: number;
  coverage_pct: number; total_tests: number;
  passed: number; failed: number; not_run: number;
  pass_rate: number; safety_relevant_uncovered: number;
  interfaces: InterfaceCoverageItem[];
  release_blocked: boolean; release_block_reasons: string[];
};

export type ITCPerformanceMetrics = {
  test_case_id: string; test_case_name: string;
  interface_id: string | null; latency_threshold_ms: number | null;
  executions: number;
  avg_latency_ms: number | null; max_latency_ms: number | null; min_latency_ms: number | null;
  threshold_breaches: number; data_integrity_pass_rate: number | null;
};

// ── Software Unit Implementation & Verification (IEC 62304 §5.5 / §5.6) ─────
export type UnitStatus = "DRAFT" | "IMPLEMENTED" | "VERIFIED";
export type UnitSafetyClass = "A" | "B" | "C";
export type UnitTestType = "FUNCTIONAL" | "BOUNDARY" | "REGRESSION" | "INTEGRATION" | "STRESS" | "SECURITY";

export type CodeArtifact = {
  id: string; unit_id: string;
  repository: string; branch: string | null;
  commit_id: string | null; file_path: string | null;
  version_tag: string | null;
  created_at: string; updated_at: string;
};

export type UnitTestResult = {
  id: string; test_case_id: string;
  execution_date: string; result: "PASS" | "FAIL";
  logs: string | null; coverage_percentage: number | null;
  executed_by: string | null; created_at: string;
};

export type UnitTestCase = {
  id: string; unit_id: string;
  name: string; description: string | null;
  test_type: string; expected_result: string | null;
  results: UnitTestResult[];
  latest_result: string | null;
  created_at: string; updated_at: string;
};

export type SoftwareUnit = {
  id: string; project_id: string; component_id: string | null;
  name: string; description: string | null;
  programming_language: string | null;
  repository_url: string | null; file_path: string | null;
  safety_class: UnitSafetyClass; status: UnitStatus;
  artifacts: CodeArtifact[];
  test_cases: UnitTestCase[];
  requirement_ids: string[];
  risk_ids: string[];
  created_at: string; updated_at: string;
};

export type UnitComplianceCheck = { rule: string; label: string; required: boolean; satisfied: boolean; detail: string };
export type UnitCompliance = { unit_id: string; safety_class: string; is_compliant: boolean; checks: UnitComplianceCheck[]; blocks: string[] };
export type UnitCoverageMetrics = {
  unit_id: string; total_test_cases: number;
  executed: number; passed: number; failed: number; not_run: number;
  avg_coverage: number | null; min_coverage: number | null; pass_rate: number;
};

// ── Software Architecture (IEC 62304 §5.3 / §5.4) ───────────────────────────
export type ComponentType = "SYSTEM" | "SUBSYSTEM" | "ITEM" | "UNIT";
export type ComponentStatus = "DRAFT" | "REVIEW" | "APPROVED";
export type InterfaceType = "DATA" | "CONTROL" | "API" | "SIGNAL";
export type DataFlowCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SWDataFlow = {
  id: string; interface_id: string;
  data_name: string; data_type: string | null;
  frequency: string | null; criticality: DataFlowCriticality;
  description: string | null;
  created_at: string; updated_at: string;
};
export type SWInterface = {
  id: string; project_id: string;
  source_component_id: string; target_component_id: string;
  source_component_name: string; target_component_name: string;
  interface_type: InterfaceType; name: string;
  description: string | null; data_format: string | null;
  communication_method: string | null; safety_relevant: boolean;
  data_flows: SWDataFlow[];
  created_at: string; updated_at: string;
};
export type SWComponent = {
  id: string; project_id: string; parent_id: string | null;
  name: string; description: string | null;
  component_type: ComponentType; safety_class: string;
  status: ComponentStatus; version: string;
  rationale: string | null;
  diagram_source: string | null;
  approved_by: string | null; approved_at: string | null;
  requirement_ids: string[]; risk_ids: string[]; system_test_ids: string[];
  interface_count: number;
  created_at: string; updated_at: string;
};
// IEC 62304 §5.3 component-type taxonomy — served by GET /architecture/component-types.
// Single backend source (architecture/constants.py); the frontend never hardcodes
// the SYSTEM→SUBSYSTEM→ITEM→UNIT chain, parent rules, ordering, or chip colours.
export type ComponentTypeInfo = {
  name: string;
  order: number;
  parents: string[];
  color: string;
  bg: string;
};
export type SWComponentTreeNode = {
  id: string; name: string; component_type: ComponentType;
  safety_class: string; status: ComponentStatus; version: string;
  description: string | null;
  requirement_ids: string[]; risk_ids: string[]; system_test_ids: string[];
  interface_count: number; is_compliant: boolean;
  children: SWComponentTreeNode[];
};
export type ArchComplianceCheck = { rule: string; label: string; required: boolean; satisfied: boolean; detail: string };
export type ArchCompliance = { component_id: string; safety_class: string; is_compliant: boolean; checks: ArchComplianceCheck[]; blocks: string[] };

// ── Architecture Baseline (IEC 62304 §5.3 versioned approval) ────────────────
export type ArchBaselineStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";

export type ArchitectureBaselineComponentSnap = {
  id: string; baseline_id: string; component_id: string | null;
  name: string; description: string | null;
  component_type: string; safety_class: string; version: string;
  rationale: string | null; parent_name: string | null; sort_order: number;
};

export type ArchitectureBaselineInterfaceSnap = {
  id: string; baseline_id: string; interface_id: string | null;
  name: string; description: string | null;
  interface_type: string;
  source_component_name: string; target_component_name: string;
  data_format: string | null; communication_method: string | null;
  safety_relevant: boolean;
  data_flows_summary: string | null;
};

export type ArchitectureBaselineSummary = ApprovalSignoff & {
  id: string; project_id: string; version: string; status: ArchBaselineStatus;
  cm_baseline_id: string | null;
  component_count: number; interface_count: number;
  created_at: string;
};

export type ArchitectureBaseline = ApprovalSignoff & {
  id: string; project_id: string; version: string; status: ArchBaselineStatus;
  review_notes: string | null;
  cm_baseline_id: string | null;
  components: ArchitectureBaselineComponentSnap[];
  interfaces: ArchitectureBaselineInterfaceSnap[];
  created_at: string; updated_at: string;
};

export type ArchitectureBaselineTransitionResult = {
  baseline: ArchitectureBaseline;
  warnings: string[];
};

export type ArchitectureLockState = {
  is_locked: boolean;
  locked_by_baseline_id: string | null;
  locked_by_version: string | null;
  has_open_draft: boolean;
  open_draft_id: string | null;
  open_draft_version: string | null;
  open_draft_status: string | null;
};

// ── IEC 62304 Plans (§6 Maintenance, §7 Risk Mgmt, §8.1 Config Mgmt, §9 Problem Resolution) ──
export type PlanStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";

export type PlanSection = {
  id: string; plan_id: string;
  section_number: string; section_name: string;
  content: string | null; sort_order: number;
  created_at: string; updated_at: string;
};
export type Plan = {
  id: string; project_id: string;
  plan_type: string; iec_clause: string | null;
  version: string; status: PlanStatus; safety_class: string;
  title: string; description: string | null; created_by: string | null;
  prepared_by: string | null; prepared_at: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
  review_notes: string | null;
  sections: PlanSection[];
  created_at: string; updated_at: string;
};
export type PlanSummary = Omit<Plan, "sections">;
export type PlanTypeInfo = { key: string; label: string; iec_clause: string; description: string };
export type PlanComplianceCheck = { rule: string; label: string; satisfied: boolean; detail: string };
export type PlanCompliance = { plan_id: string; is_ready_for_approval: boolean; checks: PlanComplianceCheck[] };
export type PlanTransitionResult = { plan: Plan; warnings: string[] };

// ── Software Development Plan (IEC 62304 §5.1) ───────────────────────────────
export type SDPStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";
export type SDPLifecycleModel = "V_MODEL" | "AGILE" | "HYBRID";

export type SDPSection = {
  id: string; sdp_id: string;
  section_number: string; section_name: string;
  content: string | null; sort_order: number;
  created_at: string; updated_at: string;
};
export type SDPPhase = {
  id: string; sdp_id: string;
  phase_name: string; phase_order: number;
  entry_criteria: string | null; exit_criteria: string | null;
  activities: string | null; required_for_class: string;
  created_at: string; updated_at: string;
};
export type SDPRole = {
  id: string; sdp_id: string;
  role_name: string; responsibilities: string | null;
  required_for_class: string; sort_order: number;
  created_at: string; updated_at: string;
};
export type SDP = {
  id: string; project_id: string;
  version: string; status: SDPStatus;
  lifecycle_model: SDPLifecycleModel; safety_class: string;
  title: string; description: string | null;
  created_by: string | null;
  prepared_by: string | null; prepared_at: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
  review_notes: string | null;
  sections: SDPSection[]; phases: SDPPhase[]; roles: SDPRole[];
  created_at: string; updated_at: string;
};
export type SDPSummary = Omit<SDP, "sections" | "phases" | "roles">;
export type SDPComplianceCheck = { rule: string; label: string; satisfied: boolean; detail: string };
export type SDPCompliance = { sdp_id: string; is_ready_for_approval: boolean; checks: SDPComplianceCheck[] };
export type SDPTransitionResult = { sdp: SDP; warnings: string[] };

// ── Software Items (IEC 62304 §5 safety classification) ──────────────────────
export type SoftwareItemType = "SYSTEM" | "SUBSYSTEM" | "UNIT";
export type SoftwareItemStatus = "DRAFT" | "REVIEWED" | "APPROVED";
export type SoftwareSafetyClass = "A" | "B" | "C";

export type SoftwareItem = {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  item_type: SoftwareItemType;
  safety_class: SoftwareSafetyClass;
  classification_justification: string | null;
  status: SoftwareItemStatus;
  risk_ids: string[];
  requirement_ids: string[];
  created_at: string;
  updated_at: string;
};

export type ComplianceCheck = {
  rule: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  detail: string;
};

export type ComplianceStatus = {
  item_id: string;
  safety_class: string;
  is_compliant: boolean;
  checks: ComplianceCheck[];
  blocks: string[];
  suggested_class: string;
  suggestion_reason: string;
};

export type AIGeneratedRequirement = {
  type: string;
  title: string;
  description: string;
  rationale: string;
};
export type AICategoryMeta = {
  name: string;
  label: string;
  sort_order: number;
  parent_name: string | null;
};
export type AIGenerateResponse = {
  requirements: AIGeneratedRequirement[];
  categories: AICategoryMeta[];
  tokens_used: number;
  model: string;
};

// ── Configuration Management & Change Control (IEC 62304 §8) ─────────────────
export type CMItemStatus = "DRAFT" | "APPROVED" | "RELEASED" | "OBSOLETE";
export type CMChangeType = "ENHANCEMENT" | "BUG_FIX" | "REGULATORY" | "SECURITY" | "EMERGENCY";
export type CMPriority   = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CMChangeStatus = "OPEN" | "IN_REVIEW" | "APPROVED" | "IMPLEMENTED" | "CLOSED" | "REJECTED";

export type CMVersionHistory = {
  id: string; config_item_id: string;
  version: string; change_request_id: string | null;
  change_summary: string | null; changed_by: string | null;
  created_at: string;
};

export type CMConfigItem = {
  id: string; project_id: string; baseline_id: string | null;
  name: string; item_type: string; reference_id: string | null;
  version: string; status: CMItemStatus; description: string | null;
  version_history: CMVersionHistory[];
  created_at: string; updated_at: string;
};

export type CMBaselineItem = {
  id: string; baseline_id: string; config_item_id: string;
  config_item_name: string; config_item_type: string;
  config_item_version: string; config_item_status: string;
};

export type CMBaseline = {
  id: string; project_id: string;
  name: string; description: string | null;
  is_released: boolean; created_by: string | null;
  created_at: string; item_count: number;
  items: CMBaselineItem[];
};

export type CMChangeImpact = {
  id: string; change_request_id: string;
  affected_item_type: string; affected_item_id: string;
  affected_item_name: string | null; impact_description: string | null;
  revalidation_required: boolean; revalidation_status: string;
  created_at: string; updated_at: string;
};

export type CMChangeRequest = {
  id: string; project_id: string;
  title: string; description: string | null;
  change_type: CMChangeType; priority: CMPriority;
  status: CMChangeStatus; created_by: string | null;
  resolution_notes: string | null;
  impacts: CMChangeImpact[];
  created_at: string; updated_at: string;
};

export type CMReleaseCheck = {
  has_open_critical: boolean; has_incomplete_impact: boolean;
  has_pending_revalidation: boolean; is_blocked: boolean;
  block_reasons: string[];
};

// ── CAPA — Problem Resolution & Maintenance (Post-release) ───────────────────
export type ProblemSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProblemStatus   = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
export type CAPAStatus      = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED";
export type RootCauseType   = "DESIGN" | "CODE" | "PROCESS" | "REQUIREMENTS" | "ENVIRONMENT" | "HUMAN_ERROR";
export type UpdateType      = "MAJOR" | "MINOR" | "PATCH" | "HOTFIX" | "EMERGENCY";

export type ProblemLink = {
  id: string; problem_id: string;
  linked_type: string; linked_id: string; linked_name: string | null;
  created_at: string;
};

export type RootCause = {
  id: string; problem_id: string;
  root_cause_type: RootCauseType; description: string;
  identified_by: string | null; identified_at: string; created_at: string;
};

export type CAPAVerification = {
  id: string; capa_id: string;
  verification_method: string | null; result: string;
  evidence_link: string | null; verified_by: string | null;
  verified_at: string; notes: string | null; created_at: string;
};

export type CAPARecord = {
  id: string; problem_id: string;
  action_type: "CORRECTIVE" | "PREVENTIVE";
  description: string; assigned_to: string | null;
  due_date: string | null; status: CAPAStatus;
  verifications: CAPAVerification[];
  created_at: string; updated_at: string;
};

export type ProblemReport = {
  id: string; project_id: string;
  title: string; description: string | null;
  source: string | null; severity: ProblemSeverity;
  status: ProblemStatus; related_release_id: string | null;
  reported_by: string | null;
  links: ProblemLink[]; root_causes: RootCause[]; capas: CAPARecord[];
  created_at: string; updated_at: string;
};

export type MaintenanceRecord = {
  id: string; project_id: string;
  related_release_id: string | null; change_request_id: string | null;
  description: string; update_type: UpdateType;
  deployed_version: string | null; deployment_date: string | null;
  created_at: string; updated_at: string;
};

export type CAPAReleaseCheck = {
  has_open_capas: boolean; has_unverified_capas: boolean;
  has_unresolved_critical: boolean; is_blocked: boolean;
  block_reasons: string[];
};

// ── Attachments (polymorphic: any entity can carry images / PDF docs) ────────
export type Attachment = {
  id: string; project_id: string;
  entity_type: string; entity_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── API client ────────────────────────────────────────────────────────────────
export const api = {
  projects: {
    list: () => req<Project[]>("/projects/"),
    create: (d: { name: string; description?: string }) => req<Project>("/projects/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { name?: string; description?: string }) => req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/projects/${id}`, { method: "DELETE" }),
  },
  requirements: {
    list: (project_id?: string, type?: string, needs_review?: boolean) => {
      const p = new URLSearchParams();
      if (project_id) p.set("project_id", project_id);
      if (type) p.set("type", type);
      if (needs_review !== undefined) p.set("needs_review", String(needs_review));
      return req<Requirement[]>(`/requirements/?${p}`);
    },
    create: (d: { project_id: string; type: string; parent_id?: string; title: string; description?: string }) =>
      req<Requirement>("/requirements/", { method: "POST", body: JSON.stringify(d) }),
    upload: (project_id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return req<UploadSummary>(`/requirements/upload?project_id=${project_id}`, { method: "POST", body: form });
    },
    update: (id: string, d: { title?: string; description?: string | null; parent_id?: string | null }) =>
      req<Requirement>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/requirements/${id}`, { method: "DELETE" }),
    /** Preview which descendants would be flagged needs_review on an edit. */
    impactPreview: (id: string) =>
      req<ChangeImpactPreview>(`/requirements/${id}/impact-preview`),
    /** Clear the needs_review flag on a requirement. */
    acknowledgeReview: (id: string) =>
      req<Requirement>(`/requirements/${id}/acknowledge-review`, { method: "POST" }),
    categories: {
      list: (project_id: string) =>
        req<RequirementCategory[]>(`/requirements/categories?project_id=${project_id}`),
      create: (d: { project_id: string; name: string; label: string; color: string; parent_id?: string; readable_id_prefix?: string }) =>
        req<RequirementCategory>("/requirements/categories", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { label?: string; color?: string; sort_order?: number; readable_id_prefix?: string; parent_id?: string | null }) =>
        req<RequirementCategory>(`/requirements/categories/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) =>
        req<void>(`/requirements/categories/${id}`, { method: "DELETE" }),
    },
    /**
     * Composite SRS baselines (the release manifests). A composite pins a
     * specific combination of approved per-category baselines.
     */
    baselines: {
      list: (project_id: string) =>
        req<CompositeBaselineSummary[]>(`/requirements/baselines/?project_id=${project_id}`),
      get: (id: string) => req<CompositeBaseline>(`/requirements/baselines/${id}`),
      create: (d: { project_id: string; version: string; category_baseline_ids?: string[] }) =>
        req<CompositeBaseline>(`/requirements/baselines/`, { method: "POST", body: JSON.stringify(d) }),
      delete: (id: string) =>
        req<void>(`/requirements/baselines/${id}`, { method: "DELETE" }),
      transition: (id: string, d: { status: ReqBaselineStatus; prepared_by?: string; reviewed_by?: string; approved_by?: string; review_notes?: string }) =>
        req<CompositeBaselineTransitionResult>(`/requirements/baselines/${id}/status`, { method: "PUT", body: JSON.stringify(d) }),
      updateComponents: (id: string, category_baseline_ids: string[]) =>
        req<CompositeBaseline>(`/requirements/baselines/${id}/components`, { method: "PUT", body: JSON.stringify({ category_baseline_ids }) }),
      fork: (id: string) =>
        req<CompositeBaseline>(`/requirements/baselines/${id}/fork`, { method: "POST" }),
      lockState: (project_id: string) =>
        req<RequirementsLockState>(`/requirements/baselines/lock-state?project_id=${project_id}`),
    },
    /** Per-category SRS baselines (USER / SYSTEM / SOFTWARE / custom). */
    categoryBaselines: {
      list: (project_id: string, category?: string) => {
        const q = new URLSearchParams({ project_id });
        if (category) q.set("category", category);
        return req<RequirementCategoryBaselineSummary[]>(`/requirements/category-baselines/?${q}`);
      },
      get: (id: string) =>
        req<RequirementCategoryBaseline>(`/requirements/category-baselines/${id}`),
      create: (d: { project_id: string; category_name: string; version: string }) =>
        req<RequirementCategoryBaseline>(`/requirements/category-baselines/`, { method: "POST", body: JSON.stringify(d) }),
      delete: (id: string) =>
        req<void>(`/requirements/category-baselines/${id}`, { method: "DELETE" }),
      transition: (id: string, d: { status: ReqBaselineStatus; prepared_by?: string; reviewed_by?: string; approved_by?: string; review_notes?: string }) =>
        req<RequirementCategoryBaselineTransitionResult>(`/requirements/category-baselines/${id}/status`, { method: "PUT", body: JSON.stringify(d) }),
      fork: (id: string) =>
        req<RequirementCategoryBaseline>(`/requirements/category-baselines/${id}/fork`, { method: "POST" }),
    },
  },
  risks: {
    list: (requirement_id?: string, project_id?: string) => {
      const p = new URLSearchParams();
      if (requirement_id) p.set("requirement_id", requirement_id);
      else if (project_id) p.set("project_id", project_id);
      return req<Risk[]>(`/risks/?${p}`);
    },
    create: (d: { requirement_id: string; category_id?: string; title?: string; hazard: string; hazardous_situation: string; harm: string; severity: number; probability: number; mitigation?: string; evaluation_notes?: string }) =>
      req<Risk>("/risks/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { category_id?: string | null; title?: string | null; hazard?: string; hazardous_situation?: string; harm?: string; severity?: number; probability?: number; mitigation?: string | null; evaluation_notes?: string | null }) =>
      req<Risk>(`/risks/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    updateStatus: (id: string, status: string) =>
      req<Risk>(`/risks/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    delete: (id: string) => req<void>(`/risks/${id}`, { method: "DELETE" }),
    dashboard: (project_id: string) => req<RiskDashboard>(`/risks/dashboard/${project_id}`),
    controls: {
      list: (risk_id: string) => req<RiskControl[]>(`/risks/${risk_id}/controls`),
      create: (risk_id: string, d: { control_type: string; description: string; requirement_id?: string | null; system_test_id?: string | null; implementation_status?: string; verification_notes?: string | null }) =>
        req<RiskControl>(`/risks/${risk_id}/controls`, { method: "POST", body: JSON.stringify(d) }),
      update: (control_id: string, d: { control_type?: string; description?: string; requirement_id?: string | null; system_test_id?: string | null; implementation_status?: string; verification_notes?: string | null }) =>
        req<RiskControl>(`/risks/controls/${control_id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (control_id: string) => req<void>(`/risks/controls/${control_id}`, { method: "DELETE" }),
    },
    residual: {
      get: (risk_id: string) => req<ResidualRisk | null>(`/risks/${risk_id}/residual`),
      upsert: (risk_id: string, d: { severity: number; probability: number; rationale?: string | null; is_accepted: boolean; accepted_by?: string | null }) =>
        req<ResidualRisk>(`/risks/${risk_id}/residual`, { method: "PUT", body: JSON.stringify(d) }),
    },
    safetyProfile: {
      get: (project_id: string) => req<SafetyProfile | null>(`/risks/safety-profile/${project_id}`),
      create: (d: Omit<SafetyProfile, "id" | "created_at" | "updated_at">) =>
        req<SafetyProfile>("/risks/safety-profile", { method: "POST", body: JSON.stringify(d) }),
      update: (project_id: string, d: Partial<Omit<SafetyProfile, "id" | "project_id" | "created_at" | "updated_at">>) =>
        req<SafetyProfile>(`/risks/safety-profile/${project_id}`, { method: "PUT", body: JSON.stringify(d) }),
    },
    categories: {
      list:   (project_id: string) => req<RiskCategory[]>(`/risks/categories?project_id=${project_id}`),
      create: (d: { project_id: string; name: string; label: string; color: string }) =>
        req<RiskCategory>("/risks/categories", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { label?: string; color?: string; sort_order?: number }) =>
        req<RiskCategory>(`/risks/categories/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/risks/categories/${id}`, { method: "DELETE" }),
    },
  },
  traceability: {
    tree: (project_id: string) => req<TreeNode[]>(`/traceability/${project_id}`),
  },
  design: {
    listElements: (project_id?: string, component_id?: string) => {
      const qs = new URLSearchParams();
      if (project_id) qs.set("project_id", project_id);
      if (component_id) qs.set("component_id", component_id);
      const s = qs.toString();
      return req<DesignElement[]>(`/design/elements${s ? `?${s}` : ""}`);
    },
    createElement: (d: { project_id: string; component_id: string; parent_id?: string | null; title: string; description?: string | null }) =>
      req<DesignElement>("/design/elements", { method: "POST", body: JSON.stringify(d) }),
    updateElement: (id: string, d: { title?: string; description?: string; diagram_source?: string | null; parent_id?: string | null }) =>
      req<DesignElement>(`/design/elements/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteElement: (id: string) => req<void>(`/design/elements/${id}`, { method: "DELETE" }),
    listLinks: (requirement_id?: string) => req<DesignLink[]>(`/design/links${requirement_id ? `?requirement_id=${requirement_id}` : ""}`),
    createLink: (d: { requirement_id: string; design_element_id: string }) =>
      req<DesignLink>("/design/links", { method: "POST", body: JSON.stringify(d) }),
    deleteLink: (id: string) => req<void>(`/design/links/${id}`, { method: "DELETE" }),
  },
  validation: {
    listRecords: (project_id?: string) => req<ValidationRecord[]>(`/validation/records${project_id ? `?project_id=${project_id}` : ""}`),
    createRecord: (d: { project_id: string; related_requirement_id: string; description: string; status?: ValidationStatus }) =>
      req<ValidationRecord>("/validation/records", { method: "POST", body: JSON.stringify(d) }),
    updateRecord: (id: string, d: { description?: string; status?: ValidationStatus }) =>
      req<ValidationRecord>(`/validation/records/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteRecord: (id: string) => req<void>(`/validation/records/${id}`, { method: "DELETE" }),
  },
  attachments: {
    /**
     * List every attachment for the given entity. `entity_type` is the
     * convention string used by the owning module (e.g. "design_element",
     * "software_unit"); `entity_id` is the row UUID.
     */
    list: (entity_type: string, entity_id: string) => {
      const q = new URLSearchParams({ entity_type, entity_id });
      return req<Attachment[]>(`/attachments/?${q}`);
    },
    /** Upload via multipart form. Returns the freshly-created row. */
    upload: (d: { project_id: string; entity_type: string; entity_id: string; description?: string; file: File }) => {
      const form = new FormData();
      form.append("project_id", d.project_id);
      form.append("entity_type", d.entity_type);
      form.append("entity_id", d.entity_id);
      if (d.description) form.append("description", d.description);
      form.append("file", d.file);
      return req<Attachment>("/attachments/", { method: "POST", body: form });
    },
    /**
     * Fetch the file bytes as a Blob (the download endpoint is auth-gated, so
     * we can't just hand a `<img src>` URL to the browser). The caller decides
     * what to do with the Blob — render in an `<img>` via Object URL,
     * trigger a download via a hidden anchor, or open in a new tab.
     */
    downloadBlob: async (id: string): Promise<Blob> => {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/attachments/${id}/download`, { headers });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.blob();
    },
    update: (id: string, d: { description?: string | null }) =>
      req<Attachment>(`/attachments/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/attachments/${id}`, { method: "DELETE" }),
  },
  audit: {
    logs: (params?: { entity_type?: string; entity_id?: string; limit?: number }) => {
      const p = new URLSearchParams();
      if (params?.entity_type) p.set("entity_type", params.entity_type);
      if (params?.entity_id) p.set("entity_id", params.entity_id);
      if (params?.limit) p.set("limit", String(params.limit));
      return req<AuditLog[]>(`/audit/logs?${p}`);
    },
  },
  impact: {
    analyze: (requirement_id: string) => req<ImpactResult>(`/impact-analysis/${requirement_id}`),
  },
  changeControl: {
    listRequests: (project_id?: string) =>
      req<ChangeRequest[]>(`/change-control/requests${project_id ? `?project_id=${project_id}` : ""}`),
    createRequest: (d: { project_id: string; title: string; description?: string }) =>
      req<ChangeRequest>("/change-control/requests", { method: "POST", body: JSON.stringify(d) }),
    getRequest: (id: string) => req<ChangeRequestDetail>(`/change-control/requests/${id}`),
    transition: (id: string, new_status: ChangeRequestState) =>
      req<ChangeRequest>(`/change-control/requests/${id}/transition`, {
        method: "PATCH",
        body: JSON.stringify({ new_status }),
      }),
    addImpact: (d: {
      change_request_id: string;
      impacted_requirement_id?: string;
      impacted_design_id?: string;
      impacted_system_test_id?: string;
      impact_description?: string;
    }) => req<ChangeImpact>("/change-control/impacts", { method: "POST", body: JSON.stringify(d) }),
    deleteImpact: (id: string) => req<void>(`/change-control/impacts/${id}`, { method: "DELETE" }),
  },
  approvals: {
    list: (params?: { entity_type?: ApprovalEntityType; entity_id?: string }) => {
      const p = new URLSearchParams();
      if (params?.entity_type) p.set("entity_type", params.entity_type);
      if (params?.entity_id) p.set("entity_id", params.entity_id);
      return req<Approval[]>(`/approvals?${p}`);
    },
    create: (d: { entity_type: ApprovalEntityType; entity_id: string; approver_name: string; decision: ApprovalDecision; comments?: string }) =>
      req<Approval>("/approvals", { method: "POST", body: JSON.stringify(d) }),
  },
  release: {
    list: (project_id?: string) =>
      req<Release[]>(`/release/releases${project_id ? `?project_id=${project_id}` : ""}`),
    create: (d: { project_id: string; version: string; parent_release_id?: string | null }) =>
      req<Release>("/release/releases", { method: "POST", body: JSON.stringify(d) }),
    get: (id: string) => req<ReleaseDetail>(`/release/releases/${id}`),
    transition: (id: string, new_status: ReleaseStatus) =>
      req<Release>(`/release/releases/${id}/transition`, {
        method: "PATCH",
        body: JSON.stringify({ new_status }),
      }),
    readiness: (id: string) => req<ReadinessCheck>(`/release/releases/${id}/readiness`),
    addItem: (d: { release_id: string; requirement_id?: string; system_test_id?: string; design_element_id?: string }) =>
      req<ReleaseItem>("/release/items", { method: "POST", body: JSON.stringify(d) }),
    deleteItem: (id: string) => req<void>(`/release/items/${id}`, { method: "DELETE" }),
    // §6.2.5 — record user / regulator notification on a release.
    notify: (id: string, audience: "USER" | "REGULATOR", summary: string) =>
      req<Release>(`/release/releases/${id}/notify`, {
        method: "PATCH",
        body: JSON.stringify({ audience, summary }),
      }),
  },
  dhf: {
    generate: (project_id: string, release_id?: string) =>
      req<DHFDocument>(`/dhf/generate/${project_id}${release_id ? `?release_id=${release_id}` : ""}`, { method: "POST" }),
    list: (project_id?: string) =>
      req<DHFDocument[]>(`/dhf/documents${project_id ? `?project_id=${project_id}` : ""}`),
    get: (id: string) => req<DHFDocument>(`/dhf/documents/${id}`),
  },

  // ── Phase 4 ───────────────────────────────────────────────────────────────
  auth: {
    login: (email: string, password: string) =>
      req<AuthTokenResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email, password }).toString(),
      }),
  },
  roles: {
    list: () => req<RoleRead[]>("/roles"),
    listPermissions: () => req<PermissionRead[]>("/roles/permissions"),
    create: (d: { name: string; description?: string; permission_names?: string[] }) =>
      req<RoleRead>("/roles", { method: "POST", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/roles/${id}`, { method: "DELETE" }),
  },
  users: {
    list: () => req<UserRead[]>("/users"),
    create: (d: { name: string; email: string; password: string; role_id: string }) =>
      req<UserRead>("/users", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { name?: string; is_active?: boolean; role_id?: string }) =>
      req<UserRead>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  },
  esign: {
    sign: (d: { entity_type: ESignEntityType; entity_id: string; meaning: ESignMeaning; password: string; comments?: string }) =>
      req<ESignRead>("/esign/sign", { method: "POST", body: JSON.stringify(d) }),
    list: (params?: { entity_type?: ESignEntityType; entity_id?: string }) => {
      const p = new URLSearchParams();
      if (params?.entity_type) p.set("entity_type", params.entity_type);
      if (params?.entity_id) p.set("entity_id", params.entity_id);
      return req<ESignRead[]>(`/esign/signatures?${p}`);
    },
  },
  training: {
    list: (user_id?: string) =>
      req<TrainingRecord[]>(`/training/records${user_id ? `?user_id=${user_id}` : ""}`),
    create: (d: { user_id: string; training_name: string; description?: string; completed_at: string; valid_until: string }) =>
      req<TrainingRecord>("/training/records", { method: "POST", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/training/records/${id}`, { method: "DELETE" }),
  },
  documents: {
    list: (project_id: string, category?: string) => {
      const p = new URLSearchParams({ project_id });
      if (category) p.set("category", category);
      return req<Doc[]>(`/documents/?${p}`);
    },
    get: (id: string) => req<Doc>(`/documents/${id}`),
    create: (d: { project_id: string; doc_type: string; category: string; title: string; status?: string; version?: string; notes?: string }) =>
      req<Doc>("/documents/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { title?: string; status?: string; version?: string; notes?: string; content?: string; tags?: string[] }) =>
      req<Doc>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/documents/${id}`, { method: "DELETE" }),
  },
  ai: {
    generateRequirements: (d: { project_id: string; product_description: string; focus_area?: string; count_per_category?: number }) =>
      req<AIGenerateResponse>("/ai/generate-requirements", { method: "POST", body: JSON.stringify(d) }),
  },
  knowledge: {
    listGlobal: (standard?: string, category?: string) => {
      const p = new URLSearchParams();
      if (standard) p.set("standard", standard);
      if (category) p.set("category", category);
      return req<KnowledgeEntry[]>(`/knowledge/global?${p}`);
    },
    listProject: (project_id: string, standard?: string, category?: string) => {
      const p = new URLSearchParams();
      if (standard) p.set("standard", standard);
      if (category) p.set("category", category);
      return req<KnowledgeEntry[]>(`/knowledge/project/${project_id}?${p}`);
    },
    get: (id: string) => req<KnowledgeEntry>(`/knowledge/entry/${id}`),
    createGlobal: (d: { category: string; standard?: string; clause_ref?: string; title: string; summary?: string; content?: string; tags?: string[]; sort_order?: number }) =>
      req<KnowledgeEntry>("/knowledge/global", { method: "POST", body: JSON.stringify(d) }),
    createProject: (project_id: string, d: { category: string; standard?: string; clause_ref?: string; title: string; summary?: string; content?: string; tags?: string[]; sort_order?: number }) =>
      req<KnowledgeEntry>(`/knowledge/project/${project_id}`, { method: "POST", body: JSON.stringify(d) }),
    updateGlobal: (id: string, d: Partial<{ title: string; summary: string; content: string; tags: string[]; category: string; standard: string; clause_ref: string; sort_order: number }>) =>
      req<KnowledgeEntry>(`/knowledge/global/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    update: (id: string, d: Partial<{ title: string; summary: string; content: string; tags: string[]; category: string; standard: string; clause_ref: string; sort_order: number }>) =>
      req<KnowledgeEntry>(`/knowledge/entry/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteGlobal: (id: string) => req<void>(`/knowledge/global/${id}`, { method: "DELETE" }),
    delete: (id: string) => req<void>(`/knowledge/entry/${id}`, { method: "DELETE" }),
    copyToProject: (entry_id: string, project_id: string) =>
      req<KnowledgeEntry>(`/knowledge/entry/${entry_id}/copy-to-project/${project_id}`, { method: "POST", body: JSON.stringify({}) }),
    bulkCopyToProject: (entry_ids: string[], project_id: string) =>
      req<{ copied: number; skipped: number }>(`/knowledge/bulk-copy-to-project/${project_id}`, { method: "POST", body: JSON.stringify({ entry_ids }) }),
  },
  architecture: {
    componentTypes: () => req<ComponentTypeInfo[]>(`/architecture/component-types`),
    listComponents: (project_id: string) => req<SWComponent[]>(`/architecture/?project_id=${project_id}`),
    getComponent: (id: string) => req<SWComponent>(`/architecture/${id}`),
    tree: (project_id: string) => req<SWComponentTreeNode[]>(`/architecture/tree/${project_id}`),
    createComponent: (d: { project_id: string; parent_id?: string | null; name: string; description?: string | null; component_type?: ComponentType; safety_class?: string; rationale?: string | null; diagram_source?: string | null }) =>
      req<SWComponent>("/architecture/", { method: "POST", body: JSON.stringify(d) }),
    updateComponent: (id: string, d: { parent_id?: string | null; name?: string; description?: string | null; component_type?: ComponentType; safety_class?: string; rationale?: string | null; diagram_source?: string | null }) =>
      req<SWComponent>(`/architecture/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteComponent: (id: string) => req<void>(`/architecture/${id}`, { method: "DELETE" }),
    transitionStatus: (id: string, status: ComponentStatus, approved_by?: string) =>
      req<SWComponent>(`/architecture/${id}/status`, { method: "PUT", body: JSON.stringify({ status, approved_by: approved_by ?? null }) }),
    setRequirements: (id: string, ids: string[]) =>
      req<SWComponent>(`/architecture/${id}/requirements`, { method: "PUT", body: JSON.stringify({ ids }) }),
    setRisks: (id: string, ids: string[]) =>
      req<SWComponent>(`/architecture/${id}/risks`, { method: "PUT", body: JSON.stringify({ ids }) }),
    setSystemTests: (id: string, ids: string[]) =>
      req<SWComponent>(`/architecture/${id}/system-tests`, { method: "PUT", body: JSON.stringify({ ids }) }),
    compliance: (id: string) => req<ArchCompliance>(`/architecture/${id}/compliance`),
    listInterfaces: (project_id: string) => req<SWInterface[]>(`/architecture/interfaces/${project_id}`),
    createInterface: (d: { project_id: string; source_component_id: string; target_component_id: string; interface_type?: InterfaceType; name: string; description?: string | null; data_format?: string | null; communication_method?: string | null; safety_relevant?: boolean }) =>
      req<SWInterface>("/architecture/interfaces", { method: "POST", body: JSON.stringify(d) }),
    updateInterface: (id: string, d: { interface_type?: InterfaceType; name?: string; description?: string | null; data_format?: string | null; communication_method?: string | null; safety_relevant?: boolean }) =>
      req<SWInterface>(`/architecture/interfaces/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteInterface: (id: string) => req<void>(`/architecture/interfaces/${id}`, { method: "DELETE" }),
    addDataFlow: (interface_id: string, d: { data_name: string; data_type?: string | null; frequency?: string | null; criticality?: DataFlowCriticality; description?: string | null }) =>
      req<SWDataFlow>(`/architecture/interfaces/${interface_id}/dataflows`, { method: "POST", body: JSON.stringify(d) }),
    updateDataFlow: (id: string, d: { data_name?: string; data_type?: string | null; frequency?: string | null; criticality?: DataFlowCriticality; description?: string | null }) =>
      req<SWDataFlow>(`/architecture/dataflows/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteDataFlow: (id: string) => req<void>(`/architecture/dataflows/${id}`, { method: "DELETE" }),
    /**
     * Versioned approval of the Software Architecture Document (IEC 62304
     * §5.3). Same shape as `requirements.baselines` — DRAFT/IN_REVIEW/
     * APPROVED/OBSOLETE with prepared/reviewed/approved signoff.
     */
    baselines: {
      list: (project_id: string) =>
        req<ArchitectureBaselineSummary[]>(`/architecture/baselines/?project_id=${project_id}`),
      get: (id: string) => req<ArchitectureBaseline>(`/architecture/baselines/${id}`),
      create: (d: { project_id: string; version: string }) =>
        req<ArchitectureBaseline>(`/architecture/baselines/`, { method: "POST", body: JSON.stringify(d) }),
      delete: (id: string) =>
        req<void>(`/architecture/baselines/${id}`, { method: "DELETE" }),
      transition: (id: string, d: { status: ArchBaselineStatus; prepared_by?: string; reviewed_by?: string; approved_by?: string; review_notes?: string }) =>
        req<ArchitectureBaselineTransitionResult>(`/architecture/baselines/${id}/status`, { method: "PUT", body: JSON.stringify(d) }),
      fork: (id: string) =>
        req<ArchitectureBaseline>(`/architecture/baselines/${id}/fork`, { method: "POST" }),
      lockState: (project_id: string) =>
        req<ArchitectureLockState>(`/architecture/baselines/lock-state?project_id=${project_id}`),
    },
  },
  sdp: {
    list: (project_id: string) => req<SDPSummary[]>(`/sdp/?project_id=${project_id}`),
    get: (id: string) => req<SDP>(`/sdp/${id}`),
    getActive: (project_id: string) => req<SDP | null>(`/sdp/active/${project_id}`),
    create: (d: { project_id: string; version?: string; lifecycle_model?: SDPLifecycleModel; safety_class?: string; title?: string; description?: string | null; created_by?: string | null }) =>
      req<SDP>("/sdp/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { lifecycle_model?: SDPLifecycleModel; safety_class?: string; title?: string; description?: string | null; created_by?: string | null }) =>
      req<SDP>(`/sdp/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/sdp/${id}`, { method: "DELETE" }),
    fork: (id: string) => req<SDP>(`/sdp/${id}/fork`, { method: "POST", body: JSON.stringify({}) }),
    transition: (id: string, d: { status: SDPStatus; prepared_by?: string | null; reviewed_by?: string | null; approved_by?: string | null; review_notes?: string | null }) =>
      req<SDPTransitionResult>(`/sdp/${id}/status`, { method: "PUT", body: JSON.stringify(d) }),
    compliance: (id: string) => req<SDPCompliance>(`/sdp/${id}/compliance`),
    sections: {
      add: (sdp_id: string, d: { section_number: string; section_name: string; content?: string | null; sort_order?: number }) =>
        req<SDPSection>(`/sdp/${sdp_id}/sections`, { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { section_name?: string; content?: string | null; sort_order?: number }) =>
        req<SDPSection>(`/sdp/sections/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/sdp/sections/${id}`, { method: "DELETE" }),
    },
    phases: {
      add: (sdp_id: string, d: { phase_name: string; phase_order?: number; entry_criteria?: string | null; exit_criteria?: string | null; activities?: string | null; required_for_class?: string }) =>
        req<SDPPhase>(`/sdp/${sdp_id}/phases`, { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { phase_name?: string; phase_order?: number; entry_criteria?: string | null; exit_criteria?: string | null; activities?: string | null; required_for_class?: string }) =>
        req<SDPPhase>(`/sdp/phases/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/sdp/phases/${id}`, { method: "DELETE" }),
    },
    roles: {
      add: (sdp_id: string, d: { role_name: string; responsibilities?: string | null; required_for_class?: string; sort_order?: number }) =>
        req<SDPRole>(`/sdp/${sdp_id}/roles`, { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { role_name?: string; responsibilities?: string | null; required_for_class?: string; sort_order?: number }) =>
        req<SDPRole>(`/sdp/roles/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/sdp/roles/${id}`, { method: "DELETE" }),
    },
  },
  systemTesting: {
    list: (project_id: string, requirement_id?: string) => {
      const p = new URLSearchParams({ project_id });
      if (requirement_id) p.set("requirement_id", requirement_id);
      return req<SystemTestCase[]>(`/system-testing/?${p}`);
    },
    get: (id: string) => req<SystemTestCase>(`/system-testing/${id}`),
    create: (d: { project_id: string; requirement_id?: string | null; name: string; description?: string | null; test_type?: STTestType; preconditions?: string | null; test_steps?: string | null; expected_result?: string | null; safety_relevance?: boolean }) =>
      req<SystemTestCase>("/system-testing/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: Partial<{ requirement_id: string | null; name: string; description: string | null; test_type: STTestType; preconditions: string | null; test_steps: string | null; expected_result: string | null; safety_relevance: boolean }>) =>
      req<SystemTestCase>(`/system-testing/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/system-testing/${id}`, { method: "DELETE" }),
    recordResult: (tc_id: string, d: { result: "PASS" | "FAIL"; logs?: string | null; actual_result?: string | null; defects_found?: string | null; executed_by?: string | null }) =>
      req<STResult>(`/system-testing/${tc_id}/results`, { method: "POST", body: JSON.stringify(d) }),
    setRequirements: (id: string, ids: string[]) =>
      req<SystemTestCase>(`/system-testing/${id}/requirements`, { method: "PUT", body: JSON.stringify({ ids }) }),
    setRisks: (id: string, ids: string[]) =>
      req<SystemTestCase>(`/system-testing/${id}/risks`, { method: "PUT", body: JSON.stringify({ ids }) }),
    coverage: (project_id: string) => req<ProjectTestCoverage>(`/system-testing/coverage/${project_id}`),
    release: {
      readiness: (release_id: string) => req<ReleaseReadiness>(`/system-testing/release/${release_id}/readiness`),
      getChecklist: (release_id: string) => req<ReleaseChecklistItem[]>(`/system-testing/release/${release_id}/checklist`),
      addChecklistItem: (release_id: string, d: { item_name: string; category?: string; evidence_link?: string | null; notes?: string | null; sort_order?: number }) =>
        req<ReleaseChecklistItem>(`/system-testing/release/${release_id}/checklist`, { method: "POST", body: JSON.stringify(d) }),
      updateChecklistItem: (item_id: string, d: { item_name?: string; status?: string; evidence_link?: string | null; notes?: string | null }) =>
        req<ReleaseChecklistItem>(`/system-testing/checklist/${item_id}`, { method: "PUT", body: JSON.stringify(d) }),
      listArtifacts: (release_id: string) => req<ReleaseArtifact[]>(`/system-testing/release/${release_id}/artifacts`),
      addArtifact: (release_id: string, d: { artifact_type: string; reference_id: string; version?: string | null; label?: string | null }) =>
        req<ReleaseArtifact>(`/system-testing/release/${release_id}/artifacts`, { method: "POST", body: JSON.stringify(d) }),
      deleteArtifact: (id: string) => req<void>(`/system-testing/artifacts/${id}`, { method: "DELETE" }),
      captureSnapshot: (release_id: string) =>
        req<ReleaseSnapshotRead>(`/system-testing/release/${release_id}/snapshot`, { method: "POST", body: JSON.stringify({}) }),
      getSnapshot: (release_id: string) => req<ReleaseSnapshotRead>(`/system-testing/release/${release_id}/snapshot`),
    },
  },
  integrationTests: {
    list: (project_id: string, interface_id?: string) => {
      const p = new URLSearchParams({ project_id });
      if (interface_id) p.set("interface_id", interface_id);
      return req<IntegrationTestCase[]>(`/integration-tests/?${p}`);
    },
    get: (id: string) => req<IntegrationTestCase>(`/integration-tests/${id}`),
    create: (d: {
      project_id: string; interface_id?: string | null;
      source_component_id?: string | null; target_component_id?: string | null;
      name: string; description?: string | null; test_type?: ITCTestType;
      preconditions?: string | null; test_steps?: string | null;
      expected_result?: string | null; safety_relevance?: boolean;
      latency_threshold_ms?: number | null;
    }) => req<IntegrationTestCase>("/integration-tests/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: Partial<{
      interface_id: string | null; source_component_id: string | null; target_component_id: string | null;
      name: string; description: string | null; test_type: ITCTestType;
      preconditions: string | null; test_steps: string | null; expected_result: string | null;
      safety_relevance: boolean; latency_threshold_ms: number | null;
    }>) => req<IntegrationTestCase>(`/integration-tests/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/integration-tests/${id}`, { method: "DELETE" }),
    recordResult: (tc_id: string, d: {
      result: "PASS" | "FAIL"; logs?: string | null;
      latency_ms?: number | null; data_integrity_check?: string | null;
      executed_by?: string | null; error_details?: string | null;
    }) => req<ITCResult>(`/integration-tests/${tc_id}/results`, { method: "POST", body: JSON.stringify(d) }),
    setRequirements: (id: string, ids: string[]) =>
      req<IntegrationTestCase>(`/integration-tests/${id}/requirements`, { method: "PUT", body: JSON.stringify({ ids }) }),
    setRisks: (id: string, ids: string[]) =>
      req<IntegrationTestCase>(`/integration-tests/${id}/risks`, { method: "PUT", body: JSON.stringify({ ids }) }),
    coverage: (project_id: string) => req<ProjectCoverage>(`/integration-tests/coverage/${project_id}`),
    performance: (project_id: string) => req<ITCPerformanceMetrics[]>(`/integration-tests/performance/${project_id}`),
  },
  units: {
    list: (project_id: string) => req<SoftwareUnit[]>(`/units/?project_id=${project_id}`),
    get: (id: string) => req<SoftwareUnit>(`/units/${id}`),
    create: (d: { project_id: string; component_id?: string | null; name: string; description?: string | null; programming_language?: string | null; repository_url?: string | null; file_path?: string | null; safety_class?: UnitSafetyClass }) =>
      req<SoftwareUnit>("/units/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { component_id?: string | null; name?: string; description?: string | null; programming_language?: string | null; repository_url?: string | null; file_path?: string | null; safety_class?: UnitSafetyClass }) =>
      req<SoftwareUnit>(`/units/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/units/${id}`, { method: "DELETE" }),
    transitionStatus: (id: string, status: UnitStatus) =>
      req<SoftwareUnit>(`/units/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    compliance: (id: string) => req<UnitCompliance>(`/units/${id}/compliance`),
    coverage: (id: string) => req<UnitCoverageMetrics>(`/units/${id}/coverage`),
    setRequirements: (id: string, ids: string[]) =>
      req<SoftwareUnit>(`/units/${id}/requirements`, { method: "PUT", body: JSON.stringify({ ids }) }),
    setRisks: (id: string, ids: string[]) =>
      req<SoftwareUnit>(`/units/${id}/risks`, { method: "PUT", body: JSON.stringify({ ids }) }),
    artifacts: {
      add: (unit_id: string, d: { repository: string; branch?: string | null; commit_id?: string | null; file_path?: string | null; version_tag?: string | null }) =>
        req<CodeArtifact>(`/units/${unit_id}/artifacts`, { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { repository?: string; branch?: string | null; commit_id?: string | null; file_path?: string | null; version_tag?: string | null }) =>
        req<CodeArtifact>(`/units/artifacts/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/units/artifacts/${id}`, { method: "DELETE" }),
    },
    testcases: {
      add: (unit_id: string, d: { name: string; description?: string | null; test_type?: string; expected_result?: string | null }) =>
        req<UnitTestCase>(`/units/${unit_id}/testcases`, { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { name?: string; description?: string | null; test_type?: string; expected_result?: string | null }) =>
        req<UnitTestCase>(`/units/testcases/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/units/testcases/${id}`, { method: "DELETE" }),
      recordResult: (tc_id: string, d: { result: "PASS" | "FAIL"; logs?: string | null; coverage_percentage?: number | null; executed_by?: string | null }) =>
        req<UnitTestResult>(`/units/testcases/${tc_id}/results`, { method: "POST", body: JSON.stringify(d) }),
    },
  },
  configMgmt: {
    items: {
      list: (project_id: string, item_type?: string, status?: string) => {
        const p = new URLSearchParams({ project_id });
        if (item_type) p.set("item_type", item_type);
        if (status) p.set("status", status);
        return req<CMConfigItem[]>(`/config-mgmt/items?${p}`);
      },
      get: (id: string) => req<CMConfigItem>(`/config-mgmt/items/${id}`),
      create: (d: { project_id: string; name: string; item_type: string; reference_id?: string | null; version?: string; description?: string | null }) =>
        req<CMConfigItem>("/config-mgmt/items", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { name?: string; item_type?: string; reference_id?: string | null; description?: string | null }) =>
        req<CMConfigItem>(`/config-mgmt/items/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/config-mgmt/items/${id}`, { method: "DELETE" }),
      newVersion: (id: string, d: { version: string; change_summary?: string | null; changed_by?: string | null; change_request_id?: string | null }) =>
        req<CMConfigItem>(`/config-mgmt/items/${id}/new-version`, { method: "POST", body: JSON.stringify(d) }),
      setStatus: (id: string, status: CMItemStatus) =>
        req<CMConfigItem>(`/config-mgmt/items/${id}/status?status=${status}`, { method: "PUT" }),
    },
    baselines: {
      list: (project_id: string) => req<CMBaseline[]>(`/config-mgmt/baselines?project_id=${project_id}`),
      get: (id: string) => req<CMBaseline>(`/config-mgmt/baselines/${id}`),
      create: (d: { project_id: string; name: string; description?: string | null; created_by?: string | null; config_item_ids?: string[] }) =>
        req<CMBaseline>("/config-mgmt/baselines", { method: "POST", body: JSON.stringify(d) }),
      release: (id: string) => req<CMBaseline>(`/config-mgmt/baselines/${id}/release`, { method: "POST", body: JSON.stringify({}) }),
      addItem: (baseline_id: string, item_id: string) =>
        req<CMBaseline>(`/config-mgmt/baselines/${baseline_id}/items/${item_id}`, { method: "POST", body: JSON.stringify({}) }),
      removeItem: (baseline_id: string, item_id: string) =>
        req<CMBaseline>(`/config-mgmt/baselines/${baseline_id}/items/${item_id}`, { method: "DELETE" }),
    },
    changes: {
      list: (project_id: string, status?: string, priority?: string) => {
        const p = new URLSearchParams({ project_id });
        if (status) p.set("status", status);
        if (priority) p.set("priority", priority);
        return req<CMChangeRequest[]>(`/config-mgmt/changes?${p}`);
      },
      get: (id: string) => req<CMChangeRequest>(`/config-mgmt/changes/${id}`),
      create: (d: { project_id: string; title: string; description?: string | null; change_type?: CMChangeType; priority?: CMPriority; created_by?: string | null }) =>
        req<CMChangeRequest>("/config-mgmt/changes", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { title?: string; description?: string | null; change_type?: CMChangeType; priority?: CMPriority; resolution_notes?: string | null }) =>
        req<CMChangeRequest>(`/config-mgmt/changes/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/config-mgmt/changes/${id}`, { method: "DELETE" }),
      transition: (id: string, status: CMChangeStatus, resolution_notes?: string) =>
        req<CMChangeRequest>(`/config-mgmt/changes/${id}/status`, { method: "PUT", body: JSON.stringify({ status, resolution_notes }) }),
      addImpact: (cr_id: string, d: { affected_item_type: string; affected_item_id: string; affected_item_name?: string | null; impact_description?: string | null; revalidation_required?: boolean }) =>
        req<CMChangeImpact>(`/config-mgmt/changes/${cr_id}/impacts`, { method: "POST", body: JSON.stringify(d) }),
      updateImpact: (impact_id: string, d: { affected_item_name?: string | null; impact_description?: string | null; revalidation_required?: boolean; revalidation_status?: string }) =>
        req<CMChangeImpact>(`/config-mgmt/impacts/${impact_id}`, { method: "PUT", body: JSON.stringify(d) }),
      deleteImpact: (impact_id: string) => req<void>(`/config-mgmt/impacts/${impact_id}`, { method: "DELETE" }),
    },
    releaseCheck: (project_id: string) => req<CMReleaseCheck>(`/config-mgmt/release-check/${project_id}`),
  },
  capa: {
    problems: {
      list: (project_id: string, status?: string, severity?: string) => {
        const p = new URLSearchParams({ project_id });
        if (status) p.set("status", status);
        if (severity) p.set("severity", severity);
        return req<ProblemReport[]>(`/capa/problems?${p}`);
      },
      get: (id: string) => req<ProblemReport>(`/capa/problems/${id}`),
      create: (d: { project_id: string; title: string; description?: string | null; source?: string | null; severity?: ProblemSeverity; related_release_id?: string | null; reported_by?: string | null }) =>
        req<ProblemReport>("/capa/problems", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { title?: string; description?: string | null; source?: string | null; severity?: ProblemSeverity; reported_by?: string | null }) =>
        req<ProblemReport>(`/capa/problems/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      transition: (id: string, status: ProblemStatus) =>
        req<ProblemReport>(`/capa/problems/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
      delete: (id: string) => req<void>(`/capa/problems/${id}`, { method: "DELETE" }),
      addLink: (id: string, d: { linked_type: string; linked_id: string; linked_name?: string | null }) =>
        req<ProblemLink>(`/capa/problems/${id}/links`, { method: "POST", body: JSON.stringify(d) }),
      deleteLink: (link_id: string) => req<void>(`/capa/links/${link_id}`, { method: "DELETE" }),
      addRootCause: (id: string, d: { root_cause_type: RootCauseType; description: string; identified_by?: string | null }) =>
        req<RootCause>(`/capa/problems/${id}/root-causes`, { method: "POST", body: JSON.stringify(d) }),
      deleteRootCause: (rc_id: string) => req<void>(`/capa/root-causes/${rc_id}`, { method: "DELETE" }),
      addCapa: (id: string, d: { action_type?: "CORRECTIVE" | "PREVENTIVE"; description: string; assigned_to?: string | null; due_date?: string | null }) =>
        req<CAPARecord>(`/capa/problems/${id}/capas`, { method: "POST", body: JSON.stringify(d) }),
    },
    capas: {
      update: (id: string, d: { action_type?: string; description?: string; assigned_to?: string | null; due_date?: string | null; status?: CAPAStatus }) =>
        req<CAPARecord>(`/capa/capas/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/capa/capas/${id}`, { method: "DELETE" }),
      addVerification: (id: string, d: { verification_method?: string | null; result?: string; evidence_link?: string | null; verified_by?: string | null; notes?: string | null }) =>
        req<CAPAVerification>(`/capa/capas/${id}/verifications`, { method: "POST", body: JSON.stringify(d) }),
      deleteVerification: (v_id: string) => req<void>(`/capa/verifications/${v_id}`, { method: "DELETE" }),
    },
    maintenance: {
      list: (project_id: string) => req<MaintenanceRecord[]>(`/capa/maintenance?project_id=${project_id}`),
      create: (d: { project_id: string; description: string; update_type?: UpdateType; related_release_id?: string | null; change_request_id?: string | null; deployed_version?: string | null; deployment_date?: string | null }) =>
        req<MaintenanceRecord>("/capa/maintenance", { method: "POST", body: JSON.stringify(d) }),
      update: (id: string, d: { description?: string; update_type?: UpdateType; deployed_version?: string | null; deployment_date?: string | null }) =>
        req<MaintenanceRecord>(`/capa/maintenance/${id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (id: string) => req<void>(`/capa/maintenance/${id}`, { method: "DELETE" }),
    },
    releaseCheck: (project_id: string) => req<CAPAReleaseCheck>(`/capa/release-check/${project_id}`),
  },
  softwareItems: {
    list: (project_id: string) =>
      req<SoftwareItem[]>(`/software-items/?project_id=${project_id}`),
    get: (id: string) => req<SoftwareItem>(`/software-items/${id}`),
    create: (d: { project_id: string; parent_id?: string | null; name: string; description?: string | null; item_type?: SoftwareItemType; safety_class?: SoftwareSafetyClass; classification_justification?: string | null }) =>
      req<SoftwareItem>("/software-items/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { parent_id?: string | null; name?: string; description?: string | null; item_type?: SoftwareItemType; safety_class?: SoftwareSafetyClass; classification_justification?: string | null; status?: SoftwareItemStatus }) =>
      req<SoftwareItem>(`/software-items/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/software-items/${id}`, { method: "DELETE" }),
    transitionStatus: (id: string, status: SoftwareItemStatus) =>
      req<SoftwareItem>(`/software-items/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    setRisks: (id: string, risk_ids: string[]) =>
      req<SoftwareItem>(`/software-items/${id}/risks`, { method: "PUT", body: JSON.stringify({ risk_ids }) }),
    setRequirements: (id: string, requirement_ids: string[]) =>
      req<SoftwareItem>(`/software-items/${id}/requirements`, { method: "PUT", body: JSON.stringify({ requirement_ids }) }),
    compliance: (id: string) => req<ComplianceStatus>(`/software-items/${id}/compliance`),
  },

  plans: {
    types: () => req<PlanTypeInfo[]>("/plans/types"),
    list: (project_id: string, plan_type?: string) => {
      const p = new URLSearchParams({ project_id: project_id.toString() });
      if (plan_type) p.set("plan_type", plan_type);
      return req<PlanSummary[]>(`/plans/?${p}`);
    },
    get: (id: string) => req<Plan>(`/plans/${id}`),
    create: (d: { project_id: string; plan_type: string; version?: string; safety_class?: string; title?: string | null; iec_clause?: string | null; description?: string | null; created_by?: string | null }) =>
      req<Plan>("/plans/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { safety_class?: string; title?: string; iec_clause?: string | null; description?: string | null; created_by?: string | null }) =>
      req<Plan>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/plans/${id}`, { method: "DELETE" }),
    fork: (id: string) => req<Plan>(`/plans/${id}/fork`, { method: "POST", body: JSON.stringify({}) }),
    transition: (id: string, d: { status: PlanStatus; prepared_by?: string | null; reviewed_by?: string | null; approved_by?: string | null; review_notes?: string | null }) =>
      req<PlanTransitionResult>(`/plans/${id}/status`, { method: "PUT", body: JSON.stringify(d) }),
    compliance: (id: string) => req<PlanCompliance>(`/plans/${id}/compliance`),
    sections: {
      add: (plan_id: string, d: { section_number: string; section_name: string; content?: string | null; sort_order?: number }) =>
        req<PlanSection>(`/plans/${plan_id}/sections`, { method: "POST", body: JSON.stringify(d) }),
      update: (section_id: string, d: { section_number?: string; section_name?: string; content?: string | null; sort_order?: number }) =>
        req<PlanSection>(`/plans/sections/${section_id}`, { method: "PUT", body: JSON.stringify(d) }),
      delete: (section_id: string) => req<void>(`/plans/sections/${section_id}`, { method: "DELETE" }),
    },
  },

  feedback: {
    meta: () => req<FeedbackMeta>("/feedback/meta"),
    list: (project_id: string, opts?: { status?: string; severity?: string }) => {
      const p = new URLSearchParams({ project_id });
      if (opts?.status)   p.set("status",   opts.status);
      if (opts?.severity) p.set("severity", opts.severity);
      return req<FeedbackItem[]>(`/feedback/?${p}`);
    },
    get:    (id: string) => req<FeedbackItem>(`/feedback/${id}`),
    create: (d: {
      project_id: string;
      source: string;
      reporter?: string | null;
      reported_at?: string | null;
      summary: string;
      description?: string | null;
      affected_version?: string | null;
      severity?: string;
      adverse_event?: boolean;
      spec_deviation?: boolean;
    }) => req<FeedbackItem>("/feedback/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: Partial<{
      source: string; reporter: string | null; reported_at: string | null;
      summary: string; description: string | null; affected_version: string | null;
      severity: string; adverse_event: boolean; spec_deviation: boolean;
    }>) => req<FeedbackItem>(`/feedback/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    evaluate: (id: string, d: {
      is_problem: boolean;
      evaluation_notes?: string | null;
      evaluated_by?: string | null;
      safety_impact_assessment?: string | null;
      change_needed?: boolean | null;
    }) => req<FeedbackItem>(`/feedback/${id}/evaluate`, { method: "PATCH", body: JSON.stringify(d) }),
    escalate: (id: string, d: { to_problem?: boolean; to_change_request?: boolean; extra_notes?: string | null }) =>
      req<FeedbackItem>(`/feedback/${id}/escalate`, { method: "PATCH", body: JSON.stringify(d) }),
    close: (id: string, closure_rationale: string) =>
      req<FeedbackItem>(`/feedback/${id}/close`, { method: "PATCH", body: JSON.stringify({ closure_rationale }) }),
    delete: (id: string) => req<void>(`/feedback/${id}`, { method: "DELETE" }),
  },
};
