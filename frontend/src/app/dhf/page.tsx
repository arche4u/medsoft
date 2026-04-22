"use client";
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState } from "react";
import { api, Project, DHFDocument } from "@/lib/api";

export default function DHFPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useActiveProject();
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

  const downloadPDF = () => {
    if (!selected || !parsedContent) return;

    const summary = parsedContent.summary as Record<string, number> | undefined;

    const SECTIONS: Array<{ key: string; title: string; columns: Array<{ id: string; label: string }> }> = [
      { key: "requirements",            title: "Requirements",                  columns: [{ id: "readable_id", label: "ID" }, { id: "type", label: "Type" }, { id: "title", label: "Title" }, { id: "description", label: "Description" }] },
      { key: "design_elements",         title: "Design Elements",               columns: [{ id: "readable_id", label: "ID" }, { id: "type", label: "Type" }, { id: "title", label: "Title" }, { id: "description", label: "Description" }, { id: "diagram_source", label: "Diagram" }] },
      { key: "requirement_design_links",title: "Requirement → Design Links",    columns: [{ id: "requirement_id", label: "Requirement ID" }, { id: "design_element_id", label: "Design Element ID" }] },
      { key: "testcases",               title: "Test Cases",                    columns: [{ id: "title", label: "Title" }, { id: "description", label: "Description" }] },
      { key: "test_results",            title: "Test Results",                  columns: [{ id: "status", label: "Status" }, { id: "executed_at", label: "Executed At" }, { id: "notes", label: "Notes" }] },
      { key: "risks",                   title: "Risk Register",                 columns: [{ id: "hazard", label: "Hazard" }, { id: "harm", label: "Harm" }, { id: "severity", label: "Sev" }, { id: "probability", label: "Prob" }, { id: "risk_level", label: "Level" }] },
      { key: "validation_records",      title: "Validation Records",            columns: [{ id: "description", label: "Description" }, { id: "status", label: "Status" }] },
      { key: "traceability",            title: "Traceability Links (Req → Test)",columns: [{ id: "requirement_id", label: "Requirement ID" }, { id: "testcase_id", label: "Test Case ID" }] },
    ];

    const RISK_COLORS: Record<string, string> = { HIGH: "#ffeaea", MEDIUM: "#fff8e1", LOW: "#f0fdf4" };
    const STATUS_COLORS: Record<string, string> = { PASS: "#f0fdf4", FAIL: "#ffeaea", BLOCKED: "#fff8e1", APPROVED: "#f0fdf4", DRAFT: "#fff8e1", IN_REVIEW: "#eff6ff" };

    const summaryHtml = summary ? `
      <div class="summary-grid">
        ${[
          ["Requirements", summary.total_requirements, "#1565c0"],
          ["Design Elements", summary.total_design_elements, "#2e7d32"],
          ["Test Cases", summary.total_testcases, "#e65100"],
          ["Risks", summary.total_risks, "#b71c1c"],
          ["Validations", summary.total_validations, "#6a1b9a"],
          ["Test Executions", summary.total_executions, "#00695c"],
        ].map(([label, value, color]) => `
          <div class="stat-card" style="border-top: 3px solid ${color}">
            <div class="stat-value" style="color:${color}">${value ?? 0}</div>
            <div class="stat-label">${label}</div>
          </div>`).join("")}
      </div>` : "";

    const sectionsHtml = SECTIONS.map(s => {
      const rows = (parsedContent[s.key] as Record<string, unknown>[] | undefined) ?? [];
      if (!rows.length) return "";
      return `
        <div class="section">
          <h2>${s.title} <span class="count">(${rows.length})</span></h2>
          <table>
            <thead><tr>${s.columns.map(c => `<th>${c.label}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map(row => {
                const level = String(row.risk_level ?? "");
                const status = String(row.status ?? "");
                const bg = RISK_COLORS[level] ?? STATUS_COLORS[status] ?? "";
                return `<tr style="background:${bg}">${s.columns.map(c => {
                  if (c.id === "diagram_source") {
                    return `<td>${row[c.id] ? "✓ has diagram" : "—"}</td>`;
                  }
                  let val = String(row[c.id] ?? "—");
                  if (c.id.endsWith("_id") && val.length > 8) val = val.slice(0, 8) + "…";
                  if (val.length > 120) val = val.slice(0, 120) + "…";
                  return `<td>${val}</td>`;
                }).join("")}</tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    }).join("");

    const designElements = (parsedContent.design_elements as DesignElementRow[] | undefined) ?? [];
    const diagramsHtml = designElements.filter(el => el.diagram_source).length > 0 ? `
      <div class="section">
        <h2>Design Diagrams</h2>
        ${designElements.filter(el => el.diagram_source).map(el => `
          <div class="diagram-block">
            <div class="diagram-header">
              <span class="mono">${el.readable_id ?? ""}</span>
              <strong>${el.title}</strong>
              <span class="type-badge">${el.type}</span>
            </div>
            <div class="diagram-body"><div class="mermaid">${el.diagram_source}</div></div>
          </div>`).join("")}
      </div>` : "";

    const hasDiagrams = designElements.some(el => el.diagram_source);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${selected.name}</title>
  ${hasDiagrams ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>` : ""}
  <style>
    @page { margin: 20mm 15mm; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.5; }
    .doc-header { border-bottom: 2pt solid #4a148c; padding-bottom: 12pt; margin-bottom: 20pt; }
    .doc-header h1 { margin: 0 0 4pt; font-size: 18pt; color: #4a148c; }
    .doc-header .meta { font-size: 9pt; color: #666; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; margin-bottom: 20pt; }
    .stat-card { border: 1pt solid #e5e7eb; border-radius: 6pt; padding: 10pt; text-align: center; page-break-inside: avoid; }
    .stat-value { font-size: 20pt; font-weight: bold; }
    .stat-label { font-size: 8pt; color: #666; margin-top: 3pt; }
    .section { margin-bottom: 20pt; page-break-inside: avoid; }
    .section h2 { font-size: 12pt; color: #4a148c; margin: 0 0 6pt; border-bottom: 1pt solid #e5e7eb; padding-bottom: 4pt; }
    .count { font-size: 9pt; font-weight: normal; color: #888; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    th { background: #f3e5f5; color: #4a148c; padding: 5pt 6pt; text-align: left; border: 0.5pt solid #ddd; font-weight: 600; }
    td { padding: 4pt 6pt; border: 0.5pt solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .diagram-block { border: 1pt solid #e5e7eb; border-radius: 6pt; margin-bottom: 14pt; page-break-inside: avoid; overflow: hidden; }
    .diagram-header { background: #f8fafc; padding: 7pt 10pt; border-bottom: 1pt solid #e5e7eb; display: flex; align-items: center; gap: 8pt; }
    .mono { font-family: monospace; font-size: 8pt; color: #6b7280; }
    .type-badge { font-size: 7.5pt; background: #e3f2fd; color: #1565c0; border-radius: 4pt; padding: 1pt 6pt; font-weight: 600; }
    .diagram-body { padding: 12pt; background: #fff; text-align: center; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="doc-header">
    <h1>Design History File</h1>
    <div class="meta">
      <strong>${selected.name}</strong> &nbsp;|&nbsp;
      Generated: ${new Date(selected.generated_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
    </div>
  </div>
  ${summaryHtml}
  ${sectionsHtml}
  ${diagramsHtml}
  ${hasDiagrams ? `<script>
    mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });
    window.addEventListener("load", function() { setTimeout(function() { window.print(); }, 1200); });
  <\/script>` : `<script>setTimeout(function(){ window.print(); }, 600);<\/script>`}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Allow pop-ups to download as PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnStyle("#15803d")} onClick={downloadPDF}>↓ Download PDF</button>
                    <button style={btnStyle("#4a148c")} onClick={downloadJSON}>↓ Download JSON</button>
                  </div>
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

              <DHFSection title="Requirements" items={parsedContent.requirements as unknown[]} columns={["readable_id", "type", "title", "description"]} />
              <DesignElementsDHFSection items={parsedContent.design_elements as unknown[]} />
              <DHFSection title="Requirement → Design Links" items={parsedContent.requirement_design_links as unknown[]} columns={["requirement_id", "design_element_id"]} />
              <DHFSection title="Test Cases" items={parsedContent.testcases as unknown[]} columns={["title", "description"]} />
              <DHFSection title="Test Results" items={parsedContent.test_results as unknown[]} columns={["testcase_id", "status", "executed_at", "notes"]} />
              <DHFSection title="Risks" items={parsedContent.risks as unknown[]} columns={["hazard", "harm", "severity", "probability", "risk_level"]} />
              <DHFSection title="Validation Records" items={parsedContent.validation_records as unknown[]} columns={["requirement_id", "description", "status"]} />
              <DHFSection title="Traceability Links (Req → Test)" items={parsedContent.traceability as unknown[]} columns={["requirement_id", "testcase_id"]} />
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

// ── Mermaid renderer (same pattern as design page) ────────────────────────────
function MermaidRenderer({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!source.trim() || !ref.current) return;
    let cancelled = false;
    setErr("");
    import("mermaid").then(mod => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      const id = `mm-dhf-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, source)
        .then(({ svg }) => { if (!cancelled && ref.current) ref.current.innerHTML = svg; })
        .catch(e => { if (!cancelled) setErr(String(e?.message ?? e)); });
    });
    return () => { cancelled = true; };
  }, [source]);

  return (
    <div>
      {err && <div style={{ color: "#b71c1c", fontSize: "0.75rem", padding: "4px 8px", background: "#fff5f5", borderRadius: 4, marginBottom: 6 }}>⚠ {err}</div>}
      <div ref={ref} style={{ minHeight: 40, overflowX: "auto" }} />
    </div>
  );
}

// ── Design elements section with inline diagram rendering ─────────────────────
type DesignElementRow = { id: string; readable_id?: string; type: string; title: string; description?: string; diagram_source?: string };

function DesignElementsDHFSection({ items }: { items: unknown[] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = (items || []) as DesignElementRow[];
  if (rows.length === 0) return null;

  const withDiagram = rows.filter(r => r.diagram_source);
  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, marginBottom: "1rem" };

  return (
    <div style={cardStyle}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: "1rem 1.5rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: expanded ? "1px solid #eee" : "none" }}
      >
        <h4 style={{ margin: 0 }}>
          Design Elements
          <span style={{ fontWeight: "normal", color: "#888", fontSize: "0.8rem" }}> ({rows.length})</span>
          {withDiagram.length > 0 && (
            <span style={{ marginLeft: 10, fontSize: "0.75rem", background: "#eff6ff", color: "#1e40af", borderRadius: 10, padding: "1px 8px", fontWeight: 600 }}>
              {withDiagram.length} diagram{withDiagram.length > 1 ? "s" : ""}
            </span>
          )}
        </h4>
        <span style={{ color: "#888" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 1.5rem 1.5rem" }}>
          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", marginTop: "0.75rem", marginBottom: "1rem" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                {["ID", "Type", "Title", "Description", "Diagram"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", fontFamily: "monospace", fontSize: "0.72rem", color: "#6b7280" }}>{row.readable_id ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", fontSize: "0.75rem" }}>
                    <span style={{ background: row.type === "ARCHITECTURE" ? "#e3f2fd" : "#f3e5f5", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>{row.type}</span>
                  </td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{row.title}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", color: "#555" }}>{row.description ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }}>
                    {row.diagram_source
                      ? <span style={{ fontSize: "0.72rem", background: "#f0fdf4", color: "#15803d", borderRadius: 4, padding: "1px 7px", border: "1px solid #bbf7d0" }}>✓ has diagram</span>
                      : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Inline diagram rendering */}
          {withDiagram.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#374151", marginBottom: 10, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                Design Diagrams
              </div>
              {withDiagram.map(el => (
                <div key={el.id} style={{ marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "#f8fafc", padding: "8px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#6b7280" }}>{el.readable_id}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#1f2937" }}>{el.title}</span>
                    <span style={{ fontSize: "0.72rem", background: el.type === "ARCHITECTURE" ? "#e3f2fd" : "#f3e5f5", borderRadius: 4, padding: "1px 7px", color: el.type === "ARCHITECTURE" ? "#1565c0" : "#6a1b9a", fontWeight: 600 }}>{el.type}</span>
                  </div>
                  <div style={{ padding: "16px", background: "#fff", overflowX: "auto" }}>
                    <MermaidRenderer source={el.diagram_source!} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
