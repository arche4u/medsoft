"use client";

import { useEffect, useState } from "react";
import { api, Project } from "@/lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setProjects(await api.projects.list());
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.projects.create({ name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Projects</h1>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Create Project</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "480px" }}>
          <input
            placeholder="Project name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
          {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? "Saving…" : "Create Project"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>All Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p style={{ color: "#888" }}>No projects yet. Create one above.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>ID</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}>{p.name}</td>
                  <td style={tdStyle}>{p.description ?? "—"}</td>
                  <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td style={{ ...tdStyle, fontSize: "0.7rem", color: "#888" }}>{p.id}</td>
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
