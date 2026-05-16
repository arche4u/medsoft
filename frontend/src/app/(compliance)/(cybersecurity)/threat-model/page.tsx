"use client";
// IEC 81001-5-1 Threat Model — STRIDE per §5.3 architecture component.
//
// Pages are intentionally simple: a left column of versioned ThreatModel
// snapshots, a right detail panel showing all threats grouped by STRIDE
// letter. Status transitions (DRAFT → IN_REVIEW → APPROVED) are the same
// pattern used by SDP + Architecture Baselines so the locking semantics
// feel familiar — once APPROVED, threats are read-only and a new
// version must be created to record new threats.
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import {
  api,
  ThreatModelRead,
  ThreatRead,
  ThreatPayload,
  StrideCategory,
  ThreatSeverity,
  ThreatStatus,
  SWComponent,
} from "@/lib/api";

const STRIDE: { code: StrideCategory; label: string; color: string; hint: string }[] = [
  { code: "S", label: "Spoofing",          color: "#1565c0", hint: "Impersonating an identity (user, service, device)" },
  { code: "T", label: "Tampering",          color: "#6a1b9a", hint: "Modifying data in transit or at rest" },
  { code: "R", label: "Repudiation",        color: "#00838f", hint: "Denying an action without an audit trail" },
  { code: "I", label: "Info disclosure",    color: "#ef6c00", hint: "Exposing data to an unauthorized party" },
  { code: "D", label: "Denial of service",  color: "#b71c1c", hint: "Making a service unavailable" },
  { code: "E", label: "Elevation of priv.", color: "#37474f", hint: "Gaining permissions beyond what was granted" },
];

const SEVERITY_COLOR: Record<ThreatSeverity, string> = {
  LOW: "#9e9e9e", MEDIUM: "#fb8c00", HIGH: "#e53935", CRITICAL: "#b71c1c",
};

const STATUS_COLOR: Record<string, string> = {
  IDENTIFIED: "#e65100", MITIGATED: "#2e7d32", ACCEPTED: "#546e7a", TRANSFERRED: "#4a148c",
  DRAFT: "#546e7a", IN_REVIEW: "#e65100", APPROVED: "#2e7d32", OBSOLETE: "#9e9e9e",
};

const EMPTY_DRAFT: ThreatPayload = { category: "S", title: "", severity: "MEDIUM", status: "IDENTIFIED" };

export default function ThreatModelPage() {
  const [projectId] = useActiveProject();
  const [models, setModels] = useState<ThreatModelRead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [components, setComponents] = useState<SWComponent[]>([]);
  const [error, setError] = useState("");

  // Create-model form
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("1.0");
  // Add-threat form (visible only when an editable model is selected)
  const [draft, setDraft] = useState<ThreatPayload>(EMPTY_DRAFT);

  const selected = models.find(m => m.id === selectedId) || null;
  const editable = selected && (selected.status === "DRAFT" || selected.status === "IN_REVIEW");

  useEffect(() => {
    if (!projectId) return;
    api.threatModel.listModels(projectId).then(setModels).catch(e => setError(String(e)));
    api.architecture.listComponents(projectId).then(setComponents).catch(() => {});
  }, [projectId]);

  const refresh = async () => {
    if (!projectId) return;
    const list = await api.threatModel.listModels(projectId);
    setModels(list);
    if (selectedId) {
      const fresh = list.find(m => m.id === selectedId);
      if (!fresh) setSelectedId(list[0]?.id ?? null);
    } else if (list.length) {
      setSelectedId(list[0].id);
    }
  };

  const createModel = async () => {
    if (!projectId || !newName.trim()) return;
    try {
      const m = await api.threatModel.createModel({ project_id: projectId, name: newName.trim(), version: newVersion.trim() || "1.0" });
      setNewName(""); setNewVersion("1.0");
      setSelectedId(m.id);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const transition = async (next: "IN_REVIEW" | "APPROVED" | "OBSOLETE") => {
    if (!selected) return;
    try {
      await api.threatModel.updateModel(selected.id, { status: next });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const addThreat = async () => {
    if (!selected || !draft.title.trim()) return;
    try {
      await api.threatModel.addThreat(selected.id, draft);
      setDraft(EMPTY_DRAFT);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const updateThreatStatus = async (t: ThreatRead, status: ThreatStatus) => {
    try {
      await api.threatModel.updateThreat(t.id, { status });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const deleteThreat = async (t: ThreatRead) => {
    if (!confirm(`Delete threat "${t.title}"?`)) return;
    try {
      await api.threatModel.deleteThreat(t.id);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // Group selected model's threats by STRIDE letter for rendering.
  const threatsByCategory: Record<StrideCategory, ThreatRead[]> = { S: [], T: [], R: [], I: [], D: [], E: [] };
  for (const t of (selected?.threats ?? [])) threatsByCategory[t.category].push(t);

  if (!projectId) {
    return <div style={page}><h1 style={h1}>Threat Model</h1><p>Select a project to view its threat models.</p></div>;
  }

  return (
    <div style={page}>
      <h1 style={h1}>Threat Model <span style={subtitle}>IEC 81001-5-1 — STRIDE per §5.3 component</span></h1>
      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem" }}>
        {/* Left: model list + create */}
        <div>
          <div style={card}>
            <h3 style={h3}>New Threat Model</h3>
            <input style={input} placeholder="Name (e.g., v1.0 STRIDE)" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={{ ...input, marginTop: "0.5rem" }} placeholder="Version" value={newVersion} onChange={e => setNewVersion(e.target.value)} />
            <button style={{ ...btn(), marginTop: "0.6rem" }} onClick={createModel}>Create</button>
          </div>
          <div style={card}>
            <h3 style={h3}>Models</h3>
            {models.length === 0 && <p style={muted}>No threat models yet.</p>}
            {models.map(m => (
              <div key={m.id} onClick={() => setSelectedId(m.id)}
                   style={{ ...modelRow, ...(m.id === selectedId ? activeModelRow : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{m.name}</strong>
                  <span style={badge(STATUS_COLOR[m.status])}>{m.status}</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "#888", marginTop: 2 }}>
                  v{m.version} · {m.threats.length} threat{m.threats.length === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div>
          {!selected && <div style={card}><p style={muted}>Select a threat model to view its threats.</p></div>}
          {selected && (
            <>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ ...h3, fontSize: "1.1rem" }}>{selected.name} <span style={muted}>v{selected.version}</span></h2>
                    <div style={muted}>{selected.threats.length} threat{selected.threats.length === 1 ? "" : "s"} across {Object.entries(threatsByCategory).filter(([, ts]) => ts.length).length} STRIDE categories</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {selected.status === "DRAFT" && <button style={btn("#1565c0")} onClick={() => transition("IN_REVIEW")}>Submit for Review</button>}
                    {selected.status === "IN_REVIEW" && <button style={btn("#2e7d32")} onClick={() => transition("APPROVED")}>Approve</button>}
                    {selected.status === "APPROVED" && <button style={btn("#9e9e9e")} onClick={() => transition("OBSOLETE")}>Mark Obsolete</button>}
                  </div>
                </div>
              </div>

              {editable && (
                <div style={card}>
                  <h3 style={h3}>Add Threat</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 110px 110px 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <select style={input} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as StrideCategory })}>
                      {STRIDE.map(s => <option key={s.code} value={s.code}>{s.code} — {s.label}</option>)}
                    </select>
                    <select style={input} value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value as ThreatSeverity })}>
                      {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as ThreatSeverity[]).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select style={input} value={draft.component_id ?? ""} onChange={e => setDraft({ ...draft, component_id: e.target.value || null })}>
                      <option value="">(no component)</option>
                      {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input style={input} placeholder="Title (e.g., Forge TLS cert to MITM telemetry)" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                  </div>
                  <textarea style={{ ...input, height: 50, marginBottom: "0.5rem" }} placeholder="Description (optional)" value={draft.description ?? ""} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                  <textarea style={{ ...input, height: 50, marginBottom: "0.5rem" }} placeholder="Mitigation (in-product control or process)" value={draft.mitigation ?? ""} onChange={e => setDraft({ ...draft, mitigation: e.target.value })} />
                  <button style={btn("#2e7d32")} onClick={addThreat}>Add Threat</button>
                </div>
              )}

              {STRIDE.map(({ code, label, color, hint }) => {
                const ts = threatsByCategory[code];
                if (!ts.length) return null;
                return (
                  <div key={code} style={card}>
                    <h3 style={h3}>
                      <span style={{ ...stridePill, background: color }}>{code}</span>
                      {label} <span style={muted}>· {hint}</span>
                    </h3>
                    {ts.map(t => (
                      <div key={t.id} style={threatRow}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>{t.title}</strong>
                          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                            <span style={badge(SEVERITY_COLOR[t.severity])}>{t.severity}</span>
                            <span style={badge(STATUS_COLOR[t.status])}>{t.status}</span>
                          </div>
                        </div>
                        {t.description && <div style={{ fontSize: "0.8rem", color: "#37474f", marginTop: 4 }}>{t.description}</div>}
                        {t.mitigation && (
                          <div style={{ fontSize: "0.8rem", color: "#1b5e20", marginTop: 4, padding: "0.4rem 0.5rem", background: "#f1f8e9", borderRadius: 4 }}>
                            <strong>Mitigation:</strong> {t.mitigation}
                          </div>
                        )}
                        {editable && (
                          <div style={{ display: "flex", gap: "0.3rem", marginTop: 6 }}>
                            {(["IDENTIFIED", "MITIGATED", "ACCEPTED", "TRANSFERRED"] as ThreatStatus[]).map(s => (
                              <button key={s} disabled={t.status === s}
                                      style={{ ...miniBtn, opacity: t.status === s ? 0.4 : 1 }}
                                      onClick={() => updateThreatStatus(t, s)}>{s}</button>
                            ))}
                            <button style={{ ...miniBtn, background: "#b71c1c" }} onClick={() => deleteThreat(t)}>Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── inline styles ────────────────────────────────────────────────────────────
const page: React.CSSProperties = { padding: "2rem", fontFamily: "-apple-system, sans-serif", maxWidth: 1300, margin: "0 auto" };
const h1: React.CSSProperties = { color: "#0d1b2a", marginBottom: "1.5rem" };
const h3: React.CSSProperties = { marginTop: 0, marginBottom: "0.6rem", color: "#0d1b2a" };
const subtitle: React.CSSProperties = { fontSize: "0.85rem", fontWeight: "normal", color: "#666", marginLeft: "0.75rem" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" };
const input: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.45rem 0.6rem", fontSize: "0.85rem", width: "100%" };
const muted: React.CSSProperties = { color: "#888", fontSize: "0.8rem" };
const modelRow: React.CSSProperties = { padding: "0.6rem 0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.4rem", cursor: "pointer", background: "#fafafa" };
const activeModelRow: React.CSSProperties = { border: "2px solid #1565c0", background: "#e3f2fd" };
const threatRow: React.CSSProperties = { padding: "0.6rem 0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.4rem", background: "#fafafa" };
const errBox: React.CSSProperties = { background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" };
const stridePill: React.CSSProperties = { display: "inline-block", color: "#fff", fontWeight: 700, padding: "2px 8px", borderRadius: 4, marginRight: 8, fontSize: "0.85rem" };
const badge = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600 });
const btn = (bg = "#1565c0"): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.9rem", cursor: "pointer", fontSize: "0.82rem" });
const miniBtn: React.CSSProperties = { background: "#546e7a", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: "0.7rem" };
