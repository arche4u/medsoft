"use client";
import { useState, useEffect } from "react";
import {
  api,
  IntegrationTestCase, ITCTestType, ITCResult,
  InterfaceCoverageItem, ProjectCoverage, ITCPerformanceMetrics,
  SWInterface, SWComponent, Requirement, Risk,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_TYPES: ITCTestType[] = ["DATA_FLOW", "CONTROL", "ERROR_HANDLING", "TIMING", "SECURITY", "REGRESSION"];
const TYPE_COLOR: Record<string, string> = {
  DATA_FLOW: "#3b82f6", CONTROL: "#8b5cf6", ERROR_HANDLING: "#ef4444",
  TIMING: "#f59e0b", SECURITY: "#dc2626", REGRESSION: "#64748b",
};
const RESULT_COLOR: Record<string, string> = { PASS: "#22c55e", FAIL: "#ef4444" };
const IFACE_TYPE_COLOR: Record<string, string> = {
  DATA: "#3b82f6", CONTROL: "#8b5cf6", API: "#6366f1", SIGNAL: "#f59e0b",
};

// ── Shared style helpers ──────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 6, padding: "1px 8px", fontSize: "0.71rem", fontWeight: 700 }}>
      {text}
    </span>
  );
}

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

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ cov, tests }: { cov: ProjectCoverage | null; tests: IntegrationTestCase[] }) {
  if (!cov) return null;
  const cards = [
    { label: "Interfaces", value: cov.total_interfaces, color: "#6366f1" },
    { label: "Covered", value: `${cov.covered_interfaces}/${cov.total_interfaces}`, color: cov.coverage_pct >= 100 ? "#22c55e" : "#f59e0b" },
    { label: "Test Cases", value: cov.total_tests, color: "#3b82f6" },
    { label: "Passed", value: cov.passed, color: "#22c55e" },
    { label: "Failed", value: cov.failed, color: cov.failed > 0 ? "#ef4444" : "#22c55e" },
    { label: "Not Run", value: cov.not_run, color: "#94a3b8" },
    { label: "Safety Uncovered", value: cov.safety_relevant_uncovered, color: cov.safety_relevant_uncovered > 0 ? "#dc2626" : "#22c55e" },
  ];
  return (
    <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginBottom: "1.1rem" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: `1px solid ${c.color}33`, borderRadius: 10, padding: "0.55rem 0.9rem", minWidth: 110 }}>
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: "0.71rem", color: "#64748b" }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Coverage bar ──────────────────────────────────────────────────────────────

function CoverageBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 100 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color, minWidth: 40, textAlign: "right" }}>{pct.toFixed(0)}%</span>
      <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{label}</span>
    </div>
  );
}

// ── Release gate banner ───────────────────────────────────────────────────────

function ReleaseGate({ cov }: { cov: ProjectCoverage }) {
  if (!cov.release_blocked) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.6rem 1rem", marginBottom: "0.9rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ fontSize: "1rem" }}>✅</span>
        <span style={{ fontSize: "0.82rem", color: "#166534", fontWeight: 600 }}>Integration testing gates: all clear — release is not blocked.</span>
      </div>
    );
  }
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "0.9rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: "1rem" }}>⛔</span>
        <span style={{ fontWeight: 700, color: "#dc2626", fontSize: "0.85rem" }}>Release Blocked — Integration Testing Gaps</span>
      </div>
      {cov.release_block_reasons.map(r => (
        <div key={r} style={{ fontSize: "0.77rem", color: "#b91c1c", paddingLeft: "1.5rem" }}>• {r}</div>
      ))}
    </div>
  );
}

// ── Interface coverage row ────────────────────────────────────────────────────

function InterfaceCoverageRow({
  item, tests, onSelectInterface,
}: {
  item: InterfaceCoverageItem;
  tests: IntegrationTestCase[];
  onSelectInterface: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ifaceTests = tests.filter(t => t.interface_id === item.interface_id);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 9, marginBottom: "0.45rem", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.85rem", background: expanded ? "#f0f4ff" : "#f8fafc", cursor: "pointer" }}
      >
        <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{expanded ? "▼" : "▶"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>{item.interface_name}</span>
            <Badge text={item.interface_type} color={IFACE_TYPE_COLOR[item.interface_type] ?? "#6366f1"} />
            {item.safety_relevant && <Badge text="Safety-relevant" color="#ef4444" />}
          </div>
          <div style={{ fontSize: "0.73rem", color: "#64748b", marginTop: "0.1rem" }}>
            {item.source_component} → {item.target_component}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <Badge text={`${item.test_count} tests`} color={item.is_covered ? "#6366f1" : "#94a3b8"} />
          {item.latest_result
            ? <Badge text={item.latest_result} color={RESULT_COLOR[item.latest_result] ?? "#94a3b8"} />
            : <Badge text="NOT RUN" color="#94a3b8" />
          }
          {item.coverage_gap && <span title={item.coverage_gap} style={{ color: "#ef4444", fontSize: "0.9rem" }}>⚠</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ background: "#fff", padding: "0.75rem 1rem", borderTop: "1px solid #e2e8f0" }}>
          {item.coverage_gap && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "0.4rem 0.7rem", fontSize: "0.77rem", color: "#dc2626", marginBottom: "0.6rem" }}>
              Gap: {item.coverage_gap}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: item.has_pass ? "#22c55e" : "#ef4444" }}>{item.has_pass ? "✓" : "✗"} Has PASS result</span>
            <span style={{ fontSize: "0.75rem", color: item.has_error_handling_test ? "#22c55e" : "#f59e0b" }}>{item.has_error_handling_test ? "✓" : "–"} Error handling test</span>
            <span style={{ fontSize: "0.75rem", color: item.latency_ok ? "#22c55e" : "#ef4444" }}>{item.latency_ok ? "✓" : "✗"} Latency OK</span>
          </div>

          {ifaceTests.length > 0 && (
            <div>
              <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "#64748b", marginBottom: "0.3rem" }}>Tests on this interface:</div>
              {ifaceTests.map(t => (
                <div key={t.id} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.76rem", color: "#374151", padding: "0.2rem 0" }}>
                  <Badge text={t.test_type} color={TYPE_COLOR[t.test_type] ?? "#6366f1"} />
                  <span>{t.name}</span>
                  {t.latest_result
                    ? <Badge text={t.latest_result} color={RESULT_COLOR[t.latest_result] ?? "#94a3b8"} />
                    : <Badge text="NOT RUN" color="#94a3b8" />
                  }
                </div>
              ))}
            </div>
          )}

          <button onClick={() => onSelectInterface(item.interface_id)} style={{ ...btn("#6366f1"), marginTop: "0.5rem", fontSize: "0.75rem" }}>
            + Add Test for this Interface
          </button>
        </div>
      )}
    </div>
  );
}

// ── Performance panel ─────────────────────────────────────────────────────────

function PerformancePanel({ metrics }: { metrics: ITCPerformanceMetrics[] }) {
  if (metrics.length === 0) {
    return <div style={{ color: "#94a3b8", fontSize: "0.82rem", fontStyle: "italic" }}>No latency-tracked test cases. Set a latency threshold when creating a test to enable performance tracking.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {metrics.map(m => {
        const isOk = !m.avg_latency_ms || !m.latency_threshold_ms || m.avg_latency_ms <= m.latency_threshold_ms;
        const hasBreach = m.threshold_breaches > 0;
        return (
          <div key={m.test_case_id} style={{ background: "#fff", border: `1px solid ${hasBreach ? "#fecaca" : "#e2e8f0"}`, borderRadius: 9, padding: "0.7rem 0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>{m.test_case_name}</span>
              {hasBreach && <Badge text={`${m.threshold_breaches} breach${m.threshold_breaches > 1 ? "es" : ""}`} color="#ef4444" />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem 1rem", fontSize: "0.78rem" }}>
              {m.avg_latency_ms !== null && (
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.68rem" }}>Avg latency</div>
                  <div style={{ fontWeight: 700, color: isOk ? "#1e293b" : "#ef4444" }}>{m.avg_latency_ms.toFixed(1)} ms</div>
                </div>
              )}
              {m.max_latency_ms !== null && (
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.68rem" }}>Max latency</div>
                  <div style={{ fontWeight: 700, color: m.latency_threshold_ms && m.max_latency_ms > m.latency_threshold_ms ? "#ef4444" : "#1e293b" }}>{m.max_latency_ms.toFixed(1)} ms</div>
                </div>
              )}
              {m.latency_threshold_ms !== null && (
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.68rem" }}>Threshold</div>
                  <div style={{ fontWeight: 700, color: "#6366f1" }}>{m.latency_threshold_ms} ms</div>
                </div>
              )}
              {m.data_integrity_pass_rate !== null && (
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.68rem" }}>Data integrity</div>
                  <div style={{ fontWeight: 700, color: m.data_integrity_pass_rate >= 100 ? "#22c55e" : "#f59e0b" }}>{m.data_integrity_pass_rate.toFixed(0)}%</div>
                </div>
              )}
              <div>
                <div style={{ color: "#64748b", fontSize: "0.68rem" }}>Executions</div>
                <div style={{ fontWeight: 700, color: "#374151" }}>{m.executions}</div>
              </div>
            </div>

            {/* latency bar vs threshold */}
            {m.avg_latency_ms !== null && m.latency_threshold_ms !== null && (
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min((m.avg_latency_ms / m.latency_threshold_ms) * 100, 100)}%`,
                    height: "100%",
                    background: isOk ? "#22c55e" : "#ef4444",
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.15rem" }}>
                  {((m.avg_latency_ms / m.latency_threshold_ms) * 100).toFixed(0)}% of threshold
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Test result row ───────────────────────────────────────────────────────────

function TestResultRow({ r, threshold }: { r: ITCResult; threshold: number | null }) {
  const latencyFail = threshold !== null && r.latency_ms !== null && r.latency_ms > threshold;
  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.76rem", padding: "0.35rem 0.5rem", background: "#f8fafc", borderRadius: 6, marginBottom: "0.25rem" }}>
      <Badge text={r.result} color={RESULT_COLOR[r.result]} />
      <span style={{ color: "#64748b" }}>{new Date(r.execution_date).toLocaleString()}</span>
      {r.executed_by && <span>by <b>{r.executed_by}</b></span>}
      {r.latency_ms !== null && (
        <span style={{ color: latencyFail ? "#ef4444" : "#374151" }}>
          {r.latency_ms.toFixed(1)} ms {latencyFail && "⚠ threshold"}
        </span>
      )}
      {r.data_integrity_check && <Badge text={`DI: ${r.data_integrity_check}`} color={r.data_integrity_check === "PASS" ? "#22c55e" : "#ef4444"} />}
      {r.logs && <span style={{ color: "#94a3b8", fontStyle: "italic", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.logs}</span>}
    </div>
  );
}

// ── Record result form ────────────────────────────────────────────────────────

function RecordResultForm({ tcId, threshold, onDone, onCancel }: { tcId: string; threshold: number | null; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ result: "PASS", latency_ms: "", data_integrity_check: "", executed_by: "", logs: "", error_details: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      await api.integrationTests.recordResult(tcId, {
        result: form.result as "PASS" | "FAIL",
        latency_ms: form.latency_ms ? parseFloat(form.latency_ms) : null,
        data_integrity_check: form.data_integrity_check || null,
        executed_by: form.executed_by || null,
        logs: form.logs || null,
        error_details: form.error_details || null,
      });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem 0.9rem", marginTop: "0.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div>
          <label style={labelStyle}>Result *</label>
          <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} style={inputStyle}>
            <option value="PASS">PASS</option><option value="FAIL">FAIL</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Latency (ms){threshold ? ` [threshold: ${threshold}]` : ""}</label>
          <input type="number" value={form.latency_ms} onChange={e => setForm(f => ({ ...f, latency_ms: e.target.value }))} style={inputStyle} placeholder="e.g. 45" />
        </div>
        <div>
          <label style={labelStyle}>Data Integrity</label>
          <select value={form.data_integrity_check} onChange={e => setForm(f => ({ ...f, data_integrity_check: e.target.value }))} style={inputStyle}>
            <option value="">N/A</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Executed By</label>
          <input value={form.executed_by} onChange={e => setForm(f => ({ ...f, executed_by: e.target.value }))} style={inputStyle} placeholder="Name / role" />
        </div>
        <div style={{ gridColumn: "2/-1" }}>
          <label style={labelStyle}>Logs</label>
          <input value={form.logs} onChange={e => setForm(f => ({ ...f, logs: e.target.value }))} style={inputStyle} placeholder="Test output…" />
        </div>
        {form.result === "FAIL" && (
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Error Details</label>
            <textarea value={form.error_details} onChange={e => setForm(f => ({ ...f, error_details: e.target.value }))} style={{ ...inputStyle, height: 56, resize: "vertical" }} placeholder="Root cause, stack trace…" />
          </div>
        )}
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={submit} disabled={saving} style={btn("#22c55e")}>Record</button>
        <button onClick={onCancel} style={btn("#94a3b8")}>Cancel</button>
      </div>
    </div>
  );
}

// ── Test case card ────────────────────────────────────────────────────────────

function TestCaseCard({
  tc, interfaces, requirements, risks, onRefresh,
}: {
  tc: IntegrationTestCase;
  interfaces: SWInterface[];
  requirements: Requirement[];
  risks: Risk[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"details" | "results" | "trace">("details");
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: tc.name,
    test_type: tc.test_type as ITCTestType,
    description: tc.description ?? "",
    preconditions: tc.preconditions ?? "",
    test_steps: tc.test_steps ?? "",
    expected_result: tc.expected_result ?? "",
    safety_relevance: tc.safety_relevance,
    latency_threshold_ms: tc.latency_threshold_ms?.toString() ?? "",
    interface_id: tc.interface_id ?? "",
  });
  const [reqSel, setReqSel] = useState<Set<string>>(new Set(tc.requirement_ids));
  const [riskSel, setRiskSel] = useState<Set<string>>(new Set(tc.risk_ids));
  const [savingTrace, setSavingTrace] = useState(false);

  const saveEdit = async () => {
    await api.integrationTests.update(tc.id, {
      name: editForm.name,
      test_type: editForm.test_type,
      description: editForm.description || null,
      preconditions: editForm.preconditions || null,
      test_steps: editForm.test_steps || null,
      expected_result: editForm.expected_result || null,
      safety_relevance: editForm.safety_relevance,
      latency_threshold_ms: editForm.latency_threshold_ms ? parseFloat(editForm.latency_threshold_ms) : null,
      interface_id: editForm.interface_id || null,
    });
    setEditing(false);
    onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete "${tc.name}"?`)) return;
    await api.integrationTests.delete(tc.id);
    onRefresh();
  };

  const saveTrace = async () => {
    setSavingTrace(true);
    await api.integrationTests.setRequirements(tc.id, [...reqSel]);
    await api.integrationTests.setRisks(tc.id, [...riskSel]);
    onRefresh();
    setSavingTrace(false);
  };

  const toggleSet = (s: Set<string>, id: string) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; };

  const ifaceName = interfaces.find(i => i.id === tc.interface_id)?.name ?? "No interface";

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: "0.55rem", overflow: "hidden" }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.6rem 0.85rem", background: expanded ? "#eff6ff" : "#f8fafc", cursor: "pointer" }}>
        <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "#1e293b", flex: 1 }}>{tc.name}</span>
        <span style={{ fontSize: "0.73rem", color: "#64748b" }}>{ifaceName}</span>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem 1.5rem", marginBottom: "0.7rem", fontSize: "0.79rem" }}>
                  {tc.description && <div style={{ gridColumn: "1/-1", color: "#475569" }}>{tc.description}</div>}
                  {tc.preconditions && <div><span style={{ color: "#94a3b8" }}>Preconditions: </span><span>{tc.preconditions}</span></div>}
                  {tc.latency_threshold_ms && <div><span style={{ color: "#94a3b8" }}>Latency threshold: </span><b style={{ color: "#6366f1" }}>{tc.latency_threshold_ms} ms</b></div>}
                  {tc.expected_result && (
                    <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "0.35rem 0.6rem" }}>
                      <span style={{ color: "#166534", fontWeight: 600, fontSize: "0.73rem" }}>Expected: </span>
                      <span style={{ color: "#166534" }}>{tc.expected_result}</span>
                    </div>
                  )}
                  {tc.test_steps && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.73rem", color: "#475569", marginBottom: "0.2rem" }}>Test Steps</div>
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
                  <select value={editForm.test_type} onChange={e => setEditForm(f => ({ ...f, test_type: e.target.value as ITCTestType }))} style={inputStyle}>
                    {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Interface</label>
                  <select value={editForm.interface_id} onChange={e => setEditForm(f => ({ ...f, interface_id: e.target.value }))} style={inputStyle}>
                    <option value="">No interface</option>
                    {interfaces.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Latency threshold (ms)</label><input type="number" value={editForm.latency_threshold_ms} onChange={e => setEditForm(f => ({ ...f, latency_threshold_ms: e.target.value }))} style={inputStyle} placeholder="e.g. 100" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Preconditions</label><textarea value={editForm.preconditions} onChange={e => setEditForm(f => ({ ...f, preconditions: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Test Steps</label><textarea value={editForm.test_steps} onChange={e => setEditForm(f => ({ ...f, test_steps: e.target.value }))} style={{ ...inputStyle, height: 68, resize: "vertical" }} placeholder="Step 1: ..." /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Expected Result</label><textarea value={editForm.expected_result} onChange={e => setEditForm(f => ({ ...f, expected_result: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} /></div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
                {tc.results.map(r => <TestResultRow key={r.id} r={r} threshold={tc.latency_threshold_ms} />)}
                {tc.results.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic", marginBottom: "0.5rem" }}>No executions recorded yet.</div>}
                {recording
                  ? <RecordResultForm tcId={tc.id} threshold={tc.latency_threshold_ms} onDone={() => { setRecording(false); onRefresh(); }} onCancel={() => setRecording(false)} />
                  : <button onClick={() => setRecording(true)} style={btn("#3b82f6")}>Record Execution</button>
                }
              </div>
            )}

            {tab === "trace" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: "0.35rem" }}>Requirements ({reqSel.size})</div>
                  <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.3rem" }}>
                    {requirements.map(r => (
                      <label key={r.id} style={{ display: "flex", gap: "0.35rem", alignItems: "center", padding: "0.18rem 0.35rem", fontSize: "0.75rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={reqSel.has(r.id)} onChange={() => setReqSel(s => toggleSet(s, r.id))} />
                        <span style={{ color: "#6366f1", fontWeight: 600, minWidth: 55 }}>{r.readable_id}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{r.title}</span>
                      </label>
                    ))}
                    {requirements.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.73rem", padding: "0.2rem" }}>No requirements</div>}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: "0.35rem" }}>Risks ({riskSel.size})</div>
                  <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.3rem" }}>
                    {risks.map(r => (
                      <label key={r.id} style={{ display: "flex", gap: "0.35rem", alignItems: "center", padding: "0.18rem 0.35rem", fontSize: "0.75rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={riskSel.has(r.id)} onChange={() => setRiskSel(s => toggleSet(s, r.id))} />
                        <Badge text={r.risk_level} color={r.risk_level === "HIGH" ? "#ef4444" : r.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{r.title ?? r.hazard}</span>
                      </label>
                    ))}
                    {risks.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.73rem", padding: "0.2rem" }}>No risks</div>}
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

function AddTestForm({
  projectId, interfaces, components, onCreated, preselectedInterfaceId,
}: {
  projectId: string;
  interfaces: SWInterface[];
  components: SWComponent[];
  onCreated: () => void;
  preselectedInterfaceId?: string;
}) {
  const [open, setOpen] = useState(!!preselectedInterfaceId);
  const [form, setForm] = useState({
    name: "", description: "", test_type: "DATA_FLOW" as ITCTestType,
    interface_id: preselectedInterfaceId ?? "",
    preconditions: "", test_steps: "", expected_result: "",
    safety_relevance: false, latency_threshold_ms: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (preselectedInterfaceId) {
      setForm(f => ({ ...f, interface_id: preselectedInterfaceId }));
      setOpen(true);
    }
  }, [preselectedInterfaceId]);

  const selectedIface = interfaces.find(i => i.id === form.interface_id);

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      await api.integrationTests.create({
        project_id: projectId,
        name: form.name.trim(),
        description: form.description || null,
        test_type: form.test_type,
        interface_id: form.interface_id || null,
        source_component_id: selectedIface?.source_component_id ?? null,
        target_component_id: selectedIface?.target_component_id ?? null,
        preconditions: form.preconditions || null,
        test_steps: form.test_steps || null,
        expected_result: form.expected_result || null,
        safety_relevance: form.safety_relevance,
        latency_threshold_ms: form.latency_threshold_ms ? parseFloat(form.latency_threshold_ms) : null,
      });
      setOpen(false);
      setForm({ name: "", description: "", test_type: "DATA_FLOW", interface_id: "", preconditions: "", test_steps: "", expected_result: "", safety_relevance: false, latency_threshold_ms: "" });
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ ...btn("#6366f1"), fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}>+ New Integration Test</button>;
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#4338ca", marginBottom: "0.7rem" }}>New Integration Test</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55rem" }}>
        <div><label style={labelStyle}>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Alarm → Display data flow test" /></div>
        <div>
          <label style={labelStyle}>Test Type</label>
          <select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value as ITCTestType }))} style={inputStyle}>
            {TEST_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Interface (optional — links test to a specific interface)</label>
          <select value={form.interface_id} onChange={e => setForm(f => ({ ...f, interface_id: e.target.value }))} style={inputStyle}>
            <option value="">No specific interface</option>
            {interfaces.map(i => <option key={i.id} value={i.id}>{i.name} ({i.source_component_name} → {i.target_component_name})</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Latency threshold (ms)</label>
          <input type="number" value={form.latency_threshold_ms} onChange={e => setForm(f => ({ ...f, latency_threshold_ms: e.target.value }))} style={inputStyle} placeholder="e.g. 100" />
        </div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", paddingTop: "1.2rem" }}>
          <input type="checkbox" id="sr-new" checked={form.safety_relevance} onChange={e => setForm(f => ({ ...f, safety_relevance: e.target.checked }))} />
          <label htmlFor="sr-new" style={{ ...labelStyle, marginBottom: 0 }}>Safety relevant</label>
        </div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Preconditions</label><textarea value={form.preconditions} onChange={e => setForm(f => ({ ...f, preconditions: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} placeholder="System state before test execution" /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Test Steps</label><textarea value={form.test_steps} onChange={e => setForm(f => ({ ...f, test_steps: e.target.value }))} style={{ ...inputStyle, height: 68, resize: "vertical" }} placeholder="Step 1: Send request&#10;Step 2: Verify response" /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Expected Result</label><textarea value={form.expected_result} onChange={e => setForm(f => ({ ...f, expected_result: e.target.value }))} style={{ ...inputStyle, height: 52, resize: "vertical" }} placeholder="Response received within threshold, data integrity intact" /></div>
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: "0.78rem", margin: "0.4rem 0" }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button onClick={save} disabled={saving} style={btn("#6366f1")}>{saving ? "Creating…" : "Create Test"}</button>
        <button onClick={() => setOpen(false)} style={btn("#94a3b8")}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PageTab = "tests" | "coverage" | "performance";

export default function IntegrationTestsPage() {
  const [projectId, setProjectId] = useState("");
  const [tests, setTests] = useState<IntegrationTestCase[]>([]);
  const [interfaces, setInterfaces] = useState<SWInterface[]>([]);
  const [components, setComponents] = useState<SWComponent[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [coverage, setCoverage] = useState<ProjectCoverage | null>(null);
  const [performance, setPerformance] = useState<ITCPerformanceMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PageTab>("tests");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [ifaceFilter, setIfaceFilter] = useState("ALL");
  const [preselectedIface, setPreselectedIface] = useState<string | undefined>();
  const [search, setSearch] = useState("");

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
      const [t, ifaces, comps, reqs, r, cov, perf] = await Promise.all([
        api.integrationTests.list(pid),
        api.architecture.listInterfaces(pid),
        api.architecture.listComponents(pid),
        api.requirements.list(pid),
        api.risks.list(undefined, pid),
        api.integrationTests.coverage(pid),
        api.integrationTests.performance(pid),
      ]);
      setTests(t); setInterfaces(ifaces); setComponents(comps);
      setRequirements(reqs); setRisks(r); setCoverage(cov); setPerformance(perf);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) load(projectId); }, [projectId]);

  const onSelectInterface = (id: string) => {
    setTab("tests");
    setPreselectedIface(id);
    setTimeout(() => setPreselectedIface(undefined), 500);
  };

  const filtered = tests
    .filter(t => typeFilter === "ALL" || t.test_type === typeFilter)
    .filter(t => ifaceFilter === "ALL" || t.interface_id === ifaceFilter)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const pageTabs: { id: PageTab; label: string }[] = [
    { id: "tests", label: `Test Cases (${tests.length})` },
    { id: "coverage", label: `Interface Coverage${coverage ? ` (${coverage.coverage_pct.toFixed(0)}%)` : ""}` },
    { id: "performance", label: `Performance (${performance.length})` },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.15rem" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.2rem" }}>
          Integration Testing
        </h1>
        <p style={{ fontSize: "0.82rem", color: "#64748b" }}>
          IEC 62304 §5.7 — Interface-driven integration test cases, execution evidence, and coverage
        </p>
      </div>

      {!projectId ? (
        <div style={{ color: "#94a3b8", fontStyle: "italic" }}>Select a project from the sidebar to continue.</div>
      ) : loading ? (
        <div style={{ color: "#94a3b8" }}>Loading…</div>
      ) : (
        <>
          <SummaryCards cov={coverage} tests={tests} />

          {coverage && <ReleaseGate cov={coverage} />}

          {/* page tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "1rem" }}>
            {pageTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "0.5rem 1rem", border: "none",
                borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
                background: "none", color: tab === t.id ? "#6366f1" : "#64748b",
                fontWeight: tab === t.id ? 700 : 400, fontSize: "0.82rem", cursor: "pointer",
              }}>{t.label}</button>
            ))}
          </div>

          {tab === "tests" && (
            <>
              <AddTestForm projectId={projectId} interfaces={interfaces} components={components} onCreated={() => load(projectId)} preselectedInterfaceId={preselectedIface} />
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem", alignItems: "center" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, width: 170 }} />
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="ALL">All Types</option>
                  {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={ifaceFilter} onChange={e => setIfaceFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="ALL">All Interfaces</option>
                  {interfaces.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  <option value="">No interface</option>
                </select>
              </div>
              {filtered.length === 0
                ? <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No tests match the current filters.</div>
                : filtered.map(tc => (
                  <TestCaseCard key={tc.id} tc={tc} interfaces={interfaces} requirements={requirements} risks={risks} onRefresh={() => load(projectId)} />
                ))
              }
            </>
          )}

          {tab === "coverage" && coverage && (
            <div>
              <div style={{ marginBottom: "1rem" }}>
                <CoverageBar pct={coverage.coverage_pct} label="Interface coverage" />
                <div style={{ marginTop: "0.4rem" }}>
                  <CoverageBar pct={coverage.pass_rate} label="Test pass rate" />
                </div>
              </div>
              {coverage.interfaces.length === 0
                ? <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No interfaces defined. Create architecture components and interfaces first.</div>
                : coverage.interfaces.map(item => (
                  <InterfaceCoverageRow key={item.interface_id} item={item} tests={tests} onSelectInterface={onSelectInterface} />
                ))
              }
            </div>
          )}

          {tab === "performance" && (
            <PerformancePanel metrics={performance} />
          )}
        </>
      )}
    </div>
  );
}
