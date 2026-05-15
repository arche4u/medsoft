"use client";
import { useState, useEffect, useCallback } from "react";
import {
  api,
  ProblemReport, CAPARecord, CAPAVerification, MaintenanceRecord,
  ProblemSeverity, ProblemStatus, CAPAStatus, RootCauseType, UpdateType,
  CAPAReleaseCheck,
} from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";

// ── Badges ────────────────────────────────────────────────────────────────────
function SevBadge({ s }: { s: string }) {
  const c: Record<string, string> = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#f97316", CRITICAL: "#dc2626" };
  return <span style={{ background: c[s] ?? "#64748b", color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10 }}>{s}</span>;
}

function StatusBadge({ s }: { s: string }) {
  const c: Record<string, string> = {
    OPEN: "#f59e0b", INVESTIGATING: "#8b5cf6", RESOLVED: "#2563eb", CLOSED: "#6b7280",
    IN_PROGRESS: "#0ea5e9", COMPLETED: "#7c3aed", VERIFIED: "#16a34a",
  };
  return <span style={{ background: c[s] ?? "#64748b", color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10 }}>{s}</span>;
}

// ── Release banner ────────────────────────────────────────────────────────────
function ReleaseBanner({ projectId }: { projectId: string }) {
  const [check, setCheck] = useState<CAPAReleaseCheck | null>(null);
  useEffect(() => { api.capa.releaseCheck(projectId).then(setCheck).catch(() => {}); }, [projectId]);
  if (!check) return null;
  const blocked = check.is_blocked;
  return (
    <div style={{ background: blocked ? "#fef2f2" : "#f0fdf4", border: `1px solid ${blocked ? "#fca5a5" : "#86efac"}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: blocked ? "#dc2626" : "#16a34a" }}>
      {blocked ? `CAPA release gate BLOCKED: ${check.block_reasons.join(" · ")}` : "CAPA release gate: CLEAR"}
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ problems, maintenance }: { problems: ProblemReport[]; maintenance: MaintenanceRecord[] }) {
  const open = problems.filter(p => p.status === "OPEN").length;
  const critical = problems.filter(p => p.severity === "CRITICAL" && p.status !== "CLOSED").length;
  const allCapas = problems.flatMap(p => p.capas);
  const openCapas = allCapas.filter(c => ["OPEN", "IN_PROGRESS"].includes(c.status)).length;
  const verifiedCapas = allCapas.filter(c => c.status === "VERIFIED").length;

  const cards = [
    { label: "Open Problems", value: open, sub: `${critical} CRITICAL`, color: open > 0 ? "#dc2626" : "#16a34a" },
    { label: "Total Problems", value: problems.length, sub: `${problems.filter(p => p.status === "CLOSED").length} closed`, color: "#2563eb" },
    { label: "Open CAPAs", value: openCapas, sub: `${verifiedCapas} verified`, color: openCapas > 0 ? "#f97316" : "#16a34a" },
    { label: "Maintenance", value: maintenance.length, sub: `${maintenance.filter(m => m.update_type === "HOTFIX" || m.update_type === "EMERGENCY").length} hotfix/emergency`, color: "#7c3aed" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", flex: 1, borderLeft: `4px solid ${c.color}` }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.label}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── IEC 62304 §9.6 — Problem trend analysis ─────────────────────────────────
//
// "The manufacturer shall analyse problem reports for trends." Surfaced here
// as a compact panel showing:
//   • Severity distribution (CRITICAL / HIGH / MEDIUM / LOW)
//   • Status distribution (OPEN / INVESTIGATING / RESOLVED / CLOSED)
//   • Top root-cause types (DESIGN / CODE / PROCESS / ENVIRONMENT / etc.)
//   • Mean Time To Resolution (MTTR) — closed problems only
//   • Trend alert: ≥3 OPEN/INVESTIGATING problems share a root-cause type
//
// Auditors look for the manufacturer's active trend analysis under §9.6;
// this panel is the user-facing evidence.
function TrendAnalysisPanel({ problems }: { problems: ProblemReport[] }) {
  const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  const SEV_COLOR: Record<string, string> = { CRITICAL: "#b71c1c", HIGH: "#e65100", MEDIUM: "#f9a825", LOW: "#558b2f" };
  const STATUS_COLOR: Record<string, string> = { OPEN: "#1565c0", INVESTIGATING: "#e65100", RESOLVED: "#558b2f", CLOSED: "#546e7a" };

  const bySeverity = SEV_ORDER.map(s => ({ key: s, n: problems.filter(p => p.severity === s).length }));
  const byStatus = (["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const).map(s => ({ key: s, n: problems.filter(p => p.status === s).length }));

  // Root-cause types across all root_causes — top 5
  const rcCounts: Record<string, number> = {};
  for (const p of problems) for (const rc of p.root_causes) rcCounts[rc.root_cause_type] = (rcCounts[rc.root_cause_type] ?? 0) + 1;
  const topRC = Object.entries(rcCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Trend alert: ≥3 OPEN/INVESTIGATING problems share a root-cause type.
  const openProblems = problems.filter(p => p.status === "OPEN" || p.status === "INVESTIGATING");
  const openRcCounts: Record<string, number> = {};
  for (const p of openProblems) for (const rc of p.root_causes) openRcCounts[rc.root_cause_type] = (openRcCounts[rc.root_cause_type] ?? 0) + 1;
  const trendAlerts = Object.entries(openRcCounts).filter(([, n]) => n >= 3);

  // MTTR — average days between created_at and updated_at for CLOSED problems.
  const closed = problems.filter(p => p.status === "CLOSED");
  const mttr = closed.length === 0 ? null
    : (closed.reduce((s, p) => s + (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()), 0) / closed.length) / 86_400_000;

  const totalProblems = problems.length;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: "#37474f" }}>§9.6 Problem trend analysis</strong>
        {mttr !== null && (
          <span style={{ fontSize: 12, color: "#64748b" }}>
            MTTR (closed): <strong style={{ color: "#37474f" }}>{mttr.toFixed(1)}</strong> days
          </span>
        )}
      </div>

      {trendAlerts.length > 0 && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
          <strong style={{ color: "#e65100", fontSize: 12 }}>
            Trend alert — {trendAlerts.length} root-cause cluster{trendAlerts.length === 1 ? "" : "s"} with ≥3 open problems:
          </strong>
          <div style={{ marginTop: 4 }}>
            {trendAlerts.map(([type, n]) => (
              <span key={type} style={{ fontSize: 11, color: "#5d4037", marginRight: 12 }}>
                <strong>{type}</strong>: {n} open
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Severity distribution */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>By severity</div>
          {bySeverity.map(({ key, n }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 70, fontSize: 11, color: SEV_COLOR[key], fontWeight: 600 }}>{key}</span>
              <div style={{ flex: 1, height: 8, background: "#eceff1", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: totalProblems ? `${(n / totalProblems) * 100}%` : "0%", height: "100%", background: SEV_COLOR[key] }} />
              </div>
              <span style={{ width: 24, textAlign: "right", fontSize: 11, color: "#37474f" }}>{n}</span>
            </div>
          ))}
        </div>

        {/* Status distribution */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>By status</div>
          {byStatus.map(({ key, n }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 90, fontSize: 11, color: STATUS_COLOR[key], fontWeight: 600 }}>{key}</span>
              <div style={{ flex: 1, height: 8, background: "#eceff1", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: totalProblems ? `${(n / totalProblems) * 100}%` : "0%", height: "100%", background: STATUS_COLOR[key] }} />
              </div>
              <span style={{ width: 24, textAlign: "right", fontSize: 11, color: "#37474f" }}>{n}</span>
            </div>
          ))}
        </div>

        {/* Top root-cause types */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Top root causes</div>
          {topRC.length === 0
            ? <span style={{ fontSize: 11, color: "#9e9e9e" }}>No root causes recorded yet.</span>
            : topRC.map(([type, n]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1, fontSize: 11, color: "#37474f", fontWeight: 600 }}>{type}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{n}</span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

// ── CAPA panel ────────────────────────────────────────────────────────────────
function CAPAPanel({ problem, onRefresh }: { problem: ProblemReport; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ action_type: "CORRECTIVE" as "CORRECTIVE" | "PREVENTIVE", description: "", assigned_to: "", due_date: "" });
  const [verifTarget, setVerifTarget] = useState<string | null>(null);
  const [verifForm, setVerifForm] = useState({ verification_method: "", result: "PASS", evidence_link: "", verified_by: "", notes: "" });

  async function submitCapa(e: React.FormEvent) {
    e.preventDefault();
    await api.capa.problems.addCapa(problem.id, { ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null });
    setShowAdd(false); setForm({ action_type: "CORRECTIVE", description: "", assigned_to: "", due_date: "" });
    onRefresh();
  }

  async function submitVerif(e: React.FormEvent, capaId: string) {
    e.preventDefault();
    await api.capa.capas.addVerification(capaId, { ...verifForm, verification_method: verifForm.verification_method || null, evidence_link: verifForm.evidence_link || null, verified_by: verifForm.verified_by || null, notes: verifForm.notes || null }).catch(err => alert(String(err)));
    setVerifTarget(null); setVerifForm({ verification_method: "", result: "PASS", evidence_link: "", verified_by: "", notes: "" });
    onRefresh();
  }

  async function advanceCapa(id: string, status: CAPAStatus) {
    await api.capa.capas.update(id, { status }).catch(err => alert(String(err)));
    onRefresh();
  }

  const NEXT_CAPA: Record<string, string[]> = { OPEN: ["IN_PROGRESS"], IN_PROGRESS: ["COMPLETED", "OPEN"], COMPLETED: [], VERIFIED: [] };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>CAPAs ({problem.capas.length})</div>
        {problem.status !== "CLOSED" && <button onClick={() => setShowAdd(!showAdd)} style={styles.btnSm}>+ Add CAPA</button>}
      </div>

      {showAdd && (
        <form onSubmit={submitCapa} style={{ background: "#f8fafc", padding: 10, borderRadius: 6, marginBottom: 8 }}>
          <div style={styles.row}>
            <select value={form.action_type} onChange={e => setForm(p => ({ ...p, action_type: e.target.value as "CORRECTIVE" | "PREVENTIVE" }))} style={styles.input}>
              <option>CORRECTIVE</option><option>PREVENTIVE</option>
            </select>
            <input placeholder="Assigned To" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={styles.input} />
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={{ ...styles.input, width: 140 }} />
          </div>
          <textarea placeholder="CAPA Description *" required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={styles.btn}>Create CAPA</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      {problem.capas.map(capa => (
        <div key={capa.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, background: capa.action_type === "CORRECTIVE" ? "#dbeafe" : "#fef3c7", color: capa.action_type === "CORRECTIVE" ? "#1d4ed8" : "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{capa.action_type}</span>
                <StatusBadge s={capa.status} />
                {capa.assigned_to && <span style={{ fontSize: 12, color: "#64748b" }}>→ {capa.assigned_to}</span>}
                {capa.due_date && <span style={{ fontSize: 12, color: "#dc2626" }}>Due: {capa.due_date}</span>}
              </div>
              <div style={{ fontSize: 13 }}>{capa.description}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexDirection: "column" as const, alignItems: "flex-end" }}>
              {(NEXT_CAPA[capa.status] ?? []).map(s => (
                <button key={s} onClick={() => advanceCapa(capa.id, s as CAPAStatus)} style={{ ...styles.btnSm, fontSize: 11 }}>→{s}</button>
              ))}
              {capa.status === "COMPLETED" && (
                <button onClick={() => setVerifTarget(verifTarget === capa.id ? null : capa.id)} style={{ ...styles.btnSm, background: "#dcfce7", color: "#166534" }}>Verify</button>
              )}
            </div>
          </div>

          {verifTarget === capa.id && (
            <form onSubmit={e => submitVerif(e, capa.id)} style={{ marginTop: 8, background: "#fff", padding: 10, borderRadius: 6 }}>
              <div style={styles.row}>
                <select value={verifForm.result} onChange={e => setVerifForm(p => ({ ...p, result: e.target.value }))} style={styles.input}>
                  <option>PASS</option><option>FAIL</option>
                </select>
                <input placeholder="Method" value={verifForm.verification_method} onChange={e => setVerifForm(p => ({ ...p, verification_method: e.target.value }))} style={styles.input} />
                <input placeholder="Verified By" value={verifForm.verified_by} onChange={e => setVerifForm(p => ({ ...p, verified_by: e.target.value }))} style={styles.input} />
                <input placeholder="Evidence Link" value={verifForm.evidence_link} onChange={e => setVerifForm(p => ({ ...p, evidence_link: e.target.value }))} style={{ ...styles.input, flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" style={styles.btn}>Submit Verification</button>
                <button type="button" onClick={() => setVerifTarget(null)} style={styles.btnGhost}>Cancel</button>
              </div>
            </form>
          )}

          {capa.verifications.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
              {capa.verifications.map(v => (
                <div key={v.id} style={{ fontSize: 12, color: "#475569", display: "flex", gap: 10 }}>
                  <span style={{ fontWeight: 600, color: v.result === "PASS" ? "#16a34a" : "#dc2626" }}>{v.result}</span>
                  <span>{v.verification_method ?? "—"}</span>
                  {v.verified_by && <span>by {v.verified_by}</span>}
                  {v.evidence_link && <a href={v.evidence_link} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>Evidence</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Problem card ──────────────────────────────────────────────────────────────
const PROB_NEXT: Record<string, string[]> = {
  OPEN: ["INVESTIGATING"],
  INVESTIGATING: ["RESOLVED", "OPEN"],
  RESOLVED: ["CLOSED", "INVESTIGATING"],
  CLOSED: [],
};

const RC_TYPES: RootCauseType[] = ["DESIGN", "CODE", "PROCESS", "REQUIREMENTS", "ENVIRONMENT", "HUMAN_ERROR"];

function ProblemCard({ problem, onRefresh }: { problem: ProblemReport; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rcForm, setRCForm] = useState({ root_cause_type: "CODE" as RootCauseType, description: "", identified_by: "" });
  const [showRC, setShowRC] = useState(false);

  async function transition(status: ProblemStatus) {
    await api.capa.problems.transition(problem.id, status).catch(err => alert(String(err)));
    onRefresh();
  }

  async function addRC(e: React.FormEvent) {
    e.preventDefault();
    await api.capa.problems.addRootCause(problem.id, { ...rcForm, identified_by: rcForm.identified_by || null });
    setShowRC(false); setRCForm({ root_cause_type: "CODE", description: "", identified_by: "" });
    onRefresh();
  }

  async function del() {
    if (!confirm("Delete this problem report?")) return;
    await api.capa.problems.delete(problem.id).catch(err => alert(String(err)));
    onRefresh();
  }

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{problem.title}</span>
            <SevBadge s={problem.severity} />
            <StatusBadge s={problem.status} />
            {problem.source && <span style={{ fontSize: 11, color: "#64748b" }}>({problem.source})</span>}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {problem.capas.length} CAPA(s) · {problem.root_causes.length} RCA(s) · {problem.links.length} link(s)
            {problem.reported_by && ` · Reported by ${problem.reported_by}`}
            {" · "}{new Date(problem.created_at).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, justifyContent: "flex-end", maxWidth: 260 }}>
          {(PROB_NEXT[problem.status] ?? []).map(s => (
            <button key={s} onClick={() => transition(s as ProblemStatus)} style={{ ...styles.btnSm, fontSize: 11 }}>→{s}</button>
          ))}
          {problem.status === "OPEN" && (
            <button onClick={del} style={{ ...styles.btnSm, background: "#fef2f2", color: "#dc2626", fontSize: 11 }}>Del</button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
          {problem.description && <p style={{ fontSize: 13, color: "#475569", margin: "0 0 12px" }}>{problem.description}</p>}

          {/* Root Causes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Root Cause Analysis ({problem.root_causes.length})</div>
              {problem.status !== "CLOSED" && <button onClick={() => setShowRC(!showRC)} style={styles.btnSm}>+ Add RCA</button>}
            </div>
            {showRC && (
              <form onSubmit={addRC} style={{ background: "#f0fdf4", padding: 10, borderRadius: 6, marginBottom: 8 }}>
                <div style={styles.row}>
                  <select value={rcForm.root_cause_type} onChange={e => setRCForm(p => ({ ...p, root_cause_type: e.target.value as RootCauseType }))} style={styles.input}>
                    {RC_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="Identified By" value={rcForm.identified_by} onChange={e => setRCForm(p => ({ ...p, identified_by: e.target.value }))} style={styles.input} />
                </div>
                <textarea placeholder="Root Cause Description *" required value={rcForm.description} onChange={e => setRCForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={styles.btn}>Add</button>
                  <button type="button" onClick={() => setShowRC(false)} style={styles.btnGhost}>Cancel</button>
                </div>
              </form>
            )}
            {problem.root_causes.map(rc => (
              <div key={rc.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>{rc.root_cause_type}</span>
                <span style={{ flex: 1 }}>{rc.description}</span>
                {rc.identified_by && <span style={{ color: "#64748b" }}>by {rc.identified_by}</span>}
              </div>
            ))}
            {problem.root_causes.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No root cause identified yet</div>}
          </div>

          {/* Linked artifacts */}
          {problem.links.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Linked Artifacts</div>
              {problem.links.map(l => (
                <div key={l.id} style={{ fontSize: 12, color: "#475569", padding: "3px 0" }}>
                  <span style={{ color: "#64748b", marginRight: 8 }}>{l.linked_type}</span>
                  <span>{l.linked_name ?? l.linked_id}</span>
                </div>
              ))}
            </div>
          )}

          <CAPAPanel problem={problem} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ── Problems Tab ──────────────────────────────────────────────────────────────
function ProblemsTab({ projectId, onProblemsChange }: { projectId: string; onProblemsChange: (p: ProblemReport[]) => void }) {
  const [problems, setProblems] = useState<ProblemReport[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");
  const [form, setForm] = useState({ title: "", description: "", source: "TESTING", severity: "MEDIUM" as ProblemSeverity, reported_by: "" });

  const load = useCallback(() => {
    api.capa.problems.list(projectId).then(p => { setProblems(p); onProblemsChange(p); }).catch(() => {});
  }, [projectId, onProblemsChange]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.capa.problems.create({ project_id: projectId, ...form, description: form.description || null, reported_by: form.reported_by || null });
    setShowAdd(false); setForm({ title: "", description: "", source: "TESTING", severity: "MEDIUM", reported_by: "" });
    load();
  }

  const sources = ["FIELD", "AUDIT", "TESTING", "CUSTOMER", "INTERNAL", "REGULATORY"];
  const severities: ProblemSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const filtered = filter === "ALL" ? problems : problems.filter(p => p.status === filter || p.severity === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["ALL", "OPEN", "INVESTIGATING", "CRITICAL", "CLOSED"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...styles.btnSm, background: filter === f ? "#2563eb" : "#f1f5f9", color: filter === f ? "#fff" : "#334155" }}>{f}</button>
          ))}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.btn}>+ Report Problem</button>
      </div>

      {showAdd && (
        <form onSubmit={submit} style={styles.card}>
          <input placeholder="Problem Title *" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={{ ...styles.input, width: "100%", marginBottom: 8 }} />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60, marginBottom: 8 }} />
          <div style={styles.row}>
            <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} style={styles.input}>
              {sources.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as ProblemSeverity }))} style={styles.input}>
              {severities.map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="Reported By" value={form.reported_by} onChange={e => setForm(p => ({ ...p, reported_by: e.target.value }))} style={styles.input} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" style={styles.btn}>Create</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      {filtered.map(p => <ProblemCard key={p.id} problem={p} onRefresh={load} />)}
      {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center" as const, color: "#94a3b8" }}>No problems {filter !== "ALL" ? `with filter "${filter}"` : "reported yet"}</div>}
    </div>
  );
}

// ── Maintenance Tab ───────────────────────────────────────────────────────────
function MaintenanceTab({ projectId }: { projectId: string }) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: "", update_type: "PATCH" as UpdateType, deployed_version: "", deployment_date: "" });

  const load = useCallback(() => api.capa.maintenance.list(projectId).then(setRecords).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.capa.maintenance.create({ project_id: projectId, ...form, deployed_version: form.deployed_version || null, deployment_date: form.deployment_date || null });
    setShowAdd(false); setForm({ description: "", update_type: "PATCH", deployed_version: "", deployment_date: "" });
    load();
  }

  const updateTypes: UpdateType[] = ["MAJOR", "MINOR", "PATCH", "HOTFIX", "EMERGENCY"];
  const typeColors: Record<string, string> = { MAJOR: "#dc2626", MINOR: "#2563eb", PATCH: "#16a34a", HOTFIX: "#f97316", EMERGENCY: "#7c3aed" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Maintenance Timeline ({records.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.btn}>+ Add Record</button>
      </div>

      {showAdd && (
        <form onSubmit={submit} style={styles.card}>
          <textarea placeholder="Description *" required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60, marginBottom: 8 }} />
          <div style={styles.row}>
            <select value={form.update_type} onChange={e => setForm(p => ({ ...p, update_type: e.target.value as UpdateType }))} style={styles.input}>
              {updateTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="Deployed Version" value={form.deployed_version} onChange={e => setForm(p => ({ ...p, deployed_version: e.target.value }))} style={styles.input} />
            <input type="date" value={form.deployment_date} onChange={e => setForm(p => ({ ...p, deployment_date: e.target.value }))} style={{ ...styles.input, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" style={styles.btn}>Add</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ position: "relative" as const }}>
        {records.map((rec, i) => (
          <div key={rec.id} style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 40 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: typeColors[rec.update_type] ?? "#64748b", flexShrink: 0 }} />
              {i < records.length - 1 && <div style={{ flex: 1, width: 2, background: "#e2e8f0", minHeight: 20 }} />}
            </div>
            <div style={{ ...styles.card, flex: 1, margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: typeColors[rec.update_type] }}>{rec.update_type}</span>
                  {rec.deployed_version && <span style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 600 }}>v{rec.deployed_version}</span>}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {rec.deployment_date && <span style={{ fontSize: 12, color: "#64748b" }}>{rec.deployment_date}</span>}
                  <button onClick={() => { if (confirm("Delete?")) api.capa.maintenance.delete(rec.id).then(load); }} style={{ fontSize: 11, background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>{rec.description}</p>
            </div>
          </div>
        ))}
        {records.length === 0 && <div style={{ padding: 24, textAlign: "center" as const, color: "#94a3b8" }}>No maintenance records yet</div>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CAPAPage() {
  const [projectId] = useActiveProject();
  const [tab, setTab] = useState<"problems" | "maintenance">("problems");
  const [problems, setProblems] = useState<ProblemReport[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);

  useEffect(() => {
    if (projectId) api.capa.maintenance.list(projectId).then(setMaintenance).catch(() => {});
  }, [projectId]);

  if (!projectId) {
    return <div style={{ padding: 32, color: "#64748b" }}>Select a project to view CAPA.</div>;
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>Problem Resolution & CAPA</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>IEC 62304 §9 — Post-release problem tracking, root cause analysis, corrective &amp; preventive actions</p>
      </div>

      <ReleaseBanner projectId={projectId} />
      <SummaryCards problems={problems} maintenance={maintenance} />
      <TrendAnalysisPanel problems={problems} />

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
        {(["problems", "maintenance"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: tab === t ? "#dc2626" : "transparent",
            color: tab === t ? "#fff" : "#64748b",
            borderRadius: "6px 6px 0 0",
          }}>
            {t === "problems" ? "Problem Reports & CAPA" : "Maintenance Timeline"}
          </button>
        ))}
      </div>

      {tab === "problems" && <ProblemsTab projectId={projectId} onProblemsChange={setProblems} />}
      {tab === "maintenance" && <MaintenanceTab projectId={projectId} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  card: {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
    padding: "14px 16px", marginBottom: 8,
  } as React.CSSProperties,
  input: {
    padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 13, outline: "none",
  } as React.CSSProperties,
  btn: {
    padding: "6px 14px", background: "#dc2626", color: "#fff", border: "none",
    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
  } as React.CSSProperties,
  btnGhost: {
    padding: "6px 14px", background: "transparent", color: "#64748b",
    border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  btnSm: {
    padding: "3px 10px", background: "#f1f5f9", color: "#334155",
    border: "1px solid #cbd5e1", borderRadius: 5, cursor: "pointer", fontSize: 12,
  } as React.CSSProperties,
  row: {
    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 8,
  } as React.CSSProperties,
};
