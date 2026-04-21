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
      window.location.href = "/login";
    }
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Core types ────────────────────────────────────────────────────────────────
export type Project     = { id: string; name: string; description: string | null; created_at: string };
export type ReqType     = string;  // open: USER | SYSTEM | SOFTWARE | custom
export type RequirementCategory = { id: string; project_id: string; name: string; label: string; color: string; is_builtin: boolean; sort_order: number; parent_id: string | null };
export type Requirement = { id: string; project_id: string; type: string; readable_id: string; parent_id: string | null; title: string; description: string | null; created_at: string };
export type TestCase    = { id: string; project_id: string; readable_id: string | null; title: string; description: string | null; created_at: string };
export type TraceLink   = { id: string; requirement_id: string; testcase_id: string };
export type Risk        = { id: string; requirement_id: string; hazard: string; hazardous_situation: string; harm: string; severity: number; probability: number; risk_level: string; mitigation: string | null };

// ── Phase 2 types ─────────────────────────────────────────────────────────────
export type DesignElementType = "ARCHITECTURE" | "DETAILED";
export type DesignElement     = { id: string; project_id: string; readable_id: string | null; type: DesignElementType; parent_id: string | null; title: string; description: string | null; created_at: string };
export type DesignLink        = { id: string; requirement_id: string; design_element_id: string };
export type ExecStatus        = "PASS" | "FAIL" | "BLOCKED";
export type TestExecution     = { id: string; testcase_id: string; status: ExecStatus; executed_at: string; notes: string | null };
export type ValidationStatus  = "PLANNED" | "PASSED" | "FAILED";
export type ValidationRecord  = { id: string; project_id: string; related_requirement_id: string; description: string; status: ValidationStatus; created_at: string };
export type AuditLog          = { id: string; entity_type: string; entity_id: string; action: "CREATE" | "UPDATE" | "DELETE"; timestamp: string };

export type ImpactResult = {
  requirement: { id: string; type: string; title: string; description: string | null };
  children_requirements: { id: string; type: string; title: string }[];
  linked_design_elements: { id: string; type: string; title: string; description: string | null }[];
  linked_testcases: { id: string; title: string }[];
  latest_executions: { testcase_id: string; testcase_title: string; status: string | null; executed_at: string | null }[];
};

export type TreeNode = {
  id: string; type: ReqType; title: string; description: string | null;
  risks: { id: string; hazard: string; harm: string; severity: number; probability: number; risk_level: string }[];
  children?: TreeNode[];
  design_elements?: { id: string; title: string; type: string }[];
  testcases?: { id: string; title: string; latest_execution: { status: string; executed_at: string } | null }[];
};

export type UploadSummary = { total_added: number; total_skipped: number; added: { title: string; type: string }[]; skipped: { title: string; reason: string }[] };

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
  status: ChangeRequestState; created_at: string;
};
export type ChangeImpact = {
  id: string; change_request_id: string;
  impacted_requirement_id: string | null;
  impacted_design_id: string | null;
  impacted_testcase_id: string | null;
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
export type Release = { id: string; project_id: string; version: string; status: ReleaseStatus; created_at: string };
export type ReleaseItem = { id: string; release_id: string; requirement_id: string | null; testcase_id: string | null; design_element_id: string | null };
export type ReleaseDetail = Release & { items: ReleaseItem[] };
export type ReadinessCheck = { ready: boolean; total_testcases: number; passed: number; not_passed: string[] };

export type DHFDocument = { id: string; project_id: string; name: string; generated_at: string; file_path: string | null; content: string | null };

// ── Documents module ─────────────────────────────────────────────────────────
export type DocumentStatus   = "NOT_STARTED" | "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";
export type DocumentCategory = "PLANS" | "TECHNICAL" | "DEVELOPMENT";
export type Doc = {
  id: string; project_id: string; doc_type: string; category: string;
  title: string; status: DocumentStatus; version: string | null;
  notes: string | null; content: string | null; created_at: string; updated_at: string;
};

// ── API client ────────────────────────────────────────────────────────────────
export const api = {
  projects: {
    list: () => req<Project[]>("/projects/"),
    create: (d: { name: string; description?: string }) => req<Project>("/projects/", { method: "POST", body: JSON.stringify(d) }),
  },
  requirements: {
    list: (project_id?: string, type?: string) => {
      const p = new URLSearchParams();
      if (project_id) p.set("project_id", project_id);
      if (type) p.set("type", type);
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
    categories: {
      list: (project_id: string) =>
        req<RequirementCategory[]>(`/requirements/categories?project_id=${project_id}`),
      create: (d: { project_id: string; name: string; label: string; color: string; parent_id?: string }) =>
        req<RequirementCategory>("/requirements/categories", { method: "POST", body: JSON.stringify(d) }),
      delete: (id: string) =>
        req<void>(`/requirements/categories/${id}`, { method: "DELETE" }),
    },
  },
  testcases: {
    list: (project_id?: string) => req<TestCase[]>(`/testcases/${project_id ? `?project_id=${project_id}` : ""}`),
    create: (d: { project_id: string; title: string; description?: string }) => req<TestCase>("/testcases/", { method: "POST", body: JSON.stringify(d) }),
  },
  tracelinks: {
    list: (requirement_id?: string) => req<TraceLink[]>(`/tracelinks/${requirement_id ? `?requirement_id=${requirement_id}` : ""}`),
    create: (d: { requirement_id: string; testcase_id: string }) => req<TraceLink>("/tracelinks/", { method: "POST", body: JSON.stringify(d) }),
  },
  risks: {
    list: (requirement_id?: string, project_id?: string) => {
      const p = new URLSearchParams();
      if (requirement_id) p.set("requirement_id", requirement_id);
      else if (project_id) p.set("project_id", project_id);
      return req<Risk[]>(`/risks/?${p}`);
    },
    create: (d: { requirement_id: string; hazard: string; hazardous_situation: string; harm: string; severity: number; probability: number; mitigation?: string }) =>
      req<Risk>("/risks/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: { hazard?: string; hazardous_situation?: string; harm?: string; severity?: number; probability?: number; mitigation?: string | null }) =>
      req<Risk>(`/risks/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/risks/${id}`, { method: "DELETE" }),
  },
  traceability: {
    tree: (project_id: string) => req<TreeNode[]>(`/traceability/${project_id}`),
  },
  design: {
    listElements: (project_id?: string) => req<DesignElement[]>(`/design/elements${project_id ? `?project_id=${project_id}` : ""}`),
    createElement: (d: { project_id: string; type: DesignElementType; parent_id?: string; title: string; description?: string }) =>
      req<DesignElement>("/design/elements", { method: "POST", body: JSON.stringify(d) }),
    deleteElement: (id: string) => req<void>(`/design/elements/${id}`, { method: "DELETE" }),
    listLinks: (requirement_id?: string) => req<DesignLink[]>(`/design/links${requirement_id ? `?requirement_id=${requirement_id}` : ""}`),
    createLink: (d: { requirement_id: string; design_element_id: string }) =>
      req<DesignLink>("/design/links", { method: "POST", body: JSON.stringify(d) }),
    deleteLink: (id: string) => req<void>(`/design/links/${id}`, { method: "DELETE" }),
  },
  verification: {
    listExecutions: (testcase_id?: string) => req<TestExecution[]>(`/verification/executions${testcase_id ? `?testcase_id=${testcase_id}` : ""}`),
    execute: (d: { testcase_id: string; status: ExecStatus; notes?: string }) =>
      req<TestExecution>("/verification/executions", { method: "POST", body: JSON.stringify(d) }),
    latest: (testcase_id: string) => req<TestExecution | null>(`/verification/executions/latest?testcase_id=${testcase_id}`),
  },
  validation: {
    listRecords: (project_id?: string) => req<ValidationRecord[]>(`/validation/records${project_id ? `?project_id=${project_id}` : ""}`),
    createRecord: (d: { project_id: string; related_requirement_id: string; description: string; status?: ValidationStatus }) =>
      req<ValidationRecord>("/validation/records", { method: "POST", body: JSON.stringify(d) }),
    updateRecord: (id: string, d: { description?: string; status?: ValidationStatus }) =>
      req<ValidationRecord>(`/validation/records/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    deleteRecord: (id: string) => req<void>(`/validation/records/${id}`, { method: "DELETE" }),
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
      impacted_testcase_id?: string;
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
    create: (d: { project_id: string; version: string }) =>
      req<Release>("/release/releases", { method: "POST", body: JSON.stringify(d) }),
    get: (id: string) => req<ReleaseDetail>(`/release/releases/${id}`),
    transition: (id: string, new_status: ReleaseStatus) =>
      req<Release>(`/release/releases/${id}/transition`, {
        method: "PATCH",
        body: JSON.stringify({ new_status }),
      }),
    readiness: (id: string) => req<ReadinessCheck>(`/release/releases/${id}/readiness`),
    addItem: (d: { release_id: string; requirement_id?: string; testcase_id?: string; design_element_id?: string }) =>
      req<ReleaseItem>("/release/items", { method: "POST", body: JSON.stringify(d) }),
    deleteItem: (id: string) => req<void>(`/release/items/${id}`, { method: "DELETE" }),
  },
  dhf: {
    generate: (project_id: string) => req<DHFDocument>(`/dhf/generate/${project_id}`, { method: "POST" }),
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
    update: (id: string, d: { title?: string; status?: string; version?: string; notes?: string; content?: string }) =>
      req<Doc>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/documents/${id}`, { method: "DELETE" }),
  },
};
