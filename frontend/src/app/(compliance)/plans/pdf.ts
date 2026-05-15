/**
 * Generic IEC 62304 Plan → PDF body builder.
 *
 * Used by all §6/§7/§8/§9 plan pages. Mirrors the SDP PDF structure.
 * The shared `printPdf` helper in `@/lib/pdfExport` wraps this with the
 * standard header, page CSS, and print-trigger script.
 */
import { Plan, PlanSummary } from "@/lib/api";
import { esc, printPdf, documentControlHtml, revisionHistoryHtml } from "@/lib/pdfExport";

function badgesHtml(plan: Plan): string {
  return `<div style="margin-bottom:12pt">
    <span class="badge badge-version">v${esc(plan.version)}</span>
    <span class="badge badge-status">${esc(plan.status.replace("_"," "))}</span>
    <span class="badge badge-class">Class ${esc(plan.safety_class)}</span>
    ${plan.iec_clause
      ? `<span style="font-size:9pt;color:#374151;margin-left:8pt">IEC 62304 §${esc(plan.iec_clause)}</span>`
      : ""}
  </div>`;
}

function approvalHtml(plan: Plan): string {
  if (plan.status !== "APPROVED") return "";
  const at = plan.approved_at ? new Date(plan.approved_at).toLocaleString() : "—";
  return `<div class="section">
    <h2>Approval</h2>
    <table>
      <tr><th style="width:30%">Approved by</th><td>${esc(plan.approved_by)}</td></tr>
      <tr><th>Approved at</th><td>${esc(at)}</td></tr>
      ${plan.review_notes ? `<tr><th>Review notes</th><td class="pre">${esc(plan.review_notes)}</td></tr>` : ""}
    </table>
  </div>`;
}

function sectionsHtml(plan: Plan): string {
  const sorted = [...plan.sections].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return "";
  return `<div class="section">
    <h2>Sections <span class="count">(${sorted.length})</span></h2>
    ${sorted.map(s => `<div style="margin-bottom:10pt">
      <h3>§${esc(s.section_number)} &nbsp; ${esc(s.section_name)}</h3>
      ${s.content ? `<div class="pre">${esc(s.content)}</div>` : '<p style="color:#9ca3af;font-style:italic">No content yet.</p>'}
    </div>`).join("")}
  </div>`;
}

export function downloadPlanPdf(plan: Plan, projectName: string, history?: PlanSummary[]): void {
  const subtitle = `${projectName} · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`;

  const bodyHtml = [
    badgesHtml(plan),
    documentControlHtml(plan),
    `<div class="section">
      <h2>${esc(plan.title)}</h2>
      ${plan.description ? `<div class="pre">${esc(plan.description)}</div>` : ""}
    </div>`,
    approvalHtml(plan),
    sectionsHtml(plan),
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
    title: `${plan.title} — v${plan.version}`,
    subtitle,
    bodyHtml,
  });
}
