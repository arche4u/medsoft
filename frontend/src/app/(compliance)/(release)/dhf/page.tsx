"use client";
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState } from "react";
import { api, Project, DHFDocument, Release } from "@/lib/api";

export default function DHFPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useActiveProject();
  const [documents, setDocuments] = useState<DHFDocument[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [boundReleaseId, setBoundReleaseId] = useState("");
  const [selected, setSelected] = useState<DHFDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [parsedContent, setParsedContent] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.projects.list().then(setProjects);
    api.dhf.list().then(setDocuments);
  }, []);

  // Load releases for the active project so the user can bind the next DHF
  // generation to a specific release version.
  useEffect(() => {
    if (!projectId) { setReleases([]); return; }
    api.release.list(projectId).then(setReleases).catch(() => setReleases([]));
  }, [projectId]);

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    setSelected(null);
    setParsedContent(null);
    setBoundReleaseId("");
    if (pid) {
      api.dhf.list(pid).then(setDocuments);
      api.release.list(pid).then(setReleases);
    } else {
      api.dhf.list().then(setDocuments);
      setReleases([]);
    }
  };

  const generateDHF = async () => {
    if (!projectId) return;
    setGenerating(true);
    setError("");
    try {
      const doc = await api.dhf.generate(projectId, boundReleaseId || undefined);
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
      { key: "software_items",          title: "§4.3 Software Items (safety classification)", columns: [{ id: "name", label: "Name" }, { id: "item_type", label: "Type" }, { id: "safety_class", label: "Class" }, { id: "status", label: "Status" }, { id: "classification_justification", label: "Justification" }] },
      { key: "requirements",            title: "§5.2 Requirements",             columns: [{ id: "readable_id", label: "ID" }, { id: "type", label: "Type" }, { id: "title", label: "Title" }, { id: "description", label: "Description" }] },
      { key: "design_elements",         title: "§5.4 Design Elements",          columns: [{ id: "readable_id", label: "ID" }, { id: "component_id", label: "Component" }, { id: "title", label: "Title" }, { id: "description", label: "Description" }, { id: "diagram_source", label: "Diagram" }] },
      { key: "requirement_design_links",title: "Requirement → Design Links",    columns: [{ id: "requirement_id", label: "Requirement ID" }, { id: "design_element_id", label: "Design Element ID" }] },
      { key: "software_units",          title: "§5.5 Software Units",           columns: [{ id: "name", label: "Name" }, { id: "programming_language", label: "Language" }, { id: "safety_class", label: "Class" }, { id: "status", label: "Status" }, { id: "test_count", label: "Tests" }] },
      { key: "unit_test_cases",         title: "§5.5 Unit Tests",               columns: [{ id: "name", label: "Name" }, { id: "test_type", label: "Type" }, { id: "expected_result", label: "Expected" }, { id: "latest_result", label: "Latest" }] },
      { key: "integration_tests",       title: "§5.6 Integration Tests",        columns: [{ id: "name", label: "Name" }, { id: "test_type", label: "Type" }, { id: "safety_relevance", label: "Safety" }, { id: "latest_result", label: "Latest" }] },
      { key: "system_tests",            title: "§5.7 System Tests",             columns: [{ id: "name", label: "Name" }, { id: "test_type", label: "Type" }, { id: "safety_relevance", label: "Safety" }, { id: "latest_result", label: "Latest" }] },
      { key: "releases",                title: "§5.8 Releases",                 columns: [{ id: "version", label: "Version" }, { id: "status", label: "Status" }, { id: "parent_release_id", label: "Supersedes (§6.3.2)" }, { id: "item_count", label: "Items" }, { id: "has_snapshot", label: "Snapshot" }, { id: "user_notification_sent", label: "User notif §6.2.5" }, { id: "regulator_notification_sent", label: "Regulator notif §6.2.5" }] },
      { key: "release_artifacts",       title: "§5.8 Release Artifacts",        columns: [{ id: "version", label: "Version" }, { id: "artifact_type", label: "Type" }, { id: "reference_id", label: "Reference" }, { id: "label", label: "Label" }] },
      { key: "feedback_items",          title: "§6.2.1 Feedback Intake",        columns: [{ id: "readable_id", label: "ID" }, { id: "source", label: "Source" }, { id: "severity", label: "Sev" }, { id: "status", label: "Status" }, { id: "summary", label: "Summary" }, { id: "is_problem", label: "Problem?" }, { id: "change_needed", label: "Change needed" }, { id: "escalated_problem_id", label: "→ CAPA" }, { id: "escalated_change_request_id", label: "→ CR" }] },
      { key: "plans",                   title: "§6/§7/§8/§9 Plans",             columns: [{ id: "plan_type", label: "Type" }, { id: "title", label: "Title" }, { id: "version", label: "Version" }, { id: "status", label: "Status" }, { id: "approved_by", label: "Approved by" }] },
      { key: "risks",                   title: "§7 Risk Register (ISO 14971)",  columns: [{ id: "hazard", label: "Hazard" }, { id: "harm", label: "Harm" }, { id: "severity", label: "Sev" }, { id: "probability", label: "Prob" }, { id: "risk_level", label: "Level" }] },
      { key: "problem_reports",         title: "§9 Problem Reports / CAPA",     columns: [{ id: "title", label: "Title" }, { id: "severity", label: "Severity" }, { id: "status", label: "Status" }, { id: "source", label: "Source" }] },
      { key: "validation_records",      title: "Validation Records (V-model: USER reqs)", columns: [{ id: "description", label: "Description" }, { id: "status", label: "Status" }] },
      { key: "electronic_signatures",   title: "Electronic Signatures (21 CFR Part 11)", columns: [{ id: "meaning", label: "Meaning" }, { id: "user_id", label: "User" }, { id: "signed_at", label: "Signed at" }, { id: "comments", label: "Comments" }] },
    ];

    const RISK_COLORS: Record<string, string> = { HIGH: "#ffeaea", MEDIUM: "#fff8e1", LOW: "#f0fdf4" };
    const STATUS_COLORS: Record<string, string> = { PASS: "#f0fdf4", FAIL: "#ffeaea", BLOCKED: "#fff8e1", APPROVED: "#f0fdf4", DRAFT: "#fff8e1", IN_REVIEW: "#eff6ff" };

    const summaryHtml = summary ? `
      <div class="summary-grid">
        ${[
          ["Requirements",       summary.total_requirements,            "#1565c0"],
          ["Software Items §4.3",summary.total_software_items,          "#4a148c"],
          ["Arch Components",    summary.total_architecture_components, "#0277bd"],
          ["Design Elements",    summary.total_design_elements,         "#2e7d32"],
          ["Software Units",     summary.total_software_units,          "#00695c"],
          ["Integration Tests",  summary.total_integration_tests,       "#5d4037"],
          ["System Tests",       summary.total_system_tests,            "#ad1457"],
          ["Risks",              summary.total_risks,                   "#b71c1c"],
          ["Validations",        summary.total_validations,             "#6a1b9a"],
          ["Releases",           summary.total_releases,                "#1976d2"],
          ["Plans",              summary.total_plans,                   "#7b1fa2"],
          ["CM Config Items",    summary.total_cm_config_items,         "#33691e"],
          ["Problem Reports §9", summary.total_problem_reports,         "#bf360c"],
          ["E-Signatures",       summary.total_esignatures,             "#01579b"],
          ["SDP",                summary.sdp_present ? "✓" : "—",       summary.sdp_present ? "#15803d" : "#9ca3af"],
          ["Feedback §6.2.1",    summary.total_feedback_items,          "#5d4037"],
          ["→ CAPA §6.2.2",      summary.feedback_escalated_to_capa,    "#b71c1c"],
          ["→ CR §6.2.3",        summary.feedback_escalated_to_cr,      "#6a1b9a"],
          ["Maintenance Plan",   summary.maintenance_plan_approved ? "✓" : "—", summary.maintenance_plan_approved ? "#15803d" : "#9ca3af"],
        ].map(([label, value, color]) => `
          <div class="stat-card" style="border-top: 3px solid ${color}">
            <div class="stat-value" style="color:${color}">${value ?? 0}</div>
            <div class="stat-label">${label}</div>
          </div>`).join("")}
      </div>` : "";

    const sdpBlob = parsedContent.sdp as SDPSDPBlob | null | undefined;
    const sdpHtml = sdpBlob ? `
      <div class="section">
        <h2>Software Development Plan
          <span class="count">v${sdpBlob.version} · ${sdpBlob.status} · Class ${sdpBlob.safety_class}</span>
        </h2>
        <p style="font-size:9pt;color:#374151"><strong>${sdpBlob.title}</strong>
          ${sdpBlob.approved_by ? `· approved by ${sdpBlob.approved_by}` : ""}
          ${sdpBlob.approved_at ? `on ${new Date(sdpBlob.approved_at).toLocaleDateString()}` : ""}
          · lifecycle: ${sdpBlob.lifecycle_model}</p>
        <h3 style="font-size:10pt;margin-top:10pt">Sections (${sdpBlob.sections.length})</h3>
        ${sdpBlob.sections.map(s => `
          <div style="margin-bottom:6pt"><strong>${s.section_number}. ${s.section_name}</strong>
            ${s.content ? `<div style="font-size:8.5pt;color:#444;white-space:pre-wrap">${s.content}</div>` : ""}
          </div>`).join("")}
        <h3 style="font-size:10pt;margin-top:10pt">Lifecycle Phases (${sdpBlob.phases.length})</h3>
        <table><thead><tr><th>#</th><th>Phase</th><th>Entry</th><th>Exit</th><th>Activities</th><th>Class</th></tr></thead>
          <tbody>${sdpBlob.phases.map(p => `<tr>
            <td>${p.phase_order}</td><td><strong>${p.phase_name}</strong></td>
            <td>${p.entry_criteria ?? "—"}</td><td>${p.exit_criteria ?? "—"}</td>
            <td>${p.activities ?? "—"}</td><td style="text-align:center">${p.required_for_class}</td>
          </tr>`).join("")}</tbody>
        </table>
        <h3 style="font-size:10pt;margin-top:10pt">Roles & Responsibilities (${sdpBlob.roles.length})</h3>
        <table><thead><tr><th>Role</th><th>Responsibilities</th><th>Class</th></tr></thead>
          <tbody>${sdpBlob.roles.map(r => `<tr>
            <td><strong>${r.role_name}</strong></td><td>${r.responsibilities ?? "—"}</td>
            <td style="text-align:center">${r.required_for_class}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>` : "";

    // Traceability matrix — a dedicated section (FDA 21 CFR 820.30 / EU MDR
    // / IEC 62304 §5.2.6). One row per requirement listing every downstream
    // verification artifact so auditors can see coverage at a glance.
    type TraceRow = {
      readable_id?: string; type?: string; title?: string;
      design_element_ids?: string[];
      system_test_ids?: string[]; integration_test_ids?: string[];
      software_unit_ids?: string[]; risk_ids?: string[]; validation_ids?: string[];
    };
    const traceRows = (parsedContent.traceability_matrix as TraceRow[] | undefined) ?? [];
    const matrixHtml = traceRows.length > 0 ? `
      <div class="section">
        <h2>Traceability Matrix <span class="count">(${traceRows.length} requirements)</span></h2>
        <p style="font-size:8.5pt;color:#666;margin:0 0 6pt">
          FDA 21 CFR 820.30 / EU MDR / IEC 62304 §5.2.6 — every requirement and its downstream verification artifacts.
        </p>
        <table>
          <thead><tr>
            <th>Req</th><th>Type</th><th>Title</th>
            <th>Design</th><th>System Tests</th><th>Integration</th><th>Units</th><th>Risks</th><th>Validation</th>
          </tr></thead>
          <tbody>
            ${traceRows.map(r => `<tr>
              <td><strong>${r.readable_id ?? "—"}</strong></td>
              <td>${r.type ?? "—"}</td>
              <td>${(r.title ?? "—").slice(0, 60)}</td>
              <td style="text-align:center">${(r.design_element_ids ?? []).length}</td>
              <td style="text-align:center">${(r.system_test_ids ?? []).length}</td>
              <td style="text-align:center">${(r.integration_test_ids ?? []).length}</td>
              <td style="text-align:center">${(r.software_unit_ids ?? []).length}</td>
              <td style="text-align:center">${(r.risk_ids ?? []).length}</td>
              <td style="text-align:center">${(r.validation_ids ?? []).length}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>` : "";

    // Bound-release banner (when the DHF was generated against a specific release)
    type BoundRel = { id: string; version: string; status: string };
    const bound = parsedContent.bound_release as BoundRel | null | undefined;
    const boundHtml = bound ? `
      <div style="background:#fef3c7;border:1pt solid #fcd34d;border-radius:5pt;padding:8pt 12pt;margin-bottom:14pt;font-size:9pt">
        <strong style="color:#92400e">Release of record:</strong> v${bound.version} (${bound.status}) —
        <span style="color:#92400e;font-family:monospace;font-size:8pt">${bound.id}</span>
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
              ${el.component_id ? `<span class="type-badge">comp ${el.component_id.slice(0,8)}…</span>` : ""}
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
  ${boundHtml}
  ${summaryHtml}
  ${sdpHtml}
  ${matrixHtml}
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

  const summary = parsedContent?.summary as Record<string, number | boolean> | undefined;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>Design History File (DHF)</h1>

      {error && <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem" }}>
        {/* Left panel */}
        <div>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Generate DHF</h3>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.72rem", color: "#64748b", display: "block", marginBottom: 3 }}>Project</label>
              <select style={inputStyle} value={projectId} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.72rem", color: "#64748b", display: "block", marginBottom: 3 }}>
                Bind to release (optional) — recommended at release time
              </label>
              <select
                style={inputStyle} value={boundReleaseId}
                onChange={e => setBoundReleaseId(e.target.value)}
                disabled={!projectId || releases.length === 0}
              >
                <option value="">— Project-wide (no release) —</option>
                {releases.map(r => (
                  <option key={r.id} value={r.id}>{r.version} ({r.status})</option>
                ))}
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
                      { label: "System Tests", value: summary.total_system_tests, color: "#ad1457" },
                      { label: "Risks", value: summary.total_risks, color: "#b71c1c" },
                      { label: "Validations", value: summary.total_validations, color: "#6a1b9a" },
                      { label: "SDP", value: summary.sdp_present ? "✓" : "—", color: summary.sdp_present ? "#15803d" : "#9ca3af" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 6, padding: "0.75rem", textAlign: "center", border: `2px solid ${s.color}20` }}>
                        <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: "0.75rem", color: "#666" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <SDPDHFSection sdp={parsedContent.sdp as SDPSDPBlob | null | undefined} />
              <DHFSection title="Requirements" items={parsedContent.requirements as unknown[]} columns={["readable_id", "type", "title", "description"]} />
              <DesignElementsDHFSection items={parsedContent.design_elements as unknown[]} />
              <DHFSection title="Requirement → Design Links" items={parsedContent.requirement_design_links as unknown[]} columns={["requirement_id", "design_element_id"]} />
              <DHFSection title="System Tests (§5.7)" items={parsedContent.system_tests as unknown[]} columns={["name", "test_type", "safety_relevance", "latest_result"]} />
              <DHFSection title="Integration Tests (§5.6)" items={parsedContent.integration_tests as unknown[]} columns={["name", "test_type", "safety_relevance", "latest_result"]} />
              <DHFSection title="Unit Tests (§5.5)" items={parsedContent.unit_test_cases as unknown[]} columns={["name", "test_type", "expected_result", "latest_result"]} />
              <DHFSection title="Risks" items={parsedContent.risks as unknown[]} columns={["hazard", "harm", "severity", "probability", "risk_level"]} />
              <DHFSection title="Validation Records" items={parsedContent.validation_records as unknown[]} columns={["requirement_id", "description", "status"]} />
              <DHFSection title="§6.2.1 Feedback Intake" items={parsedContent.feedback_items as unknown[]} columns={["readable_id", "source", "severity", "status", "summary", "is_problem", "change_needed"]} />
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
type DesignElementRow = { id: string; readable_id?: string; component_id?: string | null; title: string; description?: string; diagram_source?: string };

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
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", fontSize: "0.75rem", fontFamily: "monospace", color: "#6b7280" }}>
                    {row.component_id ? `${row.component_id.slice(0, 8)}…` : "—"}
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
                    {el.component_id && (
                      <span style={{ fontSize: "0.72rem", background: "#f3e5f5", borderRadius: 4, padding: "1px 7px", color: "#6a1b9a", fontWeight: 600 }}>
                        comp {el.component_id.slice(0, 8)}…
                      </span>
                    )}
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

// ── SDP block (IEC 62304 §5.1) ────────────────────────────────────────────────
type SDPSDPBlob = {
  id: string; version: string; status: string; lifecycle_model: string;
  safety_class: string; title: string; description: string | null;
  approved_by: string | null; approved_at: string | null;
  sections: { section_number: string; section_name: string; content: string | null; sort_order: number }[];
  phases:   { phase_name: string; phase_order: number; entry_criteria: string | null; exit_criteria: string | null; activities: string | null; required_for_class: string }[];
  roles:    { role_name: string; responsibilities: string | null; required_for_class: string; sort_order: number }[];
};

function SDPDHFSection({ sdp }: { sdp: SDPSDPBlob | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!sdp) return null;
  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, marginBottom: "1rem" };

  return (
    <div style={cardStyle}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: "1rem 1.5rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: expanded ? "1px solid #eee" : "none" }}
      >
        <h4 style={{ margin: 0 }}>
          Software Development Plan
          <span style={{ marginLeft: 8, fontSize: "0.72rem", background: "#e8f5e9", color: "#1b5e20", borderRadius: 10, padding: "1px 8px", fontWeight: 600 }}>v{sdp.version} · {sdp.status}</span>
          <span style={{ marginLeft: 6, fontSize: "0.72rem", background: "#e3f2fd", color: "#0d47a1", borderRadius: 10, padding: "1px 8px", fontWeight: 600 }}>Class {sdp.safety_class}</span>
        </h4>
        <span style={{ color: "#888" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 1.5rem 1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#374151", marginBottom: 12 }}>
            <strong>{sdp.title}</strong>
            {sdp.approved_by && <> · approved by {sdp.approved_by}</>}
            {sdp.approved_at && <> on {new Date(sdp.approved_at).toLocaleDateString()}</>}
            {" · "}lifecycle: {sdp.lifecycle_model}
          </div>

          <SDPSubBlock title="Sections" count={sdp.sections.length}>
            {sdp.sections.map(s => (
              <div key={s.section_number} style={{ borderTop: "1px solid #eee", padding: "8px 0" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.section_number}. {s.section_name}</div>
                {s.content && <div style={{ fontSize: "0.78rem", color: "#555", whiteSpace: "pre-wrap", marginTop: 4 }}>{s.content}</div>}
              </div>
            ))}
          </SDPSubBlock>

          <SDPSubBlock title="Lifecycle Phases" count={sdp.phases.length}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead><tr style={{ background: "#f5f5f5" }}>
                {["#", "Phase", "Entry", "Exit", "Activities", "Class"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{sdp.phases.map(p => (
                <tr key={p.phase_order}>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{p.phase_order}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", fontWeight: 600 }}>{p.phase_name}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{p.entry_criteria ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{p.exit_criteria ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{p.activities ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }}>{p.required_for_class}</td>
                </tr>
              ))}</tbody>
            </table>
          </SDPSubBlock>

          <SDPSubBlock title="Roles & Responsibilities" count={sdp.roles.length}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead><tr style={{ background: "#f5f5f5" }}>
                {["Role", "Responsibilities", "Class"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{sdp.roles.map(r => (
                <tr key={r.sort_order}>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", fontWeight: 600 }}>{r.role_name}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{r.responsibilities ?? "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }}>{r.required_for_class}</td>
                </tr>
              ))}</tbody>
            </table>
          </SDPSubBlock>
        </div>
      )}
    </div>
  );
}

function SDPSubBlock({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#374151", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #e5e7eb" }}>
        {title} <span style={{ fontWeight: "normal", color: "#888" }}>({count})</span>
      </div>
      {children}
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
