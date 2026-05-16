"use client";
// IEC 62366-1 Usability Engineering File.
//
// Three nested entities (UsabilityFile → UseScenario → UseError) rendered
// as a master/detail tree. The Use Specification (intended users / use
// environments / indication / operating principle) sits at the top of the
// file detail; scenarios are listed below with their use errors. Use
// errors escalate to §7 risks (risk_class=USABILITY) the same way
// vulnerabilities and threats do.
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import {
  api,
  UsabilityFileRead,
  UsabilityFileStatus,
  UseScenarioRead,
  UseErrorRead,
  UseErrorPayload,
  UseErrorSeverity,
  UseErrorStatus,
  Requirement,
  SWComponent,
} from "@/lib/api";

const SEV_COLOR: Record<UseErrorSeverity, string> = {
  LOW: "#9e9e9e", MEDIUM: "#fb8c00", HIGH: "#e53935", CRITICAL: "#b71c1c",
};
const UE_STATUS_COLOR: Record<UseErrorStatus, string> = {
  IDENTIFIED: "#e65100", MITIGATED: "#2e7d32", ACCEPTED: "#546e7a", TRANSFERRED: "#4a148c",
};
const FILE_STATUS_COLOR: Record<UsabilityFileStatus, string> = {
  DRAFT: "#546e7a", IN_REVIEW: "#e65100", APPROVED: "#2e7d32", OBSOLETE: "#9e9e9e",
};

const EMPTY_ERROR: UseErrorPayload = { description: "", severity: "MEDIUM", status: "IDENTIFIED" };

export default function UsabilityPage() {
  const [projectId] = useActiveProject();
  const [files, setFiles] = useState<UsabilityFileRead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [components, setComponents] = useState<SWComponent[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState("");

  // New-file form
  const [newName, setNewName] = useState("Usability Engineering File");
  const [newVersion, setNewVersion] = useState("1.0");

  // New-scenario form (visible per-file)
  const [scenarioName, setScenarioName] = useState("");
  // Per-scenario new-error draft (scoped by scenario id)
  const [drafts, setDrafts] = useState<Record<string, UseErrorPayload>>({});
  // Per-error escalation form (which error is being escalated, plus inputs)
  const [escFor, setEscFor] = useState<string | null>(null);
  const [esc, setEsc] = useState<{ requirement_id: string; severity: number; probability: number }>({ requirement_id: "", severity: 3, probability: 3 });

  const selected = files.find(f => f.id === selectedId) || null;
  const editable = selected && (selected.status === "DRAFT" || selected.status === "IN_REVIEW");

  useEffect(() => {
    if (!projectId) return;
    api.usability.listFiles(projectId).then(setFiles).catch(e => setError(String(e)));
    api.architecture.listComponents(projectId).then(setComponents).catch(() => {});
    api.requirements.list(projectId).then(setRequirements).catch(() => {});
  }, [projectId]);

  const refresh = async () => {
    if (!projectId) return;
    const list = await api.usability.listFiles(projectId);
    setFiles(list);
    if (!selectedId && list.length) setSelectedId(list[0].id);
  };

  const createFile = async () => {
    if (!projectId || !newName.trim()) return;
    try {
      const f = await api.usability.createFile({ project_id: projectId, name: newName.trim(), version: newVersion.trim() || "1.0" });
      setSelectedId(f.id);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const updateSpec = async (key: keyof UsabilityFileRead, value: string) => {
    if (!selected) return;
    try {
      await api.usability.updateFile(selected.id, { [key]: value || null } as Partial<{ intended_users: string | null; intended_use_environment: string | null; intended_medical_indication: string | null; operating_principle: string | null }>);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const transition = async (next: UsabilityFileStatus) => {
    if (!selected) return;
    try {
      await api.usability.updateFile(selected.id, { status: next });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const addScenario = async () => {
    if (!selected || !scenarioName.trim()) return;
    try {
      await api.usability.addScenario(selected.id, { name: scenarioName.trim() });
      setScenarioName("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const deleteScenario = async (s: UseScenarioRead) => {
    if (!confirm(`Delete scenario "${s.name}" and its ${s.use_errors.length} use error(s)?`)) return;
    try { await api.usability.deleteScenario(s.id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const addUseError = async (s: UseScenarioRead) => {
    const d = drafts[s.id] ?? EMPTY_ERROR;
    if (!d.description.trim()) return;
    try {
      await api.usability.addUseError(s.id, d);
      setDrafts({ ...drafts, [s.id]: EMPTY_ERROR });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const escalate = async (e: UseErrorRead) => {
    if (!esc.requirement_id) return;
    try {
      await api.usability.escalateUseError(e.id, esc);
      setEscFor(null);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const deleteUseError = async (e: UseErrorRead) => {
    if (!confirm(`Delete use error "${e.description}"?`)) return;
    try { await api.usability.deleteUseError(e.id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  if (!projectId) {
    return <div style={page}><h1 style={h1}>Usability Engineering File</h1><p>Select a project.</p></div>;
  }

  return (
    <div style={page}>
      <h1 style={h1}>Usability Engineering File <span style={subtitle}>IEC 62366-1 — accepted by EU MDR, FDA, Health Canada, TGA, PMDA, MHRA</span></h1>
      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem" }}>
        {/* Left: file list + create */}
        <div>
          <div style={card}>
            <h3 style={h3}>New Usability File</h3>
            <input style={input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={{ ...input, marginTop: "0.4rem" }} placeholder="Version" value={newVersion} onChange={e => setNewVersion(e.target.value)} />
            <button style={{ ...btn(), marginTop: "0.5rem" }} onClick={createFile}>Create</button>
          </div>
          <div style={card}>
            <h3 style={h3}>Files</h3>
            {files.length === 0 && <p style={muted}>No usability files yet.</p>}
            {files.map(f => (
              <div key={f.id} onClick={() => setSelectedId(f.id)}
                   style={{ ...rowStyle, ...(f.id === selectedId ? activeRowStyle : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: "0.85rem" }}>{f.name}</strong>
                  <span style={badge(FILE_STATUS_COLOR[f.status])}>{f.status}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#888", marginTop: 2 }}>
                  v{f.version} · {f.scenarios.length} scenario{f.scenarios.length === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: file detail */}
        <div>
          {!selected && <div style={card}><p style={muted}>Select a usability file.</p></div>}
          {selected && (
            <>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h2 style={{ ...h3, fontSize: "1.1rem", margin: 0 }}>{selected.name} <span style={muted}>v{selected.version}</span></h2>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {selected.status === "DRAFT" && <button style={btn("#1565c0")} onClick={() => transition("IN_REVIEW")}>Submit for Review</button>}
                    {selected.status === "IN_REVIEW" && <button style={btn("#2e7d32")} onClick={() => transition("APPROVED")}>Approve</button>}
                    {selected.status === "APPROVED" && <button style={btn("#9e9e9e")} onClick={() => transition("OBSOLETE")}>Mark Obsolete</button>}
                  </div>
                </div>
              </div>

              <div style={card}>
                <h3 style={h3}>Use Specification (§5.1)</h3>
                {[
                  { key: "intended_users",              label: "Intended users (clinical role, training, expertise)" },
                  { key: "intended_use_environment",    label: "Intended use environments" },
                  { key: "intended_medical_indication", label: "Intended medical indication" },
                  { key: "operating_principle",         label: "Operating principle" },
                ].map(({ key, label }) => (
                  <div key={key} style={{ marginBottom: "0.6rem" }}>
                    <div style={specLabel}>{label}</div>
                    <textarea
                      style={{ ...input, height: 56 }}
                      defaultValue={(selected[key as keyof UsabilityFileRead] as string) ?? ""}
                      disabled={!editable}
                      onBlur={e => editable && updateSpec(key as keyof UsabilityFileRead, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h3 style={{ ...h3, margin: 0 }}>Hazard-related Use Scenarios (§5.4)</h3>
                  {editable && (
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <input style={{ ...input, width: 280 }} placeholder="Scenario name (e.g., Set infusion rate)" value={scenarioName} onChange={e => setScenarioName(e.target.value)} />
                      <button style={btn("#2e7d32")} onClick={addScenario}>Add Scenario</button>
                    </div>
                  )}
                </div>
                {selected.scenarios.length === 0 && <p style={muted}>No scenarios yet.</p>}
                {selected.scenarios.map(s => {
                  const draft = drafts[s.id] ?? EMPTY_ERROR;
                  return (
                    <div key={s.id} style={{ padding: "0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.6rem", background: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{s.name}</strong>
                        {editable && <button style={{ ...miniBtn, background: "#b71c1c" }} onClick={() => deleteScenario(s)}>Delete</button>}
                      </div>
                      {s.use_errors.length === 0 && <div style={{ ...muted, marginTop: 4 }}>No use errors recorded yet.</div>}
                      {s.use_errors.map(e => (
                        <div key={e.id} style={{ padding: "0.5rem", border: "1px solid #ddd", borderRadius: 4, marginTop: 6, background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.85rem" }}>{e.description}</span>
                            <div style={{ display: "flex", gap: "0.3rem" }}>
                              <span style={badge(SEV_COLOR[e.severity])}>{e.severity}</span>
                              <span style={badge(UE_STATUS_COLOR[e.status])}>{e.status}</span>
                              {e.escalated_risk_id && <span style={{ ...badge("#1565c0"), fontSize: "0.65rem" }}>→ §7</span>}
                            </div>
                          </div>
                          {e.potential_harm && <div style={{ ...muted, marginTop: 4 }}>Harm: {e.potential_harm}</div>}
                          {e.mitigation && <div style={{ fontSize: "0.78rem", color: "#1b5e20", marginTop: 4, padding: "0.3rem", background: "#f1f8e9", borderRadius: 3 }}>Mitigation: {e.mitigation}</div>}
                          {editable && (
                            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: 5 }}>
                              {!e.escalated_risk_id && <button style={{ ...miniBtn, background: "#6a1b9a" }} onClick={() => { setEscFor(e.id); setEsc({ requirement_id: "", severity: 3, probability: 3 }); }}>Escalate to §7</button>}
                              <button style={{ ...miniBtn, background: "#b71c1c" }} onClick={() => deleteUseError(e)}>Delete</button>
                            </div>
                          )}
                          {escFor === e.id && (
                            <div style={{ marginTop: 6, padding: "0.5rem", background: "#fff8e1", borderRadius: 4 }}>
                              <select style={input} value={esc.requirement_id} onChange={ev => setEsc({ ...esc, requirement_id: ev.target.value })}>
                                <option value="">Target requirement…</option>
                                {requirements.map(r => <option key={r.id} value={r.id}>[{r.readable_id ?? r.type}] {r.title}</option>)}
                              </select>
                              <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.3rem" }}>
                                <select style={input} value={esc.severity} onChange={ev => setEsc({ ...esc, severity: Number(ev.target.value) })}>
                                  {[1,2,3,4,5].map(n => <option key={n} value={n}>Sev {n}</option>)}
                                </select>
                                <select style={input} value={esc.probability} onChange={ev => setEsc({ ...esc, probability: Number(ev.target.value) })}>
                                  {[1,2,3,4,5].map(n => <option key={n} value={n}>Prob {n}</option>)}
                                </select>
                                <button style={btn("#2e7d32")} onClick={() => escalate(e)} disabled={!esc.requirement_id}>Create Risk</button>
                                <button style={btn("#9e9e9e")} onClick={() => setEscFor(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <div style={{ marginTop: 6, padding: "0.5rem", border: "1px dashed #ccc", borderRadius: 4 }}>
                          <input style={input} placeholder="New use error — describe the foreseeable user mistake" value={draft.description} onChange={ev => setDrafts({ ...drafts, [s.id]: { ...draft, description: ev.target.value } })} />
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px", gap: "0.3rem", marginTop: "0.3rem" }}>
                            <input style={input} placeholder="Potential harm (optional)" value={draft.potential_harm ?? ""} onChange={ev => setDrafts({ ...drafts, [s.id]: { ...draft, potential_harm: ev.target.value } })} />
                            <input style={input} placeholder="Mitigation (optional)" value={draft.mitigation ?? ""} onChange={ev => setDrafts({ ...drafts, [s.id]: { ...draft, mitigation: ev.target.value } })} />
                            <select style={input} value={draft.severity ?? "MEDIUM"} onChange={ev => setDrafts({ ...drafts, [s.id]: { ...draft, severity: ev.target.value as UseErrorSeverity } })}>
                              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as UseErrorSeverity[]).map(x => <option key={x}>{x}</option>)}
                            </select>
                            <button style={btn("#2e7d32")} onClick={() => addUseError(s)}>Add Error</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Suppress unused-component warning — components list is loaded for future scenario→component linking */}
      <span style={{ display: "none" }}>{components.length}</span>
    </div>
  );
}

const page: React.CSSProperties = { padding: "2rem", fontFamily: "-apple-system, sans-serif", maxWidth: 1300, margin: "0 auto" };
const h1: React.CSSProperties = { color: "#0d1b2a", marginBottom: "1.5rem" };
const h3: React.CSSProperties = { marginTop: 0, marginBottom: "0.6rem", color: "#0d1b2a" };
const subtitle: React.CSSProperties = { fontSize: "0.85rem", fontWeight: "normal", color: "#666", marginLeft: "0.75rem" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" };
const input: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.55rem", fontSize: "0.83rem", width: "100%" };
const specLabel: React.CSSProperties = { fontSize: "0.78rem", color: "#37474f", marginBottom: 3, fontWeight: 600 };
const muted: React.CSSProperties = { color: "#888", fontSize: "0.78rem" };
const rowStyle: React.CSSProperties = { padding: "0.55rem 0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.4rem", cursor: "pointer", background: "#fafafa" };
const activeRowStyle: React.CSSProperties = { border: "2px solid #1565c0", background: "#e3f2fd" };
const errBox: React.CSSProperties = { background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" };
const badge = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600 });
const btn = (bg = "#1565c0"): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.9rem", cursor: "pointer", fontSize: "0.82rem" });
const miniBtn: React.CSSProperties = { background: "#546e7a", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: "0.7rem" };
