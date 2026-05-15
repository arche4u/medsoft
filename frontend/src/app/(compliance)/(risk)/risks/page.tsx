"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api, Project, Requirement, SystemTestCase, IntegrationTestCase, SoftwareUnit, SoftwareItem,
  SWComponentTreeNode, Risk, RiskClass, RiskControl, RiskContribution, VerificationEvidence,
  ResidualRisk, RiskDashboard, SafetyProfile,
} from "@/lib/api";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const LEVEL_META: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: "High",   color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  MEDIUM: { label: "Medium", color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  LOW:    { label: "Low",    color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

// IEC 81001-5-1 / AAMI TIR57 — three fixed risk classes per the standard.
const RISK_CLASSES: RiskClass[] = ["SAFETY", "SECURITY", "SAFETY_SECURITY"];
const RISK_CLASS_META: Record<RiskClass, { label: string; short: string; color: string; bg: string; border: string }> = {
  SAFETY:          { label: "Safety",          short: "Safety",      color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  SECURITY:        { label: "Security",        short: "Security",    color: "#1565c0", bg: "#e3f2fd", border: "#90caf9" },
  SAFETY_SECURITY: { label: "Safety + Security", short: "Safety+Sec", color: "#6a1b9a", bg: "#f3e5f5", border: "#ce93d8" },
};

const EVIDENCE_TYPE_META: Record<VerificationEvidence["evidence_type"], { label: string; color: string }> = {
  SYSTEM_TEST:      { label: "System Test",      color: "#2e7d32" },
  INTEGRATION_TEST: { label: "Integration Test", color: "#1565c0" },
  UNIT_TEST:        { label: "Unit Test",        color: "#6a1b9a" },
  REVIEW:           { label: "Review",           color: "#455a64" },
  INSPECTION:       { label: "Inspection",       color: "#37474f" },
  ANALYSIS:         { label: "Analysis",         color: "#e65100" },
  EXTERNAL_REF:     { label: "External Ref",     color: "#5d4037" },
};

// Build a flat {id → name} map by walking the §5.3 SWComponent tree.
function flattenComponentTree(nodes: SWComponentTreeNode[], acc: { id: string; name: string }[] = []): { id: string; name: string }[] {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name });
    if (n.children?.length) flattenComponentTree(n.children, acc);
  }
  return acc;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:                   { label: "Open",             color: "#546e7a", bg: "#eceff1" },
  IN_CONTROL:             { label: "In Control",       color: "#1565c0", bg: "#e3f2fd" },
  RE_EVALUATION_REQUIRED: { label: "Re-eval Required", color: "#e65100", bg: "#fff3e0" },
  ACCEPTED:               { label: "Accepted",         color: "#2e7d32", bg: "#e8f5e9" },
  CLOSED:                 { label: "Closed",           color: "#4a148c", bg: "#f3e5f5" },
};

const CONTROL_TYPE_META: Record<string, { label: string; short: string; color: string }> = {
  INHERENT_SAFETY:       { label: "Inherent Safety by Design", short: "Inherent",    color: "#1565c0" },
  PROTECTIVE_MEASURE:    { label: "Protective Measure",        short: "Protective",  color: "#6a1b9a" },
  INFORMATION_FOR_SAFETY:{ label: "Information for Safety",    short: "Information", color: "#e65100" },
};

const IMPL_STATUS_META: Record<string, { label: string; color: string }> = {
  PROPOSED:    { label: "Proposed",    color: "#546e7a" },
  IMPLEMENTED: { label: "Implemented", color: "#1565c0" },
  VERIFIED:    { label: "Verified",    color: "#2e7d32" },
};

const CLASS_META: Record<string, { color: string; bg: string; border: string; label: string; description: string }> = {
  A: { color: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7", label: "Class A", description: "No injury or damage to health possible." },
  B: { color: "#e65100", bg: "#fff3e0", border: "#ffcc80", label: "Class B", description: "Non-serious injury is possible." },
  C: { color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a", label: "Class C", description: "Death or serious injury is possible." },
};

const DEFAULT_SEV_5 = JSON.stringify([
  { level: 1, label: "Negligible",   description: "No patient harm; minor inconvenience" },
  { level: 2, label: "Minor",        description: "Temporary discomfort; fully reversible" },
  { level: 3, label: "Moderate",     description: "Requires medical intervention; reversible" },
  { level: 4, label: "Critical",     description: "Serious or permanent injury" },
  { level: 5, label: "Catastrophic", description: "Death or irreversible serious harm" },
], null, 2);

const DEFAULT_PROB_5 = JSON.stringify([
  { level: 1, label: "Remote",   description: "< 1 in 1,000,000 device-hours" },
  { level: 2, label: "Unlikely", description: "1 in 100,000 – 1,000,000" },
  { level: 3, label: "Possible", description: "1 in 10,000 – 100,000" },
  { level: 4, label: "Likely",   description: "1 in 1,000 – 10,000" },
  { level: 5, label: "Frequent", description: "> 1 in 1,000 device-hours" },
], null, 2);

function computeLevel(s: number, p: number): RiskLevel {
  const score = s * p;
  if (score <= 4) return "LOW";
  if (score <= 9) return "MEDIUM";
  return "HIGH";
}

// ── Risk heatmap ──────────────────────────────────────────────────────────────
function RpnMatrix({ scale, heatmap }: { scale: number; heatmap?: { severity: number; probability: number; count: number }[] }) {
  const countAt = (s: number, p: number) => heatmap?.find(h => h.severity === s && h.probability === p)?.count ?? 0;
  const getCellColor = (s: number, p: number) => {
    const rpn = s * p;
    if (rpn <= 4)  return { bg: "#e8f5e9", color: "#1b5e20" };
    if (rpn <= 9)  return { bg: "#fff3e0", color: "#e65100" };
    return           { bg: "#ffebee", color: "#b71c1c" };
  };
  const max = scale;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 32, textAlign: "center", fontSize: 10, color: "#888", padding: "4px 2px" }}>S\P</th>
              {Array.from({ length: max }, (_, i) => (
                <th key={i+1} style={{ width: 40, textAlign: "center", fontSize: 10, color: "#888", padding: "4px 2px" }}>{i+1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: max }, (_, si) => max - si).map(s => (
              <tr key={s}>
                <td style={{ width: 32, textAlign: "center", fontSize: 11, color: "#888", border: "1px solid #e0e0e0", fontWeight: 600 }}>{s}</td>
                {Array.from({ length: max }, (_, pi) => pi + 1).map(p => {
                  const { bg, color } = getCellColor(s, p);
                  const cnt = countAt(s, p);
                  return (
                    <td key={p} style={{ width: 40, height: 32, textAlign: "center", fontSize: cnt > 0 ? 13 : 10,
                      background: cnt > 0 ? bg : "#fafafa", color: cnt > 0 ? color : "#ccc",
                      fontWeight: cnt > 0 ? 700 : 400, border: "1px solid #e0e0e0",
                      position: "relative" }}>
                      {cnt > 0 ? cnt : s * p}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {[{ label: "LOW", bg: "#e8f5e9", color: "#1b5e20", range: "RPN ≤ 4" },
          { label: "MEDIUM", bg: "#fff3e0", color: "#e65100", range: "RPN 5–9" },
          { label: "HIGH", bg: "#ffebee", color: "#b71c1c", range: "RPN ≥ 10" }].map(({ label, bg, color, range }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <span style={{ width: 14, height: 14, background: bg, border: `1px solid ${color}`, borderRadius: 2, display: "inline-block" }} />
            <b style={{ color }}>{label}</b>
            <span style={{ color: "#888" }}>{range}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────
function DashboardTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RiskDashboard | null>(null);
  useEffect(() => {
    api.risks.dashboard(projectId).then(setData).catch(() => setData(null));
  }, [projectId]);

  if (!data) return <p style={{ color: "#888" }}>Loading dashboard…</p>;

  const statCard = (label: string, value: number | string, color = "#1565c0") => (
    <div style={{ ...sectionCard, textAlign: "center", padding: "1rem" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {statCard("Total Risks", data.total, "#37474f")}
        {statCard("High Risk", data.by_level.HIGH ?? 0, "#b71c1c")}
        {statCard("Re-eval Required", data.re_evaluation_count, "#e65100")}
        {statCard("Controls Verified", `${data.controls_verified}/${data.controls_total}`, "#2e7d32")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={sectionCard}>
          <div style={sectionTitle}>Risk Heatmap (numbers = active risks at each S×P)</div>
          <RpnMatrix scale={5} heatmap={data.heatmap} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={sectionCard}>
            <div style={sectionTitle}>By Level</div>
            {(["HIGH", "MEDIUM", "LOW"] as RiskLevel[]).map(l => {
              const count = data.by_level[l] ?? 0;
              const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
              return (
                <div key={l} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: LEVEL_META[l].color }}>{LEVEL_META[l].label}</span>
                    <span style={{ color: "#666" }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ background: "#f0f0f0", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: LEVEL_META[l].color, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={sectionCard}>
            <div style={sectionTitle}>By Status</div>
            {Object.entries(data.by_status).map(([st, cnt]) => {
              const meta = STATUS_META[st] ?? { label: st, color: "#666", bg: "#f5f5f5" };
              return (
                <div key={st} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 8px", borderRadius: 4, marginBottom: 4, background: meta.bg }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ ...sectionCard }}>
        <div style={sectionTitle}>Residual Risk Acceptance</div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2e7d32" }}>{data.residual_accepted}</div>
          <div style={{ fontSize: 13, color: "#555" }}>
            risks with accepted residual risk out of {data.total} total.
            {data.total > 0 && (
              <span style={{ color: data.residual_accepted === data.total ? "#2e7d32" : "#e65100", marginLeft: 6, fontWeight: 600 }}>
                ({Math.round((data.residual_accepted / data.total) * 100)}% complete)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Verification Evidence row + modal (§7.3) ─────────────────────────────────
function EvidenceModal({ control, systemTests, integrationTests, units, onClose, onSaved }: {
  control: RiskControl;
  systemTests: SystemTestCase[]; integrationTests: IntegrationTestCase[]; units: SoftwareUnit[];
  onClose: () => void; onSaved: () => void;
}) {
  const [evType, setEvType]   = useState<VerificationEvidence["evidence_type"]>("SYSTEM_TEST");
  const [stId, setStId]       = useState("");
  const [itId, setItId]       = useState("");
  const [utId, setUtId]       = useState("");
  const [extRef, setExtRef]   = useState("");
  const [result, setResult]   = useState<"PASS" | "FAIL">("PASS");
  const [notes, setNotes]     = useState("");
  const [verBy, setVerBy]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Flatten units → unit test cases (UnitTestCase comes nested under SoftwareUnit).
  const unitTestCases = units.flatMap(u =>
    u.test_cases.map(tc => ({ id: tc.id, label: `${u.name} / ${tc.name}` }))
  );

  async function handleSubmit() {
    setSaving(true); setError("");
    try {
      const payload: Parameters<typeof api.risks.evidence.add>[1] = {
        evidence_type: evType,
        result, notes: notes.trim() || null,
        verified_by: verBy.trim() || null,
      };
      if (evType === "SYSTEM_TEST"      && stId)    payload.system_test_id      = stId;
      if (evType === "INTEGRATION_TEST" && itId)    payload.integration_test_id = itId;
      if (evType === "UNIT_TEST"        && utId)    payload.unit_test_id        = utId;
      if (evType === "EXTERNAL_REF"     && extRef.trim()) payload.external_reference = extRef.trim();
      await api.risks.evidence.add(control.id, payload);
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Add Verification Evidence (§7.3)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Evidence Type</label>
            <select value={evType} onChange={e => setEvType(e.target.value as VerificationEvidence["evidence_type"])}
              style={inputStyle}>
              {(Object.keys(EVIDENCE_TYPE_META) as VerificationEvidence["evidence_type"][]).map(k => (
                <option key={k} value={k}>{EVIDENCE_TYPE_META[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Result</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["PASS", "FAIL"] as const).map(r => (
                <button key={r} type="button" onClick={() => setResult(r)} style={{
                  flex: 1, padding: "6px 12px", borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${r === "PASS" ? "#2e7d32" : "#b71c1c"}`,
                  background: result === r ? (r === "PASS" ? "#e8f5e9" : "#ffebee") : "#fff",
                  color: r === "PASS" ? "#2e7d32" : "#b71c1c", fontWeight: 700, fontSize: 12,
                }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {evType === "SYSTEM_TEST" && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>System Test</label>
            <select value={stId} onChange={e => setStId(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {systemTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {evType === "INTEGRATION_TEST" && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Integration Test</label>
            <select value={itId} onChange={e => setItId(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {integrationTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {evType === "UNIT_TEST" && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Unit Test</label>
            <select value={utId} onChange={e => setUtId(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {unitTestCases.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        )}
        {evType === "EXTERNAL_REF" && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>External Reference (URL / doc ID)</label>
            <input value={extRef} onChange={e => setExtRef(e.target.value)}
              placeholder="e.g. https://… or DOC-123" style={inputStyle} />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Verified By</label>
          <input value={verBy} onChange={e => setVerBy(e.target.value)} style={inputStyle} />
        </div>

        {result === "PASS" && (
          <p style={{ fontSize: 11, color: "#1b5e20", margin: "0 0 8px", fontStyle: "italic" }}>
            Adding PASS will mark this control VERIFIED.
          </p>
        )}
        {error && <p style={{ color: "red", fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...btnStyle, background: "#757575" }}>Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={btnStyle}>
            {saving ? "Saving…" : "Add Evidence"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EvidenceTable({ control, systemTestById, integrationTestById, unitTestById, onReload }: {
  control: RiskControl;
  systemTestById: Record<string, SystemTestCase>;
  integrationTestById: Record<string, IntegrationTestCase>;
  unitTestById: Record<string, { label: string }>;
  onReload: () => void;
}) {
  async function handleDelete(ev: VerificationEvidence) {
    if (!confirm("Delete this evidence row?")) return;
    await api.risks.evidence.delete(ev.id);
    onReload();
  }
  if (!control.evidence.length) {
    return <p style={{ color: "#aaa", fontSize: 11, margin: "4px 0 0" }}>No verification evidence recorded.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 4 }}>
      <thead>
        <tr style={{ background: "#f5f5f5" }}>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px" }}>Type</th>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px" }}>Reference</th>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px", width: 50 }}>Result</th>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px" }}>Verified By</th>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px", width: 90 }}>Date</th>
          <th style={{ ...thStyle, fontSize: 10, padding: "4px 6px", width: 30 }}></th>
        </tr>
      </thead>
      <tbody>
        {control.evidence.map(ev => {
          const meta = EVIDENCE_TYPE_META[ev.evidence_type];
          let refLabel = "—";
          if (ev.system_test_id      && systemTestById[ev.system_test_id])           refLabel = systemTestById[ev.system_test_id].name;
          else if (ev.integration_test_id && integrationTestById[ev.integration_test_id]) refLabel = integrationTestById[ev.integration_test_id].name;
          else if (ev.unit_test_id        && unitTestById[ev.unit_test_id])               refLabel = unitTestById[ev.unit_test_id].label;
          else if (ev.external_reference) refLabel = ev.external_reference;
          else if (ev.notes)              refLabel = ev.notes.slice(0, 60);
          const date = ev.verified_at ? new Date(ev.verified_at).toLocaleDateString() : "—";
          const resultColor = ev.result === "PASS" ? "#2e7d32" : "#b71c1c";
          return (
            <tr key={ev.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ ...tdStyle, padding: "4px 6px" }}>
                <span style={{ fontSize: 10, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
              </td>
              <td style={{ ...tdStyle, padding: "4px 6px" }}>{refLabel}</td>
              <td style={{ ...tdStyle, padding: "4px 6px", color: resultColor, fontWeight: 700 }}>{ev.result}</td>
              <td style={{ ...tdStyle, padding: "4px 6px", color: "#555" }}>{ev.verified_by ?? "—"}</td>
              <td style={{ ...tdStyle, padding: "4px 6px", color: "#888" }}>{date}</td>
              <td style={{ ...tdStyle, padding: "4px 6px", textAlign: "right" }}>
                <button type="button" onClick={() => handleDelete(ev)}
                  style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 12 }}>✕</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Risk Controls Panel ───────────────────────────────────────────────────────
function ControlsPanel({ risk, reqs, systemTests, integrationTests, units, componentMap, onReload }: {
  risk: Risk; reqs: Requirement[]; systemTests: SystemTestCase[];
  integrationTests: IntegrationTestCase[]; units: SoftwareUnit[];
  componentMap: Record<string, string>;
  onReload: () => void;
}) {
  const [showAdd, setShowAdd]   = useState(false);
  const [cType, setCType]       = useState("INHERENT_SAFETY");
  const [cDesc, setCDesc]       = useState("");
  const [cReqId, setCReqId]     = useState("");
  const [cTcId, setCTcId]       = useState("");
  const [cCompId, setCCompId]   = useState("");
  const [cStatus, setCStatus]   = useState("PROPOSED");
  const [cNotes, setCNotes]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  // Edit-control state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eDesc, setEDesc]         = useState("");
  const [eCompId, setECompId]     = useState("");
  const [eReqId, setEReqId]       = useState("");
  const [eTcId, setETcId]         = useState("");

  // Evidence modal state.
  const [evCtrl, setEvCtrl] = useState<RiskControl | null>(null);

  async function handleAdd() {
    if (!cDesc.trim()) { setError("Description is required"); return; }
    setSaving(true); setError("");
    try {
      await api.risks.controls.create(risk.id, {
        control_type: cType, description: cDesc,
        requirement_id: cReqId || null, system_test_id: cTcId || null,
        component_id: cCompId || null,
        implementation_status: cStatus, verification_notes: cNotes || null,
      });
      setCDesc(""); setCReqId(""); setCTcId(""); setCCompId(""); setCNotes(""); setShowAdd(false);
      onReload();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  function startEdit(ctrl: RiskControl) {
    setEditingId(ctrl.id);
    setEDesc(ctrl.description);
    setECompId(ctrl.component_id ?? "");
    setEReqId(ctrl.requirement_id ?? "");
    setETcId(ctrl.system_test_id ?? "");
  }

  async function saveEdit(ctrl: RiskControl) {
    await api.risks.controls.update(ctrl.id, {
      description: eDesc,
      component_id: eCompId || null,
      requirement_id: eReqId || null,
      system_test_id: eTcId || null,
    });
    setEditingId(null);
    onReload();
  }

  async function handleUpdateStatus(ctrl: RiskControl, status: string) {
    await api.risks.controls.update(ctrl.id, { implementation_status: status });
    onReload();
  }

  async function handleDelete(ctrl: RiskControl) {
    if (!confirm("Delete this risk control?")) return;
    await api.risks.controls.delete(ctrl.id);
    onReload();
  }

  const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));
  const tcById  = Object.fromEntries(systemTests.map(t => [t.id, t]));
  const itById  = Object.fromEntries(integrationTests.map(t => [t.id, t]));
  const unitTestById: Record<string, { label: string }> = {};
  for (const u of units) for (const tc of u.test_cases) unitTestById[tc.id] = { label: `${u.name} / ${tc.name}` };

  return (
    <div style={{ padding: "10px 14px 12px", background: "#f8faff", borderTop: "1px solid #c5cae9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#3949ab", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Risk Controls ({risk.controls.length})
        </span>
        <button type="button" onClick={() => setShowAdd(v => !v)} style={{
          fontSize: 11, padding: "1px 10px", borderRadius: 10, border: "1px solid #7986cb",
          background: showAdd ? "#3949ab" : "#e8eaf6", color: showAdd ? "#fff" : "#3949ab", cursor: "pointer",
        }}>{showAdd ? "Cancel" : "+ Add"}</button>
      </div>

      {risk.controls.map(ctrl => {
        const meta = CONTROL_TYPE_META[ctrl.control_type] ?? { label: ctrl.control_type, short: ctrl.control_type, color: "#546e7a" };
        const impl = IMPL_STATUS_META[ctrl.implementation_status] ?? { label: ctrl.implementation_status, color: "#546e7a" };
        const linkedReq  = ctrl.requirement_id ? reqById[ctrl.requirement_id] : null;
        const linkedTc   = ctrl.system_test_id ? tcById[ctrl.system_test_id] : null;
        const linkedComp = ctrl.component_id ? componentMap[ctrl.component_id] : null;
        const isEditing  = editingId === ctrl.id;
        return (
          <div key={ctrl.id} style={{ marginBottom: 6, padding: "8px 10px", background: "#fff", border: "1px solid #e8eaf6", borderRadius: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: meta.color, color: "#fff", fontSize: 10, padding: "1px 7px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                {meta.short}
              </span>
              <span style={{ fontSize: 13, flex: 1 }}>{ctrl.description}</span>
              <select value={ctrl.implementation_status} onChange={e => handleUpdateStatus(ctrl, e.target.value)}
                style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, border: `1px solid ${impl.color}`,
                  background: "#fff", color: impl.color, fontWeight: 600, cursor: "pointer" }}>
                {Object.entries(IMPL_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => isEditing ? setEditingId(null) : startEdit(ctrl)}
                style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, cursor: "pointer",
                  background: isEditing ? "#e3f2fd" : "#f5f5f5", border: `1px solid ${isEditing ? "#1565c0" : "#ddd"}`,
                  color: isEditing ? "#1565c0" : "#555" }}>{isEditing ? "Cancel" : "Edit"}</button>
              <button type="button" onClick={() => handleDelete(ctrl)}
                style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {linkedReq && (
                <a href={`/requirements?highlight=${linkedReq.id}`}
                  style={{ fontSize: 11, color: "#1565c0", background: "#e3f2fd", padding: "1px 7px", borderRadius: 4, textDecoration: "none", fontFamily: "monospace" }}>
                  {linkedReq.readable_id} {linkedReq.title.slice(0, 40)}
                </a>
              )}
              {linkedTc && (
                <a href={`/system-testing?highlight=${linkedTc.id}`}
                  style={{ fontSize: 11, color: "#2e7d32", background: "#e8f5e9", padding: "1px 7px", borderRadius: 4, textDecoration: "none", fontFamily: "monospace" }}>
                  ST: {linkedTc.name.slice(0, 40)}
                </a>
              )}
              {linkedComp && (
                <span style={{ fontSize: 11, color: "#5e35b1", background: "#ede7f6", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace" }}>
                  §5.3 {linkedComp.slice(0, 40)}
                </span>
              )}
            </div>

            {isEditing && (
              <div style={{ marginTop: 8, padding: 8, background: "#f5f7fb", border: "1px solid #c5cae9", borderRadius: 4 }}>
                <div style={{ marginBottom: 6 }}>
                  <label style={labelStyle}>Description</label>
                  <input value={eDesc} onChange={e => setEDesc(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <div>
                    <label style={labelStyle}>§5.3 Component</label>
                    <select value={eCompId} onChange={e => setECompId(e.target.value)} style={inputStyle}>
                      <option value="">— none</option>
                      {Object.entries(componentMap).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Requirement</label>
                    <select value={eReqId} onChange={e => setEReqId(e.target.value)} style={inputStyle}>
                      <option value="">— none</option>
                      {reqs.filter(r => r.type === "SOFTWARE" || r.type === "SYSTEM").map(r => (
                        <option key={r.id} value={r.id}>{r.readable_id} {r.title.slice(0, 40)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>System Test</label>
                    <select value={eTcId} onChange={e => setETcId(e.target.value)} style={inputStyle}>
                      <option value="">— none</option>
                      {systemTests.map(t => <option key={t.id} value={t.id}>{t.name.slice(0, 50)}</option>)}
                    </select>
                  </div>
                </div>
                <button type="button" onClick={() => saveEdit(ctrl)} style={{ ...btnStyle, fontSize: 12, padding: "4px 12px" }}>Save</button>
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed #e0e0e0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#3949ab", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Verification Evidence (§7.3)
                </span>
                <button type="button" onClick={() => setEvCtrl(ctrl)} style={{
                  marginLeft: "auto", fontSize: 10, padding: "1px 8px", borderRadius: 10,
                  border: "1px solid #7986cb", background: "#e8eaf6", color: "#3949ab", cursor: "pointer",
                }}>+ Evidence</button>
              </div>
              <EvidenceTable control={ctrl}
                systemTestById={tcById} integrationTestById={itById} unitTestById={unitTestById}
                onReload={onReload} />
            </div>
          </div>
        );
      })}

      {evCtrl && (
        <EvidenceModal control={evCtrl}
          systemTests={systemTests} integrationTests={integrationTests} units={units}
          onClose={() => setEvCtrl(null)} onSaved={onReload} />
      )}

      {risk.controls.length === 0 && !showAdd && (
        <p style={{ color: "#aaa", fontSize: 12, margin: "4px 0" }}>No controls defined. Add at least one ISO 14971 §6.2 control.</p>
      )}

      {showAdd && (
        <div style={{ padding: "10px", background: "#fff", border: "1px solid #c5cae9", borderRadius: 6, marginTop: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Control Type (ISO 14971 §6.2)</label>
              <select value={cType} onChange={e => setCType(e.target.value)} style={inputStyle}>
                {Object.entries(CONTROL_TYPE_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Implementation Status</label>
              <select value={cStatus} onChange={e => setCStatus(e.target.value)} style={inputStyle}>
                {Object.keys(IMPL_STATUS_META).map(k => (
                  <option key={k} value={k}>{IMPL_STATUS_META[k].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Description *</label>
            <textarea value={cDesc} onChange={e => setCDesc(e.target.value)} rows={2}
              placeholder="Describe the control measure…"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>§5.3 Component (optional)</label>
              <select value={cCompId} onChange={e => setCCompId(e.target.value)} style={inputStyle}>
                <option value="">— none</option>
                {Object.entries(componentMap).map(([id, name]) => (
                  <option key={id} value={id}>{name.slice(0, 50)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Link to Requirement (optional)</label>
              <select value={cReqId} onChange={e => setCReqId(e.target.value)} style={inputStyle}>
                <option value="">— none</option>
                {reqs.filter(r => r.type === "SOFTWARE" || r.type === "SYSTEM").map(r => (
                  <option key={r.id} value={r.id}>{r.readable_id} {r.title.slice(0, 50)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Link to System Test (optional)</label>
              <select value={cTcId} onChange={e => setCTcId(e.target.value)} style={inputStyle}>
                <option value="">— none</option>
                {systemTests.map(t => (
                  <option key={t.id} value={t.id}>{t.name.slice(0, 60)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Verification Notes (optional)</label>
            <input value={cNotes} onChange={e => setCNotes(e.target.value)}
              placeholder="Notes on how this was verified…" style={inputStyle} />
          </div>
          {error && <p style={{ color: "red", fontSize: 12, margin: "0 0 6px" }}>{error}</p>}
          <button type="button" onClick={handleAdd} disabled={saving} style={{ ...btnStyle, fontSize: 12, padding: "5px 14px" }}>
            {saving ? "Saving…" : "Add Control"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Residual Risk Panel ───────────────────────────────────────────────────────
function ResidualPanel({ risk, onReload }: { risk: Risk; onReload: () => void }) {
  const rr = risk.residual_risk;
  const [sev, setSev]       = useState(rr?.severity ?? 1);
  const [prob, setProb]     = useState(rr?.probability ?? 1);
  const [rationale, setRat] = useState(rr?.rationale ?? "");
  const [accept, setAccept] = useState(rr?.is_accepted ?? false);
  const [acceptedBy, setAby]= useState(rr?.accepted_by ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSave() {
    setSaving(true); setError("");
    try {
      await api.risks.residual.upsert(risk.id, {
        severity: sev, probability: prob,
        rationale: rationale.trim() || null,
        is_accepted: accept,
        accepted_by: accept ? (acceptedBy.trim() || null) : null,
      });
      onReload();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const previewLvl = computeLevel(sev, prob);
  const lvlMeta = LEVEL_META[previewLvl];

  return (
    <div style={{ padding: "10px 14px 12px", background: "#fffde7", borderTop: "1px solid #fff176" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#f57f17", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Residual Risk (ISO 14971 §6.4)
        {rr?.is_accepted && (
          <span style={{ marginLeft: 8, background: "#2e7d32", color: "#fff", fontSize: 10, padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>
            ACCEPTED{rr.accepted_by ? ` by ${rr.accepted_by}` : ""}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>Residual Severity (1–5)</label>
          <input type="number" min={1} max={5} value={sev} onChange={e => setSev(+e.target.value)}
            style={{ ...inputStyle, width: 70 }} />
        </div>
        <div>
          <label style={labelStyle}>Residual Probability (1–5)</label>
          <input type="number" min={1} max={5} value={prob} onChange={e => setProb(+e.target.value)}
            style={{ ...inputStyle, width: 70 }} />
        </div>
        <div style={{ paddingBottom: 2 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Residual Level: </span>
          <b style={{ color: lvlMeta.color }}>{previewLvl}</b>
          <span style={{ color: "#888", fontSize: 11, marginLeft: 4 }}>(score: {sev * prob})</span>
          {risk.severity * risk.probability > sev * prob && (
            <span style={{ marginLeft: 6, fontSize: 11, color: "#2e7d32" }}>
              ↓ reduced from {risk.severity * risk.probability}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>Acceptance Rationale *</label>
        <textarea value={rationale} onChange={e => setRat(e.target.value)} rows={2}
          placeholder="Justify why this residual risk level is acceptable (ALARP principle)…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />
          <span><b>Accept residual risk</b></span>
        </label>
        {accept && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <input value={acceptedBy} onChange={e => setAby(e.target.value)}
              placeholder="Accepted by (name / role)"
              style={{ ...inputStyle, fontSize: 12, padding: "4px 8px" }} />
          </div>
        )}
      </div>

      {error && <p style={{ color: "red", fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
      <button type="button" onClick={handleSave} disabled={saving}
        style={{ ...btnStyle, marginTop: 8, fontSize: 12, padding: "5px 14px", background: "#f57f17" }}>
        {saving ? "Saving…" : "Save Residual Risk"}
      </button>
    </div>
  );
}

// ── Risk Contributions Panel (§7.1) ───────────────────────────────────────────
function ContributionsPanel({ risk, componentMap, softwareItemMap, onReload }: {
  risk: Risk;
  componentMap: Record<string, string>;
  softwareItemMap: Record<string, string>;
  onReload: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind]       = useState<"SW_ITEM" | "COMPONENT">("SW_ITEM");
  const [targetId, setTargetId] = useState("");
  const [notes, setNotes]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function handleAdd() {
    if (!targetId) { setError("Select a target"); return; }
    setSaving(true); setError("");
    try {
      const payload = kind === "SW_ITEM"
        ? { software_item_id: targetId, contribution_notes: notes.trim() || undefined }
        : { component_id: targetId, contribution_notes: notes.trim() || undefined };
      await api.risks.contributions.add(risk.id, payload);
      setShowAdd(false); setTargetId(""); setNotes("");
      onReload();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(c: RiskContribution) {
    if (!confirm("Delete this contribution?")) return;
    await api.risks.contributions.delete(c.id);
    onReload();
  }

  return (
    <div style={{ padding: "8px 14px 10px", background: "#f1f8e9", borderTop: "1px solid #c5e1a5" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#33691e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Contributions (§7.1) — {risk.contributions.length}
        </span>
        <button type="button" onClick={() => setShowAdd(v => !v)} style={{
          fontSize: 11, padding: "1px 10px", borderRadius: 10, border: "1px solid #689f38",
          background: showAdd ? "#558b2f" : "#dcedc8", color: showAdd ? "#fff" : "#33691e", cursor: "pointer",
        }}>{showAdd ? "Cancel" : "+ Add"}</button>
      </div>

      {risk.contributions.length === 0 && !showAdd && (
        <p style={{ color: "#9e9d24", fontSize: 11, margin: "2px 0 0" }}>
          No software item / component contributions linked yet.
        </p>
      )}

      {risk.contributions.map(c => {
        const isItem = !!c.software_item_id;
        const name = isItem
          ? (softwareItemMap[c.software_item_id!] ?? c.software_item_id)
          : (componentMap[c.component_id!] ?? c.component_id);
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px",
            background: "#fff", border: "1px solid #c5e1a5", borderRadius: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
              background: isItem ? "#e3f2fd" : "#ede7f6", color: isItem ? "#1565c0" : "#5e35b1" }}>
              {isItem ? "SW Item" : "§5.3"}
            </span>
            <span style={{ fontSize: 12, flex: 1 }}>{name}</span>
            {c.contribution_notes && (
              <span style={{ fontSize: 11, color: "#666", fontStyle: "italic" }}>
                {c.contribution_notes.length > 80 ? c.contribution_notes.slice(0, 80) + "…" : c.contribution_notes}
              </span>
            )}
            <button type="button" onClick={() => handleDelete(c)}
              style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        );
      })}

      {showAdd && (
        <div style={{ padding: 8, background: "#fff", border: "1px solid #c5e1a5", borderRadius: 4, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["SW_ITEM", "COMPONENT"] as const).map(k => (
              <button key={k} type="button" onClick={() => { setKind(k); setTargetId(""); }}
                style={{
                  flex: 1, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600,
                  border: `1px solid ${kind === k ? "#558b2f" : "#ddd"}`,
                  background: kind === k ? "#dcedc8" : "#fafafa",
                  color: kind === k ? "#33691e" : "#555",
                }}>{k === "SW_ITEM" ? "Software Item" : "§5.3 SW Component"}</button>
            ))}
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Target</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {kind === "SW_ITEM"
                ? Object.entries(softwareItemMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)
                : Object.entries(componentMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)
              }
            </select>
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Contribution Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="How does this item/component contribute to the hazard?"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          {error && <p style={{ color: "red", fontSize: 11, margin: "0 0 6px" }}>{error}</p>}
          <button type="button" onClick={handleAdd} disabled={saving}
            style={{ ...btnStyle, fontSize: 12, padding: "4px 12px", background: "#558b2f" }}>
            {saving ? "Saving…" : "Add Contribution"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Re-evaluation modal (§7) ──────────────────────────────────────────────────
function ReevaluateModal({ risk, onClose, onSaved }: { risk: Risk; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes]   = useState("");
  const [by, setBy]         = useState("");
  const [sev, setSev]       = useState<number | "">("");
  const [prob, setProb]     = useState<number | "">("");
  const [newStatus, setNS]  = useState<"" | "OPEN" | "IN_CONTROL" | "ACCEPTED" | "CLOSED">("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit() {
    if (!notes.trim()) { setError("Notes are required"); return; }
    setSaving(true); setError("");
    try {
      await api.risks.recordReevaluation(risk.id, {
        notes: notes.trim(),
        re_evaluated_by: by.trim() || null,
        ...(sev  !== "" ? { severity:  +sev } : {}),
        ...(prob !== "" ? { probability: +prob } : {}),
        ...(newStatus ? { new_status: newStatus } : {}),
      });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Re-evaluate Risk</h3>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
          {risk.hazard} → {risk.harm}
        </p>
        {risk.re_evaluation_reason && (
          <div style={{ padding: "6px 10px", background: "#fff3e0", borderLeft: "3px solid #e65100",
            fontSize: 12, color: "#555", marginBottom: 10, borderRadius: "0 4px 4px 0" }}>
            <b>Trigger:</b> {risk.re_evaluation_reason}
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Re-evaluation Notes *</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Document the re-evaluation outcome…"
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Re-evaluated By</label>
          <input value={by} onChange={e => setBy(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <label style={labelStyle}>New Severity (1–5)</label>
            <input type="range" min={1} max={5} value={sev === "" ? risk.severity : sev}
              onChange={e => setSev(+e.target.value)} style={{ width: "100%" }} />
            <div style={{ fontSize: 11, color: "#555", textAlign: "center" }}>
              {sev === "" ? <span style={{ color: "#aaa" }}>unchanged ({risk.severity})</span> : sev}
            </div>
          </div>
          <div>
            <label style={labelStyle}>New Probability (1–5)</label>
            <input type="range" min={1} max={5} value={prob === "" ? risk.probability : prob}
              onChange={e => setProb(+e.target.value)} style={{ width: "100%" }} />
            <div style={{ fontSize: 11, color: "#555", textAlign: "center" }}>
              {prob === "" ? <span style={{ color: "#aaa" }}>unchanged ({risk.probability})</span> : prob}
            </div>
          </div>
          <div>
            <label style={labelStyle}>New Status</label>
            <select value={newStatus} onChange={e => setNS(e.target.value as typeof newStatus)} style={inputStyle}>
              <option value="">— unchanged —</option>
              <option value="OPEN">Open</option>
              <option value="IN_CONTROL">In Control</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>
        {error && <p style={{ color: "red", fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...btnStyle, background: "#757575" }}>Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={btnStyle}>
            {saving ? "Saving…" : "Record Re-evaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Re-evaluation Inbox tab ───────────────────────────────────────────────────
function ReevalInboxTab({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [list, setList]   = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState<Risk | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.risks.needsReevaluation(projectId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [projectId]);

  if (loading) return <p style={{ color: "#888" }}>Loading inbox…</p>;
  if (list.length === 0) {
    return (
      <div style={{ ...sectionCard, textAlign: "center", color: "#2e7d32" }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#2e7d32" }}>✓</div>
        <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
          No risks awaiting re-evaluation. All linked changes have been assessed.
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
        Risks below need ISO 14971 §7 re-evaluation following a change. Record an outcome to clear them from this inbox.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map(r => {
          const lvl = LEVEL_META[r.risk_level as RiskLevel] ?? LEVEL_META.HIGH;
          const cls = RISK_CLASS_META[r.risk_class];
          const triggered = r.re_evaluation_triggered_at ? new Date(r.re_evaluation_triggered_at).toLocaleString() : null;
          return (
            <div key={r.id} style={{ ...sectionCard, borderLeft: "4px solid #e65100" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ background: lvl.color, color: "#fff", borderRadius: 3, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                  {r.risk_level}
                </span>
                <span style={{ background: cls.color, color: "#fff", borderRadius: 3, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                  {cls.short}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#999" }}>
                  #{r.id.slice(0, 8)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#37474f", flex: 1 }}>{r.hazard}</span>
                <button type="button" onClick={() => setActive(r)} style={{
                  padding: "4px 14px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: "#e65100", color: "#fff", fontSize: 12, fontWeight: 700,
                }}>Re-evaluate</button>
              </div>
              {r.re_evaluation_reason && (
                <div style={{ padding: "5px 9px", background: "#fff3e0", borderLeft: "3px solid #e65100",
                  fontSize: 12, color: "#555", borderRadius: "0 4px 4px 0", marginBottom: 4 }}>
                  {r.re_evaluation_reason}
                </div>
              )}
              {triggered && (
                <div style={{ fontSize: 11, color: "#888" }}>Triggered at {triggered}</div>
              )}
            </div>
          );
        })}
      </div>
      {active && (
        <ReevaluateModal risk={active}
          onClose={() => setActive(null)}
          onSaved={() => { load(); onChanged(); }} />
      )}
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────
function RiskRow({ risk, req, reqs, systemTests, integrationTests, units, componentMap, softwareItemMap, isLast, onDelete, onUpdate }: {
  risk: Risk; req?: Requirement; reqs: Requirement[]; systemTests: SystemTestCase[];
  integrationTests: IntegrationTestCase[]; units: SoftwareUnit[];
  componentMap: Record<string, string>; softwareItemMap: Record<string, string>;
  isLast: boolean; onDelete: (id: string) => void; onUpdate: (updated: Risk) => void;
}) {
  const [editing,           setEditing]           = useState(false);
  const [showControls,      setShowControls]      = useState(false);
  const [showResidual,      setShowResidual]      = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [showReeval,        setShowReeval]        = useState(false);
  const [statusErr,         setStatusErr]         = useState("");
  const [statusSaving,      setStatusSaving]      = useState(false);

  // Edit form state
  const [hazard,    setHazard]   = useState(risk.hazard);
  const [hazSit,    setHazSit]   = useState(risk.hazardous_situation);
  const [harm,      setHarm]     = useState(risk.harm);
  const [sev,       setSev]      = useState(risk.severity);
  const [prob,      setProb]     = useState(risk.probability);
  const [mit,       setMit]      = useState(risk.mitigation ?? "");
  const [notes,     setNotes]    = useState(risk.evaluation_notes ?? "");
  const [riskClass, setRiskClass] = useState<RiskClass>(risk.risk_class);
  const [saving,    setSaving]   = useState(false);
  const [error,     setError]    = useState("");

  const level = risk.risk_level as RiskLevel;
  const levelMeta  = LEVEL_META[level] ?? LEVEL_META.HIGH;
  const statusMeta = STATUS_META[risk.status] ?? STATUS_META.OPEN;
  const classMeta  = RISK_CLASS_META[risk.risk_class];

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await api.risks.update(risk.id, {
        hazard, hazardous_situation: hazSit, harm,
        severity: sev, probability: prob,
        mitigation: mit.trim() || null,
        evaluation_notes: notes.trim() || null,
        risk_class: riskClass,
      });
      onUpdate(updated); setEditing(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleStatus(newStatus: string) {
    setStatusSaving(true); setStatusErr("");
    try {
      const updated = await api.risks.updateStatus(risk.id, newStatus);
      onUpdate(updated);
    } catch (e: any) { setStatusErr(e.message); }
    finally { setStatusSaving(false); }
  }

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${levelMeta.border}`, background: "#fff" }}>
      {/* Re-evaluation alert */}
      {risk.re_evaluation_required && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px",
          background: "#fff3e0", borderBottom: "1px solid #ffcc80", fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ color: "#e65100", fontWeight: 600 }}>Re-evaluation required</span>
          <span style={{ color: "#666" }}>
            — {risk.re_evaluation_reason ?? "a linked artifact was changed."}
          </span>
          <button type="button" onClick={() => setShowReeval(true)}
            style={{ marginLeft: "auto", fontSize: 11, padding: "2px 10px", borderRadius: 4, border: "1px solid #e65100",
              background: "#e65100", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
            Re-evaluate
          </button>
          <button type="button" onClick={() => handleStatus("IN_CONTROL")}
            style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, border: "1px solid #e65100",
              background: "#fff", color: "#e65100", cursor: "pointer" }}>
            Acknowledge
          </button>
        </div>
      )}

      <div style={{ padding: "10px 14px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ background: levelMeta.color, color: "#fff", borderRadius: 3, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
            {level}
          </span>
          <span style={{ background: classMeta.color, color: "#fff", borderRadius: 3, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
            {classMeta.short}
          </span>
          <span style={{ fontSize: 11, color: "#999" }}>S={risk.severity}×P={risk.probability}={risk.severity*risk.probability}</span>
          <span style={{ background: statusMeta.bg, color: statusMeta.color, borderRadius: 10, padding: "1px 9px", fontSize: 11, fontWeight: 600 }}>
            {statusMeta.label}
          </span>

          {req && (
            <a href={`/requirements?highlight=${req.id}`} style={{ marginLeft: "auto", fontSize: 12, color: "#1565c0", textDecoration: "none" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{req.readable_id}</span>
              {" "}{req.title.length > 40 ? req.title.slice(0, 40) + "…" : req.title}
            </a>
          )}

          <div style={{ display: "flex", gap: 4, marginLeft: req ? 0 : "auto", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setShowContributions(v => !v)}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: showContributions ? "#dcedc8" : "#f5f5f5", border: "1px solid #c5e1a5",
                color: showContributions ? "#33691e" : "#555" }}>
              §7.1 Contributions ({risk.contributions.length})
            </button>
            <button type="button" onClick={() => setShowControls(v => !v)}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: showControls ? "#e8eaf6" : "#f5f5f5", border: "1px solid #c5cae9",
                color: showControls ? "#3949ab" : "#555" }}>
              Controls ({risk.controls.length})
            </button>
            <button type="button" onClick={() => setShowResidual(v => !v)}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: showResidual ? "#fff9c4" : "#f5f5f5", border: "1px solid #fff176",
                color: showResidual ? "#f57f17" : "#555" }}>
              {risk.residual_risk ? (risk.residual_risk.is_accepted ? "✓ Residual" : "Residual") : "Residual"}
            </button>
            <button type="button" onClick={() => setEditing(e => !e)}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: editing ? "#e3f2fd" : "#f5f5f5", border: `1px solid ${editing ? "#1565c0" : "#ddd"}`,
                color: editing ? "#1565c0" : "#555" }}>
              {editing ? "Cancel" : "Edit"}
            </button>
            <button type="button" onClick={() => onDelete(risk.id)}
              style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>✕</button>
          </div>
        </div>

        {/* Hazard analysis 3-col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", fontSize: 13 }}>
          <div><span style={{ color: "#888", fontSize: 11 }}>Hazard</span><br />{risk.hazard}</div>
          <div><span style={{ color: "#888", fontSize: 11 }}>Hazardous Situation</span><br />{risk.hazardous_situation}</div>
          <div><span style={{ color: "#888", fontSize: 11 }}>Harm</span><br />{risk.harm}</div>
        </div>

        {risk.evaluation_notes && (
          <div style={{ marginTop: 6, padding: "5px 9px", background: "#f9fbe7", borderLeft: "3px solid #cddc39", borderRadius: "0 4px 4px 0", fontSize: 12, color: "#555" }}>
            {risk.evaluation_notes}
          </div>
        )}

        {risk.last_re_evaluated_at && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>
            Last re-evaluated {new Date(risk.last_re_evaluated_at).toLocaleString()}
            {risk.last_re_evaluated_by ? ` by ${risk.last_re_evaluated_by}` : ""}
          </div>
        )}

        {/* Status transition buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#888" }}>Move to:</span>
          {["OPEN", "IN_CONTROL", "ACCEPTED", "CLOSED"].filter(s => s !== risk.status).map(s => {
            const sm = STATUS_META[s];
            return (
              <button key={s} type="button" onClick={() => handleStatus(s)} disabled={statusSaving}
                style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: sm.bg, border: `1px solid ${sm.color}`, color: sm.color, fontWeight: 600 }}>
                {sm.label}
              </button>
            );
          })}
          {statusErr && <span style={{ fontSize: 11, color: "#b71c1c", marginLeft: 4 }}>{statusErr}</span>}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSaveEdit} style={{ padding: "10px 14px", background: "#fffde7", borderTop: "1px solid #ffd54f" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><label style={labelStyle}>Hazard</label>
              <input value={hazard} onChange={e => setHazard(e.target.value)} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Hazardous Situation</label>
              <input value={hazSit} onChange={e => setHazSit(e.target.value)} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Harm</label>
              <input value={harm} onChange={e => setHarm(e.target.value)} required style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>Severity (1–5):
              <input type="number" min={1} max={5} value={sev} onChange={e => setSev(+e.target.value)}
                style={{ ...inputStyle, width: 60, marginLeft: 8 }} /></label>
            <label style={{ fontSize: 13 }}>Probability (1–5):
              <input type="number" min={1} max={5} value={prob} onChange={e => setProb(+e.target.value)}
                style={{ ...inputStyle, width: 60, marginLeft: 8 }} /></label>
            <label style={{ fontSize: 13 }}>Risk Class:
              <select value={riskClass} onChange={e => setRiskClass(e.target.value as RiskClass)}
                style={{ ...inputStyle, width: "auto", marginLeft: 8 }}>
                {RISK_CLASSES.map(c => <option key={c} value={c}>{RISK_CLASS_META[c].label}</option>)}
              </select></label>
            <span style={{ fontSize: 13 }}>
              Preview: <b style={{ color: LEVEL_META[computeLevel(sev, prob)].color }}>{computeLevel(sev, prob)}</b>
              <span style={{ color: "#888", marginLeft: 4 }}>(score: {sev * prob})</span>
            </span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Mitigation / Notes</label>
            <textarea value={mit} onChange={e => setMit(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Evaluation Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          {error && <p style={{ color: "red", margin: "0 0 8px", fontSize: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...btnStyle, background: "#2e7d32" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...btnStyle, background: "#757575" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Contributions panel (§7.1) */}
      {showContributions && (
        <ContributionsPanel risk={risk}
          componentMap={componentMap} softwareItemMap={softwareItemMap}
          onReload={() => onUpdate(risk)} />
      )}

      {/* Controls panel */}
      {showControls && (
        <ControlsPanel risk={risk} reqs={reqs} systemTests={systemTests}
          integrationTests={integrationTests} units={units}
          componentMap={componentMap}
          onReload={() => onUpdate(risk)} />
      )}

      {/* Residual risk panel */}
      {showResidual && (
        <ResidualPanel risk={risk} onReload={() => onUpdate(risk)} />
      )}

      {/* Re-evaluation modal */}
      {showReeval && (
        <ReevaluateModal risk={risk}
          onClose={() => setShowReeval(false)}
          onSaved={() => onUpdate(risk)} />
      )}
    </div>
  );
}

// ── Risk level group ──────────────────────────────────────────────────────────
function RiskGroup({ level, risks, reqs, systemTests, integrationTests, units, componentMap, softwareItemMap, onDelete, onUpdate }: {
  level: RiskLevel; risks: Risk[]; reqs: Requirement[]; systemTests: SystemTestCase[];
  integrationTests: IntegrationTestCase[]; units: SoftwareUnit[];
  componentMap: Record<string, string>; softwareItemMap: Record<string, string>;
  onDelete: (id: string) => void; onUpdate: (updated: Risk) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = LEVEL_META[level];
  const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));

  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        background: meta.bg, border: `1px solid ${meta.border}`, borderLeft: `4px solid ${meta.color}`,
        padding: "10px 14px", borderRadius: "0 6px 6px 0",
      }}>
        <span style={{ fontWeight: 700, color: meta.color, fontSize: 14, flex: 1 }}>
          {open ? "▾" : "▸"} {meta.label} Risk
        </span>
        <span style={{ background: meta.color, color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
          {risks.length}
        </span>
        {risks.filter(r => r.re_evaluation_required).length > 0 && (
          <span style={{ background: "#e65100", color: "#fff", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
            {risks.filter(r => r.re_evaluation_required).length} re-eval
          </span>
        )}
      </div>

      {open && (
        <div style={{ border: `1px solid ${meta.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
          {risks.map((r, i) => (
            <RiskRow key={r.id} risk={r} req={reqById[r.requirement_id]}
              reqs={reqs} systemTests={systemTests}
              integrationTests={integrationTests} units={units}
              componentMap={componentMap} softwareItemMap={softwareItemMap}
              isLast={i === risks.length - 1}
              onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Safety Classification tab (unchanged) ─────────────────────────────────────
function ScaleTable({ title, jsonStr }: { title: string; jsonStr: string | null }) {
  let rows: { level: number; label: string; description: string }[] = [];
  try { rows = JSON.parse(jsonStr ?? "[]"); } catch { /* ignore */ }
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ ...thStyle, width: 50 }}>Level</th>
            <th style={{ ...thStyle, width: 120 }}>Label</th>
            <th style={thStyle}>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.level} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{r.level}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.label}</td>
              <td style={{ ...tdStyle, color: "#555" }}>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ ok, label, description }: { ok: boolean; label: string; description: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 4,
      background: ok ? "#e8f5e9" : "#ffebee", border: `1px solid ${ok ? "#a5d6a7" : "#ef9a9a"}` }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{ok ? "✓" : "✗"}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: ok ? "#1b5e20" : "#b71c1c" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
}

function SafetyClassificationTab({ projectId }: { projectId: string }) {
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [cls, setCls]             = useState("C");
  const [rationale, setRationale] = useState("");
  const [scale, setScale]         = useState(5);
  const [sevDefs, setSevDefs]     = useState(DEFAULT_SEV_5);
  const [probDefs, setProbDefs]   = useState(DEFAULT_PROB_5);
  const [iso, setIso]             = useState(true);
  const [sfAssume, setSfAssume]   = useState(true);
  const [sdpRef, setSdpRef]       = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  useEffect(() => {
    setLoading(true);
    api.risks.safetyProfile.get(projectId).then(p => { setProfile(p); if (p) populateForm(p); }).finally(() => setLoading(false));
  }, [projectId]);

  function populateForm(p: SafetyProfile) {
    setCls(p.iec62304_class); setRationale(p.classification_rationale ?? "");
    setScale(p.rpn_scale); setSevDefs(p.severity_definitions ?? DEFAULT_SEV_5);
    setProbDefs(p.probability_definitions ?? DEFAULT_PROB_5);
    setIso(p.iso14971_aligned); setSfAssume(p.software_failure_assumption);
    setSdpRef(p.sdp_section_reference ?? ""); setApprovedBy(p.approved_by ?? ""); setReviewDate(p.review_date ?? "");
  }

  async function handleSave() {
    setSaving(true); setError("");
    const payload = { project_id: projectId, iec62304_class: cls, classification_rationale: rationale || null,
      rpn_scale: scale, severity_definitions: sevDefs || null, probability_definitions: probDefs || null,
      iso14971_aligned: iso, software_failure_assumption: sfAssume, sdp_section_reference: sdpRef || null,
      approved_by: approvedBy || null, review_date: reviewDate || null };
    try {
      const saved = profile ? await api.risks.safetyProfile.update(projectId, payload) : await api.risks.safetyProfile.create(payload);
      setProfile(saved); setEditing(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>;
  const classMeta = CLASS_META[profile?.iec62304_class ?? cls] ?? CLASS_META["C"];

  if (editing || !profile) {
    return (
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{profile ? "Edit Safety Classification" : "Set Up Safety Classification"}</h2>
          {profile && <button type="button" onClick={() => setEditing(false)} style={{ ...btnStyle, background: "#757575" }}>Cancel</button>}
        </div>
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>IEC 62304 Software Safety Class</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {["A","B","C"].map(c => {
              const m = CLASS_META[c];
              return (
                <button key={c} type="button" onClick={() => setCls(c)} style={{
                  flex: 1, padding: "12px 8px", borderRadius: 6, cursor: "pointer",
                  border: `2px solid ${cls === c ? m.color : "#ddd"}`, background: cls === c ? m.bg : "#fafafa" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: m.color }}>{c}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.4 }}>{m.description}</div>
                </button>
              );
            })}
          </div>
          <label style={labelStyle}>Classification Rationale</label>
          <textarea value={rationale} onChange={e => setRationale(e.target.value)}
            style={{ ...inputStyle, width: "100%", height: 80, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>RPN Methodology (ISO 14971)</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            {[5, 10].map(v => (
              <button key={v} type="button" onClick={() => setScale(v)} style={{
                padding: "8px 24px", borderRadius: 4, cursor: "pointer",
                border: `2px solid ${scale === v ? "#1565c0" : "#ddd"}`, background: scale === v ? "#e3f2fd" : "#fafafa",
                fontWeight: scale === v ? 700 : 400, color: scale === v ? "#1565c0" : "#555", fontSize: 14 }}>1–{v} Scale</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Severity Definitions (JSON)</label>
              <textarea value={sevDefs} onChange={e => setSevDefs(e.target.value)}
                style={{ ...inputStyle, width: "100%", height: 160, resize: "vertical", fontFamily: "monospace", fontSize: 11 }} />
            </div>
            <div>
              <label style={labelStyle}>Probability Definitions (JSON)</label>
              <textarea value={probDefs} onChange={e => setProbDefs(e.target.value)}
                style={{ ...inputStyle, width: "100%", height: 160, resize: "vertical", fontFamily: "monospace", fontSize: 11 }} />
            </div>
          </div>
        </div>
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>Compliance</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={iso} onChange={e => setIso(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16 }} />
            <span style={{ fontSize: 13 }}><b>ISO 14971 Aligned</b> — risk management process aligned with ISO 14971:2019</span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={sfAssume} onChange={e => setSfAssume(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16 }} />
            <span style={{ fontSize: 13 }}><b>100% Software Failure Assumption</b> — per IEC 62304 §7.4.2</span>
          </label>
        </div>
        <div style={{ ...sectionCard, marginBottom: 20 }}>
          <div style={sectionTitle}>Document References</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>SDP Section</label><input value={sdpRef} onChange={e => setSdpRef(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Approved By</label><input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Review Date</label><input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={inputStyle} /></div>
          </div>
        </div>
        {error && <p style={{ color: "#c62828", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}
        <button type="button" onClick={handleSave} disabled={saving} style={btnStyle}>
          {saving ? "Saving…" : profile ? "Save Changes" : "Create Safety Profile"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Safety Classification</h2>
        <button type="button" onClick={() => { setEditing(true); populateForm(profile); }} style={{ ...btnStyle, background: "#455a64" }}>Edit</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px",
        background: classMeta.bg, border: `2px solid ${classMeta.color}`, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: classMeta.color, color: "#fff", fontSize: 28, fontWeight: 900, flexShrink: 0 }}>{profile.iec62304_class}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: classMeta.color }}>{classMeta.label} — IEC 62304</div>
          <div style={{ fontSize: 13, color: classMeta.color, marginTop: 2 }}>{classMeta.description}</div>
          {profile.classification_rationale && <div style={{ fontSize: 13, color: "#444", marginTop: 6, fontStyle: "italic" }}>"{profile.classification_rationale}"</div>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={sectionCard}>
          <div style={sectionTitle}>RPN Matrix (1–{profile.rpn_scale} Scale)</div>
          <RpnMatrix scale={profile.rpn_scale} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={sectionCard}>
            <div style={sectionTitle}>Compliance Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <StatusBadge ok={profile.iso14971_aligned} label="ISO 14971 Aligned" description="Risk management process aligned with ISO 14971:2019" />
              <StatusBadge ok={profile.software_failure_assumption} label="100% Failure Assumption" description="Software items assessed assuming 100% failure probability (IEC 62304 §7.4.2)" />
            </div>
          </div>
          <div style={sectionCard}>
            <div style={sectionTitle}>Document References</div>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              {profile.sdp_section_reference && <div><span style={{ color: "#888", fontSize: 11 }}>SDP Section</span><br /><b>{profile.sdp_section_reference}</b></div>}
              {profile.approved_by && <div><span style={{ color: "#888", fontSize: 11 }}>Approved By</span><br />{profile.approved_by}</div>}
              {profile.review_date && <div><span style={{ color: "#888", fontSize: 11 }}>Review Date</span><br />{profile.review_date}</div>}
              {!profile.sdp_section_reference && !profile.approved_by && !profile.review_date && <span style={{ color: "#aaa" }}>No document references set.</span>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={sectionCard}><ScaleTable title="Severity" jsonStr={profile.severity_definitions} /></div>
        <div style={sectionCard}><ScaleTable title="Probability" jsonStr={profile.probability_definitions} /></div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type TabKey = "dashboard" | "inbox" | "register" | "classification";

function RisksPageInner() {
  const params    = useSearchParams();
  const lvlParam  = params.get("level") ?? "ALL";
  const clsParam  = (params.get("class") ?? "ALL").toUpperCase();

  const [projects,         setProjects]         = useState<Project[]>([]);
  const [reqs,             setReqs]             = useState<Requirement[]>([]);
  const [systemTests,      setSystemTests]      = useState<SystemTestCase[]>([]);
  const [integrationTests, setIntegrationTests] = useState<IntegrationTestCase[]>([]);
  const [units,            setUnits]            = useState<SoftwareUnit[]>([]);
  const [components,       setComponents]       = useState<{ id: string; name: string }[]>([]);
  const [softwareItems,    setSoftwareItems]    = useState<SoftwareItem[]>([]);
  const [risks,            setRisks]            = useState<Risk[]>([]);
  const [projectId,        setProjectId]        = useActiveProject();
  const [filter,           setFilter]           = useState<string>(lvlParam);
  const initialClassFilter: "ALL" | RiskClass =
    (RISK_CLASSES as string[]).includes(clsParam) ? (clsParam as RiskClass) : "ALL";
  const [classFilter,      setClassFilter]      = useState<"ALL" | RiskClass>(initialClassFilter);
  const [activeTab,        setActiveTab]        = useState<TabKey>("register");
  const [showForm,         setShowForm]         = useState(false);

  // Add-risk form
  const [reqId,           setReqId]      = useState("");
  const [hazard,          setHazard]     = useState("");
  const [hazSit,          setHazSit]     = useState("");
  const [harm,            setHarm]       = useState("");
  const [severity,        setSeverity]   = useState(1);
  const [prob,            setProb]       = useState(1);
  const [mitigation,      setMitigation] = useState("");
  const [newRiskClass,    setNewRiskClass] = useState<RiskClass>("SAFETY");
  const [formError,       setFormError]  = useState("");
  const [saving,          setSaving]     = useState(false);

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async () => {
    if (!projectId) return;
    const [r, rk, tc, it, un, tree, si] = await Promise.all([
      api.requirements.list(projectId),
      api.risks.list(undefined, projectId),
      api.systemTesting.list(projectId),
      api.integrationTests.list(projectId).catch(() => []),
      api.units.list(projectId).catch(() => []),
      api.architecture.tree(projectId).catch(() => []),
      api.softwareItems.list(projectId).catch(() => []),
    ]);
    setReqs(r);
    setRisks(rk);
    setSystemTests(tc);
    setIntegrationTests(it);
    setUnits(un);
    setComponents(flattenComponentTree(tree));
    setSoftwareItems(si);
  };

  useEffect(() => {
    if (!projectId) {
      setReqs([]); setRisks([]); setSystemTests([]); setIntegrationTests([]);
      setUnits([]); setComponents([]); setSoftwareItems([]);
      return;
    }
    reload();
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!reqId) { setFormError("Select a requirement"); return; }
    setSaving(true); setFormError("");
    try {
      await api.risks.create({
        requirement_id: reqId, hazard, hazardous_situation: hazSit, harm,
        severity, probability: prob, mitigation: mitigation.trim() || undefined,
        risk_class: newRiskClass,
      });
      setHazard(""); setHazSit(""); setHarm(""); setSeverity(1); setProb(1); setMitigation(""); setReqId("");
      setNewRiskClass("SAFETY");
      await reload();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await api.risks.delete(id);
    await reload();
  }

  function handleUpdate(_updated: Risk) {
    // Re-fetch to get latest controls / residual / contributions / evidence from server
    reload();
  }

  const componentMap     = Object.fromEntries(components.map(c => [c.id, c.name])) as Record<string, string>;
  const softwareItemMap  = Object.fromEntries(softwareItems.map(s => [s.id, s.name])) as Record<string, string>;

  const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW"];
  const classFiltered = classFilter === "ALL" ? risks : risks.filter(r => r.risk_class === classFilter);
  const grouped = Object.fromEntries(LEVELS.map(l => [l, classFiltered.filter(r => r.risk_level === l)])) as Record<RiskLevel, Risk[]>;
  const displayLevels = filter === "ALL" ? LEVELS : [filter as RiskLevel];
  const totalShown = displayLevels.reduce((n, l) => n + grouped[l].length, 0);
  const previewLevel = computeLevel(severity, prob);
  const reEvalCount = risks.filter(r => r.re_evaluation_required).length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Risk Management</h1>
        {reEvalCount > 0 && (
          <span style={{ background: "#e65100", color: "#fff", borderRadius: 10, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
            ⚠ {reEvalCount} re-eval required
          </span>
        )}
        {projectId && activeTab === "register" && (
          <button type="button" onClick={() => setShowForm(f => !f)} style={{
            marginLeft: "auto", padding: "5px 14px", borderRadius: 6, border: "1px solid #1565c0",
            background: showForm ? "#1565c0" : "#e3f2fd", color: showForm ? "#fff" : "#1565c0", cursor: "pointer", fontSize: 13 }}>
            + Add Risk
          </button>
        )}
      </div>

      <select value={projectId} onChange={e => { setProjectId(e.target.value); setReqId(""); }} style={{ ...inputStyle, marginBottom: 16, maxWidth: 400 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* Risk-class chip filter — IEC 81001-5-1 / AAMI TIR57 */}
      {projectId && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#888", marginRight: 4, fontWeight: 600 }}>RISK CLASS:</span>
          {(["ALL", ...RISK_CLASSES] as const).map(c => {
            const count = c === "ALL" ? risks.length : risks.filter(r => r.risk_class === c).length;
            const color = c === "ALL" ? "#37474f" : RISK_CLASS_META[c].color;
            const label = c === "ALL" ? "All" : RISK_CLASS_META[c].label;
            return (
              <button key={c} type="button" onClick={() => setClassFilter(c)} style={{
                padding: "4px 12px", borderRadius: 16, border: `1px solid ${classFilter === c ? color : "#ddd"}`,
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: classFilter === c ? color : "#fff",
                color: classFilter === c ? "#fff" : color,
              }}>{label} <span style={{ opacity: 0.75 }}>({count})</span></button>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e0e0e0" }}>
        {([
          { key: "dashboard",      label: "Dashboard" },
          { key: "inbox",          label: `Re-eval Inbox${reEvalCount > 0 ? ` (${reEvalCount})` : ""}` },
          { key: "register",       label: `Risk Register${risks.length > 0 ? ` (${risks.length})` : ""}` },
          { key: "classification", label: "Safety Classification" },
        ] as const).map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={{
            padding: "9px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14,
            fontWeight: activeTab === t.key ? 700 : 400,
            color: activeTab === t.key ? "#1565c0" : "#555",
            borderBottom: activeTab === t.key ? "3px solid #1565c0" : "3px solid transparent",
            marginBottom: -2 }}>{t.label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {activeTab === "dashboard" && (
        projectId ? <DashboardTab projectId={projectId} />
          : <p style={{ color: "#888" }}>Select a project to view the dashboard.</p>
      )}

      {/* Re-evaluation Inbox */}
      {activeTab === "inbox" && (
        projectId ? <ReevalInboxTab projectId={projectId} onChanged={reload} />
          : <p style={{ color: "#888" }}>Select a project.</p>
      )}

      {/* Safety Classification */}
      {activeTab === "classification" && (
        projectId ? <SafetyClassificationTab projectId={projectId} />
          : <p style={{ color: "#888" }}>Select a project.</p>
      )}

      {/* Risk Register */}
      {activeTab === "register" && (
        <>
          {showForm && projectId && (
            <div style={{ ...cardStyle, marginBottom: 20, border: "1px solid #1565c0" }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Add Risk — ISO 14971 Hazard Analysis</h3>
              <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select value={reqId} onChange={e => setReqId(e.target.value)} style={inputStyle}>
                  <option value="">— Select requirement *</option>
                  {reqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} [{r.type}] {r.title}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <input placeholder="Hazard * (energy source / situation)" value={hazard} onChange={e => setHazard(e.target.value)} required style={inputStyle} />
                  <input placeholder="Hazardous Situation *" value={hazSit} onChange={e => setHazSit(e.target.value)} required style={inputStyle} />
                  <input placeholder="Harm * (patient / user impact)" value={harm} onChange={e => setHarm(e.target.value)} required style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13 }}>Severity (1–5):
                    <input type="number" min={1} max={5} value={severity} onChange={e => setSeverity(+e.target.value)}
                      style={{ ...inputStyle, width: 60, marginLeft: 8 }} /></label>
                  <label style={{ fontSize: 13 }}>Probability (1–5):
                    <input type="number" min={1} max={5} value={prob} onChange={e => setProb(+e.target.value)}
                      style={{ ...inputStyle, width: 60, marginLeft: 8 }} /></label>
                  <label style={{ fontSize: 13 }}>Risk Class:
                    <select value={newRiskClass} onChange={e => setNewRiskClass(e.target.value as RiskClass)}
                      style={{ ...inputStyle, width: "auto", marginLeft: 8 }}>
                      {RISK_CLASSES.map(c => <option key={c} value={c}>{RISK_CLASS_META[c].label}</option>)}
                    </select></label>
                  <span style={{ fontSize: 13 }}>
                    Level: <b style={{ color: LEVEL_META[previewLevel].color }}>{previewLevel}</b>
                    <span style={{ color: "#888", marginLeft: 4 }}>(score: {severity * prob})</span>
                  </span>
                </div>
                <textarea value={mitigation} onChange={e => setMitigation(e.target.value)} rows={2}
                  placeholder="Initial mitigation notes (optional)"
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                {formError && <p style={{ color: "red", margin: 0, fontSize: 13 }}>{formError}</p>}
                <button type="submit" disabled={saving || !reqId} style={btnStyle}>{saving ? "Saving…" : "Add Risk"}</button>
              </form>
            </div>
          )}

          {projectId && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {(["ALL", ...LEVELS] as const).map(l => {
                const count = l === "ALL" ? risks.length : grouped[l].length;
                const color = l === "ALL" ? "#37474f" : LEVEL_META[l].color;
                return (
                  <button key={l} type="button" onClick={() => setFilter(l)} style={{
                    padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500,
                    background: filter === l ? color : "#f0f0f0",
                    color: filter === l ? "#fff" : "#555" }}>
                    {l === "ALL" ? "All Risks" : LEVEL_META[l].label}
                    <span style={{ marginLeft: 6, opacity: 0.75 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {!projectId ? (
            <p style={{ color: "#888" }}>Select a project.</p>
          ) : risks.length === 0 ? (
            <p style={{ color: "#888" }}>No risks yet. Use the ISO 14971 hazard analysis form above.</p>
          ) : totalShown === 0 ? (
            <p style={{ color: "#aaa" }}>No {filter}{classFilter !== "ALL" ? ` ${RISK_CLASS_META[classFilter].label}` : ""} risks.</p>
          ) : (
            <div>
              {displayLevels.map(l => grouped[l].length > 0 && (
                <RiskGroup key={l} level={l} risks={grouped[l]} reqs={reqs} systemTests={systemTests}
                  integrationTests={integrationTests} units={units}
                  componentMap={componentMap} softwareItemMap={softwareItemMap}
                  onDelete={handleDelete} onUpdate={handleUpdate} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RisksPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <RisksPageInner />
    </Suspense>
  );
}

const cardStyle: React.CSSProperties    = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.25rem" };
const sectionCard: React.CSSProperties  = { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem 1.25rem" };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#455a64", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 };
const inputStyle: React.CSSProperties  = { padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" as const, width: "100%" };
const btnStyle: React.CSSProperties    = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const labelStyle: React.CSSProperties  = { display: "block", fontSize: 11, color: "#666", marginBottom: 3, fontWeight: 600 };
const thStyle: React.CSSProperties     = { padding: "6px 10px", textAlign: "left" as const, fontWeight: 600, fontSize: 12, color: "#555", borderBottom: "1px solid #e0e0e0" };
const tdStyle: React.CSSProperties     = { padding: "6px 10px", verticalAlign: "top" as const };
const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 8, padding: "1.25rem 1.5rem",
  width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
};
