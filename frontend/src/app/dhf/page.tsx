"use client";
import { useEffect, useState } from "react";
import { api, Project, DHFDocument } from "@/lib/api";

export default function DHFPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [documents, setDocuments] = useState<DHFDocument[]>([]);
  const [selected, setSelected] = useState<DHFDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [parsedContent, setParsedContent] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.projects.list().then(setProjects);
    api.dhf.list().then(setDocuments);
  }, []);

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    setSelected(null);
    setParsedContent(null);
    if (pid) {
      api.dhf.list(pid).then(setDocuments);
    } else {
      api.dhf.list().then(setDocuments);
    }
  };

  const generateDHF = async () => {
    if (!projectId) return;
    setGenerating(true);
    setError("");
    try {
      const doc = await api.dhf.generate(projectId);
      setDocuments(prev => [doc, ...prev]);
      await viewDocument(doc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const viewDocument = async (doc: DHFDocument) => {
    const full = await api.dhf.get(doc.id);
    setSelected(full);
    if (full.content) {
      try {
        setParsedContent(JSON.parse(full.content) as Record<string, unknown>);
      } catch {
        setParsedContent(null);
      }
    }
  };

  const downloadJSON = () => {
    if (!selected?.content) return;
    const blob = new Blob([selected.content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });

  const summary = parsedContent?.summary as Record<string, number> | undefined;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>Design History File (DHF)</h1>

      {error && <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem" }}>
        {/* Left panel */}
        <div>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Generate DHF</h3>
            <div style={{ marginBottom: "0.75rem" }}>
              <select style={inputStyle} value={projectId} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button
              style={{ ...btnStyle("#4a148c"), width: "100%", padding: "0.6rem" }}
              onClick={generateDHF}
              disabled={!projectId || generating}
            >
              {generating ? "Generating…" : "Generate DHF"}
            </button>
            {!projectId && <p style={{ color: "#888", fontSize: "0.75rem", marginTop: "0.5rem" }}>Select a project to generate a DHF</p>}
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Generated Documents</h3>
            {documents.length === 0 ? (
              <p style={{ color: "#888", fontSize: "0.85rem" }}>No documents yet.</p>
            ) : (
              documents.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => viewDocument(doc)}
                  style={{
                    border: selected?.id === doc.id ? "2px solid #4a148c" : "1px solid #eee",
                    borderRadius: 6, padding: "0.75rem", marginBottom: "0.5rem", cursor: "pointer",
                    background: selected?.id === doc.id ? "#f3e5f5" : "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: "bold", fontSize: "0.85rem", color: "#333", wordBreak: "break-all" }}>{doc.name}</div>
                  <div style={{ color: "#888", fontSize: "0.75rem", marginTop: 4 }}>
                    {new Date(doc.generated_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {selected && parsedContent ? (
            <>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ marginTop: 0 }}>DHF Report</h3>
                    <p style={{ color: "#888", fontSize: "0.8rem", margin: 0 }}>
                      Generated: {new Date(selected.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <button style={btnStyle("#4a148c")} onClick={downloadJSON}>Download JSON</button>
                </div>
              </div>

              {summary && (
                <div style={cardStyle}>
                  <h4 style={{ marginTop: 0 }}>Summary</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                    {[
                      { label: "Requirements", value: summary.total_requirements, color: "#1565c0" },
                      { label: "Design Elements", value: summary.total_design_elements, color: "#2e7d32" },
                      { label: "Test Cases", value: summary.total_testcases, color: "#e65100" },
                      { label: "Risks", value: summary.total_risks, color: "#b71c1c" },
                      { label: "Validations", value: summary.total_validations, color: "#6a1b9a" },
                      { label: "Test Executions", value: summary.total_executions, color: "#00695c" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 6, padding: "0.75rem", textAlign: "center", border: `2px solid ${s.color}20` }}>
                        <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: "0.75rem", color: "#666" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DHFSection title="Requirements" items={parsedContent.requirements as unknown[]} columns={["type", "title", "description"]} />
              <DHFSection title="Design Elements" items={parsedContent.design_elements as unknown[]} columns={["type", "title", "description"]} />
              <DHFSection title="Test Cases" items={parsedContent.testcases as unknown[]} columns={["title", "description"]} />
              <DHFSection title="Test Results" items={parsedContent.test_results as unknown[]} columns={["testcase_id", "status", "executed_at", "notes"]} />
              <DHFSection title="Risks" items={parsedContent.risks as unknown[]} columns={["hazard", "harm", "severity", "probability", "risk_level"]} />
              <DHFSection title="Validation Records" items={parsedContent.validation_records as unknown[]} columns={["requirement_id", "description", "status"]} />
              <DHFSection title="Traceability Links" items={parsedContent.traceability as unknown[]} columns={["requirement_id", "testcase_id"]} />
            </>
          ) : (
            <div style={{ ...cardStyle, color: "#888", textAlign: "center", padding: "3rem" }}>
              {selected ? "Loading document…" : "Generate or select a DHF document to view its contents"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DHFSection({ title, items, columns }: { title: string; items: unknown[]; columns: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = (items || []) as Record<string, unknown>[];

  if (rows.length === 0) return null;

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, marginBottom: "1rem" };

  return (
    <div style={cardStyle}>
      <div
        style={{ padding: "1rem 1.5rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: expanded ? "1px solid #eee" : "none" }}
        onClick={() => setExpanded(v => !v)}
      >
        <h4 style={{ margin: 0 }}>{title} <span style={{ fontWeight: "normal", color: "#888", fontSize: "0.8rem" }}>({rows.length})</span></h4>
        <span style={{ color: "#888" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 1.5rem 1rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", marginTop: "0.75rem" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                {columns.map(c => (
                  <th key={c} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee", textTransform: "capitalize" }}>
                    {c.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {columns.map(c => {
                    const val = String(row[c] ?? "—");
                    const isId = c.endsWith("_id");
                    const isStatus = c === "status" || c === "risk_level";
                    return (
                      <td key={c} style={{ padding: "6px 8px", border: "1px solid #eee", color: isId ? "#888" : "#333", fontFamily: isId ? "monospace" : "inherit", fontSize: isId ? "0.7rem" : "0.78rem" }}>
                        {isStatus
                          ? <span style={{ background: "#e3f2fd", borderRadius: 4, padding: "1px 6px" }}>{val}</span>
                          : isId ? val.slice(0, 8) + "…"
                          : val.length > 80 ? val.slice(0, 80) + "…"
                          : val
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
