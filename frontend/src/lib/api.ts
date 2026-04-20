const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Core types ────────────────────────────────────────────────────────────────
export type Project     = { id: string; name: string; description: string | null; created_at: string };
export type ReqType     = "USER" | "SYSTEM" | "SOFTWARE";
export type Requirement = { id: string; project_id: string; type: ReqType; parent_id: string | null; title: string; description: string | null; created_at: string };
export type TestCase    = { id: string; project_id: string; title: string; description: string | null; created_at: string };
export type TraceLink   = { id: string; requirement_id: string; testcase_id: string };
export type Risk        = { id: string; requirement_id: string; hazard: string; hazardous_situation: string; harm: string; severity: number; probability: number; risk_level: string };

// ── Phase 2 types ─────────────────────────────────────────────────────────────
export type DesignElementType = "ARCHITECTURE" | "DETAILED";
export type DesignElement     = { id: string; project_id: string; type: DesignElementType; parent_id: string | null; title: string; description: string | null; created_at: string };
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

// ── API client ────────────────────────────────────────────────────────────────
export const api = {
  projects: {
    list: () => req<Project[]>("/projects/"),
    create: (d: { name: string; description?: string }) => req<Project>("/projects/", { method: "POST", body: JSON.stringify(d) }),
  },
  requirements: {
    list: (project_id?: string, type?: ReqType) => {
      const p = new URLSearchParams();
      if (project_id) p.set("project_id", project_id);
      if (type) p.set("type", type);
      return req<Requirement[]>(`/requirements/?${p}`);
    },
    create: (d: { project_id: string; type: ReqType; parent_id?: string; title: string; description?: string }) =>
      req<Requirement>("/requirements/", { method: "POST", body: JSON.stringify(d) }),
    upload: (project_id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return req<UploadSummary>(`/requirements/upload?project_id=${project_id}`, { method: "POST", body: form });
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
    list: (requirement_id?: string) => req<Risk[]>(`/risks/${requirement_id ? `?requirement_id=${requirement_id}` : ""}`),
    create: (d: { requirement_id: string; hazard: string; hazardous_situation: string; harm: string; severity: number; probability: number }) =>
      req<Risk>("/risks/", { method: "POST", body: JSON.stringify(d) }),
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
};
