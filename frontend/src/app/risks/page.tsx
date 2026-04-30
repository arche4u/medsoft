"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api, Project, Requirement, TestCase, Risk, RiskControl, ResidualRisk, RiskDashboard, SafetyProfile,
} from "@/lib/api";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const LEVEL_META: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: "High",   color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  MEDIUM: { label: "Medium", color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  LOW:    { label: "Low",    color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

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

// ── Risk Controls Panel ───────────────────────────────────────────────────────
function ControlsPanel({ risk, reqs, testcases, onReload }: {
  risk: Risk; reqs: Requirement[]; testcases: TestCase[]; onReload: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [cType, setCType]     = useState("INHERENT_SAFETY");
  const [cDesc, setCDesc]     = useState("");
  const [cReqId, setCReqId]   = useState("");
  const [cTcId, setCTcId]     = useState("");
  const [cStatus, setCStatus] = useState("PROPOSED");
  const [cNotes, setCNotes]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function handleAdd() {
    if (!cDesc.trim()) { setError("Description is required"); return; }
    setSaving(true); setError("");
    try {
      await api.risks.controls.create(risk.id, {
        control_type: cType, description: cDesc,
        requirement_id: cReqId || null, testcase_id: cTcId || null,
        implementation_status: cStatus, verification_notes: cNotes || null,
      });
      setCDesc(""); setCReqId(""); setCTcId(""); setCNotes(""); setShowAdd(false);
      onReload();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
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
  const tcById  = Object.fromEntries(testcases.map(t => [t.id, t]));

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
        const linkedReq = ctrl.requirement_id ? reqById[ctrl.requirement_id] : null;
        const linkedTc  = ctrl.testcase_id ? tcById[ctrl.testcase_id] : null;
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
                <a href={`/testcases?highlight=${linkedTc.id}`}
                  style={{ fontSize: 11, color: "#2e7d32", background: "#e8f5e9", padding: "1px 7px", borderRadius: 4, textDecoration: "none", fontFamily: "monospace" }}>
                  TC: {linkedTc.title.slice(0, 40)}
                </a>
              )}
            </div>
          </div>
        );
      })}

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
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
              <label style={labelStyle}>Link to Test Case (optional)</label>
              <select value={cTcId} onChange={e => setCTcId(e.target.value)} style={inputStyle}>
                <option value="">— none</option>
                {testcases.map(t => (
                  <option key={t.id} value={t.id}>{t.readable_id ? `${t.readable_id} ` : ""}{t.title.slice(0, 50)}</option>
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

// ── Risk row ──────────────────────────────────────────────────────────────────
function RiskRow({ risk, req, reqs, testcases, isLast, onDelete, onUpdate }: {
  risk: Risk; req?: Requirement; reqs: Requirement[]; testcases: TestCase[];
  isLast: boolean; onDelete: (id: string) => void; onUpdate: (updated: Risk) => void;
}) {
  const [editing,      setEditing]      = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showResidual, setShowResidual] = useState(false);
  const [statusErr,    setStatusErr]    = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  // Edit form state
  const [hazard,  setHazard]  = useState(risk.hazard);
  const [hazSit,  setHazSit]  = useState(risk.hazardous_situation);
  const [harm,    setHarm]    = useState(risk.harm);
  const [sev,     setSev]     = useState(risk.severity);
  const [prob,    setProb]    = useState(risk.probability);
  const [mit,     setMit]     = useState(risk.mitigation ?? "");
  const [notes,   setNotes]   = useState(risk.evaluation_notes ?? "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const level = risk.risk_level as RiskLevel;
  const levelMeta  = LEVEL_META[level] ?? LEVEL_META.HIGH;
  const statusMeta = STATUS_META[risk.status] ?? STATUS_META.OPEN;

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await api.risks.update(risk.id, {
        hazard, hazardous_situation: hazSit, harm,
        severity: sev, probability: prob,
        mitigation: mit.trim() || null,
        evaluation_notes: notes.trim() || null,
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
          background: "#fff3e0", borderBottom: "1px solid #ffcc80", fontSize: 12 }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ color: "#e65100", fontWeight: 600 }}>Re-evaluation required</span>
          <span style={{ color: "#666" }}>— a linked requirement was changed.</span>
          <button type="button" onClick={() => handleStatus("IN_CONTROL")}
            style={{ marginLeft: "auto", fontSize: 11, padding: "2px 10px", borderRadius: 4, border: "1px solid #e65100",
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

          <div style={{ display: "flex", gap: 4, marginLeft: req ? 0 : "auto" }}>
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

      {/* Controls panel */}
      {showControls && (
        <ControlsPanel risk={risk} reqs={reqs} testcases={testcases} onReload={() => onUpdate(risk)} />
      )}

      {/* Residual risk panel */}
      {showResidual && (
        <ResidualPanel risk={risk} onReload={() => onUpdate(risk)} />
      )}
    </div>
  );
}

// ── Risk level group ──────────────────────────────────────────────────────────
function RiskGroup({ level, risks, reqs, testcases, onDelete, onUpdate }: {
  level: RiskLevel; risks: Risk[]; reqs: Requirement[]; testcases: TestCase[];
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
              reqs={reqs} testcases={testcases}
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
function RisksPageInner() {
  const params    = useSearchParams();
  const lvlParam  = params.get("level") ?? "ALL";

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [reqs,       setReqs]       = useState<Requirement[]>([]);
  const [testcases,  setTestcases]  = useState<TestCase[]>([]);
  const [risks,      setRisks]      = useState<Risk[]>([]);
  const [projectId,  setProjectId]  = useActiveProject();
  const [filter,     setFilter]     = useState<string>(lvlParam);
  const [activeTab,  setActiveTab]  = useState<"dashboard" | "register" | "classification">("register");
  const [showForm,   setShowForm]   = useState(false);

  // Add-risk form
  const [reqId,      setReqId]      = useState("");
  const [hazard,     setHazard]     = useState("");
  const [hazSit,     setHazSit]     = useState("");
  const [harm,       setHarm]       = useState("");
  const [severity,   setSeverity]   = useState(1);
  const [prob,       setProb]       = useState(1);
  const [mitigation, setMitigation] = useState("");
  const [formError,  setFormError]  = useState("");
  const [saving,     setSaving]     = useState(false);

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async () => {
    if (!projectId) return;
    const [r, rk, tc] = await Promise.all([
      api.requirements.list(projectId),
      api.risks.list(undefined, projectId),
      api.testcases.list(projectId),
    ]);
    setReqs(r);
    setRisks(rk);
    setTestcases(tc);
  };

  useEffect(() => {
    if (!projectId) { setReqs([]); setRisks([]); setTestcases([]); return; }
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
      });
      setHazard(""); setHazSit(""); setHarm(""); setSeverity(1); setProb(1); setMitigation(""); setReqId("");
      await reload();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await api.risks.delete(id);
    await reload();
  }

  function handleUpdate(updated: Risk) {
    // Re-fetch to get latest controls/residual from server
    api.risks.list(undefined, projectId).then(setRisks);
  }

  const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW"];
  const grouped = Object.fromEntries(LEVELS.map(l => [l, risks.filter(r => r.risk_level === l)])) as Record<RiskLevel, Risk[]>;
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e0e0e0" }}>
        {([
          { key: "dashboard",      label: "Dashboard" },
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
            <p style={{ color: "#aaa" }}>No {filter} risks.</p>
          ) : (
            <div>
              {displayLevels.map(l => grouped[l].length > 0 && (
                <RiskGroup key={l} level={l} risks={grouped[l]} reqs={reqs} testcases={testcases}
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
