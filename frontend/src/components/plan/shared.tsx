"use client";
/**
 * Shared shell for all versioned IEC 62304 plan documents.
 *
 * Used by: SDP (§5.1), Maintenance Plan (§6.1), Risk Mgmt Plan (§7),
 *          Config Mgmt Plan (§8.1), Problem Resolution Plan (§9).
 *
 * Each plan page renders <PlanShell> with its own plan-type props.
 * SDP adds extra tabs (Lifecycle, Roles) by passing them in `extraTabs`.
 */
import { useState, useEffect, useCallback, Suspense } from "react";
import { api, Plan, PlanSummary, PlanStatus, PlanCompliance, PlanTypeInfo } from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";
import { downloadPlanPdf } from "@/app/(compliance)/plans/pdf";

// ── Status metadata ────────────────────────────────────────────────────────────

export const STATUS_META: Record<string, { color: string; bg: string; border: string }> = {
  DRAFT:     { color: "#546e7a", bg: "#eceff1",  border: "#cfd8dc" },
  IN_REVIEW: { color: "#e65100", bg: "#fff3e0",  border: "#ffcc80" },
  APPROVED:  { color: "#1b5e20", bg: "#e8f5e9",  border: "#a5d6a7" },
  OBSOLETE:  { color: "#9e9e9e", bg: "#f5f5f5",  border: "#e0e0e0" },
};

export const CLASS_COLOR: Record<string, string> = {
  A: "#1b5e20", B: "#e65100", C: "#b71c1c",
};

// ── Style constants (single source of truth for all plan pages) ───────────────

export const sty = {
  versionList: {
    width: 200,
    flexShrink: 0,
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: "8px 0 0 8px",
    minHeight: 400,
  } as React.CSSProperties,
  panel: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "14px 16px",
  } as React.CSSProperties,
  panelTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: "#1a237e",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
  } as React.CSSProperties,
  btn: {
    background: "#1a237e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  } as React.CSSProperties,
  btnSmall: {
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "5px 10px",
    cursor: "pointer",
    fontSize: 12,
    background: "#eceff1",
    color: "#546e7a",
  } as React.CSSProperties,
  btnSecondary: {
    background: "#e8f5e9",
    color: "#1b5e20",
    border: "1px solid #c8e6c9",
    borderRadius: 5,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  } as React.CSSProperties,
  btnGhost: {
    background: "transparent",
    color: "#546e7a",
    border: "1px solid #cfd8dc",
    borderRadius: 6,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
  } as React.CSSProperties,
  iconBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#78909c",
    fontSize: 16,
    padding: "0 4px",
  } as React.CSSProperties,
  tabBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 13,
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "#546e7a",
    marginBottom: 4,
  } as React.CSSProperties,
  input: {
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 13,
    outline: "none",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 13,
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  } as React.CSSProperties,
  emptyState: {
    textAlign: "center",
    padding: "60px 24px",
    color: "#546e7a",
  } as React.CSSProperties,
};

// ── SignoffRow ─────────────────────────────────────────────────────────────────

export function SignoffRow({ label, name, at }: { label: string; name: string | null; at: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12 }}>
      <span style={{ width: 100, color: "#78909c" }}>{label}:</span>
      <span style={{ fontWeight: name ? 600 : 400, color: name ? "#1a237e" : "#bdbdbd", flex: 1 }}>
        {name ?? "— not signed —"}
      </span>
      {at && <span style={{ color: "#78909c", fontSize: 11 }}>{new Date(at).toLocaleDateString()}</span>}
    </div>
  );
}

// ── VersionSidebar ─────────────────────────────────────────────────────────────

export type VersionEntry = {
  id: string;
  version: string;
  status: string;
  created_at: string;
  approved_by: string | null;
};

export function VersionSidebar({
  versions, selectedId, onSelect, label = "Version History",
}: {
  versions: VersionEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
}) {
  return (
    <div style={sty.versionList}>
      <div style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#546e7a", borderBottom: "1px solid #e0e0e0", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      {versions.length === 0 && (
        <div style={{ padding: "20px 14px", color: "#90a4ae", fontSize: 13 }}>No versions yet</div>
      )}
      {versions.map(v => {
        const m = STATUS_META[v.status] ?? STATUS_META.DRAFT;
        const isSelected = v.id === selectedId;
        return (
          <button key={v.id} onClick={() => onSelect(v.id)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "12px 14px", border: "none", cursor: "pointer",
            borderLeft: isSelected ? "3px solid #1a237e" : "3px solid transparent",
            background: isSelected ? "#e8eaf6" : "transparent",
            borderBottom: "1px solid #f5f5f5",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? "#1a237e" : "#37474f" }}>
                v{v.version}
              </span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: m.bg, color: m.color }}>
                {v.status.replace("_", " ")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#78909c", marginTop: 3 }}>
              {new Date(v.created_at).toLocaleDateString()}
              {v.approved_by && ` · ${v.approved_by}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── SectionsTab ────────────────────────────────────────────────────────────────

export function SectionsTab({ plan, onRefresh, readonly }: {
  plan: Plan;
  onRefresh: () => void;
  readonly: boolean;
}) {
  const [editing, setEditing]         = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName]       = useState("");
  const [editNum, setEditNum]         = useState("");
  const [saving, setSaving]           = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [newNum, setNewNum]           = useState("");
  const [newName, setNewName]         = useState("");
  const [newContent, setNewContent]   = useState("");

  async function saveSection(id: string) {
    setSaving(true);
    try {
      await api.plans.sections.update(id, {
        section_number: editNum, section_name: editName, content: editContent || null,
      });
      setEditing(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deleteSection(id: string, name: string) {
    if (!confirm(`Delete section "${name}"?`)) return;
    await api.plans.sections.delete(id);
    onRefresh();
  }

  async function addSection() {
    if (!newNum.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await api.plans.sections.add(plan.id, {
        section_number: newNum, section_name: newName,
        content: newContent || null, sort_order: plan.sections.length + 1,
      });
      setNewNum(""); setNewName(""); setNewContent(""); setShowAdd(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  return (
    <div>
      {!readonly && (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowAdd(v => !v)} style={sty.btnSecondary}>
            {showAdd ? "Cancel" : "+ Add Section"}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={{ ...sty.panel, marginBottom: 16, background: "#f3e5f5" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input value={newNum} onChange={e => setNewNum(e.target.value)}
              placeholder="§ No. (e.g. 4)" style={{ ...sty.input, width: 110 }} />
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Section name" style={{ ...sty.input, flex: 1 }} />
          </div>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="Content…" rows={4} style={sty.textarea} />
          <button onClick={addSection} disabled={saving || !newNum.trim() || !newName.trim()}
            style={{ ...sty.btn, marginTop: 8 }}>
            Add Section
          </button>
        </div>
      )}

      {plan.sections.map(s => (
        <div key={s.id} style={{ ...sty.panel, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: editing === s.id ? 10 : 0 }}>
            {editing === s.id ? (
              <input value={editNum} onChange={e => setEditNum(e.target.value)}
                style={{ ...sty.input, width: 70 }} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a237e", minWidth: 36 }}>
                §{s.section_number}
              </span>
            )}
            {editing === s.id ? (
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ ...sty.input, flex: 1 }} />
            ) : (
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{s.section_name}</span>
            )}
            {!readonly && (
              <div style={{ display: "flex", gap: 4 }}>
                {editing === s.id ? (
                  <>
                    <button onClick={() => saveSection(s.id)} disabled={saving} style={sty.btn}>Save</button>
                    <button onClick={() => setEditing(null)} style={sty.btnGhost}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button title="Edit section"
                      onClick={() => { setEditing(s.id); setEditNum(s.section_number); setEditName(s.section_name); setEditContent(s.content ?? ""); }}
                      style={sty.iconBtn}>✎</button>
                    <button title="Delete section"
                      onClick={() => deleteSection(s.id, s.section_name)}
                      style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
                  </>
                )}
              </div>
            )}
          </div>

          {editing === s.id ? (
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              rows={8} style={sty.textarea} placeholder="Section content…" />
          ) : (
            <div style={{ fontSize: 13, color: "#37474f", whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6, paddingTop: 6, borderTop: "1px solid #f0f0f0" }}>
              {s.content || <span style={{ color: "#bdbdbd", fontStyle: "italic" }}>No content yet</span>}
            </div>
          )}
        </div>
      ))}

      {plan.sections.length === 0 && (
        <div style={{ textAlign: "center", color: "#90a4ae", padding: "30px 0", fontSize: 13 }}>
          No sections. Default IEC 62304 sections are seeded automatically on plan creation.
        </div>
      )}
    </div>
  );
}

// ── ApprovalTab ────────────────────────────────────────────────────────────────

export type ComplianceResult = {
  is_ready_for_approval: boolean;
  checks: { rule: string; label: string; satisfied: boolean; detail: string }[];
};

export type TransitionPayload = {
  status: string;
  prepared_by?: string;
  reviewed_by?: string;
  approved_by?: string;
  review_notes?: string;
};

export type Signoff = {
  prepared_by: string | null; prepared_at: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
  review_notes: string | null;
  status: string;
};

export function ApprovalTab({ signoff, entityLabel, compliance, onTransition, onRefreshCompliance }: {
  signoff: Signoff;
  entityLabel: string;
  compliance: ComplianceResult | null;
  onTransition: (payload: TransitionPayload) => Promise<string[]>;
  onRefreshCompliance: () => void;
}) {
  const [preparedBy, setPreparedBy] = useState(signoff.prepared_by ?? "");
  const [reviewer, setReviewer]     = useState(signoff.reviewed_by ?? "");
  const [approver, setApprover]     = useState(signoff.approved_by ?? "");
  const [notes, setNotes]           = useState(signoff.review_notes ?? "");
  const [warnings, setWarnings]     = useState<string[]>([]);
  const m = STATUS_META[signoff.status] ?? STATUS_META.DRAFT;

  const FLOW = ["DRAFT", "IN_REVIEW", "APPROVED", "OBSOLETE"];
  const currentIdx = FLOW.indexOf(signoff.status);

  async function go(payload: TransitionPayload) {
    setWarnings([]);
    const w = await onTransition(payload);
    setWarnings(w);
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 380px" }}>
        <div style={sty.panel}>
          <div style={sty.panelTitle}>Approval Workflow</div>

          {/* Status stepper */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            {FLOW.map((s, i) => {
              const past = i < currentIdx;
              const curr = i === currentIdx;
              const sm   = STATUS_META[s] ?? STATUS_META.DRAFT;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    background: past || curr ? sm.bg : "#f5f5f5",
                    border: `2px solid ${curr ? sm.border : past ? sm.border : "#e0e0e0"}`,
                    color: past || curr ? sm.color : "#9e9e9e",
                  }}>
                    {past ? "✓" : i + 1}
                  </div>
                  <div style={{ marginLeft: 6, marginRight: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: curr ? 700 : 500, color: curr ? sm.color : "#78909c" }}>
                      {s.replace("_", " ")}
                    </div>
                  </div>
                  {i < FLOW.length - 1 && (
                    <div style={{ width: 24, height: 2, background: past ? "#a5d6a7" : "#e0e0e0", marginRight: 6 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current status */}
          <div style={{ padding: "10px 14px", borderRadius: 6, background: m.bg, border: `1px solid ${m.border}`, marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: m.color }}>
              Current: {signoff.status.replace("_", " ")}
            </span>
          </div>

          {/* Signoff trail */}
          <div style={{ ...sty.panel, padding: 12, marginBottom: 16, background: "#fafafa" }}>
            <div style={{ ...sty.panelTitle, marginBottom: 8 }}>Document Signoff</div>
            <SignoffRow label="Prepared by" name={signoff.prepared_by} at={signoff.prepared_at} />
            <SignoffRow label="Reviewed by" name={signoff.reviewed_by} at={signoff.reviewed_at} />
            <SignoffRow label="Approved by" name={signoff.approved_by} at={signoff.approved_at} />
          </div>

          {warnings.length > 0 && (
            <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: "#e65100", fontSize: 13 }}>
              ⚠ {warnings.join(" · ")}
            </div>
          )}

          {/* Action buttons */}
          {signoff.status === "DRAFT" && (
            <div>
              <label style={sty.label}>Prepared by</label>
              <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                placeholder="Author full name"
                style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" }} />
              <label style={sty.label}>Review Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Optional review notes…"
                style={{ ...sty.textarea, marginBottom: 10 }} />
              <button onClick={() => go({ status: "IN_REVIEW", prepared_by: preparedBy || undefined, review_notes: notes || undefined })}
                style={sty.btn}>
                Submit for Review →
              </button>
            </div>
          )}

          {signoff.status === "IN_REVIEW" && (
            <div>
              <label style={sty.label}>Reviewed by *</label>
              <input value={reviewer} onChange={e => setReviewer(e.target.value)}
                placeholder="Reviewer full name"
                style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" }} />
              <label style={sty.label}>Approved by *</label>
              <input value={approver} onChange={e => setApprover(e.target.value)}
                placeholder="Approver full name"
                style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" }} />
              <label style={sty.label}>Review Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Approval notes…"
                style={{ ...sty.textarea, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => go({ status: "APPROVED", reviewed_by: reviewer, approved_by: approver, review_notes: notes || undefined })}
                  disabled={!reviewer || !approver}
                  style={{ ...sty.btn, background: !reviewer || !approver ? "#9e9e9e" : "#1b5e20", cursor: !reviewer || !approver ? "not-allowed" : "pointer" }}>
                  ✓ Approve {entityLabel}
                </button>
                <button onClick={() => go({ status: "DRAFT", review_notes: notes || undefined })}
                  style={{ ...sty.btnSmall, background: "#ffebee", color: "#b71c1c", border: "1px solid #ef9a9a" }}>
                  ✗ Return to Draft
                </button>
              </div>
            </div>
          )}

          {signoff.status === "APPROVED" && (
            <button onClick={() => { if (confirm(`Mark this ${entityLabel} as obsolete?`)) go({ status: "OBSOLETE" }); }}
              style={{ ...sty.btnSmall, background: "#eceff1", color: "#546e7a" }}>
              → Mark Obsolete
            </button>
          )}
        </div>
      </div>

      {/* Compliance checklist */}
      <div style={{ flex: "1 1 260px" }}>
        <div style={sty.panel}>
          <div style={{ ...sty.panelTitle, justifyContent: "space-between" }}>
            Approval Checklist
            <button onClick={onRefreshCompliance} style={{ ...sty.btnGhost, padding: "3px 8px", fontSize: 11 }}>
              Refresh
            </button>
          </div>
          {!compliance ? (
            <div style={{ color: "#90a4ae", fontSize: 13 }}>Click Refresh to check</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                {compliance.is_ready_for_approval
                  ? <span style={{ color: "#1b5e20", fontWeight: 600, fontSize: 13 }}>✓ Ready for approval</span>
                  : <span style={{ color: "#b71c1c", fontWeight: 600, fontSize: 13 }}>✗ Not ready</span>}
              </div>
              {compliance.checks.map(c => (
                <div key={c.rule} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ color: c.satisfied ? "#1b5e20" : "#b71c1c", flexShrink: 0 }}>{c.satisfied ? "✓" : "✗"}</span>
                  <div>
                    <div style={{ fontWeight: 500, color: c.satisfied ? "#1b5e20" : "#b71c1c" }}>{c.label}</div>
                    <div style={{ color: "#78909c", fontSize: 11 }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PlanShell — full page for one plan type (mirrors SDP layout exactly) ──────

export type PlanShellTab<T extends string> = {
  id: T;
  label: (plan: Plan) => string;
  render: (plan: Plan, reload: () => void, readonly: boolean) => React.ReactNode;
};

export type PlanShellProps<T extends string> = {
  /** IEC 62304 plan type key, e.g. "MAINTENANCE" */
  planType: string;
  pageTitle: string;
  pageSubtitle: string;
  /** Short label for "Approve X" button, e.g. "Plan" or "SDP" */
  entityLabel: string;
  /** Extra tabs inserted between Overview and Approval (SDP uses Lifecycle, Roles) */
  extraTabs?: PlanShellTab<T>[];
  /** Slot for extra header-bar content beyond the built-in PDF button */
  headerExtra?: (plan: Plan, versions: PlanSummary[], projectName: string) => React.ReactNode;
  /** Slot for the Overview tab's right column cards */
  overviewRight?: (plan: Plan, reload: () => void, readonly: boolean) => React.ReactNode;
  /** Slot for the Create form (allows overriding default) */
  createForm?: (projectId: string, onCreated: () => void) => React.ReactNode;
};

function DefaultCreateForm({ projectId, planType, typeInfo, onCreated }: {
  projectId: string; planType: string; typeInfo: PlanTypeInfo | null; onCreated: () => void;
}) {
  const [sc, setSc]         = useState("C");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await api.plans.create({ project_id: projectId, plan_type: planType, safety_class: sc, created_by: author || null });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ ...sty.panel, maxWidth: 480 }}>
      <div style={sty.panelTitle}>
        Create {typeInfo?.label ?? planType}
        {typeInfo && <span style={{ marginLeft: 8, fontSize: 12, color: "#546e7a", fontWeight: 400 }}>IEC 62304 §{typeInfo.iec_clause}</span>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <label style={sty.label}>Safety Class</label>
          <select value={sc} onChange={e => setSc(e.target.value)} style={{ ...sty.input, width: 110 }}>
            <option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={sty.label}>Author</label>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name / role" style={{ ...sty.input, width: "100%" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#78909c", marginBottom: 10 }}>
        Default IEC 62304 sections will be seeded automatically.
      </div>
      <button onClick={create} disabled={saving} style={sty.btn}>
        {saving ? "Creating…" : `Create ${typeInfo?.label ?? planType}`}
      </button>
    </div>
  );
}

function OverviewTab({ plan, typeInfo, onUpdate, onFork, readonly, rightSlot }: {
  plan: Plan;
  typeInfo: PlanTypeInfo | null;
  onUpdate: (d: { title?: string; safety_class?: string; description?: string | null; created_by?: string | null }) => void;
  onFork: () => void;
  readonly: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [title, setTitle]   = useState(plan.title);
  const [desc, setDesc]     = useState(plan.description ?? "");
  const [sc, setSc]         = useState(plan.safety_class);
  const [author, setAuthor] = useState(plan.created_by ?? "");
  const [dirty, setDirty]   = useState(false);
  const m = STATUS_META[plan.status] ?? STATUS_META.DRAFT;

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 400px" }}>
        <div style={sty.panel}>
          <div style={sty.panelTitle}>Document Information</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {([
                ["Version",     `v${plan.version}`],
                ["Status",      <span key="s" style={{ padding: "2px 10px", borderRadius: 10, background: m.bg, color: m.color, fontSize: 12 }}>{plan.status.replace("_"," ")}</span>],
                ["IEC 62304",   plan.iec_clause ? `§${plan.iec_clause}` : "—"],
                ["Safety Class",<span key="c" style={{ fontWeight: 700, color: CLASS_COLOR[plan.safety_class] ?? "#333" }}>Class {plan.safety_class}</span>],
                ["Created by",  plan.created_by ?? "—"],
                ["Approved by", plan.approved_by ?? "—"],
                ["Approved at", plan.approved_at ? new Date(plan.approved_at).toLocaleString() : "—"],
                ["Created",     new Date(plan.created_at).toLocaleString()],
                ["Updated",     new Date(plan.updated_at).toLocaleString()],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "7px 0", color: "#546e7a", width: 140, fontWeight: 500 }}>{k}</td>
                  <td style={{ padding: "7px 0" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readonly && (
          <div style={{ ...sty.panel, marginTop: 16 }}>
            <div style={sty.panelTitle}>Edit Metadata</div>
            <label style={sty.label}>Document Title</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
              style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 110 }}>
                <label style={sty.label}>Safety Class</label>
                <select value={sc} onChange={e => { setSc(e.target.value); setDirty(true); }} style={{ ...sty.input, width: "100%" }}>
                  <option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Author</label>
                <input value={author} onChange={e => { setAuthor(e.target.value); setDirty(true); }}
                  style={{ ...sty.input, width: "100%" }} placeholder="Name / role" />
              </div>
            </div>
            <label style={sty.label}>Description / Purpose</label>
            <textarea value={desc} onChange={e => { setDesc(e.target.value); setDirty(true); }} rows={3} style={sty.textarea} />
            <button disabled={!dirty}
              onClick={() => { onUpdate({ title, safety_class: sc, description: desc || null, created_by: author || null }); setDirty(false); }}
              style={{ ...sty.btn, marginTop: 10, opacity: dirty ? 1 : 0.5 }}>
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 220px" }}>
        {rightSlot}
        {typeInfo && !rightSlot && (
          <div style={sty.panel}>
            <div style={sty.panelTitle}>IEC 62304 §{typeInfo.iec_clause}</div>
            <div style={{ fontSize: 12, color: "#546e7a", lineHeight: 1.8 }}>{typeInfo.description}</div>
          </div>
        )}
        <div style={{ ...sty.panel, marginTop: 12 }}>
          <div style={sty.panelTitle}>Versioning</div>
          <div style={{ fontSize: 12, color: "#546e7a", marginBottom: 10 }}>
            Approved plans cannot be edited. Fork to create a new version with all sections copied.
          </div>
          <button onClick={onFork} style={{ ...sty.btnSecondary, width: "100%" }}>
            Fork → New Version
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The main reusable shell ────────────────────────────────────────────────────

function PlanShellInner<T extends string>({
  planType, pageTitle, pageSubtitle, entityLabel,
  extraTabs = [], headerExtra, overviewRight, createForm,
}: PlanShellProps<T>) {
  const [activeProjectId] = useActiveProject();

  const [versions, setVersions]   = useState<PlanSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan]           = useState<Plan | null>(null);
  const [typeInfo, setTypeInfo]   = useState<PlanTypeInfo | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [tab, setTab]             = useState<string>("overview");
  const [loading, setLoading]     = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  // Fetch the type metadata and project name once
  useEffect(() => {
    api.plans.types().then(rows => {
      setTypeInfo(rows.find(r => r.key === planType) ?? null);
    }).catch(() => {});
  }, [planType]);

  useEffect(() => {
    if (!activeProjectId) { setProjectName(""); return; }
    api.projects.list()
      .then(ps => setProjectName(ps.find(p => p.id === activeProjectId)?.name ?? ""))
      .catch(() => setProjectName(""));
  }, [activeProjectId]);

  const loadVersions = useCallback(async () => {
    if (!activeProjectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const vs = await api.plans.list(activeProjectId, planType);
      setVersions(vs);
      if (vs.length > 0 && !selectedId) setSelectedId(vs[0].id);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [activeProjectId, planType, selectedId]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    setLoadingDetail(true);
    try {
      setPlan(await api.plans.get(selectedId));
      setCompliance(null);
    } finally { setLoadingDetail(false); }
  }, [selectedId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  useEffect(() => {
    const handler = () => { setSelectedId(null); setPlan(null); setVersions([]); };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);

  async function handleUpdate(d: Parameters<typeof api.plans.update>[1]) {
    if (!selectedId) return;
    await api.plans.update(selectedId, d);
    loadDetail();
  }

  async function handleFork() {
    if (!selectedId) return;
    try {
      const forked = await api.plans.fork(selectedId);
      setSelectedId(null);
      await loadVersions();
      setSelectedId(forked.id);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
  }

  async function handleTransition(payload: TransitionPayload): Promise<string[]> {
    if (!selectedId) return [];
    try {
      const result = await api.plans.transition(selectedId, {
        status: payload.status as PlanStatus,
        prepared_by: payload.prepared_by ?? null,
        reviewed_by: payload.reviewed_by ?? null,
        approved_by: payload.approved_by ?? null,
        review_notes: payload.review_notes ?? null,
      });
      await loadVersions();
      loadDetail();
      return result.warnings ?? [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const match = msg.match(/\d+: ([\s\S]*)/);
      try { alert(JSON.parse(match?.[1] ?? "{}").detail ?? msg); } catch { alert(msg); }
      return [];
    }
  }

  const readonly = plan ? !["DRAFT", "IN_REVIEW"].includes(plan.status) : true;

  const allTabs = [
    { id: "overview", label: () => "Overview" },
    { id: "sections", label: (p: Plan) => `Sections (${p.sections.length})` },
    ...extraTabs.map(t => ({ id: t.id, label: (p: Plan) => t.label(p) })),
    { id: "approval", label: () => "Approval" },
  ];

  if (!activeProjectId) {
    return (
      <div style={sty.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 600 }}>No project selected</div>
        <div style={{ color: "#78909c", marginTop: 4 }}>Select a project from the sidebar.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>{pageTitle}</h1>
          <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>{pageSubtitle}</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} style={sty.btn}>
          {showCreate ? "Cancel" : `+ New ${entityLabel}`}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {showCreate && (
        <div style={{ marginBottom: 20 }}>
          {createForm
            ? createForm(activeProjectId, () => { setShowCreate(false); setSelectedId(null); loadVersions(); })
            : <DefaultCreateForm projectId={activeProjectId} planType={planType} typeInfo={typeInfo}
                onCreated={() => { setShowCreate(false); setSelectedId(null); loadVersions(); }} />}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : versions.length === 0 && !showCreate ? (
        <div style={sty.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600 }}>{pageTitle} not started</div>
          <div style={{ color: "#78909c", marginTop: 4, fontSize: 13 }}>
            {typeInfo ? `IEC 62304 §${typeInfo.iec_clause} — ${typeInfo.description}` : pageSubtitle}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ ...sty.btn, marginTop: 16 }}>
            Create First Version
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
          {/* Version sidebar */}
          <VersionSidebar
            versions={versions}
            selectedId={selectedId}
            onSelect={id => { setSelectedId(id); setTab("overview"); }}
          />

          {/* Detail pane */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loadingDetail ? (
              <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
            ) : plan ? (
              <>
                {/* Header bar */}
                <div style={{
                  padding: "14px 18px", background: "#fff",
                  border: "1px solid #e0e0e0", borderRadius: "0 8px 0 0", borderBottom: "none",
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: "#1a237e" }}>v{plan.version}</span>
                  <span style={{
                    padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: (STATUS_META[plan.status] ?? STATUS_META.DRAFT).bg,
                    color: (STATUS_META[plan.status] ?? STATUS_META.DRAFT).color,
                  }}>
                    {plan.status.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 13, color: "#546e7a" }}>{plan.title}</span>
                  <span style={{ fontSize: 12, color: CLASS_COLOR[plan.safety_class] ?? "#333", fontWeight: 700, marginLeft: "auto" }}>
                    Class {plan.safety_class}{plan.iec_clause && ` · §${plan.iec_clause}`}
                  </span>
                  {readonly && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fff3e0", color: "#e65100", border: "1px solid #ffcc80" }}>
                      Read-only
                    </span>
                  )}
                  {/* Built-in PDF button — same position as SDP */}
                  <button
                    onClick={() => downloadPlanPdf(plan, projectName, versions)}
                    title="Open print dialog to save this plan as PDF"
                    style={{
                      padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: "#fff", color: "#4a148c",
                      border: "1px solid #ce93d8", borderRadius: 6,
                    }}
                  >
                    ⬇ PDF
                  </button>
                  {headerExtra?.(plan, versions, projectName)}
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", background: "#fff", border: "1px solid #e0e0e0", borderTop: "none", borderBottom: "none" }}>
                  {allTabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                      ...sty.tabBtn,
                      borderBottom: tab === t.id ? "2px solid #1a237e" : "2px solid transparent",
                      color: tab === t.id ? "#1a237e" : "#546e7a",
                      fontWeight: tab === t.id ? 600 : 400,
                    }}>
                      {t.label(plan)}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 18 }}>
                  {tab === "overview" && (
                    <OverviewTab
                      plan={plan} typeInfo={typeInfo}
                      onUpdate={handleUpdate} onFork={handleFork} readonly={readonly}
                      rightSlot={overviewRight?.(plan, loadDetail, readonly)}
                    />
                  )}
                  {tab === "sections" && (
                    <SectionsTab plan={plan} onRefresh={loadDetail} readonly={readonly} />
                  )}
                  {extraTabs.map(t => tab === t.id && (
                    <div key={t.id}>{t.render(plan, loadDetail, readonly)}</div>
                  ))}
                  {tab === "approval" && (
                    <ApprovalTab
                      signoff={plan} entityLabel={entityLabel}
                      compliance={compliance}
                      onTransition={handleTransition}
                      onRefreshCompliance={async () => {
                        if (selectedId) setCompliance(await api.plans.compliance(selectedId));
                      }}
                    />
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#78909c", border: "1px solid #e0e0e0", borderRadius: "0 0 8px 8px" }}>
                Select a version from the left
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanShell<T extends string = never>(props: PlanShellProps<T>) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>}>
      <PlanShellInner {...props} />
    </Suspense>
  );
}
