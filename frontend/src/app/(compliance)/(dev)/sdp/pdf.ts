/**
 * SDP → PDF body builder.
 *
 * Returns the inner HTML for the printed SDP. The shared `printPdf` helper
 * in `@/lib/pdfExport` wraps this with the standard header, page CSS, and
 * print-trigger script.
 */
import { SDP, SDPSummary } from "@/lib/api";
import { esc, tableHtml, printPdf, documentControlHtml, revisionHistoryHtml } from "@/lib/pdfExport";

const LIFECYCLE_LABEL: Record<string, string> = {
  V_MODEL: "V-Model",
  AGILE: "Agile",
  HYBRID: "Hybrid",
};

function badgesHtml(sdp: SDP): string {
  return `<div style="margin-bottom:12pt">
    <span class="badge badge-version">v${esc(sdp.version)}</span>
    <span class="badge badge-status">${esc(sdp.status)}</span>
    <span class="badge badge-class">Class ${esc(sdp.safety_class)}</span>
    <span style="font-size:9pt;color:#374151;margin-left:8pt">
      Lifecycle: ${esc(LIFECYCLE_LABEL[sdp.lifecycle_model] ?? sdp.lifecycle_model)}
    </span>
  </div>`;
}

function approvalHtml(sdp: SDP): string {
  if (sdp.status !== "APPROVED") return "";
  const approvedAt = sdp.approved_at ? new Date(sdp.approved_at).toLocaleString() : "—";
  return `<div class="section">
    <h2>Approval</h2>
    <table>
      <tr><th style="width:30%">Approved by</th><td>${esc(sdp.approved_by)}</td></tr>
      <tr><th>Approved at</th><td>${esc(approvedAt)}</td></tr>
      ${sdp.review_notes ? `<tr><th>Review notes</th><td class="pre">${esc(sdp.review_notes)}</td></tr>` : ""}
    </table>
  </div>`;
}

function sectionsHtml(sdp: SDP): string {
  const sorted = [...sdp.sections].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return "";
  return `<div class="section">
    <h2>Sections <span class="count">(${sorted.length})</span></h2>
    ${sorted.map(s => `<div style="margin-bottom:8pt">
      <h3>${esc(s.section_number)}. ${esc(s.section_name)}</h3>
      ${s.content ? `<div class="pre">${esc(s.content)}</div>` : ""}
    </div>`).join("")}
  </div>`;
}

function lifecycleHtml(sdp: SDP): string {
  const sorted = [...sdp.phases].sort((a, b) => a.phase_order - b.phase_order);
  if (sorted.length === 0) return "";
  return `<div class="section">
    <h2>Lifecycle Phases <span class="count">(${sorted.length})</span></h2>
    ${tableHtml(sorted, [
      { header: "#", cell: p => esc(p.phase_order), align: "center" },
      { header: "Phase", cell: p => `<strong>${esc(p.phase_name)}</strong>` },
      { header: "Entry criteria", cell: p => esc(p.entry_criteria) },
      { header: "Exit criteria",  cell: p => esc(p.exit_criteria) },
      { header: "Activities",     cell: p => esc(p.activities) },
      { header: "Class",          cell: p => esc(p.required_for_class), align: "center" },
    ])}
  </div>`;
}

function rolesHtml(sdp: SDP): string {
  const sorted = [...sdp.roles].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return "";
  return `<div class="section">
    <h2>Roles &amp; Responsibilities <span class="count">(${sorted.length})</span></h2>
    ${tableHtml(sorted, [
      { header: "Role",             cell: r => `<strong>${esc(r.role_name)}</strong>` },
      { header: "Responsibilities", cell: r => esc(r.responsibilities) },
      { header: "Class",            cell: r => esc(r.required_for_class), align: "center" },
    ])}
  </div>`;
}

/**
 * Open the SDP as a printable PDF. User clicks the SDP page button and the
 * browser's print dialog handles the actual save.
 *
 * `history` is optional: when provided, a "Revision History" table is appended
 * showing every version's signoff trail. Pass it from the page where the
 * caller already has the version list.
 */
export function downloadSdpPdf(sdp: SDP, projectName: string, history?: SDPSummary[]): void {
  const subtitle = `${projectName} · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`;
  const bodyHtml = [
    badgesHtml(sdp),
    documentControlHtml(sdp),
    `<div class="section">
      <h2>${esc(sdp.title)}</h2>
      ${sdp.description ? `<div class="pre">${esc(sdp.description)}</div>` : ""}
    </div>`,
    approvalHtml(sdp),
    sectionsHtml(sdp),
    lifecycleHtml(sdp),
    rolesHtml(sdp),
    history && history.length > 0
      ? revisionHistoryHtml(history, {
          version:     v => v.version,
          status:      v => v.status,
          prepared_by: v => v.prepared_by,
          reviewed_by: v => v.reviewed_by,
          approved_by: v => v.approved_by,
          approved_at: v => v.approved_at,
        })
      : "",
  ].join("\n");

  printPdf({
    title: `Software Development Plan — v${sdp.version}`,
    subtitle,
    bodyHtml,
  });
}
