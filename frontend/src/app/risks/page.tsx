"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, Requirement, Risk } from "@/lib/api";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const LEVEL_META: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: "High Risk",   color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  MEDIUM: { label: "Medium Risk", color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  LOW:    { label: "Low Risk",    color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

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
      {/* Main row */}
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

      {/* Inline edit form */}
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
  const [projectId, setProjectId] = useState("");
  const [filter, setFilter]       = useState<string>(lvlParam);

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
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Risk Register</h1>
        {projectId && (
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

      {/* Add risk form */}
      {showForm && projectId && (
        <div style={{ ...cardStyle, marginBottom: 20, borderColor: "#1565c0" }}>
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
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" as const };
const btnStyle: React.CSSProperties   = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "#666", marginBottom: 3, fontWeight: 600 };
