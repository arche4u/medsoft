"use client";

import { useEffect, useState } from "react";
import { api, Project, Requirement, Risk } from "@/lib/api";

const LEVEL_COLOR: Record<string, string> = { LOW: "#2e7d32", MEDIUM: "#e65100", HIGH: "#b71c1c" };

export default function RisksPage() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [reqs, setReqs]           = useState<Requirement[]>([]);
  const [risks, setRisks]         = useState<Risk[]>([]);
  const [projectId, setProjectId] = useState("");
  const [reqId, setReqId]         = useState("");

  // form
  const [hazard, setHazard]       = useState("");
  const [hazSit, setHazSit]       = useState("");
  const [harm, setHarm]           = useState("");
  const [severity, setSeverity]   = useState(1);
  const [prob, setProb]           = useState(1);
  const [formError, setFormError] = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projectId) { setReqs([]); setRisks([]); setReqId(""); return; }
    api.requirements.list(projectId).then(setReqs).catch(console.error);
    api.risks.list().then((all) => {
      // filter risks belonging to this project's requirements later
    }).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!reqId) { setRisks([]); return; }
    api.risks.list(reqId).then(setRisks).catch(console.error);
  }, [reqId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!reqId) { setFormError("Select a requirement"); return; }
    setSaving(true); setFormError("");
    try {
      await api.risks.create({ requirement_id: reqId, hazard, hazardous_situation: hazSit, harm, severity, probability: prob });
      setHazard(""); setHazSit(""); setHarm(""); setSeverity(1); setProb(1);
      setRisks(await api.risks.list(reqId));
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.risks.delete(id);
    setRisks(await api.risks.list(reqId));
  }

  const previewLevel = () => {
    const score = severity * prob;
    if (score <= 4) return "LOW";
    if (score <= 9) return "MEDIUM";
    return "HIGH";
  };

  return (
    <div>
      <h1>Risk Management</h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setReqId(""); }} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={reqId} onChange={(e) => setReqId(e.target.value)} style={inputStyle} disabled={!projectId}>
          <option value="">— Select requirement</option>
          {reqs.map((r) => <option key={r.id} value={r.id}>[{r.type}] {r.title}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Create form */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Add Risk</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input placeholder="Hazard *" value={hazard} onChange={(e) => setHazard(e.target.value)} required style={inputStyle} />
            <input placeholder="Hazardous Situation *" value={hazSit} onChange={(e) => setHazSit(e.target.value)} required style={inputStyle} />
            <input placeholder="Harm *" value={harm} onChange={(e) => setHarm(e.target.value)} required style={inputStyle} />
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <label style={{ fontSize: "0.875rem" }}>
                Severity (1–5):
                <input type="number" min={1} max={5} value={severity} onChange={(e) => setSeverity(+e.target.value)} style={{ ...inputStyle, width: "4rem", marginLeft: "0.5rem" }} />
              </label>
              <label style={{ fontSize: "0.875rem" }}>
                Probability (1–5):
                <input type="number" min={1} max={5} value={prob} onChange={(e) => setProb(+e.target.value)} style={{ ...inputStyle, width: "4rem", marginLeft: "0.5rem" }} />
              </label>
            </div>
            <div style={{ fontSize: "0.875rem" }}>
              Risk Level Preview:{" "}
              <span style={{ fontWeight: "bold", color: LEVEL_COLOR[previewLevel()] }}>{previewLevel()}</span>
              {" "}(score: {severity * prob})
            </div>
            {formError && <p style={{ color: "red", margin: 0, fontSize: "0.85rem" }}>{formError}</p>}
            <button type="submit" disabled={saving || !reqId} style={btnStyle}>{saving ? "Saving…" : "Add Risk"}</button>
          </form>
        </section>

        {/* Risk list */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Risks for requirement ({risks.length})</h2>
          {!reqId ? (
            <p style={{ color: "#888" }}>Select a requirement.</p>
          ) : risks.length === 0 ? (
            <p style={{ color: "#888" }}>No risks yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {risks.map((r) => (
                <div key={r.id} style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "0.75rem", position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: "bold", color: LEVEL_COLOR[r.risk_level] }}>{r.risk_level}</span>
                    <button onClick={() => handleDelete(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c62828", fontSize: "0.8rem" }}>✕ delete</button>
                  </div>
                  <div style={{ fontSize: "0.85rem" }}><b>Hazard:</b> {r.hazard}</div>
                  <div style={{ fontSize: "0.85rem" }}><b>Situation:</b> {r.hazardous_situation}</div>
                  <div style={{ fontSize: "0.85rem" }}><b>Harm:</b> {r.harm}</div>
                  <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>S={r.severity} × P={r.probability} = {r.severity * r.probability}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem" };
const btnStyle: React.CSSProperties   = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
