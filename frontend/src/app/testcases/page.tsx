"use client";

import { useEffect, useState } from "react";
import { api, Project, TestCase, Requirement } from "@/lib/api";

export default function TestCasesPage() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [swReqs, setSwReqs]       = useState<Requirement[]>([]);
  const [projectId, setProjectId] = useState("");

  const [title, setTitle]         = useState("");
  const [desc, setDesc]           = useState("");
  const [filterProject, setFilter] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving]       = useState(false);

  // link form
  const [linkReqId, setLinkReqId]   = useState("");
  const [linkTcId, setLinkTcId]     = useState("");
  const [linking, setLinking]       = useState(false);
  const [linkMsg, setLinkMsg]       = useState("");

  useEffect(() => {
    api.projects.list().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    api.testcases.list(filterProject || undefined).then(setTestcases).catch(console.error);
  }, [filterProject]);

  useEffect(() => {
    if (!projectId) { setSwReqs([]); return; }
    api.requirements.list(projectId, "SOFTWARE").then(setSwReqs).catch(console.error);
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) { setFormError("Select a project"); return; }
    setSaving(true); setFormError("");
    try {
      await api.testcases.create({ project_id: projectId, title: title.trim(), description: desc.trim() || undefined });
      setTitle(""); setDesc("");
      setTestcases(await api.testcases.list(filterProject || undefined));
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkReqId || !linkTcId) return;
    setLinking(true); setLinkMsg("");
    try {
      await api.tracelinks.create({ requirement_id: linkReqId, testcase_id: linkTcId });
      setLinkMsg("Linked successfully.");
      setLinkReqId(""); setLinkTcId("");
    } catch (e: any) {
      setLinkMsg(`Error: ${e.message}`);
    } finally {
      setLinking(false);
    }
  }

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div>
      <h1>Test Cases</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
        {/* Create test case */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Add Test Case</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required style={inputStyle}>
              <option value="">— Select project *</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} />
            {formError && <p style={{ color: "red", margin: 0, fontSize: "0.85rem" }}>{formError}</p>}
            <button type="submit" disabled={saving || !projectId} style={btnStyle}>{saving ? "Saving…" : "Add Test Case"}</button>
          </form>
        </section>

        {/* Link SOFTWARE req → test case */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Link SOFTWARE Req → Test Case</h2>
          <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLinkReqId(""); }} style={inputStyle}>
              <option value="">— Select project *</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={linkReqId} onChange={(e) => setLinkReqId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— SOFTWARE requirement *</option>
              {swReqs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <select value={linkTcId} onChange={(e) => setLinkTcId(e.target.value)} required style={inputStyle}>
              <option value="">— Test case *</option>
              {testcases.map((tc) => <option key={tc.id} value={tc.id}>{tc.title}</option>)}
            </select>
            {linkMsg && <p style={{ color: linkMsg.startsWith("Error") ? "red" : "green", margin: 0, fontSize: "0.85rem" }}>{linkMsg}</p>}
            <button type="submit" disabled={linking || !linkReqId || !linkTcId} style={btnStyle}>{linking ? "Linking…" : "Link"}</button>
          </form>
        </section>
      </div>

      <section>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Test Cases ({testcases.length})</h2>
          <select value={filterProject} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, padding: "0.3rem 0.5rem" }}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {testcases.length === 0 ? (
          <p style={{ color: "#888" }}>No test cases yet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {testcases.map((tc) => (
                <tr key={tc.id}>
                  <td style={tdStyle}>{tc.title}</td>
                  <td style={tdStyle}>{tc.description ?? "—"}</td>
                  <td style={tdStyle}>{projectName(tc.project_id)}</td>
                  <td style={tdStyle}>{new Date(tc.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem" };
const btnStyle: React.CSSProperties   = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff" };
const thStyle: React.CSSProperties    = { padding: "0.6rem 0.75rem", textAlign: "left", border: "1px solid #ddd" };
const tdStyle: React.CSSProperties    = { padding: "0.6rem 0.75rem", border: "1px solid #ddd" };
