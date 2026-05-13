/**
 * Requirements → SRS PDF body builder.
 *
 * Follows the same pattern as `app/sdp/pdf.ts` so all module exports look like
 * the same MedSoft regulated artifact. Renders the IEC 62304 §5.2 Software
 * Requirements Specification: USER → SYSTEM → SOFTWARE hierarchy plus any
 * project-defined custom types.
 */
import {
  Requirement, RequirementCategory,
  CompositeBaselineSummary,
  RequirementCategoryBaseline, RequirementCategoryBaselineItem, RequirementCategoryBaselineSummary,
} from "@/lib/api";
import { esc, tableHtml, printPdf, documentControlHtml, revisionHistoryHtml } from "@/lib/pdfExport";

// ── tree building ─────────────────────────────────────────────────────────────

type Node = Requirement & { children: Node[] };

function buildTree(reqs: Requirement[]): Node[] {
  const byId = new Map<string, Node>();
  reqs.forEach(r => byId.set(r.id, { ...r, children: [] }));
  const roots: Node[] = [];
  byId.forEach(node => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Stable sort by readable_id within siblings.
  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.readable_id ?? "").localeCompare(b.readable_id ?? ""));
    nodes.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// ── HTML chunks ───────────────────────────────────────────────────────────────

function summaryHtml(reqs: Requirement[], categories: RequirementCategory[]): string {
  const counts = new Map<string, number>();
  reqs.forEach(r => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));

  const cells = categories
    .filter(c => counts.has(c.name))
    .map(c => `
      <div style="border:1pt solid #e5e7eb;border-radius:6pt;padding:8pt;text-align:center;border-top:3pt solid ${esc(c.color)}">
        <div style="font-size:18pt;font-weight:bold;color:${esc(c.color)}">${counts.get(c.name) ?? 0}</div>
        <div style="font-size:8pt;color:#666;margin-top:3pt">${esc(c.label)}</div>
      </div>`)
    .join("");

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140pt, 1fr));gap:10pt;margin-bottom:18pt">
    ${cells || `<div style="color:#888;font-size:9pt">No requirements yet</div>`}
  </div>`;
}

function nodeHtml(node: Node, color: string, depth: number): string {
  const indent = depth * 14;
  const childrenHtml = node.children.map(c => nodeHtml(c, color, depth + 1)).join("");
  return `<div style="margin-left:${indent}pt;border-left:${depth > 0 ? "1pt solid #e5e7eb" : "0"};padding-left:${depth > 0 ? 8 : 0}pt;margin-bottom:6pt">
    <div style="display:flex;gap:8pt;align-items:baseline">
      <span style="font-family:monospace;font-size:8.5pt;color:${esc(color)};font-weight:600">${esc(node.readable_id ?? "—")}</span>
      <span style="font-weight:600">${esc(node.title)}</span>
      <span style="font-size:7.5pt;background:${esc(color)}22;color:${esc(color)};padding:1pt 6pt;border-radius:3pt">${esc(node.type)}</span>
    </div>
    ${node.description ? `<div class="pre" style="margin-top:3pt">${esc(node.description)}</div>` : ""}
    ${childrenHtml}
  </div>`;
}

function hierarchyHtml(reqs: Requirement[], categories: RequirementCategory[]): string {
  const tree = buildTree(reqs);
  if (tree.length === 0) return "";
  const colorByType = new Map(categories.map(c => [c.name, c.color]));

  return `<div class="section">
    <h2>Hierarchy</h2>
    ${tree.map(root => nodeHtml(root, colorByType.get(root.type) ?? "#374151", 0)).join("")}
  </div>`;
}

function flatTableHtml(reqs: Requirement[], typeFilter: string, label: string, color: string): string {
  const filtered = reqs.filter(r => r.type === typeFilter);
  if (filtered.length === 0) return "";
  filtered.sort((a, b) => (a.readable_id ?? "").localeCompare(b.readable_id ?? ""));
  return `<div class="section">
    <h2 style="color:${esc(color)}">${esc(label)} <span class="count">(${filtered.length})</span></h2>
    ${tableHtml(filtered, [
      { header: "ID",          cell: r => `<span style="font-family:monospace;color:#6b7280">${esc(r.readable_id)}</span>` },
      { header: "Title",       cell: r => `<strong>${esc(r.title)}</strong>` },
      { header: "Description", cell: r => esc(r.description) },
    ])}
  </div>`;
}

// ── public API ────────────────────────────────────────────────────────────────

function baselineBannerHtml(baseline: CompositeBaselineSummary | null | undefined): string {
  if (!baseline) {
    return `<div style="margin-bottom:12pt">
      <span class="badge badge-class">Working Draft</span>
      <span style="font-size:9pt;color:#374151;margin-left:8pt">No formal composite SRS yet</span>
    </div>`;
  }
  const approved = baseline.approved_at ? new Date(baseline.approved_at).toLocaleDateString() : null;
  return `<div style="margin-bottom:12pt">
    <span class="badge badge-version">v${esc(baseline.version)}</span>
    <span class="badge badge-status">${esc(baseline.status)}</span>
    ${baseline.approved_by ? `<span style="font-size:9pt;color:#374151;margin-left:8pt">Approved by ${esc(baseline.approved_by)}${approved ? ` on ${esc(approved)}` : ""}</span>` : ""}
    <span style="font-size:9pt;color:#6b7280;margin-left:8pt">${baseline.component_count} category(ies) pinned</span>
  </div>`;
}

export function downloadSrsPdf(
  reqs: Requirement[],
  categories: RequirementCategory[],
  projectName: string,
  composite?: CompositeBaselineSummary | null,
  history?: CompositeBaselineSummary[],
): void {
  const versionStamp = composite ? ` v${composite.version} ${composite.status}` : " (Working Draft)";
  const subtitle = `${projectName} · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`;

  // Render one section per project-defined category, in the project's
  // configured sort order — covers builtins + customs uniformly without
  // hardcoded type→label/color maps.
  const sectionsByCategory = categories
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => flatTableHtml(reqs, c.name, c.label, c.color))
    .join("");

  const docControl = composite
    ? documentControlHtml(composite)
    : documentControlHtml({
        prepared_by: null, prepared_at: null,
        reviewed_by: null, reviewed_at: null,
        approved_by: null, approved_at: null,
      });

  const bodyHtml = [
    baselineBannerHtml(composite),
    docControl,
    summaryHtml(reqs, categories),
    hierarchyHtml(reqs, categories),
    sectionsByCategory,
    history && history.length > 0
      ? revisionHistoryHtml(history, {
          version:     v => v.version,
          status:      v => v.status,
          prepared_by: v => v.prepared_by,
          reviewed_by: v => v.reviewed_by,
          approved_by: v => v.approved_by,
          approved_at: v => v.approved_at,
          item_count:  v => v.component_count,  // composite history shows component count
        })
      : "",
  ].join("\n");

  printPdf({
    title: `Software Requirements Specification${versionStamp}`,
    subtitle,
    bodyHtml,
  });
}


// ── Snapshot variant (renders an old version's frozen items, not live data) ─

/** Resolve a category's display label + color from the project's category
 *  definitions. Never hardcode per-type maps — the platform must support any
 *  customer-defined category set. */
function resolveCategoryMeta(name: string, categories: RequirementCategory[]) {
  const c = categories.find(x => x.name === name);
  return { label: c?.label ?? name, color: c?.color ?? "#546e7a" };
}

function snapshotSummaryHtml(items: RequirementCategoryBaselineItem[], categories: RequirementCategory[]): string {
  const counts = new Map<string, number>();
  items.forEach(i => counts.set(i.type, (counts.get(i.type) ?? 0) + 1));
  const cells = Array.from(counts.entries()).map(([type, n]) => {
    const { label, color } = resolveCategoryMeta(type, categories);
    return `<div style="border:1pt solid #e5e7eb;border-radius:6pt;padding:8pt;text-align:center;border-top:3pt solid ${esc(color)}">
      <div style="font-size:18pt;font-weight:bold;color:${esc(color)}">${n}</div>
      <div style="font-size:8pt;color:#666;margin-top:3pt">${esc(label)}</div>
    </div>`;
  }).join("");
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140pt, 1fr));gap:10pt;margin-bottom:18pt">${cells}</div>`;
}

function snapshotHierarchyHtml(items: RequirementCategoryBaselineItem[], categories: RequirementCategory[]): string {
  // Build tree by parent_readable_id (snapshot rows store parent as a string).
  const byRid = new Map(items.map(i => [i.readable_id, { ...i, children: [] as (RequirementCategoryBaselineItem & { children: unknown[] })[] }]));
  const roots: (RequirementCategoryBaselineItem & { children: unknown[] })[] = [];
  byRid.forEach(node => {
    if (node.parent_readable_id && byRid.has(node.parent_readable_id)) {
      (byRid.get(node.parent_readable_id)!.children as unknown[]).push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: (RequirementCategoryBaselineItem & { children: unknown[] })[]) => {
    nodes.sort((a, b) => a.readable_id.localeCompare(b.readable_id));
    nodes.forEach(n => sortRec(n.children as (RequirementCategoryBaselineItem & { children: unknown[] })[]));
  };
  sortRec(roots);

  const renderNode = (node: RequirementCategoryBaselineItem & { children: unknown[] }, depth: number): string => {
    const { color } = resolveCategoryMeta(node.type, categories);
    const indent = depth * 14;
    const childrenHtml = (node.children as (RequirementCategoryBaselineItem & { children: unknown[] })[])
      .map(c => renderNode(c, depth + 1)).join("");
    return `<div style="margin-left:${indent}pt;border-left:${depth > 0 ? "1pt solid #e5e7eb" : "0"};padding-left:${depth > 0 ? 8 : 0}pt;margin-bottom:6pt">
      <div style="display:flex;gap:8pt;align-items:baseline">
        <span style="font-family:monospace;font-size:8.5pt;color:${esc(color)};font-weight:600">${esc(node.readable_id)}</span>
        <span style="font-weight:600">${esc(node.title)}</span>
        <span style="font-size:7.5pt;background:${esc(color)}22;color:${esc(color)};padding:1pt 6pt;border-radius:3pt">${esc(node.type)}</span>
      </div>
      ${node.description ? `<div class="pre" style="margin-top:3pt">${esc(node.description)}</div>` : ""}
      ${childrenHtml}
    </div>`;
  };

  if (roots.length === 0) return "";
  return `<div class="section">
    <h2>Hierarchy</h2>
    ${roots.map(r => renderNode(r, 0)).join("")}
  </div>`;
}

function snapshotFlatTableHtml(items: RequirementCategoryBaselineItem[], type: string, categories: RequirementCategory[]): string {
  const filtered = items.filter(i => i.type === type);
  if (filtered.length === 0) return "";
  filtered.sort((a, b) => a.readable_id.localeCompare(b.readable_id));
  const { label, color } = resolveCategoryMeta(type, categories);
  return `<div class="section">
    <h2 style="color:${esc(color)}">${esc(label)} <span class="count">(${filtered.length})</span></h2>
    ${tableHtml(filtered, [
      { header: "ID",          cell: i => `<span style="font-family:monospace;color:#6b7280">${esc(i.readable_id)}</span>` },
      { header: "Title",       cell: i => `<strong>${esc(i.title)}</strong>` },
      { header: "Description", cell: i => esc(i.description) },
    ])}
  </div>`;
}

/**
 * Render an *immutable* SRS snapshot — the frozen requirements as approved at
 * the chosen baseline. Use this when the user clicks "PDF" on an old version
 * in the history panel. Differs from `downloadSrsPdf` which always reads live
 * requirements.
 */
export function downloadSrsSnapshotPdf(
  baseline: RequirementCategoryBaseline,
  projectName: string,
  categories: RequirementCategory[],
  history?: RequirementCategoryBaselineSummary[],
): void {
  const subtitle = `${projectName} · ${baseline.category_name} category snapshot v${baseline.version} (${baseline.status}) · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`;

  // Group distinct types in the snapshot and order by the project's category
  // sort_order — no hardcoded USER/SYSTEM/SOFTWARE ordering.
  const presentTypes = Array.from(new Set(baseline.items.map(i => i.type)));
  const sortOrderOf = (t: string) => categories.find(c => c.name === t)?.sort_order ?? 999;
  const types = presentTypes.sort((a, b) => sortOrderOf(a) - sortOrderOf(b) || a.localeCompare(b));

  const bodyHtml = [
    `<div style="margin-bottom:12pt">
      <span class="badge badge-version">v${esc(baseline.version)}</span>
      <span class="badge badge-status">${esc(baseline.status)}</span>
      <span style="font-size:9pt;color:#374151;margin-left:8pt">${baseline.items.length} requirement(s) frozen</span>
    </div>`,
    documentControlHtml(baseline),
    snapshotSummaryHtml(baseline.items, categories),
    snapshotHierarchyHtml(baseline.items, categories),
    types.map(t => snapshotFlatTableHtml(baseline.items, t, categories)).join(""),
    history && history.length > 0
      ? revisionHistoryHtml(history, {
          version:     v => v.version,
          status:      v => v.status,
          prepared_by: v => v.prepared_by,
          reviewed_by: v => v.reviewed_by,
          approved_by: v => v.approved_by,
          approved_at: v => v.approved_at,
          item_count:  v => v.item_count,
        })
      : "",
  ].join("\n");

  printPdf({
    title: `Software Requirements Specification v${baseline.version} ${baseline.status} (Snapshot)`,
    subtitle,
    bodyHtml,
  });
}
