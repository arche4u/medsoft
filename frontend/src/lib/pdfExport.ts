/**
 * Shared PDF export helper.
 *
 * Each module owns its own body-builder (e.g. `app/sdp/pdf.ts`) and calls
 * `printPdf(...)` to render. Keeps the print boilerplate (window.open, auto-print
 * script, page CSS) in one place so the medsoft "regulatory artifact" PDFs all
 * look the same.
 */

export type PdfOptions = {
  /** Browser tab + print-dialog title */
  title: string;
  /** Plain text shown under the H1 in the header */
  subtitle?: string;
  /** HTML for the body section (after the auto-generated header). */
  bodyHtml: string;
  /** Anything that needs to live inside <head> (e.g. mermaid <script> tag). */
  extraHead?: string;
  /** Anything that needs to live at the end of <body> before the print trigger. */
  extraBodyEnd?: string;
  /** Delay before the auto-print fires, in ms. Bump up if mermaid renders. */
  printDelayMs?: number;
};

/**
 * Standard MedSoft PDF CSS — applied to every export so all modules look like
 * the same regulated document. Tweak here, never per-module.
 */
const BASE_CSS = `
  @page { margin: 20mm 15mm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.5; margin: 0; }
  .doc-header { border-bottom: 2pt solid #4a148c; padding-bottom: 12pt; margin-bottom: 20pt; }
  .doc-header h1 { margin: 0 0 4pt; font-size: 18pt; color: #4a148c; }
  .doc-header .meta { font-size: 9pt; color: #666; }
  .badge { display: inline-block; font-size: 8pt; font-weight: 600; border-radius: 10pt; padding: 1pt 8pt; margin-right: 6pt; }
  .badge-version { background: #e8f5e9; color: #1b5e20; }
  .badge-status  { background: #e3f2fd; color: #0d47a1; }
  .badge-class   { background: #fff3e0; color: #e65100; }
  .section { margin-bottom: 18pt; page-break-inside: avoid; }
  .section h2 { font-size: 12pt; color: #4a148c; margin: 0 0 6pt; border-bottom: 1pt solid #e5e7eb; padding-bottom: 4pt; }
  .section h3 { font-size: 10pt; color: #374151; margin: 10pt 0 4pt; }
  .count { font-size: 9pt; font-weight: normal; color: #888; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 6pt; }
  th { background: #f3e5f5; color: #4a148c; padding: 5pt 6pt; text-align: left; border: 0.5pt solid #ddd; font-weight: 600; }
  td { padding: 4pt 6pt; border: 0.5pt solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .pre { white-space: pre-wrap; font-size: 8.5pt; color: #444; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/** HTML-escape a value for safe placement in element text (not attribute). */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render the standard "Document Control" block printed at the top of every
 * controlled-document PDF. Shows the three-stage signoff trail
 * (prepared / reviewed / approved) using whatever names + dates are present.
 * Always renders even if some rows are empty — auditors expect to see the
 * shape of the block.
 */
export function documentControlHtml(opts: {
  prepared_by: string | null;
  prepared_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}): string {
  const row = (label: string, name: string | null, at: string | null) => `
    <tr>
      <td style="font-weight:600;width:25%">${esc(label)}</td>
      <td>${name ? esc(name) : `<em style="color:#999">— not signed —</em>`}</td>
      <td style="width:25%">${at ? esc(new Date(at).toLocaleDateString()) : ""}</td>
    </tr>`;
  return `<div class="section">
    <h2>Document Control</h2>
    <table>
      <thead><tr><th>Role</th><th>Name</th><th>Date</th></tr></thead>
      <tbody>
        ${row("Prepared by", opts.prepared_by, opts.prepared_at)}
        ${row("Reviewed by", opts.reviewed_by, opts.reviewed_at)}
        ${row("Approved by", opts.approved_by, opts.approved_at)}
      </tbody>
    </table>
  </div>`;
}

/**
 * Render a "Revision History" table from a list of versions/baselines. Each
 * row shows version, status, prepared/reviewed/approved names, item count,
 * and creation date.
 */
export function revisionHistoryHtml<R>(
  rows: R[],
  accessors: {
    version: (r: R) => string;
    status: (r: R) => string;
    prepared_by: (r: R) => string | null;
    reviewed_by: (r: R) => string | null;
    approved_by: (r: R) => string | null;
    approved_at?: (r: R) => string | null;
    item_count?: (r: R) => number | null;
  },
): string {
  if (rows.length === 0) return "";
  const showItems = !!accessors.item_count;
  return `<div class="section">
    <h2>Revision History <span class="count">(${rows.length})</span></h2>
    <table>
      <thead><tr>
        <th>Version</th><th>Status</th>
        <th>Prepared</th><th>Reviewed</th><th>Approved</th>
        ${showItems ? "<th>Items</th>" : ""}
        <th>Approved on</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><strong>v${esc(accessors.version(r))}</strong></td>
        <td>${esc(accessors.status(r))}</td>
        <td>${esc(accessors.prepared_by(r))}</td>
        <td>${esc(accessors.reviewed_by(r))}</td>
        <td>${esc(accessors.approved_by(r))}</td>
        ${showItems ? `<td style="text-align:center">${accessors.item_count!(r) ?? "—"}</td>` : ""}
        <td>${accessors.approved_at ? esc(accessors.approved_at(r) ? new Date(accessors.approved_at(r)!).toLocaleDateString() : "") : ""}</td>
      </tr>`).join("")}</tbody>
    </table>
  </div>`;
}

/** Render a simple HTML table from rows + column defs. */
export function tableHtml<R>(
  rows: R[],
  columns: { header: string; cell: (row: R) => string; align?: "left" | "center" | "right" }[],
): string {
  if (rows.length === 0) return `<p style="color:#888;font-size:9pt">— no entries —</p>`;
  return `<table>
    <thead><tr>${columns.map(c => `<th style="text-align:${c.align ?? "left"}">${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${columns.map(c => `<td style="text-align:${c.align ?? "left"}">${c.cell(r)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

/**
 * Open a new tab with the rendered HTML and trigger the browser's print dialog.
 * The user picks "Save as PDF" from there. No backend round-trip.
 */
export function printPdf(opts: PdfOptions): void {
  const printDelay = opts.printDelayMs ?? 600;
  const headerHtml = `
    <div class="doc-header">
      <h1>${esc(opts.title)}</h1>
      ${opts.subtitle ? `<div class="meta">${esc(opts.subtitle)}</div>` : ""}
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(opts.title)}</title>
  ${opts.extraHead ?? ""}
  <style>${BASE_CSS}</style>
</head>
<body>
  ${headerHtml}
  ${opts.bodyHtml}
  ${opts.extraBodyEnd ?? ""}
  <script>setTimeout(function(){ window.print(); }, ${printDelay});<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Allow pop-ups to download as PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
}
