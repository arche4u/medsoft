"use client";

import { useEffect, useState } from "react";
import { api, Project, Requirement, TestCase, TraceLink } from "@/lib/api";

export default function TraceMatrixPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [tracelinks, setTracelinks] = useState<TraceLink[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [reqId, setReqId] = useState("");
  const [tcId, setTcId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.projects.list().then(setProjects).catch((e) => setError(e.message));
    api.tracelinks.list().then(setTracelinks).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) { setRequirements([]); setTestcases([]); return; }
    api.requirements.list(selectedProject).then(setRequirements).catch((e) => setError(e.message));
    api.testcases.list(selectedProject).then(setTestcases).catch((e) => setError(e.message));
  }, [selectedProject]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!reqId || !tcId) return;
    setLoading(true);
    setError("");
    try {
      await api.tracelinks.create({ requirement_id: reqId, testcase_id: tcId });
      setReqId("");
      setTcId("");
      setTracelinks(await api.tracelinks.list());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const reqTitle = (id: string) => requirements.find((r) => r.id === id)?.title ?? id.slice(0, 8);
  const tcTitle = (id: string) => testcases.find((tc) => tc.id === id)?.title ?? id.slice(0, 8);

  const linkedTcIds = (reqId: string) =>
    tracelinks.filter((l) => l.requirement_id === reqId).map((l) => l.testcase_id);

  const allRequirements = requirements.length > 0 ? requirements :
    tracelinks.map((l) => l.requirement_id).filter((v, i, a) => a.indexOf(v) === i).map((id) => ({ id, title: id.slice(0, 8) }));

  return (
    <div>
      <h1>Traceability Matrix</h1>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Link Requirement → Test Case</h2>
        <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "480px" }}>
          <select value={selectedProject} onChange={(e) => { setSelectedProject(e.target.value); setReqId(""); setTcId(""); }} style={inputStyle}>
            <option value="">— Select project to load items</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={reqId} onChange={(e) => setReqId(e.target.value)} required style={inputStyle}>
            <option value="">— Select requirement *</option>
            {requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <select value={tcId} onChange={(e) => setTcId(e.target.value)} required style={inputStyle}>
            <option value="">— Select test case *</option>
            {testcases.map((tc) => <option key={tc.id} value={tc.id}>{tc.title}</option>)}
          </select>
          {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading || !reqId || !tcId} style={btnStyle}>
            {loading ? "Linking…" : "Create Link"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Matrix — Requirements vs Test Cases</h2>
        {requirements.length === 0 || testcases.length === 0 ? (
          <p style={{ color: "#888" }}>Select a project above to view its traceability matrix.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ ...thStyle, minWidth: "160px" }}>Requirement \ Test Case</th>
                  {testcases.map((tc) => (
                    <th key={tc.id} style={{ ...thStyle, fontSize: "0.8rem", writingMode: "vertical-lr", transform: "rotate(180deg)", maxWidth: "80px" }}>
                      {tc.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => {
                  const linked = linkedTcIds(r.id);
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: "bold" }}>{r.title}</td>
                      {testcases.map((tc) => (
                        <td key={tc.id} style={{ ...tdStyle, textAlign: "center", background: linked.includes(tc.id) ? "#c8e6c9" : "#fff" }}>
                          {linked.includes(tc.id) ? "✓" : ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>All TraceLinks ({tracelinks.length})</h2>
        {tracelinks.length === 0 ? (
          <p style={{ color: "#888" }}>No links yet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={thStyle}>Requirement ID</th>
                <th style={thStyle}>Test Case ID</th>
              </tr>
            </thead>
            <tbody>
              {tracelinks.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{l.requirement_id}</td>
                  <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{l.testcase_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9rem" };
const btnStyle: React.CSSProperties = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff" };
const thStyle: React.CSSProperties = { padding: "0.6rem 0.75rem", textAlign: "left", border: "1px solid #ddd" };
const tdStyle: React.CSSProperties = { padding: "0.6rem 0.75rem", border: "1px solid #ddd" };
