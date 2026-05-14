/**
 * Software Architecture Document → PDF.
 *
 * Renders an approved (or in-progress) architecture baseline as a regulated
 * PDF artifact: header + Document Control (prepared/reviewed/approved) +
 * Component table (with hierarchy by parent_name) + Interface table (with
 * data-flow text dump) + Revision History.
 *
 * Always reads from the snapshot rows so the PDF is immutable — even if the
 * underlying SWComponent gets renamed later, the PDF preserves what was
 * actually approved.
 */
import {
  ArchitectureBaseline, ArchitectureBaselineSummary,
  ArchitectureBaselineComponentSnap, ArchitectureBaselineInterfaceSnap,
} from "@/lib/api";
import { esc, tableHtml, printPdf, documentControlHtml, revisionHistoryHtml } from "@/lib/pdfExport";


// ── Mermaid sources built from the snapshot rows (not live data) ─────────────
//
// Component IDs are unique within a baseline so we use them directly as
// Mermaid node ids. Parent linkage in the snapshot uses parent_name rather
// than parent_id, so we resolve it by name.

function _nodeId(id: string): string {
  return "n_" + id.replace(/-/g, "_");
}

function buildHierarchyMermaid(components: ArchitectureBaselineComponentSnap[]): string {
  if (components.length === 0) return "";
  const byName = new Map(components.map(c => [c.name, c]));
  const lines: string[] = ["flowchart TD"];
  for (const c of components) {
    const label = `${c.name}<br/><small>${c.component_type} · Class ${c.safety_class}</small>`;
    lines.push(`    ${_nodeId(c.id)}["${label}"]`);
  }
  for (const c of components) {
    if (c.parent_name) {
      const parent = byName.get(c.parent_name);
      if (parent) lines.push(`    ${_nodeId(parent.id)} --> ${_nodeId(c.id)}`);
    }
  }
  lines.push("    classDef cA fill:#e8f5e9,stroke:#1b5e20,color:#1b5e20");
  lines.push("    classDef cB fill:#fff3e0,stroke:#e65100,color:#e65100");
  lines.push("    classDef cC fill:#ffebee,stroke:#b71c1c,color:#b71c1c");
  for (const c of components) {
    const cls = c.safety_class === "C" ? "cC" : c.safety_class === "B" ? "cB" : "cA";
    lines.push(`    class ${_nodeId(c.id)} ${cls}`);
  }
  return lines.join("\n");
}

function buildInterfaceMermaid(
  components: ArchitectureBaselineComponentSnap[],
  interfaces: ArchitectureBaselineInterfaceSnap[],
): string {
  if (interfaces.length === 0) return "";
  const byName = new Map(components.map(c => [c.name, c]));
  const involved = new Set<string>();
  interfaces.forEach(i => {
    const s = byName.get(i.source_component_name);
    const t = byName.get(i.target_component_name);
    if (s) involved.add(s.id);
    if (t) involved.add(t.id);
  });
  const lines: string[] = ["flowchart LR"];
  for (const c of components) {
    if (!involved.has(c.id)) continue;
    lines.push(`    ${_nodeId(c.id)}["${c.name}<br/><small>${c.component_type}</small>"]`);
  }
  for (const iface of interfaces) {
    const s = byName.get(iface.source_component_name);
    const t = byName.get(iface.target_component_name);
    if (!s || !t) continue;
    const label = `${iface.name}<br/><small>${iface.interface_type}${iface.safety_relevant ? " · SAFETY" : ""}</small>`;
    const arrow = iface.safety_relevant ? "==>" : "-->";
    lines.push(`    ${_nodeId(s.id)} ${arrow}|"${label}"| ${_nodeId(t.id)}`);
  }
  return lines.join("\n");
}

function componentsHtml(rows: ArchitectureBaselineComponentSnap[]): string {
  if (rows.length === 0) return `<p style="color:#888;font-size:9pt">No components in this baseline.</p>`;
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  return `<div class="section">
    <h2>Components <span class="count">(${sorted.length})</span></h2>
    ${tableHtml(sorted, [
      { header: "Name",        cell: c => `<strong>${esc(c.name)}</strong>` },
      { header: "Type",        cell: c => esc(c.component_type), align: "center" },
      { header: "Class",       cell: c => esc(c.safety_class), align: "center" },
      { header: "Version",     cell: c => esc(c.version), align: "center" },
      { header: "Parent",      cell: c => esc(c.parent_name) },
      { header: "Description", cell: c => esc(c.description) },
      { header: "Rationale",   cell: c => esc(c.rationale) },
    ])}
  </div>`;
}

function interfacesHtml(rows: ArchitectureBaselineInterfaceSnap[]): string {
  if (rows.length === 0) return "";
  return `<div class="section">
    <h2>Interfaces <span class="count">(${rows.length})</span></h2>
    ${tableHtml(rows, [
      { header: "Name",   cell: i => `<strong>${esc(i.name)}</strong>` },
      { header: "Type",   cell: i => esc(i.interface_type), align: "center" },
      { header: "Source", cell: i => esc(i.source_component_name) },
      { header: "Target", cell: i => esc(i.target_component_name) },
      { header: "Format", cell: i => esc(i.data_format) },
      { header: "Method", cell: i => esc(i.communication_method) },
      { header: "Safety", cell: i => i.safety_relevant ? "✓" : "—", align: "center" },
    ])}

    ${rows.some(r => r.data_flows_summary) ? `
      <h3 style="font-size:10pt;margin-top:10pt">Data Flows</h3>
      ${rows.filter(r => r.data_flows_summary).map(r => `
        <div style="margin-bottom:8pt">
          <strong>${esc(r.name)}</strong>
          <span style="font-size:9pt;color:#666"> · ${esc(r.source_component_name)} → ${esc(r.target_component_name)}</span>
          <pre class="pre" style="margin-top:3pt;background:#fafafa;padding:6pt;border:0.5pt solid #eee;border-radius:3pt">${esc(r.data_flows_summary)}</pre>
        </div>
      `).join("")}
    ` : ""}
  </div>`;
}

export function downloadArchitecturePdf(
  baseline: ArchitectureBaseline,
  projectName: string,
  history?: ArchitectureBaselineSummary[],
): void {
  const subtitle = `${projectName} · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`;

  const headerBadges = `<div style="margin-bottom:12pt">
    <span class="badge badge-version">v${esc(baseline.version)}</span>
    <span class="badge badge-status">${esc(baseline.status)}</span>
    <span style="font-size:9pt;color:#6b7280;margin-left:8pt">
      ${baseline.components.length} component(s), ${baseline.interfaces.length} interface(s)
    </span>
  </div>`;

  // Auto-generated Mermaid diagrams — same content the on-page Diagrams tab
  // renders, but built from the frozen snapshot rows so the PDF is immutable.
  const hierarchyMm = buildHierarchyMermaid(baseline.components);
  const interfaceMm = buildInterfaceMermaid(baseline.components, baseline.interfaces);
  const hasDiagrams = !!hierarchyMm || !!interfaceMm;
  const diagramsHtml = hasDiagrams ? `
    <div class="section" style="page-break-inside: auto">
      <h2>Architecture Diagrams</h2>
      ${hierarchyMm ? `
        <h3 style="font-size:10pt;margin-top:8pt">Component hierarchy</h3>
        <div class="diagram-block"><div class="mermaid">${hierarchyMm}</div></div>` : ""}
      ${interfaceMm ? `
        <h3 style="font-size:10pt;margin-top:14pt">Interface map</h3>
        <div class="diagram-block"><div class="mermaid">${interfaceMm}</div></div>` : ""}
    </div>` : "";

  const bodyHtml = [
    headerBadges,
    documentControlHtml(baseline),
    diagramsHtml,
    componentsHtml(baseline.components),
    interfacesHtml(baseline.interfaces),
    history && history.length > 0
      ? revisionHistoryHtml(history, {
          version:     v => v.version,
          status:      v => v.status,
          prepared_by: v => v.prepared_by,
          reviewed_by: v => v.reviewed_by,
          approved_by: v => v.approved_by,
          approved_at: v => v.approved_at,
          item_count:  v => v.component_count,  // architecture history shows component count
        })
      : "",
  ].join("\n");

  // Mermaid in the print window: same pattern as the DHF PDF. Load via CDN
  // and bump the print delay so the SVGs are rendered before the dialog opens.
  const mermaidHead = hasDiagrams
    ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>`
    : "";
  const mermaidInit = hasDiagrams
    ? `<script>mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });<\/script>`
    : "";
  const extraStyle = hasDiagrams
    ? `<style>.diagram-block { border: 0.5pt solid #e5e7eb; border-radius: 4pt; padding: 8pt; margin: 6pt 0; background: #fff; text-align: center; page-break-inside: avoid; } .diagram-block svg { max-width: 100% !important; height: auto !important; }</style>`
    : "";

  printPdf({
    title: `Software Architecture Document v${baseline.version} ${baseline.status}`,
    subtitle,
    bodyHtml,
    extraHead: mermaidHead + extraStyle,
    extraBodyEnd: mermaidInit,
    printDelayMs: hasDiagrams ? 1500 : 600,
  });
}
