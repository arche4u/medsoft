"use client";
import { useState, useEffect } from "react";
import {
  api,
  SoftwareUnit, UnitStatus, UnitSafetyClass,
  CodeArtifact, UnitTestCase, UnitTestResult,
  UnitCompliance, UnitCoverageMetrics,
  Requirement, Risk, SWComponent,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASS_COLOR: Record<string, string> = { A: "#22c55e", B: "#f59e0b", C: "#ef4444" };
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#94a3b8", IMPLEMENTED: "#3b82f6", VERIFIED: "#22c55e",
};
const RESULT_COLOR: Record<string, string> = { PASS: "#22c55e", FAIL: "#ef4444" };

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 6, padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>
      {text}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ units }: { units: SoftwareUnit[] }) {
  const byStatus = (s: UnitStatus) => units.filter(u => u.status === s).length;
  const byClass  = (c: string) => units.filter(u => u.safety_class === c).length;
  const unverifiedC = units.filter(u => u.safety_class === "C" && u.status !== "VERIFIED").length;

  const cards = [
    { label: "Total Units", value: units.length, color: "#6366f1" },
    { label: "Verified", value: byStatus("VERIFIED"), color: "#22c55e" },
    { label: "Implemented", value: byStatus("IMPLEMENTED"), color: "#3b82f6" },
    { label: "Draft", value: byStatus("DRAFT"), color: "#94a3b8" },
    { label: "Class C Unverified", value: unverifiedC, color: unverifiedC > 0 ? "#ef4444" : "#22c55e" },
    { label: "Class A / B / C", value: `${byClass("A")} / ${byClass("B")} / ${byClass("C")}`, color: "#8b5cf6" },
  ];

  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: `1px solid ${c.color}33`, borderRadius: 10, padding: "0.6rem 1rem", minWidth: 120 }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Compliance panel ──────────────────────────────────────────────────────────

function CompliancePanel({ unitId }: { unitId: string }) {
  const [comp, setComp] = useState<UnitCompliance | null>(null);
  const [cov, setCov] = useState<UnitCoverageMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.units.compliance(unitId),
      api.units.coverage(unitId),
    ]).then(([c, m]) => { setComp(c); setCov(m); }).finally(() => setLoading(false));
  }, [unitId]);

  if (loading) return <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Checking compliance…</div>;
  if (!comp) return null;

  const pct = Math.round((comp.checks.filter(c => c.satisfied).length / comp.checks.length) * 100);

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.9rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>Compliance</span>
        <Badge text={comp.is_compliant ? "COMPLIANT" : "NON-COMPLIANT"} color={comp.is_compliant ? "#22c55e" : "#ef4444"} />
      </div>

      {/* progress bar */}
      <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, marginBottom: "0.75rem" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: comp.is_compliant ? "#22c55e" : "#f59e0b", borderRadius: 4, transition: "width 0.3s" }} />
      </div>

      {comp.checks.map(c => (
        <div key={c.rule} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.85rem", color: c.satisfied ? "#22c55e" : c.required ? "#ef4444" : "#94a3b8", minWidth: 16 }}>
            {c.satisfied ? "✓" : c.required ? "✗" : "–"}
          </span>
          <div>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{c.label}</span>
            <span style={{ fontSize: "0.73rem", color: "#64748b", marginLeft: "0.4rem" }}>{c.detail}</span>
          </div>
        </div>
      ))}

      {cov && cov.total_test_cases > 0 && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid #e2e8f0", paddingTop: "0.6rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: "0.35rem" }}>Coverage Metrics</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.73rem", color: "#64748b" }}>
            <span>Pass rate: <b style={{ color: cov.pass_rate >= 100 ? "#22c55e" : "#f59e0b" }}>{cov.pass_rate.toFixed(0)}%</b></span>
            <span>Executed: <b>{cov.executed}/{cov.total_test_cases}</b></span>
            {cov.avg_coverage !== null && <span>Avg coverage: <b style={{ color: (cov.avg_coverage ?? 0) >= 80 ? "#22c55e" : "#ef4444" }}>{cov.avg_coverage?.toFixed(1)}%</b></span>}
            {cov.min_coverage !== null && <span>Min coverage: <b>{cov.min_coverage?.toFixed(1)}%</b></span>}
          </div>
        </div>
      )}

      {comp.blocks.length > 0 && (
        <div style={{ marginTop: "0.6rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "0.5rem 0.7rem" }}>
          <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "#dc2626", marginBottom: "0.2rem" }}>Blocking Issues</div>
          {comp.blocks.map(b => (
            <div key={b} style={{ fontSize: "0.72rem", color: "#b91c1c" }}>• {b}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Code artifact panel ───────────────────────────────────────────────────────

function ArtifactPanel({ unit, onRefresh }: { unit: SoftwareUnit; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ repository: "", branch: "", commit_id: "", file_path: "", version_tag: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.repository.trim()) { setErr("Repository is required"); return; }
    setSaving(true); setErr("");
    try {
      await api.units.artifacts.add(unit.id, {
        repository: form.repository.trim(),
        branch: form.branch || null,
        commit_id: form.commit_id || null,
        file_path: form.file_path || null,
        version_tag: form.version_tag || null,
      });
      setAdding(false);
      setForm({ repository: "", branch: "", commit_id: "", file_path: "", version_tag: "" });
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add artifact");
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this artifact?")) return;
    await api.units.artifacts.delete(id);
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>Code Artifacts</span>
        <button onClick={() => setAdding(true)} style={btnStyle("#3b82f6")}>+ Add Artifact</button>
      </div>

      {unit.artifacts.length === 0 && !adding && (
        <div style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic" }}>No code artifacts linked yet.</div>
      )}

      {unit.artifacts.map(a => (
        <div key={a.id} style={{ background: "#f1f5f9", borderRadius: 8, padding: "0.6rem 0.8rem", marginBottom: "0.5rem", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1rem" }}>📦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#1e293b", wordBreak: "break-all" }}>{a.repository}</div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
              {a.branch && <span style={metaStyle}>branch: <b>{a.branch}</b></span>}
              {a.commit_id && <span style={metaStyle}>commit: <b style={{ fontFamily: "monospace" }}>{a.commit_id.slice(0, 10)}</b></span>}
              {a.file_path && <span style={metaStyle}>path: <b>{a.file_path}</b></span>}
              {a.version_tag && <span style={metaStyle}>tag: <b>{a.version_tag}</b></span>}
            </div>
          </div>
          <button onClick={() => del(a.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
        </div>
      ))}

      {adding && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.8rem 1rem", marginTop: "0.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Repository URL *</label>
              <input value={form.repository} onChange={e => setForm(f => ({ ...f, repository: e.target.value }))} style={inputStyle} placeholder="https://github.com/org/repo" />
            </div>
            <div>
              <label style={labelStyle}>Branch</label>
              <input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} style={inputStyle} placeholder="main" />
            </div>
            <div>
              <label style={labelStyle}>Commit ID / SHA</label>
              <input value={form.commit_id} onChange={e => setForm(f => ({ ...f, commit_id: e.target.value }))} style={inputStyle} placeholder="abc1234..." />
            </div>
            <div>
              <label style={labelStyle}>File Path</label>
              <input value={form.file_path} onChange={e => setForm(f => ({ ...f, file_path: e.target.value }))} style={inputStyle} placeholder="src/module/unit.py" />
            </div>
            <div>
              <label style={labelStyle}>Version Tag</label>
              <input value={form.version_tag} onChange={e => setForm(f => ({ ...f, version_tag: e.target.value }))} style={inputStyle} placeholder="v1.0.0" />
            </div>
          </div>
          {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={save} disabled={saving} style={btnStyle("#22c55e")}>Save</button>
            <button onClick={() => setAdding(false)} style={btnStyle("#94a3b8")}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Test case row ─────────────────────────────────────────────────────────────

function TestCaseRow({ tc, onRefresh }: { tc: UnitTestCase; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [recordingResult, setRecordingResult] = useState(false);
  const [resultForm, setResultForm] = useState({ result: "PASS", logs: "", coverage_percentage: "", executed_by: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const latestResult = tc.results[0] ?? null;

  const submitResult = async () => {
    setSaving(true); setErr("");
    try {
      await api.units.testcases.recordResult(tc.id, {
        result: resultForm.result as "PASS" | "FAIL",
        logs: resultForm.logs || null,
        coverage_percentage: resultForm.coverage_percentage ? parseFloat(resultForm.coverage_percentage) : null,
        executed_by: resultForm.executed_by || null,
      });
      setRecordingResult(false);
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to record result");
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!confirm(`Delete test case "${tc.name}"?`)) return;
    await api.units.testcases.delete(tc.id);
    onRefresh();
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: "0.5rem", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.8rem", background: "#f8fafc", cursor: "pointer" }}
      >
        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: "0.82rem", color: "#1e293b" }}>{tc.name}</span>
        <Badge text={tc.test_type} color="#6366f1" />
        {latestResult
          ? <Badge text={latestResult.result} color={RESULT_COLOR[latestResult.result]} />
          : <Badge text="NOT RUN" color="#94a3b8" />
        }
      </div>

      {expanded && (
        <div style={{ padding: "0.7rem 0.9rem", background: "#fff" }}>
          {tc.description && <p style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "0.5rem" }}>{tc.description}</p>}
          {tc.expected_result && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "0.4rem 0.6rem", marginBottom: "0.6rem" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534" }}>Expected: </span>
              <span style={{ fontSize: "0.78rem", color: "#166534" }}>{tc.expected_result}</span>
            </div>
          )}

          {/* Result history */}
          {tc.results.length > 0 && (
            <div style={{ marginBottom: "0.6rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", marginBottom: "0.3rem" }}>Execution History</div>
              {tc.results.slice(0, 3).map(r => (
                <div key={r.id} style={{ display: "flex", gap: "0.6rem", alignItems: "center", fontSize: "0.75rem", color: "#475569", marginBottom: "0.2rem", padding: "0.3rem 0.5rem", background: "#f8fafc", borderRadius: 5 }}>
                  <Badge text={r.result} color={RESULT_COLOR[r.result]} />
                  <span>{new Date(r.execution_date).toLocaleString()}</span>
                  {r.executed_by && <span>by <b>{r.executed_by}</b></span>}
                  {r.coverage_percentage != null && <span>cov: <b>{r.coverage_percentage.toFixed(1)}%</b></span>}
                  {r.logs && <span style={{ color: "#94a3b8", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{r.logs}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Record result form */}
          {recordingResult ? (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.7rem 0.8rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div>
                  <label style={labelStyle}>Result *</label>
                  <select value={resultForm.result} onChange={e => setResultForm(f => ({ ...f, result: e.target.value }))} style={inputStyle}>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Coverage %</label>
                  <input type="number" min="0" max="100" value={resultForm.coverage_percentage} onChange={e => setResultForm(f => ({ ...f, coverage_percentage: e.target.value }))} style={inputStyle} placeholder="e.g. 85" />
                </div>
                <div>
                  <label style={labelStyle}>Executed By</label>
                  <input value={resultForm.executed_by} onChange={e => setResultForm(f => ({ ...f, executed_by: e.target.value }))} style={inputStyle} placeholder="Name / role" />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Logs / Notes</label>
                  <textarea value={resultForm.logs} onChange={e => setResultForm(f => ({ ...f, logs: e.target.value }))} style={{ ...inputStyle, height: 60, resize: "vertical" }} placeholder="Test output, error messages…" />
                </div>
              </div>
              {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={submitResult} disabled={saving} style={btnStyle("#22c55e")}>Record</button>
                <button onClick={() => setRecordingResult(false)} style={btnStyle("#94a3b8")}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => setRecordingResult(true)} style={btnStyle("#3b82f6")}>Record Result</button>
              <button onClick={del} style={btnStyle("#ef4444")}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test case manager ─────────────────────────────────────────────────────────

function TestCaseManager({ unit, onRefresh }: { unit: SoftwareUnit; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", test_type: "FUNCTIONAL", expected_result: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const TEST_TYPES = ["FUNCTIONAL", "BOUNDARY", "REGRESSION", "INTEGRATION", "STRESS", "SECURITY"];

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      await api.units.testcases.add(unit.id, {
        name: form.name.trim(),
        description: form.description || null,
        test_type: form.test_type,
        expected_result: form.expected_result || null,
      });
      setAdding(false);
      setForm({ name: "", description: "", test_type: "FUNCTIONAL", expected_result: "" });
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add test case");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>
          Unit Test Cases <span style={{ fontWeight: 400, color: "#94a3b8" }}>({unit.test_cases.length})</span>
        </span>
        <button onClick={() => setAdding(true)} style={btnStyle("#6366f1")}>+ Add Test Case</button>
      </div>

      {unit.test_cases.length === 0 && !adding && (
        <div style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic" }}>No test cases defined yet.</div>
      )}

      {unit.test_cases.map(tc => (
        <TestCaseRow key={tc.id} tc={tc} onRefresh={onRefresh} />
      ))}

      {adding && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.8rem 1rem", marginTop: "0.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Test case name" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value }))} style={inputStyle}>
                {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, height: 56, resize: "vertical" }} placeholder="What does this test verify?" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Expected Result</label>
              <textarea value={form.expected_result} onChange={e => setForm(f => ({ ...f, expected_result: e.target.value }))} style={{ ...inputStyle, height: 56, resize: "vertical" }} placeholder="Expected outcome when test passes" />
            </div>
          </div>
          {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={save} disabled={saving} style={btnStyle("#22c55e")}>Save</button>
            <button onClick={() => setAdding(false)} style={btnStyle("#94a3b8")}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Traceability panel ────────────────────────────────────────────────────────

function TracePanel({
  unit, requirements, risks, onRefresh,
}: {
  unit: SoftwareUnit;
  requirements: Requirement[];
  risks: Risk[];
  onRefresh: () => void;
}) {
  const [reqSel, setReqSel] = useState<Set<string>>(new Set(unit.requirement_ids));
  const [riskSel, setRiskSel] = useState<Set<string>>(new Set(unit.risk_ids));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReqSel(new Set(unit.requirement_ids));
    setRiskSel(new Set(unit.risk_ids));
  }, [unit.requirement_ids, unit.risk_ids]);

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.units.setRequirements(unit.id, [...reqSel]);
      await api.units.setRisks(unit.id, [...riskSel]);
      onRefresh();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#374151", marginBottom: "0.4rem" }}>
          Requirements ({reqSel.size})
        </div>
        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.3rem" }}>
          {requirements.map(r => (
            <label key={r.id} style={{ display: "flex", gap: "0.4rem", alignItems: "center", padding: "0.2rem 0.4rem", cursor: "pointer", fontSize: "0.76rem", color: "#374151" }}>
              <input type="checkbox" checked={reqSel.has(r.id)} onChange={() => setReqSel(toggle(reqSel, r.id))} />
              <span style={{ color: "#6366f1", fontWeight: 600, minWidth: 58 }}>{r.readable_id}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            </label>
          ))}
          {requirements.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.75rem", padding: "0.3rem" }}>No requirements in project</div>}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#374151", marginBottom: "0.4rem" }}>
          Risks ({riskSel.size})
        </div>
        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.3rem" }}>
          {risks.map(r => (
            <label key={r.id} style={{ display: "flex", gap: "0.4rem", alignItems: "center", padding: "0.2rem 0.4rem", cursor: "pointer", fontSize: "0.76rem", color: "#374151" }}>
              <input type="checkbox" checked={riskSel.has(r.id)} onChange={() => setRiskSel(toggle(riskSel, r.id))} />
              <Badge text={r.risk_level} color={r.risk_level === "HIGH" ? "#ef4444" : r.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title ?? r.hazard}</span>
            </label>
          ))}
          {risks.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.75rem", padding: "0.3rem" }}>No risks in project</div>}
        </div>
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <button onClick={save} disabled={saving} style={btnStyle("#6366f1")}>
          {saving ? "Saving…" : "Save Traceability"}
        </button>
      </div>
    </div>
  );
}

// ── Unit row ──────────────────────────────────────────────────────────────────

type UnitTab = "overview" | "code" | "tests" | "trace" | "compliance";

function UnitRow({
  unit, requirements, risks, onRefresh,
}: {
  unit: SoftwareUnit;
  requirements: Requirement[];
  risks: Risk[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<UnitTab>("overview");
  const [transitioning, setTransitioning] = useState(false);
  const [transErr, setTransErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: unit.name,
    description: unit.description ?? "",
    programming_language: unit.programming_language ?? "",
    repository_url: unit.repository_url ?? "",
    file_path: unit.file_path ?? "",
    safety_class: unit.safety_class,
  });

  const nextStatus: Record<string, UnitStatus | null> = {
    DRAFT: "IMPLEMENTED", IMPLEMENTED: "VERIFIED", VERIFIED: null,
  };
  const next = nextStatus[unit.status];

  const transition = async (s: UnitStatus) => {
    setTransitioning(true); setTransErr("");
    try {
      await api.units.transitionStatus(unit.id, s);
      onRefresh();
    } catch (e: unknown) {
      setTransErr(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed");
    } finally { setTransitioning(false); }
  };

  const saveEdit = async () => {
    await api.units.update(unit.id, {
      name: editForm.name,
      description: editForm.description || null,
      programming_language: editForm.programming_language || null,
      repository_url: editForm.repository_url || null,
      file_path: editForm.file_path || null,
      safety_class: editForm.safety_class as UnitSafetyClass,
    });
    setEditing(false);
    onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete unit "${unit.name}"?`)) return;
    await api.units.delete(unit.id);
    onRefresh();
  };

  const tabs: { id: UnitTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "code", label: `Code (${unit.artifacts.length})` },
    { id: "tests", label: `Tests (${unit.test_cases.length})` },
    { id: "trace", label: "Traceability" },
    { id: "compliance", label: "Compliance" },
  ];

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: "0.6rem", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.65rem 0.9rem", background: expanded ? "#eff6ff" : "#f8fafc", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", flex: 1 }}>{unit.name}</span>
        {unit.programming_language && (
          <span style={{ fontSize: "0.72rem", background: "#dbeafe", color: "#1d4ed8", borderRadius: 5, padding: "1px 7px", fontFamily: "monospace" }}>{unit.programming_language}</span>
        )}
        <Badge text={`Class ${unit.safety_class}`} color={CLASS_COLOR[unit.safety_class]} />
        <Badge text={unit.status} color={STATUS_COLOR[unit.status]} />
        {unit.test_cases.length > 0 && (() => {
          const passed = unit.test_cases.filter(tc => tc.latest_result === "PASS").length;
          const total = unit.test_cases.length;
          const allPass = passed === total;
          return <Badge text={`${passed}/${total} pass`} color={allPass ? "#22c55e" : "#f59e0b"} />;
        })()}
      </div>

      {expanded && (
        <div style={{ background: "#fff" }}>
          {/* tab bar */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", overflowX: "auto" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "0.45rem 0.85rem", border: "none", borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
                background: "none", color: tab === t.id ? "#6366f1" : "#64748b", fontWeight: tab === t.id ? 700 : 400,
                fontSize: "0.78rem", cursor: "pointer", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>

          <div style={{ padding: "0.9rem 1rem" }}>
            {tab === "overview" && (
              <div>
                {editing ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div><label style={labelStyle}>Name</label><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Language</label><input value={editForm.programming_language} onChange={e => setEditForm(f => ({ ...f, programming_language: e.target.value }))} style={inputStyle} placeholder="Python, TypeScript…" /></div>
                    <div><label style={labelStyle}>Repository URL</label><input value={editForm.repository_url} onChange={e => setEditForm(f => ({ ...f, repository_url: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={labelStyle}>File Path</label><input value={editForm.file_path} onChange={e => setEditForm(f => ({ ...f, file_path: e.target.value }))} style={inputStyle} /></div>
                    <div>
                      <label style={labelStyle}>Safety Class</label>
                      <select value={editForm.safety_class} onChange={e => setEditForm(f => ({ ...f, safety_class: e.target.value as UnitSafetyClass }))} style={inputStyle}>
                        <option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, height: 68, resize: "vertical" }} /></div>
                    <div style={{ gridColumn: "1/-1", display: "flex", gap: "0.5rem" }}>
                      <button onClick={saveEdit} style={btnStyle("#22c55e")}>Save</button>
                      <button onClick={() => setEditing(false)} style={btnStyle("#94a3b8")}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 1.5rem", marginBottom: "0.7rem" }}>
                      {unit.description && <div style={{ gridColumn: "1/-1", fontSize: "0.82rem", color: "#475569" }}>{unit.description}</div>}
                      <div style={infoRow}><span>Language</span><b>{unit.programming_language ?? "—"}</b></div>
                      <div style={infoRow}><span>File path</span><b style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{unit.file_path ?? "—"}</b></div>
                      <div style={infoRow}><span>Repository</span><b style={{ wordBreak: "break-all" }}>{unit.repository_url ?? "—"}</b></div>
                      <div style={infoRow}><span>Linked to</span><b>{unit.requirement_ids.length} req · {unit.risk_ids.length} risk</b></div>
                    </div>
                    {/* status transitions */}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <button onClick={() => setEditing(true)} style={btnStyle("#64748b")}>Edit</button>
                      {next && (
                        <button onClick={() => transition(next)} disabled={transitioning} style={btnStyle(STATUS_COLOR[next])}>
                          Mark as {next}
                        </button>
                      )}
                      {unit.status !== "DRAFT" && (
                        <button onClick={() => transition("DRAFT")} disabled={transitioning} style={{ ...btnStyle("#94a3b8"), fontSize: "0.72rem" }}>
                          Revert to Draft
                        </button>
                      )}
                      <button onClick={del} style={btnStyle("#ef4444")}>Delete</button>
                    </div>
                    {transErr && (
                      <div style={{ marginTop: "0.5rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "0.5rem 0.7rem", fontSize: "0.78rem", color: "#dc2626" }}>
                        {transErr}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "code" && <ArtifactPanel unit={unit} onRefresh={onRefresh} />}
            {tab === "tests" && <TestCaseManager unit={unit} onRefresh={onRefresh} />}
            {tab === "trace" && <TracePanel unit={unit} requirements={requirements} risks={risks} onRefresh={onRefresh} />}
            {tab === "compliance" && <CompliancePanel unitId={unit.id} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add unit form ─────────────────────────────────────────────────────────────

function AddUnitForm({ projectId, components, onCreated }: { projectId: string; components: SWComponent[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", programming_language: "",
    repository_url: "", file_path: "",
    safety_class: "A", component_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      await api.units.create({
        project_id: projectId,
        name: form.name.trim(),
        description: form.description || null,
        programming_language: form.programming_language || null,
        repository_url: form.repository_url || null,
        file_path: form.file_path || null,
        safety_class: form.safety_class as UnitSafetyClass,
        component_id: form.component_id || null,
      });
      setOpen(false);
      setForm({ name: "", description: "", programming_language: "", repository_url: "", file_path: "", safety_class: "A", component_id: "" });
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create unit");
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btnStyle("#6366f1"), fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}>
        + New Software Unit
      </button>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#4338ca", marginBottom: "0.7rem" }}>New Software Unit</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. AlarmController" />
        </div>
        <div>
          <label style={labelStyle}>Safety Class</label>
          <select value={form.safety_class} onChange={e => setForm(f => ({ ...f, safety_class: e.target.value }))} style={inputStyle}>
            <option value="A">Class A — Non-safety</option>
            <option value="B">Class B — Non-serious injury</option>
            <option value="C">Class C — Death / serious injury</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Language</label>
          <input value={form.programming_language} onChange={e => setForm(f => ({ ...f, programming_language: e.target.value }))} style={inputStyle} placeholder="Python, C, TypeScript…" />
        </div>
        <div>
          <label style={labelStyle}>Architecture Component</label>
          <select value={form.component_id} onChange={e => setForm(f => ({ ...f, component_id: e.target.value }))} style={inputStyle}>
            <option value="">None</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Repository URL</label>
          <input value={form.repository_url} onChange={e => setForm(f => ({ ...f, repository_url: e.target.value }))} style={inputStyle} placeholder="https://github.com/…" />
        </div>
        <div>
          <label style={labelStyle}>File Path</label>
          <input value={form.file_path} onChange={e => setForm(f => ({ ...f, file_path: e.target.value }))} style={inputStyle} placeholder="src/units/alarm.py" />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, height: 68, resize: "vertical" }} placeholder="Describe the unit's purpose and responsibilities" />
        </div>
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={save} disabled={saving} style={btnStyle("#6366f1")}>{saving ? "Creating…" : "Create Unit"}</button>
        <button onClick={() => setOpen(false)} style={btnStyle("#94a3b8")}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnitsPage() {
  const [projectId, setProjectId] = useState("");
  const [units, setUnits] = useState<SoftwareUnit[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [components, setComponents] = useState<SWComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "IMPLEMENTED" | "VERIFIED">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pid = localStorage.getItem("medsoft_active_project") ?? "";
    if (pid) { setProjectId(pid); }
    const handler = (e: Event) => {
      const pid2 = (e as CustomEvent<{ projectId: string }>).detail?.projectId ?? "";
      setProjectId(pid2);
    };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);

  const load = async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const [u, reqs, r, comps] = await Promise.all([
        api.units.list(pid),
        api.requirements.list(pid),
        api.risks.list(undefined, pid),
        api.architecture.listComponents(pid),
      ]);
      setUnits(u);
      setRequirements(reqs);
      setRisks(r);
      setComponents(comps);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) load(projectId); }, [projectId]);

  const filtered = units
    .filter(u => filter === "ALL" || u.safety_class === filter)
    .filter(u => statusFilter === "ALL" || u.status === statusFilter)
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      {/* page header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.2rem" }}>
          Software Unit Verification
        </h1>
        <p style={{ fontSize: "0.82rem", color: "#64748b" }}>
          IEC 62304 §5.5 / §5.6 — Unit implementation, test cases, and verification evidence
        </p>
      </div>

      {!projectId ? (
        <div style={{ color: "#94a3b8", fontStyle: "italic" }}>Select a project from the sidebar to continue.</div>
      ) : loading ? (
        <div style={{ color: "#94a3b8" }}>Loading…</div>
      ) : (
        <>
          <SummaryCards units={units} />

          {/* Class C release gate notice */}
          {units.some(u => u.safety_class === "C" && u.status !== "VERIFIED") && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "1rem", display: "flex", gap: "0.6rem", alignItems: "center" }}>
              <span style={{ fontSize: "1.1rem" }}>⛔</span>
              <div>
                <div style={{ fontWeight: 700, color: "#dc2626", fontSize: "0.85rem" }}>Release Blocked</div>
                <div style={{ color: "#b91c1c", fontSize: "0.78rem" }}>
                  {units.filter(u => u.safety_class === "C" && u.status !== "VERIFIED").length} Class C unit(s) are not yet verified.
                  All Class C units must be Verified before release.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
            <AddUnitForm projectId={projectId} components={components} onCreated={() => load(projectId)} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units…"
              style={{ ...inputStyle, width: 180 }} />
            <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} style={{ ...inputStyle, width: "auto" }}>
              <option value="ALL">All Classes</option>
              <option value="A">Class A</option>
              <option value="B">Class B</option>
              <option value="C">Class C</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ ...inputStyle, width: "auto" }}>
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IMPLEMENTED">Implemented</option>
              <option value="VERIFIED">Verified</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No units match the current filters.</div>
          ) : (
            filtered.map(u => (
              <UnitRow key={u.id} unit={u} requirements={requirements} risks={risks} onRefresh={() => load(projectId)} />
            ))
          )}
        </>
      )}
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "0.38rem 0.6rem",
  border: "1px solid #d1d5db", borderRadius: 6, fontSize: "0.82rem",
  outline: "none", color: "#1e293b", background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", marginBottom: "0.2rem",
};

const metaStyle: React.CSSProperties = {
  fontSize: "0.72rem", color: "#64748b",
};

const infoRow: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "0.1rem",
  fontSize: "0.78rem", color: "#94a3b8",
};

function btnStyle(color: string): React.CSSProperties {
  return {
    background: color, color: "#fff", border: "none", borderRadius: 7,
    padding: "0.38rem 0.8rem", fontSize: "0.78rem", fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}
