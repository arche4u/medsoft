"use client";
import { useState, useEffect } from "react";
import {
  api,
  SystemTestCase, STTestType, STResult,
  RequirementCoverageItem, ProjectTestCoverage,
  ReleaseReadiness, ReleaseGateResult,
  ReleaseChecklistItem, ReleaseArtifact, ReleaseSnapshotRead,
  Release, Requirement, Risk,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const ST_TYPES: STTestType[] = ["FUNCTIONAL", "PERFORMANCE", "SAFETY", "USABILITY", "REGRESSION", "SECURITY"];
const TYPE_COLOR: Record<string, string> = {
  FUNCTIONAL: "#3b82f6", PERFORMANCE: "#f59e0b", SAFETY: "#ef4444",
  USABILITY: "#8b5cf6", REGRESSION: "#64748b", SECURITY: "#dc2626",
};
const RESULT_COLOR: Record<string, string> = { PASS: "#22c55e", FAIL: "#ef4444" };
const CHECKLIST_CAT_COLOR: Record<string, string> = {
  PLANNING: "#6366f1", REQUIREMENTS: "#3b82f6", TESTING: "#22c55e",
  RISK: "#ef4444", DESIGN: "#8b5cf6", TRACEABILITY: "#f59e0b",
  APPROVAL: "#dc2626", RELEASE: "#0ea5e9", GENERAL: "#94a3b8",
};

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "0.38rem 0.6rem",
  border: "1px solid #d1d5db", borderRadius: 6, fontSize: "0.82rem", color: "#1e293b", background: "#fff",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", marginBottom: "0.18rem",
};
function btn(color: string): React.CSSProperties {
  return { background: color, color: "#fff", border: "none", borderRadius: 7, padding: "0.38rem 0.8rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 6, padding: "1px 8px", fontSize: "0.71rem", fontWeight: 700 }}>
      {text}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ cov }: { cov: ProjectTestCoverage }) {
  const cards = [
    { label: "Requirements", value: cov.total_requirements, color: "#6366f1" },
    { label: "Covered", value: `${cov.covered_requirements}/${cov.total_requirements}`, color: cov.coverage_pct >= 100 ? "#22c55e" : "#f59e0b" },
    { label: "System Tests", value: cov.total_tests, color: "#3b82f6" },
    { label: "Passed", value: cov.passed, color: "#22c55e" },
    { label: "Failed", value: cov.failed, color: cov.failed > 0 ? "#ef4444" : "#22c55e" },
    { label: "Not Run", value: cov.not_run, color: "#94a3b8" },
  ];
  return (
    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: `1px solid ${c.color}33`, borderRadius: 10, padding: "0.5rem 0.85rem", minWidth: 110 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Coverage bar ──────────────────────────────────────────────────────────────

function CoverageBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 100 ? "#22c55e" : pct >= 75 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
      <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color, minWidth: 38, textAlign: "right" }}>{pct.toFixed(0)}%</span>
      <span style={{ fontSize: "0.72rem", color: "#64748b", minWidth: 140 }}>{label}</span>
    </div>
  );
}

// ── Requirement coverage tab ──────────────────────────────────────────────────

function CoverageTab({ cov, onAddTest }: { cov: ProjectTestCoverage; onAddTest: (reqId: string) => void }) {
  const [filter, setFilter] = useState<"ALL" | "COVERED" | "UNCOVERED">("ALL");
  const filtered = cov.requirements.filter(r =>
    filter === "ALL" ? true : filter === "COVERED" ? r.is_covered : !r.is_covered
  );

  return (
    <div>
      <div style={{ marginBottom: "0.85rem" }}>
        <CoverageBar pct={cov.coverage_pct} label="Requirement coverage" />
        <CoverageBar pct={cov.pass_rate} label="Test pass rate" />
      </div>

      {cov.release_blocked && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "0.65rem 0.9rem", marginBottom: "0.85rem" }}>
          <div style={{ fontWeight: 700, color: "#dc2626", fontSize: "0.82rem", marginBottom: "0.3rem" }}>⛔ Release Blocked</div>
          {cov.release_block_reasons.slice(0, 6).map(r => <div key={r} style={{ fontSize: "0.75rem", color: "#b91c1c" }}>• {r}</div>)}
          {cov.release_block_reasons.length > 6 && <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>+{cov.release_block_reasons.length - 6} more…</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.65rem" }}>
        {(["ALL", "COVERED", "UNCOVERED"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...btn(filter === f ? "#6366f1" : "#e2e8f0"), color: filter === f ? "#fff" : "#374151", fontSize: "0.74rem", padding: "0.3rem 0.7rem" }}>
            {f} {f === "ALL" ? `(${cov.requirements.length})` : f === "COVERED" ? `(${cov.covered_requirements})` : `(${cov.uncovered_requirements})`}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: "0.4rem" }}>
        {filtered.map(r => (
          <div key={r.requirement_id} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.5rem 0.75rem", background: r.is_covered ? "#fff" : "#fff7ed", border: `1px solid ${r.is_covered ? "#e2e8f0" : "#fed7aa"}`, borderRadius: 8 }}>
            <span style={{ fontWeight: 700, fontSize: "0.78rem", color: "#6366f1", minWidth: 72 }}>{r.readable_id}</span>
            <Badge text={r.req_type} color="#64748b" />
            <span style={{ flex: 1, fontSize: "0.8rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            <Badge text={`${r.test_count} test${r.test_count !== 1 ? "s" : ""}`} color={r.is_covered ? "#6366f1" : "#94a3b8"} />
            {r.latest_result
              ? <Badge text={r.latest_result} color={RESULT_COLOR[r.latest_result] ?? "#94a3b8"} />
              : r.is_covered
                ? <Badge text="NOT RUN" color="#94a3b8" />
                : <Badge text="NO TEST" color="#f59e0b" />
            }
            {!r.is_covered && (
              <button onClick={() => onAddTest(r.requirement_id)} style={{ ...btn("#6366f1"), fontSize: "0.7rem", padding: "0.25rem 0.55rem" }}>+ Add Test</button>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.8rem" }}>No requirements match filter.</div>}
      </div>
    </div>
  );
}

// ── Record result form ────────────────────────────────────────────────────────

function RecordResultForm({ tcId, onDone, onCancel }: { tcId: string; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ result: "PASS", logs: "", actual_result: "", defects_found: "", executed_by: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      await api.systemTesting.recordResult(tcId, {
        result: form.result as "PASS" | "FAIL",
        logs: form.logs || null,
        actual_result: form.actual_result || null,
        defects_found: form.defects_found || null,
        executed_by: form.executed_by || null,
      });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.7rem 0.85rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem", marginBottom: "0.5rem" }}>
        <div>
          <label style={labelStyle}>Result *</label>
          <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} style={inputStyle}>
            <option value="PASS">PASS</option><option value="FAIL">FAIL</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Executed By</label>
          <input value={form.executed_by} onChange={e => setForm(f => ({ ...f, executed_by: e.target.value }))} style={inputStyle} placeholder="Name / role" />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Actual Result</label>
          <textarea value={form.actual_result} onChange={e => setForm(f => ({ ...f, actual_result: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} placeholder="What actually happened?" />
        </div>
        {form.result === "FAIL" && (
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Defects Found</label>
            <textarea value={form.defects_found} onChange={e => setForm(f => ({ ...f, defects_found: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} placeholder="Defect description / ticket reference" />
          </div>
        )}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Logs</label>
          <input value={form.logs} onChange={e => setForm(f => ({ ...f, logs: e.target.value }))} style={inputStyle} placeholder="Test output, screenshots reference…" />
        </div>
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={submit} disabled={saving} style={btn("#22c55e")}>Record</button>
        <button onClick={onCancel} style={btn("#94a3b8")}>Cancel</button>
      </div>
    </div>
  );
}

// ── System test card ──────────────────────────────────────────────────────────

function TestCard({
  tc, requirements, risks, onRefresh,
}: {
  tc: SystemTestCase; requirements: Requirement[]; risks: Risk[]; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"details" | "results" | "trace">("details");
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: tc.name, test_type: tc.test_type as STTestType,
    description: tc.description ?? "", requirement_id: tc.requirement_id ?? "",
    preconditions: tc.preconditions ?? "", test_steps: tc.test_steps ?? "",
    expected_result: tc.expected_result ?? "", safety_relevance: tc.safety_relevance,
  });
  const [reqSel, setReqSel] = useState<Set<string>>(new Set(tc.additional_requirement_ids));
  const [riskSel, setRiskSel] = useState<Set<string>>(new Set(tc.risk_ids));
  const [savingTrace, setSavingTrace] = useState(false);

  const reqName = requirements.find(r => r.id === tc.requirement_id);

  const saveEdit = async () => {
    await api.systemTesting.update(tc.id, {
      name: editForm.name, test_type: editForm.test_type,
      description: editForm.description || null,
      requirement_id: editForm.requirement_id || null,
      preconditions: editForm.preconditions || null,
      test_steps: editForm.test_steps || null,
      expected_result: editForm.expected_result || null,
      safety_relevance: editForm.safety_relevance,
    });
    setEditing(false); onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete "${tc.name}"?`)) return;
    await api.systemTesting.delete(tc.id); onRefresh();
  };

  const saveTrace = async () => {
    setSavingTrace(true);
    await api.systemTesting.setRequirements(tc.id, [...reqSel]);
    await api.systemTesting.setRisks(tc.id, [...riskSel]);
    onRefresh(); setSavingTrace(false);
  };

  const toggleSet = (s: Set<string>, id: string) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: "0.5rem", overflow: "hidden" }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.6rem 0.85rem", background: expanded ? "#eff6ff" : "#f8fafc", cursor: "pointer" }}>
        <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "#1e293b", flex: 1 }}>{tc.name}</span>
        {reqName && <span style={{ fontSize: "0.73rem", color: "#6366f1", fontWeight: 600 }}>{reqName.readable_id}</span>}
        <Badge text={tc.test_type} color={TYPE_COLOR[tc.test_type] ?? "#6366f1"} />
        {tc.safety_relevance && <Badge text="Safety" color="#ef4444" />}
        {tc.latest_result
          ? <Badge text={tc.latest_result} color={RESULT_COLOR[tc.latest_result] ?? "#94a3b8"} />
          : <Badge text="NOT RUN" color="#94a3b8" />
        }
      </div>

      {expanded && (
        <div style={{ background: "#fff" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
            {(["details", "results", "trace"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "0.42rem 0.8rem", border: "none", borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent", background: "none", color: tab === t ? "#6366f1" : "#64748b", fontWeight: tab === t ? 700 : 400, fontSize: "0.77rem", cursor: "pointer" }}>
                {t === "details" ? "Details" : t === "results" ? `Results (${tc.results.length})` : "Traceability"}
              </button>
            ))}
          </div>

          <div style={{ padding: "0.85rem 1rem" }}>
            {tab === "details" && !editing && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem 1.5rem", marginBottom: "0.7rem", fontSize: "0.79rem" }}>
                  {tc.description && <div style={{ gridColumn: "1/-1", color: "#475569" }}>{tc.description}</div>}
                  {tc.preconditions && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "#94a3b8" }}>Preconditions: </span>{tc.preconditions}</div>}
                  {tc.expected_result && (
                    <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "0.35rem 0.6rem" }}>
                      <span style={{ color: "#166534", fontWeight: 600, fontSize: "0.73rem" }}>Expected: </span>
                      <span style={{ color: "#166534" }}>{tc.expected_result}</span>
                    </div>
                  )}
                  {tc.test_steps && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.72rem", color: "#64748b", marginBottom: "0.18rem" }}>Test Steps</div>
                      <pre style={{ fontSize: "0.77rem", color: "#374151", background: "#f8fafc", borderRadius: 6, padding: "0.4rem 0.6rem", whiteSpace: "pre-wrap", margin: 0 }}>{tc.test_steps}</pre>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => setEditing(true)} style={btn("#64748b")}>Edit</button>
                  <button onClick={del} style={btn("#ef4444")}>Delete</button>
                </div>
              </div>
            )}

            {tab === "details" && editing && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div><label style={labelStyle}>Name</label><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={editForm.test_type} onChange={e => setEditForm(f => ({ ...f, test_type: e.target.value as STTestType }))} style={inputStyle}>
                    {ST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Primary Requirement</label>
                  <select value={editForm.requirement_id} onChange={e => setEditForm(f => ({ ...f, requirement_id: e.target.value }))} style={inputStyle}>
                    <option value="">None</option>
                    {requirements.map(r => <option key={r.id} value={r.id}>{r.readable_id} — {r.title}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Preconditions</label><textarea value={editForm.preconditions} onChange={e => setEditForm(f => ({ ...f, preconditions: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Test Steps</label><textarea value={editForm.test_steps} onChange={e => setEditForm(f => ({ ...f, test_steps: e.target.value }))} style={{ ...inputStyle, height: 68, resize: "vertical" }} /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Expected Result</label><textarea value={editForm.expected_result} onChange={e => setEditForm(f => ({ ...f, expected_result: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} /></div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input type="checkbox" id={`sr-${tc.id}`} checked={editForm.safety_relevance} onChange={e => setEditForm(f => ({ ...f, safety_relevance: e.target.checked }))} />
                  <label htmlFor={`sr-${tc.id}`} style={{ ...labelStyle, marginBottom: 0 }}>Safety relevant</label>
                </div>
                <div style={{ gridColumn: "1/-1", display: "flex", gap: "0.5rem" }}>
                  <button onClick={saveEdit} style={btn("#22c55e")}>Save</button>
                  <button onClick={() => setEditing(false)} style={btn("#94a3b8")}>Cancel</button>
                </div>
              </div>
            )}

            {tab === "results" && (
              <div>
                {tc.results.map(r => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: "0.5rem", alignItems: "center", padding: "0.4rem 0.5rem", background: "#f8fafc", borderRadius: 6, marginBottom: "0.3rem", fontSize: "0.76rem" }}>
                    <Badge text={r.result} color={RESULT_COLOR[r.result]} />
                    <span style={{ color: "#64748b" }}>{new Date(r.execution_date).toLocaleString()}</span>
                    <span style={{ color: "#374151" }}>{r.actual_result ?? r.logs ?? "—"}</span>
                    {r.executed_by && <span style={{ color: "#94a3b8" }}>{r.executed_by}</span>}
                    {r.defects_found && (
                      <div style={{ gridColumn: "1/-1", background: "#fef2f2", borderRadius: 5, padding: "0.25rem 0.5rem", fontSize: "0.73rem", color: "#b91c1c" }}>
                        Defects: {r.defects_found}
                      </div>
                    )}
                  </div>
                ))}
                {tc.results.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic", marginBottom: "0.5rem" }}>No executions yet.</div>}
                {recording
                  ? <RecordResultForm tcId={tc.id} onDone={() => { setRecording(false); onRefresh(); }} onCancel={() => setRecording(false)} />
                  : <button onClick={() => setRecording(true)} style={btn("#3b82f6")}>Record Execution</button>
                }
              </div>
            )}

            {tab === "trace" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: "0.3rem" }}>Additional Requirements ({reqSel.size})</div>
                  <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.25rem" }}>
                    {requirements.filter(r => r.id !== tc.requirement_id).map(r => (
                      <label key={r.id} style={{ display: "flex", gap: "0.35rem", alignItems: "center", padding: "0.18rem 0.3rem", fontSize: "0.74rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={reqSel.has(r.id)} onChange={() => setReqSel(s => toggleSet(s, r.id))} />
                        <span style={{ color: "#6366f1", fontWeight: 600, minWidth: 55 }}>{r.readable_id}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{r.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: "0.3rem" }}>Risks ({riskSel.size})</div>
                  <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.25rem" }}>
                    {risks.map(r => (
                      <label key={r.id} style={{ display: "flex", gap: "0.35rem", alignItems: "center", padding: "0.18rem 0.3rem", fontSize: "0.74rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={riskSel.has(r.id)} onChange={() => setRiskSel(s => toggleSet(s, r.id))} />
                        <Badge text={r.risk_level} color={r.risk_level === "HIGH" ? "#ef4444" : r.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{r.title ?? r.hazard}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <button onClick={saveTrace} disabled={savingTrace} style={btn("#6366f1")}>{savingTrace ? "Saving…" : "Save Traceability"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add test form ─────────────────────────────────────────────────────────────

function AddTestForm({ projectId, requirements, onCreated, preselectedReqId }: {
  projectId: string; requirements: Requirement[]; onCreated: () => void; preselectedReqId?: string;
}) {
  const [open, setOpen] = useState(!!preselectedReqId);
  const [form, setForm] = useState({
    name: "", test_type: "FUNCTIONAL" as STTestType, requirement_id: preselectedReqId ?? "",
    description: "", preconditions: "", test_steps: "", expected_result: "", safety_relevance: false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (preselectedReqId) { setForm(f => ({ ...f, requirement_id: preselectedReqId })); setOpen(true); }
  }, [preselectedReqId]);

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      await api.systemTesting.create({
        project_id: projectId, name: form.name.trim(),
        test_type: form.test_type,
        requirement_id: form.requirement_id || null,
        description: form.description || null,
        preconditions: form.preconditions || null,
        test_steps: form.test_steps || null,
        expected_result: form.expected_result || null,
        safety_relevance: form.safety_relevance,
      });
      setOpen(false);
      setForm({ name: "", test_type: "FUNCTIONAL", requirement_id: "", description: "", preconditions: "", test_steps: "", expected_result: "", safety_relevance: false });
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} style={{ ...btn("#6366f1"), fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}>+ New System Test</button>;

  return (
    <div style={{ background: "#fff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#4338ca", marginBottom: "0.65rem" }}>New System Test Case</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55rem" }}>
        <div><label style={labelStyle}>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Alarm threshold detection test" /></div>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value as STTestType }))} style={inputStyle}>
            {ST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Primary Requirement</label>
          <select value={form.requirement_id} onChange={e => setForm(f => ({ ...f, requirement_id: e.target.value }))} style={inputStyle}>
            <option value="">None (unlinked)</option>
            {requirements.map(r => <option key={r.id} value={r.id}>{r.readable_id} — {r.title}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Preconditions</label><textarea value={form.preconditions} onChange={e => setForm(f => ({ ...f, preconditions: e.target.value }))} style={{ ...inputStyle, height: 48, resize: "vertical" }} placeholder="System state before execution" /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Test Steps</label><textarea value={form.test_steps} onChange={e => setForm(f => ({ ...f, test_steps: e.target.value }))} style={{ ...inputStyle, height: 64, resize: "vertical" }} placeholder="Step 1: ..." /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Expected Result</label><textarea value={form.expected_result} onChange={e => setForm(f => ({ ...f, expected_result: e.target.value }))} style={{ ...inputStyle, height: 48, resize: "vertical" }} /></div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="checkbox" id="sr-add" checked={form.safety_relevance} onChange={e => setForm(f => ({ ...f, safety_relevance: e.target.checked }))} />
          <label htmlFor="sr-add" style={{ ...labelStyle, marginBottom: 0 }}>Safety relevant</label>
        </div>
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", margin: "0.4rem 0" }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button onClick={save} disabled={saving} style={btn("#6366f1")}>{saving ? "Creating…" : "Create"}</button>
        <button onClick={() => setOpen(false)} style={btn("#94a3b8")}>Cancel</button>
      </div>
    </div>
  );
}

// ── Release readiness tab ─────────────────────────────────────────────────────

function ReadinessTab({ releases, projectId }: { releases: Release[]; projectId: string }) {
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>(releases[0]?.id ?? "");
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [checklist, setChecklist] = useState<ReleaseChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);

  const loadReadiness = async (rid: string) => {
    if (!rid) return;
    setLoading(true);
    try {
      const [r, cl] = await Promise.all([
        api.systemTesting.release.readiness(rid),
        api.systemTesting.release.getChecklist(rid),
      ]);
      setReadiness(r); setChecklist(cl);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (selectedReleaseId) loadReadiness(selectedReleaseId); }, [selectedReleaseId]);

  const toggleChecklist = async (item: ReleaseChecklistItem) => {
    const newStatus = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setUpdatingItem(item.id);
    const updated = await api.systemTesting.release.updateChecklistItem(item.id, { status: newStatus });
    setChecklist(cl => cl.map(i => i.id === item.id ? updated : i));
    setUpdatingItem(null);
  };

  if (releases.length === 0) {
    return <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.82rem" }}>No releases found. Create a release under Change Control → Releases first.</div>;
  }

  const completedCount = checklist.filter(i => i.status === "COMPLETED").length;
  const checklistPct = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.85rem" }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Release:</label>
        <select value={selectedReleaseId} onChange={e => setSelectedReleaseId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {releases.map(r => <option key={r.id} value={r.id}>{r.version} — {r.status}</option>)}
        </select>
        <button onClick={() => loadReadiness(selectedReleaseId)} style={{ ...btn("#6366f1"), fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}>Refresh</button>
      </div>

      {loading && <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Loading…</div>}

      {!loading && readiness && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Gates panel */}
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b", marginBottom: "0.6rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              Release Gates
              <Badge text={readiness.is_ready ? "READY" : "NOT READY"} color={readiness.is_ready ? "#22c55e" : "#ef4444"} />
            </div>
            {readiness.gates.map(g => (
              <div key={g.gate} style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start", marginBottom: "0.35rem", padding: "0.4rem 0.6rem", background: g.passed ? "#f0fdf4" : g.blocking ? "#fef2f2" : "#f8fafc", border: `1px solid ${g.passed ? "#bbf7d0" : g.blocking ? "#fecaca" : "#e2e8f0"}`, borderRadius: 7 }}>
                <span style={{ fontSize: "0.85rem", color: g.passed ? "#22c55e" : g.blocking ? "#ef4444" : "#94a3b8", minWidth: 16, marginTop: 1 }}>{g.passed ? "✓" : g.blocking ? "✗" : "–"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.79rem", fontWeight: 600, color: "#374151" }}>{g.label}</div>
                  <div style={{ fontSize: "0.73rem", color: "#64748b" }}>{g.detail}</div>
                </div>
                {!g.blocking && <Badge text="non-blocking" color="#94a3b8" />}
              </div>
            ))}
          </div>

          {/* Checklist panel */}
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b", marginBottom: "0.35rem" }}>
              Release Checklist <span style={{ color: "#64748b", fontWeight: 400 }}>({completedCount}/{checklist.length})</span>
            </div>
            <CoverageBar pct={checklistPct} label="complete" />
            <div style={{ marginTop: "0.5rem", maxHeight: 300, overflowY: "auto" }}>
              {Object.entries(
                checklist.reduce((acc, item) => {
                  acc[item.category] = acc[item.category] ?? [];
                  acc[item.category].push(item);
                  return acc;
                }, {} as Record<string, ReleaseChecklistItem[]>)
              ).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: "0.5rem" }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: CHECKLIST_CAT_COLOR[cat] ?? "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>{cat}</div>
                  {items.map(item => (
                    <div key={item.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.3rem 0.5rem", background: item.status === "COMPLETED" ? "#f0fdf4" : "#fff", border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: "0.2rem" }}>
                      <button
                        onClick={() => toggleChecklist(item)}
                        disabled={updatingItem === item.id}
                        style={{ width: 18, height: 18, border: `2px solid ${item.status === "COMPLETED" ? "#22c55e" : "#d1d5db"}`, borderRadius: 4, background: item.status === "COMPLETED" ? "#22c55e" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                      >
                        {item.status === "COMPLETED" && <span style={{ color: "#fff", fontSize: "0.65rem" }}>✓</span>}
                      </button>
                      <span style={{ fontSize: "0.77rem", color: item.status === "COMPLETED" ? "#64748b" : "#374151", textDecoration: item.status === "COMPLETED" ? "line-through" : "none", flex: 1 }}>{item.item_name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Snapshot tab ──────────────────────────────────────────────────────────────

function SnapshotTab({ releases }: { releases: Release[] }) {
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>(releases[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<ReleaseSnapshotRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const loadSnapshot = async (rid: string) => {
    if (!rid) return;
    setLoading(true);
    try { setSnapshot(await api.systemTesting.release.getSnapshot(rid)); } catch { setSnapshot(null); }
    finally { setLoading(false); }
  };

  const capture = async () => {
    if (!selectedReleaseId) return;
    setCapturing(true);
    try { setSnapshot(await api.systemTesting.release.captureSnapshot(selectedReleaseId)); } catch { /* ignore */ }
    finally { setCapturing(false); }
  };

  useEffect(() => { if (selectedReleaseId) loadSnapshot(selectedReleaseId); }, [selectedReleaseId]);

  if (releases.length === 0) return <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No releases found.</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.85rem" }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Release:</label>
        <select value={selectedReleaseId} onChange={e => setSelectedReleaseId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {releases.map(r => <option key={r.id} value={r.id}>{r.version} — {r.status}</option>)}
        </select>
        <button onClick={capture} disabled={capturing} style={btn("#6366f1")}>{capturing ? "Capturing…" : "Capture Snapshot"}</button>
      </div>

      {loading && <div style={{ color: "#94a3b8" }}>Loading…</div>}

      {!loading && !snapshot && (
        <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.82rem" }}>No snapshot captured yet. Click "Capture Snapshot" to freeze the current configuration.</div>
      )}

      {!loading && snapshot && (
        <div>
          <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.85rem" }}>
            Snapshot captured: <b>{snapshot.captured_at ? new Date(snapshot.captured_at).toLocaleString() : "—"}</b> — v{snapshot.snapshot.release_version}
          </div>

          {/* Count cards */}
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {Object.entries(snapshot.snapshot.counts).map(([k, v]) => (
              <div key={k} style={{ background: "#eff6ff", borderRadius: 9, padding: "0.45rem 0.8rem", minWidth: 90 }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#1d4ed8" }}>{String(v)}</div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</div>
              </div>
            ))}
          </div>

          {/* Snapshot sections */}
          {(
            [
              { key: "requirements", label: "Requirements", cols: ["readable_id", "type", "title"] },
              { key: "risks", label: "Risks", cols: ["hazard", "risk_level", "status"] },
              { key: "software_units", label: "Software Units", cols: ["name", "safety_class", "status"] },
              { key: "system_tests", label: "System Tests", cols: ["name", "type", "latest_result"] },
            ] as const
          ).map(section => {
            const items = (snapshot.snapshot as unknown as Record<string, Record<string, string | null>[]>)[section.key];
            return (
              <div key={section.key} style={{ marginBottom: "0.85rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1e293b", marginBottom: "0.35rem" }}>
                  {section.label} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({items.length})</span>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                    <thead>
                      <tr style={{ background: "#eff6ff" }}>
                        {section.cols.map(c => (
                          <th key={c} style={{ padding: "0.35rem 0.6rem", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: "0.71rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.replace(/_/g, " ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 20).map((item, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #e2e8f0" }}>
                          {section.cols.map(c => (
                            <td key={c} style={{ padding: "0.3rem 0.6rem", color: "#374151" }}>
                              {item[c] ?? <span style={{ color: "#94a3b8" }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {items.length > 20 && (
                        <tr style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td colSpan={section.cols.length} style={{ padding: "0.3rem 0.6rem", color: "#94a3b8", fontStyle: "italic" }}>+{items.length - 20} more…</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PageTab = "tests" | "coverage" | "readiness" | "snapshot";

export default function SystemTestingPage() {
  const [projectId, setProjectId] = useState("");
  const [tests, setTests] = useState<SystemTestCase[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [coverage, setCoverage] = useState<ProjectTestCoverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PageTab>("tests");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [preselectedReqId, setPreselectedReqId] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pid = localStorage.getItem("medsoft_active_project") ?? "";
    if (pid) setProjectId(pid);
    const handler = (e: Event) => setProjectId((e as CustomEvent<{ projectId: string }>).detail?.projectId ?? "");
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);

  const load = async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const [t, reqs, r, rels, cov] = await Promise.all([
        api.systemTesting.list(pid),
        api.requirements.list(pid),
        api.risks.list(undefined, pid),
        api.release.list(pid),
        api.systemTesting.coverage(pid),
      ]);
      setTests(t); setRequirements(reqs); setRisks(r); setReleases(rels); setCoverage(cov);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) load(projectId); }, [projectId]);

  const onAddTest = (reqId: string) => { setTab("tests"); setPreselectedReqId(reqId); setTimeout(() => setPreselectedReqId(undefined), 400); };

  const filtered = tests
    .filter(t => typeFilter === "ALL" || t.test_type === typeFilter)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const pageTabs: { id: PageTab; label: string }[] = [
    { id: "tests", label: `System Tests (${tests.length})` },
    { id: "coverage", label: `Req Coverage${coverage ? ` (${coverage.coverage_pct.toFixed(0)}%)` : ""}` },
    { id: "readiness", label: "Release Readiness" },
    { id: "snapshot", label: "Config Snapshot" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.1rem" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.2rem" }}>System Testing & Release</h1>
        <p style={{ fontSize: "0.82rem", color: "#64748b" }}>IEC 62304 §5.7 — End-to-end test execution, requirement coverage, release gates, and configuration snapshots</p>
      </div>

      {!projectId ? (
        <div style={{ color: "#94a3b8", fontStyle: "italic" }}>Select a project from the sidebar.</div>
      ) : loading ? (
        <div style={{ color: "#94a3b8" }}>Loading…</div>
      ) : (
        <>
          {coverage && <SummaryCards cov={coverage} />}

          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "1rem" }}>
            {pageTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "0.5rem 0.95rem", border: "none", borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent", background: "none", color: tab === t.id ? "#6366f1" : "#64748b", fontWeight: tab === t.id ? 700 : 400, fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
            ))}
          </div>

          {tab === "tests" && (
            <>
              <AddTestForm projectId={projectId} requirements={requirements} onCreated={() => load(projectId)} preselectedReqId={preselectedReqId} />
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, width: 170 }} />
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="ALL">All Types</option>
                  {ST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {filtered.length === 0
                ? <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No tests match filters.</div>
                : filtered.map(tc => <TestCard key={tc.id} tc={tc} requirements={requirements} risks={risks} onRefresh={() => load(projectId)} />)
              }
            </>
          )}

          {tab === "coverage" && coverage && (
            <CoverageTab cov={coverage} onAddTest={onAddTest} />
          )}

          {tab === "readiness" && (
            <ReadinessTab releases={releases} projectId={projectId} />
          )}

          {tab === "snapshot" && (
            <SnapshotTab releases={releases} />
          )}
        </>
      )}
    </div>
  );
}
