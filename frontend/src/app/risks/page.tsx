"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, Requirement, Risk, SafetyProfile } from "@/lib/api";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const LEVEL_META: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: "High Risk",   color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  MEDIUM: { label: "Medium Risk", color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  LOW:    { label: "Low Risk",    color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

const CLASS_META: Record<string, { color: string; bg: string; border: string; label: string; description: string }> = {
  A: {
    color: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7",
    label: "Class A",
    description: "No injury or damage to health is possible. Lowest development rigor required.",
  },
  B: {
    color: "#e65100", bg: "#fff3e0", border: "#ffcc80",
    label: "Class B",
    description: "Non-serious injury is possible. Moderate development rigor, unit testing, and risk controls required.",
  },
  C: {
    color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a",
    label: "Class C",
    description: "Death or serious injury is possible. Full IEC 62304 lifecycle, rigorous testing, and documented risk management required.",
  },
};

const DEFAULT_SEV_5 = JSON.stringify([
  { level: 1, label: "Negligible", description: "No patient harm; minor inconvenience" },
  { level: 2, label: "Minor",      description: "Temporary discomfort; fully reversible" },
  { level: 3, label: "Moderate",   description: "Requires medical intervention; reversible" },
  { level: 4, label: "Critical",   description: "Serious or permanent injury" },
  { level: 5, label: "Catastrophic",description: "Death or irreversible serious harm" },
], null, 2);

const DEFAULT_PROB_5 = JSON.stringify([
  { level: 1, label: "Remote",    description: "< 1 in 1,000,000 device-hours" },
  { level: 2, label: "Unlikely",  description: "1 in 100,000 – 1 in 1,000,000 device-hours" },
  { level: 3, label: "Possible",  description: "1 in 10,000 – 1 in 100,000 device-hours" },
  { level: 4, label: "Likely",    description: "1 in 1,000 – 1 in 10,000 device-hours" },
  { level: 5, label: "Frequent",  description: "> 1 in 1,000 device-hours" },
], null, 2);

const DEFAULT_SEV_10 = JSON.stringify([
  { level: 1,  label: "None",         description: "No harm" },
  { level: 2,  label: "Negligible",   description: "Trivial; no medical intervention" },
  { level: 3,  label: "Minor",        description: "Temporary discomfort" },
  { level: 4,  label: "Low",          description: "Minor injury; reversible" },
  { level: 5,  label: "Moderate",     description: "Requires medical intervention" },
  { level: 6,  label: "Significant",  description: "Extended treatment required" },
  { level: 7,  label: "Serious",      description: "Permanent minor impairment" },
  { level: 8,  label: "Critical",     description: "Permanent significant impairment" },
  { level: 9,  label: "Severe",       description: "Life-threatening; hospitalization" },
  { level: 10, label: "Catastrophic", description: "Death" },
], null, 2);

const DEFAULT_PROB_10 = JSON.stringify([
  { level: 1,  label: "Incredible",    description: "< 1 in 10,000,000" },
  { level: 2,  label: "Improbable",    description: "1 in 1,000,000 – 1 in 10,000,000" },
  { level: 3,  label: "Remote",        description: "1 in 100,000 – 1 in 1,000,000" },
  { level: 4,  label: "Very Unlikely", description: "1 in 50,000 – 1 in 100,000" },
  { level: 5,  label: "Unlikely",      description: "1 in 10,000 – 1 in 50,000" },
  { level: 6,  label: "Possible",      description: "1 in 1,000 – 1 in 10,000" },
  { level: 7,  label: "Occasional",    description: "1 in 500 – 1 in 1,000" },
  { level: 8,  label: "Likely",        description: "1 in 100 – 1 in 500" },
  { level: 9,  label: "Frequent",      description: "1 in 10 – 1 in 100" },
  { level: 10, label: "Certain",       description: "> 1 in 10" },
], null, 2);

// ── RPN matrix preview ────────────────────────────────────────────────────────
function RpnMatrix({ scale }: { scale: number }) {
  const getCellColor = (s: number, p: number) => {
    const rpn = s * p;
    if (scale === 5) {
      if (rpn <= 4)  return { bg: "#e8f5e9", color: "#1b5e20" };
      if (rpn <= 9)  return { bg: "#fff3e0", color: "#e65100" };
      return           { bg: "#ffebee", color: "#b71c1c" };
    } else {
      if (rpn <= 15) return { bg: "#e8f5e9", color: "#1b5e20" };
      if (rpn <= 50) return { bg: "#fff3e0", color: "#e65100" };
      return           { bg: "#ffebee", color: "#b71c1c" };
    }
  };

  const max = scale;
  const cells = [];
  for (let s = max; s >= 1; s--) {
    const row = [];
    for (let p = 1; p <= max; p++) {
      const { bg, color } = getCellColor(s, p);
      row.push(
        <td key={p} style={{
          width: 36, height: 28, textAlign: "center", fontSize: 11,
          background: bg, color, fontWeight: 600, border: "1px solid #e0e0e0",
        }}>{s * p}</td>
      );
    }
    cells.push(
      <tr key={s}>
        <td style={{ width: 28, textAlign: "center", fontSize: 11, color: "#888", border: "1px solid #e0e0e0", fontWeight: 600 }}>{s}</td>
        {row}
      </tr>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        RPN = Severity × Probability (scale 1–{scale})
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 28, textAlign: "center", fontSize: 10, color: "#888", padding: "4px 2px" }}>S\P</th>
              {Array.from({ length: max }, (_, i) => (
                <th key={i + 1} style={{ width: 36, textAlign: "center", fontSize: 10, color: "#888", padding: "4px 2px" }}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>{cells}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {[
          { label: "LOW",    bg: "#e8f5e9", color: "#1b5e20", range: scale === 5 ? "RPN ≤ 4" : "RPN ≤ 15" },
          { label: "MEDIUM", bg: "#fff3e0", color: "#e65100", range: scale === 5 ? "RPN 5–9" : "RPN 16–50" },
          { label: "HIGH",   bg: "#ffebee", color: "#b71c1c", range: scale === 5 ? "RPN ≥ 10" : "RPN ≥ 51" },
        ].map(({ label, bg, color, range }) => (
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

// ── Scale definition table ────────────────────────────────────────────────────
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

// ── Safety Classification tab ─────────────────────────────────────────────────
function SafetyClassificationTab({ projectId }: { projectId: string }) {
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // form state
  const [cls, setCls]           = useState("C");
  const [rationale, setRationale] = useState("");
  const [scale, setScale]       = useState(5);
  const [sevDefs, setSevDefs]   = useState(DEFAULT_SEV_5);
  const [probDefs, setProbDefs] = useState(DEFAULT_PROB_5);
  const [iso, setIso]           = useState(true);
  const [sfAssume, setSfAssume] = useState(true);
  const [sdpRef, setSdpRef]     = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  useEffect(() => {
    setLoading(true);
    api.risks.safetyProfile.get(projectId)
      .then(p => { setProfile(p); if (p) populateForm(p); })
      .finally(() => setLoading(false));
  }, [projectId]);

  function populateForm(p: SafetyProfile) {
    setCls(p.iec62304_class);
    setRationale(p.classification_rationale ?? "");
    setScale(p.rpn_scale);
    setSevDefs(p.severity_definitions ?? (p.rpn_scale === 5 ? DEFAULT_SEV_5 : DEFAULT_SEV_10));
    setProbDefs(p.probability_definitions ?? (p.rpn_scale === 5 ? DEFAULT_PROB_5 : DEFAULT_PROB_10));
    setIso(p.iso14971_aligned);
    setSfAssume(p.software_failure_assumption);
    setSdpRef(p.sdp_section_reference ?? "");
    setApprovedBy(p.approved_by ?? "");
    setReviewDate(p.review_date ?? "");
  }

  function handleScaleChange(v: number) {
    setScale(v);
    setSevDefs(v === 5 ? DEFAULT_SEV_5 : DEFAULT_SEV_10);
    setProbDefs(v === 5 ? DEFAULT_PROB_5 : DEFAULT_PROB_10);
  }

  async function handleSave() {
    setSaving(true); setError("");
    const payload = {
      project_id: projectId,
      iec62304_class: cls,
      classification_rationale: rationale || null,
      rpn_scale: scale,
      severity_definitions: sevDefs || null,
      probability_definitions: probDefs || null,
      iso14971_aligned: iso,
      software_failure_assumption: sfAssume,
      sdp_section_reference: sdpRef || null,
      approved_by: approvedBy || null,
      review_date: reviewDate || null,
    };
    try {
      let saved: SafetyProfile;
      if (profile) {
        saved = await api.risks.safetyProfile.update(projectId, payload);
      } else {
        saved = await api.risks.safetyProfile.create(payload);
      }
      setProfile(saved);
      setEditing(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>;

  const classMeta = CLASS_META[profile?.iec62304_class ?? cls] ?? CLASS_META["C"];

  if (editing || !profile) {
    return (
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {profile ? "Edit Safety Classification" : "Set Up Safety Classification"}
          </h2>
          {profile && (
            <button onClick={() => setEditing(false)} style={{ ...btnStyle, background: "#757575" }}>Cancel</button>
          )}
        </div>

        {/* IEC 62304 Class */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>IEC 62304 Software Safety Class</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {["A", "B", "C"].map(c => {
              const m = CLASS_META[c];
              return (
                <button key={c} onClick={() => setCls(c)} style={{
                  flex: 1, padding: "12px 8px", borderRadius: 6, cursor: "pointer",
                  border: `2px solid ${cls === c ? m.color : "#ddd"}`,
                  background: cls === c ? m.bg : "#fafafa",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: m.color }}>{c}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.4 }}>{m.description}</div>
                </button>
              );
            })}
          </div>
          <label style={labelStyle}>Classification Rationale</label>
          <textarea
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            placeholder="Explain why this software safety class was assigned (e.g., failure modes, hazard analysis outcome)…"
            style={{ ...inputStyle, width: "100%", height: 80, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {/* RPN Methodology */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>RPN Methodology (ISO 14971)</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Risk Priority Number Scale</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[5, 10].map(v => (
                  <button key={v} onClick={() => handleScaleChange(v)} style={{
                    padding: "8px 24px", borderRadius: 4, cursor: "pointer",
                    border: `2px solid ${scale === v ? "#1565c0" : "#ddd"}`,
                    background: scale === v ? "#e3f2fd" : "#fafafa",
                    fontWeight: scale === v ? 700 : 400,
                    color: scale === v ? "#1565c0" : "#555",
                    fontSize: 14,
                  }}>1–{v} Scale</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#666", padding: "8px 12px", background: "#f5f5f5", borderRadius: 4, maxWidth: 340 }}>
              <b>RPN = Severity × Probability</b><br />
              {scale === 5
                ? "LOW ≤ 4 · MEDIUM 5–9 · HIGH ≥ 10"
                : "LOW ≤ 15 · MEDIUM 16–50 · HIGH ≥ 51"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Severity Definitions (JSON)</label>
              <textarea
                value={sevDefs}
                onChange={e => setSevDefs(e.target.value)}
                style={{ ...inputStyle, width: "100%", height: 180, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Probability Definitions (JSON)</label>
              <textarea
                value={probDefs}
                onChange={e => setProbDefs(e.target.value)}
                style={{ ...inputStyle, width: "100%", height: 180, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
              />
            </div>
          </div>
        </div>

        {/* Compliance */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionTitle}>Compliance Acknowledgements</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={iso} onChange={e => setIso(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16 }} />
            <span style={{ fontSize: 13 }}>
              <b>ISO 14971 Aligned</b> — This project's risk management process aligns with ISO 14971:2019
              (Medical devices — Application of risk management to medical devices).
              IEC 62304 software risk assessment is performed as part of, and traceable to, the ISO 14971 risk file.
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={sfAssume} onChange={e => setSfAssume(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16 }} />
            <span style={{ fontSize: 13 }}>
              <b>100% Software Failure Assumption</b> — Per IEC 62304 §7.4.2: when assessing software items
              as contributors to a hazardous situation, a 100% probability of software failure is assumed.
              Risk acceptability is based solely on severity of harm, not probability of software error.
            </span>
          </label>
        </div>

        {/* Document references */}
        <div style={{ ...sectionCard, marginBottom: 20 }}>
          <div style={sectionTitle}>Document References</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>SDP Section Reference</label>
              <input
                value={sdpRef}
                onChange={e => setSdpRef(e.target.value)}
                placeholder="e.g. SDP §5.2 Risk Management"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Approved By</label>
              <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
                placeholder="Name / role" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Review Date</label>
              <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {error && <p style={{ color: "#c62828", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}
        <button onClick={handleSave} disabled={saving} style={btnStyle}>
          {saving ? "Saving…" : profile ? "Save Changes" : "Create Safety Profile"}
        </button>
      </div>
    );
  }

  // ── Read-only view ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Safety Classification</h2>
        <button onClick={() => { setEditing(true); populateForm(profile); }} style={{ ...btnStyle, background: "#455a64" }}>
          Edit
        </button>
      </div>

      {/* Class banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, padding: "16px 20px",
        background: classMeta.bg, border: `2px solid ${classMeta.color}`,
        borderRadius: 8, marginBottom: 20,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center",
          justifyContent: "center", background: classMeta.color,
          color: "#fff", fontSize: 28, fontWeight: 900, flexShrink: 0,
        }}>{profile.iec62304_class}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: classMeta.color }}>{classMeta.label} — IEC 62304</div>
          <div style={{ fontSize: 13, color: classMeta.color, marginTop: 2 }}>{classMeta.description}</div>
          {profile.classification_rationale && (
            <div style={{ fontSize: 13, color: "#444", marginTop: 6, fontStyle: "italic" }}>
              "{profile.classification_rationale}"
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* RPN Matrix */}
        <div style={sectionCard}>
          <div style={sectionTitle}>RPN Matrix (1–{profile.rpn_scale} Scale)</div>
          <RpnMatrix scale={profile.rpn_scale} />
        </div>

        {/* Compliance status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={sectionCard}>
            <div style={sectionTitle}>Compliance Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <StatusBadge
                ok={profile.iso14971_aligned}
                label="ISO 14971 Aligned"
                description="Risk management process aligned with ISO 14971:2019"
              />
              <StatusBadge
                ok={profile.software_failure_assumption}
                label="100% Failure Assumption"
                description="Software items assessed assuming 100% failure probability (IEC 62304 §7.4.2)"
              />
            </div>
          </div>
          <div style={sectionCard}>
            <div style={sectionTitle}>Document References</div>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              {profile.sdp_section_reference && (
                <div><span style={{ color: "#888", fontSize: 11 }}>SDP Section</span><br />
                  <b>{profile.sdp_section_reference}</b></div>
              )}
              {profile.approved_by && (
                <div><span style={{ color: "#888", fontSize: 11 }}>Approved By</span><br />
                  {profile.approved_by}</div>
              )}
              {profile.review_date && (
                <div><span style={{ color: "#888", fontSize: 11 }}>Review Date</span><br />
                  {profile.review_date}</div>
              )}
              {!profile.sdp_section_reference && !profile.approved_by && !profile.review_date && (
                <span style={{ color: "#aaa" }}>No document references set.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scale definition tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={sectionCard}>
          <ScaleTable title="Severity Scale Definitions" jsonStr={profile.severity_definitions} />
          {!profile.severity_definitions && <span style={{ color: "#aaa", fontSize: 13 }}>No definitions set.</span>}
        </div>
        <div style={sectionCard}>
          <ScaleTable title="Probability Scale Definitions" jsonStr={profile.probability_definitions} />
          {!profile.probability_definitions && <span style={{ color: "#aaa", fontSize: 13 }}>No definitions set.</span>}
        </div>
      </div>

      {/* IEC 62304 Class reference */}
      <div style={{ ...sectionCard, marginTop: 16 }}>
        <div style={sectionTitle}>IEC 62304 Class Definitions Reference</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {Object.entries(CLASS_META).map(([c, m]) => (
            <div key={c} style={{
              padding: "10px 12px", borderRadius: 6,
              background: m.bg, border: `1px solid ${m.border}`,
              opacity: profile.iec62304_class === c ? 1 : 0.55,
            }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: m.color, marginBottom: 4 }}>
                {m.label}
                {profile.iec62304_class === c && (
                  <span style={{ marginLeft: 8, fontSize: 10, background: m.color, color: "#fff",
                    borderRadius: 10, padding: "1px 7px" }}>ASSIGNED</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>{m.description}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8f9fa", borderLeft: "3px solid #1565c0", borderRadius: "0 4px 4px 0", fontSize: 12, color: "#444" }}>
          <b>ISO 14971 Integration:</b> IEC 62304 does not stand alone. It serves as a software-specific extension of the
          broader ISO 14971 medical device risk management standard. The safety class drives all software development
          lifecycle activities, including the rigor of design, verification, and validation required.
          <br /><br />
          <b>100% Failure Rule:</b> Unlike hardware (which uses statistical failure rates), software failures are
          systematic. Therefore IEC 62304 §7.4.2 requires assuming 100% probability of failure for software items
          when assessing their contribution to a hazardous situation. Risk acceptability is determined solely by
          severity of potential harm.
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ok, label, description }: { ok: boolean; label: string; description: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "8px 10px", borderRadius: 4,
      background: ok ? "#e8f5e9" : "#ffebee",
      border: `1px solid ${ok ? "#a5d6a7" : "#ef9a9a"}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{ok ? "✓" : "✗"}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: ok ? "#1b5e20" : "#b71c1c" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
}

// ── Inline edit form ──────────────────────────────────────────────────────────
function EditRiskForm({ risk, onSave, onCancel }: {
  risk: Risk;
  onSave: (updated: Risk) => void;
  onCancel: () => void;
}) {
  const [hazard, setHazard]   = useState(risk.hazard);
  const [hazSit, setHazSit]   = useState(risk.hazardous_situation);
  const [harm, setHarm]       = useState(risk.harm);
  const [severity, setSev]    = useState(risk.severity);
  const [prob, setProb]       = useState(risk.probability);
  const [mitigation, setMit]  = useState(risk.mitigation ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const previewLevel = (): RiskLevel => {
    const s = severity * prob;
    return s <= 4 ? "LOW" : s <= 9 ? "MEDIUM" : "HIGH";
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await api.risks.update(risk.id, {
        hazard, hazardous_situation: hazSit, harm,
        severity, probability: prob,
        mitigation: mitigation.trim() || null,
      });
      onSave(updated);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "12px 14px", background: "#fffde7", borderTop: "1px solid #ffd54f" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>Hazard</label>
          <input value={hazard} onChange={e => setHazard(e.target.value)} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Hazardous Situation</label>
          <input value={hazSit} onChange={e => setHazSit(e.target.value)} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Harm</label>
          <input value={harm} onChange={e => setHarm(e.target.value)} required style={inputStyle} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>
          Severity (1–5):
          <input type="number" min={1} max={5} value={severity} onChange={e => setSev(+e.target.value)}
            style={{ ...inputStyle, width: 60, marginLeft: 8 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Probability (1–5):
          <input type="number" min={1} max={5} value={prob} onChange={e => setProb(+e.target.value)}
            style={{ ...inputStyle, width: 60, marginLeft: 8 }} />
        </label>
        <span style={{ fontSize: 13 }}>
          Level: <b style={{ color: LEVEL_META[previewLevel()].color }}>{previewLevel()}</b>
          <span style={{ color: "#888", marginLeft: 4 }}>(score: {severity * prob})</span>
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Mitigation / Control Measure</label>
        <textarea
          value={mitigation}
          onChange={e => setMit(e.target.value)}
          placeholder="Describe the risk control measure, acceptance rationale, or residual risk justification…"
          style={{ ...inputStyle, width: "100%", height: 64, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
      {error && <p style={{ color: "red", margin: "0 0 8px", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={saving} style={{ ...btnStyle, background: "#2e7d32" }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onCancel} style={{ ...btnStyle, background: "#757575" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────
function RiskRow({ risk, req, level, isLast, onDelete, onUpdate }: {
  risk: Risk; req?: Requirement; level: RiskLevel; isLast: boolean;
  onDelete: (id: string) => void;
  onUpdate: (updated: Risk) => void;
}) {
  const [editing, setEditing] = useState(false);
  const meta = LEVEL_META[level];

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${meta.border}`, background: "#fff" }}>
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            background: meta.color, color: "#fff", borderRadius: 3,
            padding: "1px 8px", fontSize: 11, fontWeight: 700,
          }}>{level}</span>
          <span style={{ fontSize: 11, color: "#999" }}>
            S={risk.severity} × P={risk.probability} = {risk.severity * risk.probability}
          </span>
          {req && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1565c0" }}>
                {req.readable_id}
              </span>
              {" "}{req.title.length > 45 ? req.title.slice(0, 45) + "…" : req.title}
            </span>
          )}
          <button
            onClick={() => setEditing(e => !e)}
            style={{
              padding: "2px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer",
              background: editing ? "#e3f2fd" : "#f5f5f5",
              border: `1px solid ${editing ? "#1565c0" : "#ddd"}`,
              color: editing ? "#1565c0" : "#555",
            }}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={() => onDelete(risk.id)}
            style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
          >✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", fontSize: 13 }}>
          <div><span style={{ color: "#888", fontSize: 11 }}>Hazard</span><br />{risk.hazard}</div>
          <div><span style={{ color: "#888", fontSize: 11 }}>Situation</span><br />{risk.hazardous_situation}</div>
          <div><span style={{ color: "#888", fontSize: 11 }}>Harm</span><br />{risk.harm}</div>
        </div>

        {risk.mitigation && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: "#f1f8e9", borderLeft: "3px solid #66bb6a", borderRadius: "0 4px 4px 0", fontSize: 13 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mitigation</span>
            <div style={{ color: "#33691e", marginTop: 2 }}>{risk.mitigation}</div>
          </div>
        )}
      </div>

      {editing && (
        <EditRiskForm
          risk={risk}
          onSave={updated => { onUpdate(updated); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ── Collapsible risk level group ──────────────────────────────────────────────
function RiskGroup({ level, risks, reqs, onDelete, onUpdate }: {
  level: RiskLevel; risks: Risk[]; reqs: Requirement[];
  onDelete: (id: string) => void;
  onUpdate: (updated: Risk) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = LEVEL_META[level];
  const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          background: meta.bg,
          border: `1px solid ${meta.border}`, borderLeft: `4px solid ${meta.color}`,
          padding: "10px 14px", borderRadius: "0 6px 6px 0",
        }}
      >
        <span style={{ fontWeight: 700, color: meta.color, fontSize: 14, flex: 1 }}>
          {open ? "▾" : "▸"} {meta.label}
        </span>
        <span style={{
          background: meta.color, color: "#fff", borderRadius: 12,
          padding: "2px 10px", fontSize: 12, fontWeight: 700,
        }}>{risks.length}</span>
      </div>

      {open && (
        <div style={{ border: `1px solid ${meta.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
          {risks.map((r, i) => (
            <RiskRow
              key={r.id}
              risk={r}
              req={reqById[r.requirement_id]}
              level={level}
              isLast={i === risks.length - 1}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────
function RisksPageInner() {
  const params    = useSearchParams();
  const lvlParam  = params.get("level") ?? "ALL";

  const [projects, setProjects]   = useState<Project[]>([]);
  const [reqs, setReqs]           = useState<Requirement[]>([]);
  const [risks, setRisks]         = useState<Risk[]>([]);
  const [projectId, setProjectId] = useActiveProject();
  const [filter, setFilter]       = useState<string>(lvlParam);
  const [activeTab, setActiveTab] = useState<"register" | "classification">("register");

  // add-risk form
  const [reqId, setReqId]         = useState("");
  const [hazard, setHazard]       = useState("");
  const [hazSit, setHazSit]       = useState("");
  const [harm, setHarm]           = useState("");
  const [severity, setSeverity]   = useState(1);
  const [prob, setProb]           = useState(1);
  const [mitigation, setMitigation] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async () => {
    if (!projectId) return;
    const [r, rk] = await Promise.all([
      api.requirements.list(projectId),
      api.risks.list(undefined, projectId),
    ]);
    setReqs(r);
    setRisks(rk);
  };

  useEffect(() => {
    if (!projectId) { setReqs([]); setRisks([]); return; }
    reload();
  }, [projectId]);

  const previewLevel = (): RiskLevel => {
    const s = severity * prob;
    return s <= 4 ? "LOW" : s <= 9 ? "MEDIUM" : "HIGH";
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!reqId) { setFormError("Select a requirement"); return; }
    setSaving(true); setFormError("");
    try {
      await api.risks.create({
        requirement_id: reqId, hazard, hazardous_situation: hazSit, harm,
        severity, probability: prob,
        mitigation: mitigation.trim() || undefined,
      });
      setHazard(""); setHazSit(""); setHarm(""); setSeverity(1); setProb(1);
      setMitigation(""); setReqId("");
      await reload();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await api.risks.delete(id);
    await reload();
  }

  function handleUpdate(updated: Risk) {
    setRisks(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW"];
  const grouped = Object.fromEntries(
    LEVELS.map(l => [l, risks.filter(r => r.risk_level === l)])
  ) as Record<RiskLevel, Risk[]>;

  const displayLevels = filter === "ALL" ? LEVELS : [filter as RiskLevel];
  const totalShown = displayLevels.reduce((n, l) => n + grouped[l].length, 0);

  return (
    <div style={{ maxWidth: 1050, margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Risk Register</h1>
        {projectId && activeTab === "register" && (
          <button onClick={() => setShowForm(f => !f)} style={{
            padding: "5px 14px", borderRadius: 6, border: "1px solid #1565c0",
            background: showForm ? "#1565c0" : "#e3f2fd",
            color: showForm ? "#fff" : "#1565c0", cursor: "pointer", fontSize: 13,
          }}>+ Add Risk</button>
        )}
      </div>

      <select value={projectId} onChange={e => { setProjectId(e.target.value); setReqId(""); }} style={{ ...inputStyle, marginBottom: 16 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* Top-level tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e0e0e0" }}>
        {([
          { key: "register",       label: "Risk Register" },
          { key: "classification", label: "Safety Classification" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "9px 20px", border: "none", background: "none",
            cursor: "pointer", fontSize: 14, fontWeight: activeTab === t.key ? 700 : 400,
            color: activeTab === t.key ? "#1565c0" : "#555",
            borderBottom: activeTab === t.key ? "3px solid #1565c0" : "3px solid transparent",
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Safety Classification tab */}
      {activeTab === "classification" && projectId && (
        <SafetyClassificationTab projectId={projectId} />
      )}
      {activeTab === "classification" && !projectId && (
        <p style={{ color: "#888" }}>Select a project to view its safety classification.</p>
      )}

      {/* Risk Register tab */}
      {activeTab === "register" && (
        <>
          {/* Add risk form */}
          {showForm && projectId && (
            <div style={{ ...cardStyle, marginBottom: 20, border: "1px solid #1565c0" }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Add Risk</h3>
              <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select value={reqId} onChange={e => setReqId(e.target.value)} style={inputStyle}>
                  <option value="">— Select requirement *</option>
                  {reqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} [{r.type}] {r.title}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <input placeholder="Hazard *" value={hazard} onChange={e => setHazard(e.target.value)} required style={inputStyle} />
                  <input placeholder="Hazardous Situation *" value={hazSit} onChange={e => setHazSit(e.target.value)} required style={inputStyle} />
                  <input placeholder="Harm *" value={harm} onChange={e => setHarm(e.target.value)} required style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13 }}>
                    Severity (1–5):
                    <input type="number" min={1} max={5} value={severity} onChange={e => setSeverity(+e.target.value)}
                      style={{ ...inputStyle, width: 60, marginLeft: 8 }} />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Probability (1–5):
                    <input type="number" min={1} max={5} value={prob} onChange={e => setProb(+e.target.value)}
                      style={{ ...inputStyle, width: 60, marginLeft: 8 }} />
                  </label>
                  <span style={{ fontSize: 13 }}>
                    Preview: <b style={{ color: LEVEL_META[previewLevel()].color }}>{previewLevel()}</b>
                    <span style={{ color: "#888", marginLeft: 4 }}>(score: {severity * prob})</span>
                  </span>
                </div>
                <div>
                  <label style={labelStyle}>Mitigation / Control Measure (optional)</label>
                  <textarea
                    value={mitigation}
                    onChange={e => setMitigation(e.target.value)}
                    placeholder="Describe the risk control measure…"
                    style={{ ...inputStyle, width: "100%", height: 56, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                {formError && <p style={{ color: "red", margin: 0, fontSize: 13 }}>{formError}</p>}
                <button type="submit" disabled={saving || !reqId} style={btnStyle}>{saving ? "Saving…" : "Add Risk"}</button>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          {projectId && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {(["ALL", ...LEVELS] as const).map(l => {
                const count = l === "ALL" ? risks.length : grouped[l].length;
                const color = l === "ALL" ? "#37474f" : LEVEL_META[l].color;
                return (
                  <button key={l} onClick={() => setFilter(l)} style={{
                    padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500,
                    background: filter === l ? color : "#f0f0f0",
                    color: filter === l ? "#fff" : "#555",
                  }}>
                    {l === "ALL" ? "All Risks" : LEVEL_META[l].label}
                    <span style={{ marginLeft: 6, opacity: 0.75 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Risk groups */}
          {!projectId ? (
            <p style={{ color: "#888" }}>Select a project.</p>
          ) : risks.length === 0 ? (
            <p style={{ color: "#888" }}>No risks yet.</p>
          ) : totalShown === 0 ? (
            <p style={{ color: "#aaa" }}>No {filter} risks.</p>
          ) : (
            <div>
              {displayLevels.map(l => grouped[l].length > 0 && (
                <RiskGroup key={l} level={l} risks={grouped[l]} reqs={reqs}
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

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.25rem" };
const sectionCard: React.CSSProperties = { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem 1.25rem" };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#455a64", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" as const, width: "100%" };
const btnStyle: React.CSSProperties   = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "#666", marginBottom: 3, fontWeight: 600 };
const thStyle: React.CSSProperties    = { padding: "6px 10px", textAlign: "left" as const, fontWeight: 600, fontSize: 12, color: "#555", borderBottom: "1px solid #e0e0e0" };
const tdStyle: React.CSSProperties    = { padding: "6px 10px", verticalAlign: "top" as const };
