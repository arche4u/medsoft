"use client";
// IEC 81001-5-1 Vulnerability Intake.
//
// A simple triage queue: incoming CVE/advisory rows on the left, detail
// + edit + escalate-to-§7 controls on the right. Escalation requires
// picking a target SOFTWARE-tier requirement (Risk.requirement_id is NOT
// NULL by schema) so the triager makes that choice explicit.
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import {
  api,
  VulnerabilityRead,
  VulnerabilityCreatePayload,
  VulnSeverity,
  VulnStatus,
  Requirement,
  CMConfigItem,
} from "@/lib/api";

const SEVERITY_COLOR: Record<VulnSeverity, string> = {
  LOW: "#9e9e9e", MEDIUM: "#fb8c00", HIGH: "#e53935", CRITICAL: "#b71c1c",
};
const STATUS_COLOR: Record<VulnStatus, string> = {
  NEW: "#1565c0", TRIAGED: "#e65100", MITIGATED: "#558b2f",
  RESOLVED: "#2e7d32", FALSE_POSITIVE: "#9e9e9e",
};

const EMPTY: VulnerabilityCreatePayload = { project_id: "", title: "", severity_band: "MEDIUM" };

export default function VulnerabilitiesPage() {
  const [projectId] = useActiveProject();
  const [list, setList] = useState<VulnerabilityRead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [soup, setSoup] = useState<CMConfigItem[]>([]);
  const [draft, setDraft] = useState<VulnerabilityCreatePayload>(EMPTY);
  const [esc, setEsc] = useState<{ requirement_id: string; severity: number; probability: number }>({ requirement_id: "", severity: 3, probability: 3 });
  const [showEsc, setShowEsc] = useState(false);
  const [error, setError] = useState("");

  const selected = list.find(v => v.id === selectedId) || null;

  useEffect(() => {
    if (!projectId) return;
    api.vulnerabilities.list(projectId).then(setList).catch(e => setError(String(e)));
    api.requirements.list(projectId).then(setRequirements).catch(() => {});
    api.configMgmt.items.list(projectId, "SOUP").then(setSoup).catch(() => {});
  }, [projectId]);

  const refresh = async () => {
    if (!projectId) return;
    setList(await api.vulnerabilities.list(projectId));
  };

  const create = async () => {
    if (!projectId || !draft.title.trim()) return;
    try {
      const v = await api.vulnerabilities.create({ ...draft, project_id: projectId });
      setDraft(EMPTY);
      setSelectedId(v.id);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const setStatus = async (next: VulnStatus) => {
    if (!selected) return;
    try {
      await api.vulnerabilities.update(selected.id, { status: next });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const escalate = async () => {
    if (!selected || !esc.requirement_id) return;
    try {
      await api.vulnerabilities.escalate(selected.id, esc);
      setShowEsc(false);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const remove = async () => {
    if (!selected || !confirm(`Delete vulnerability "${selected.title}"?`)) return;
    try {
      await api.vulnerabilities.delete(selected.id);
      setSelectedId(null);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (!projectId) {
    return <div style={page}><h1 style={h1}>Vulnerabilities</h1><p>Select a project to view vulnerabilities.</p></div>;
  }

  return (
    <div style={page}>
      <h1 style={h1}>Vulnerabilities <span style={subtitle}>IEC 81001-5-1 — CVE / advisory intake → §7 risk escalation</span></h1>
      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1.5rem" }}>
        <div>
          <div style={card}>
            <h3 style={h3}>New Vulnerability</h3>
            <input style={input} placeholder="CVE ID (optional, e.g. CVE-2024-12345)" value={draft.cve_id ?? ""} onChange={e => setDraft({ ...draft, cve_id: e.target.value || null })} />
            <input style={{ ...input, marginTop: "0.4rem" }} placeholder="Title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem" }}>
              <select style={input} value={draft.severity_band} onChange={e => setDraft({ ...draft, severity_band: e.target.value as VulnSeverity })}>
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as VulnSeverity[]).map(s => <option key={s}>{s}</option>)}
              </select>
              <input style={input} placeholder="CVSS" type="number" min={0} max={10} step={0.1} value={draft.cvss_score ?? ""} onChange={e => setDraft({ ...draft, cvss_score: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <select style={{ ...input, marginTop: "0.4rem" }} value={draft.affected_soup_id ?? ""} onChange={e => setDraft({ ...draft, affected_soup_id: e.target.value || null })}>
              <option value="">(no SOUP linkage)</option>
              {soup.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
            </select>
            <textarea style={{ ...input, height: 50, marginTop: "0.4rem" }} placeholder="Description (optional)" value={draft.description ?? ""} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            <button style={{ ...btn(), marginTop: "0.5rem" }} onClick={create}>Log Vulnerability</button>
          </div>

          <div style={card}>
            <h3 style={h3}>Intake Queue</h3>
            {list.length === 0 && <p style={muted}>No vulnerabilities logged.</p>}
            {list.map(v => (
              <div key={v.id} onClick={() => { setSelectedId(v.id); setShowEsc(false); }}
                   style={{ ...rowStyle, ...(v.id === selectedId ? activeRowStyle : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: "0.85rem" }}>{v.cve_id ?? "(internal)"}</strong>
                  <span style={badge(SEVERITY_COLOR[v.severity_band])}>{v.severity_band}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#37474f", marginTop: 2 }}>{v.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={badge(STATUS_COLOR[v.status])}>{v.status}</span>
                  {v.escalated_risk_id && <span style={{ fontSize: "0.7rem", color: "#1565c0", fontWeight: 600 }}>→ §7</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {!selected && <div style={card}><p style={muted}>Select a vulnerability to view details.</p></div>}
          {selected && (
            <>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ ...h3, fontSize: "1.1rem", marginBottom: 4 }}>
                      {selected.cve_id ?? "(internal finding)"}
                      <span style={badge(SEVERITY_COLOR[selected.severity_band])}>{selected.severity_band}</span>
                      <span style={badge(STATUS_COLOR[selected.status])}>{selected.status}</span>
                    </h2>
                    <div style={{ fontSize: "0.95rem", color: "#0d1b2a" }}>{selected.title}</div>
                    {selected.cvss_score != null && <div style={muted}>CVSS {selected.cvss_score.toFixed(1)}{selected.cvss_vector ? ` (${selected.cvss_vector})` : ""}</div>}
                  </div>
                  <button style={{ ...miniBtn, background: "#b71c1c" }} onClick={remove}>Delete</button>
                </div>
                {selected.description && <div style={{ fontSize: "0.85rem", color: "#37474f", marginTop: "0.5rem" }}>{selected.description}</div>}
                {selected.notes && <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.5rem", background: "#fff8e1", borderRadius: 4, fontSize: "0.8rem" }}>{selected.notes}</div>}
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                  {(["NEW", "TRIAGED", "MITIGATED", "RESOLVED", "FALSE_POSITIVE"] as VulnStatus[]).map(s => (
                    <button key={s} disabled={selected.status === s}
                            style={{ ...miniBtn, opacity: selected.status === s ? 0.4 : 1 }}
                            onClick={() => setStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>

              <div style={card}>
                <h3 style={h3}>§7 Risk Escalation</h3>
                {selected.escalated_risk_id ? (
                  <p style={{ color: "#2e7d32", fontSize: "0.9rem" }}>
                    ✓ Escalated to §7 risk register · Risk ID <code style={{ fontSize: "0.75rem" }}>{selected.escalated_risk_id}</code>
                  </p>
                ) : (
                  <>
                    {!showEsc && <button style={btn("#6a1b9a")} onClick={() => setShowEsc(true)}>Escalate to §7 Risk (SECURITY)</button>}
                    {showEsc && (
                      <div>
                        <p style={{ fontSize: "0.8rem", color: "#666", marginBottom: "0.5rem" }}>
                          Pick the target requirement this vulnerability impacts; severity/probability use the 1-5 scale.
                        </p>
                        <select style={input} value={esc.requirement_id} onChange={e => setEsc({ ...esc, requirement_id: e.target.value })}>
                          <option value="">Select target requirement…</option>
                          {requirements.map(r => <option key={r.id} value={r.id}>[{r.readable_id ?? r.type}] {r.title}</option>)}
                        </select>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem" }}>
                          <select style={input} value={esc.severity} onChange={e => setEsc({ ...esc, severity: Number(e.target.value) })}>
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>Severity {n}</option>)}
                          </select>
                          <select style={input} value={esc.probability} onChange={e => setEsc({ ...esc, probability: Number(e.target.value) })}>
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>Probability {n}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                          <button style={btn("#2e7d32")} onClick={escalate} disabled={!esc.requirement_id}>Create Risk</button>
                          <button style={btn("#9e9e9e")} onClick={() => setShowEsc(false)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const page: React.CSSProperties = { padding: "2rem", fontFamily: "-apple-system, sans-serif", maxWidth: 1300, margin: "0 auto" };
const h1: React.CSSProperties = { color: "#0d1b2a", marginBottom: "1.5rem" };
const h3: React.CSSProperties = { marginTop: 0, marginBottom: "0.5rem", color: "#0d1b2a" };
const subtitle: React.CSSProperties = { fontSize: "0.85rem", fontWeight: "normal", color: "#666", marginLeft: "0.75rem" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" };
const input: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.45rem 0.6rem", fontSize: "0.85rem", width: "100%" };
const muted: React.CSSProperties = { color: "#888", fontSize: "0.8rem" };
const rowStyle: React.CSSProperties = { padding: "0.6rem 0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.4rem", cursor: "pointer", background: "#fafafa" };
const activeRowStyle: React.CSSProperties = { border: "2px solid #1565c0", background: "#e3f2fd" };
const errBox: React.CSSProperties = { background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" };
const badge = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600, marginLeft: 6 });
const btn = (bg = "#1565c0"): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.9rem", cursor: "pointer", fontSize: "0.82rem" });
const miniBtn: React.CSSProperties = { background: "#546e7a", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: "0.72rem" };
