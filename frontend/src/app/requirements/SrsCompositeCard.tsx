"use client";
/**
 * Composite SRS card.
 *
 * Renders the top-level "release manifest" SRS — the version that bundles
 * approved per-category baselines and goes through its own approval flow.
 * Shows the manifest pins (which category-baseline versions are included),
 * the workflow buttons, and opens the re-pin modal when the user wants to
 * change which category versions are pinned.
 *
 * Approving a composite requires every pinned category baseline to already
 * be APPROVED — the backend enforces this and the UI surfaces the error
 * clearly.
 */
import { useState } from "react";
import {
  api, CompositeBaselineSummary, CompositeBaseline,
  RequirementCategoryBaselineSummary, ReqBaselineStatus,
} from "@/lib/api";
import SrsRepinModal from "./SrsRepinModal";

const STATUS_COLOR: Record<ReqBaselineStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "#eceff1", fg: "#546e7a" },
  IN_REVIEW: { bg: "#fff3e0", fg: "#e65100" },
  APPROVED:  { bg: "#e8f5e9", fg: "#1b5e20" },
  OBSOLETE:  { bg: "#f5f5f5", fg: "#9e9e9e" },
};

type Props = {
  projectId: string;
  /** Detailed composite baselines (with components inlined). Newest first. */
  composites: CompositeBaseline[];
  /** Lightweight summaries (used as fallback when no detail loaded). */
  composite_summaries: CompositeBaselineSummary[];
  /** All category baselines for the project — used by the re-pin modal. */
  allCategoryBaselines: RequirementCategoryBaselineSummary[];
  onMutated: () => void;
};

export default function SrsCompositeCard({
  projectId, composites, composite_summaries, allCategoryBaselines, onMutated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showRepin, setShowRepin] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");

  const current = composites[0] ?? null;       // most-recent composite (any status)
  const draft = composites.find(c => c.status === "DRAFT" || c.status === "IN_REVIEW");
  const latestApproved = composites.find(c => c.status === "APPROVED");

  function reset() {
    setShowSubmit(false); setShowApprove(false);
    setPreparedBy(""); setReviewedBy(""); setApprovedBy("");
    setError(""); setWarnings([]);
  }

  async function callTransition(id: string, payload: Parameters<typeof api.requirements.baselines.transition>[1]) {
    setBusy(true); setError(""); setWarnings([]);
    try {
      const r = await api.requirements.baselines.transition(id, payload);
      setWarnings(r.warnings ?? []);
      reset();
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fork(id: string) {
    if (!window.confirm("Fork the composite SRS to a new DRAFT?\nThe new draft will start with the same component pinning.")) return;
    setBusy(true); setError("");
    try {
      await api.requirements.baselines.fork(id);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createInitial() {
    setBusy(true); setError("");
    try {
      await api.requirements.baselines.create({ project_id: projectId, version: "1.0", category_baseline_ids: [] });
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#1a237e", fontSize: 14 }}>Composite SRS</span>
          {current ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>v{current.version}</span>
              <span style={{ ...statusBadge(current.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {current.status}
              </span>
              <span style={styles.meta}>{current.components.length} category(ies) pinned</span>
              {composite_summaries.length >= 1 && (
                <button onClick={() => setShowHistory(h => !h)} style={styles.btnSubtle}>
                  {showHistory ? "▾" : "▸"} History ({composite_summaries.length})
                </button>
              )}
            </>
          ) : (
            <span style={styles.meta}>— no composite SRS yet —</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!current && (
            <button onClick={createInitial} disabled={busy} style={styles.btnPrimary}>
              Create v1.0 (DRAFT)
            </button>
          )}
          {draft?.status === "DRAFT" && !showSubmit && (
            <>
              <button onClick={() => setShowRepin(true)} disabled={busy} style={styles.btn}>
                Re-pin manifest…
              </button>
              <button onClick={() => { setShowSubmit(true); setPreparedBy(draft.prepared_by ?? ""); }} disabled={busy} style={styles.btn}>
                Submit v{draft.version} for review
              </button>
            </>
          )}
          {draft?.status === "IN_REVIEW" && !showApprove && (
            <>
              <button onClick={() => { setShowApprove(true); setReviewedBy(draft.reviewed_by ?? ""); setApprovedBy(draft.approved_by ?? ""); }} disabled={busy} style={styles.btnPrimary}>
                Approve v{draft.version}
              </button>
              <button onClick={() => callTransition(draft.id, { status: "DRAFT" })} disabled={busy} style={styles.btnSubtle}>
                Return to DRAFT
              </button>
            </>
          )}
          {latestApproved && !draft && (
            <button onClick={() => fork(latestApproved.id)} disabled={busy} style={styles.btn}>
              Fork to new DRAFT
            </button>
          )}
        </div>
      </div>

      {/* Manifest pinning view */}
      {current && current.components.length > 0 && (
        <div style={styles.manifest}>
          <div style={{ fontSize: 11, color: "#78909c", fontWeight: 600, marginBottom: 4 }}>
            Manifest pins
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {current.components.map(c => (
              <span key={c.id} style={pinChip(c.category_baseline.status)}>
                {c.category_baseline.category_name}@v{c.category_baseline.version}
                {" "}
                <span style={{ opacity: 0.7, fontSize: 10 }}>{c.category_baseline.status}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signoff trail */}
      {current && (
        <div style={styles.signoffPanel}>
          <SignoffRow label="Prepared by" name={current.prepared_by} at={current.prepared_at} />
          <SignoffRow label="Reviewed by" name={current.reviewed_by} at={current.reviewed_at} />
          <SignoffRow label="Approved by" name={current.approved_by} at={current.approved_at} />
        </div>
      )}

      {/* Submit-for-review form */}
      {showSubmit && draft && (
        <div style={styles.formPanel}>
          <div style={styles.formTitle}>Submit composite SRS v{draft.version} for review</div>
          <label style={styles.label}>Prepared by</label>
          <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Author full name" style={styles.input} />
          <div style={styles.formActions}>
            <button onClick={() => callTransition(draft.id, { status: "IN_REVIEW", prepared_by: preparedBy || undefined })} disabled={busy} style={styles.btnPrimary}>Submit</button>
            <button onClick={reset} style={styles.btnSubtle}>Cancel</button>
          </div>
        </div>
      )}

      {/* Approve form */}
      {showApprove && draft && (
        <div style={styles.formPanel}>
          <div style={styles.formTitle}>Approve composite SRS v{draft.version}</div>
          <div style={{ fontSize: 11, color: "#78909c", marginBottom: 6 }}>
            Backend rejects approval if any pinned category baseline is not yet APPROVED.
          </div>
          <label style={styles.label}>Reviewed by *</label>
          <input value={reviewedBy} onChange={e => setReviewedBy(e.target.value)} placeholder="Reviewer full name" style={styles.input} />
          <label style={styles.label}>Approved by *</label>
          <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Approver full name" style={styles.input} />
          <div style={styles.formActions}>
            <button
              onClick={() => callTransition(draft.id, { status: "APPROVED", reviewed_by: reviewedBy, approved_by: approvedBy })}
              disabled={busy || !reviewedBy || !approvedBy}
              style={{ ...styles.btnPrimary, background: "#1b5e20", opacity: !reviewedBy || !approvedBy ? 0.5 : 1 }}
            >
              ✓ Release composite SRS
            </button>
            <button onClick={reset} style={styles.btnSubtle}>Cancel</button>
          </div>
        </div>
      )}

      {warnings.length > 0 && <div style={styles.warnBanner}>⚠ {warnings.join(" · ")}</div>}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {showHistory && composite_summaries.length > 0 && (
        <div style={styles.historyPanel}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.historyTh}>Version</th>
                <th style={styles.historyTh}>Status</th>
                <th style={styles.historyTh}>Prepared by</th>
                <th style={styles.historyTh}>Reviewed by</th>
                <th style={styles.historyTh}>Approved by</th>
                <th style={styles.historyTh}>Components</th>
                <th style={styles.historyTh}>Created</th>
              </tr>
            </thead>
            <tbody>
              {composite_summaries.map(s => (
                <tr key={s.id}>
                  <td style={styles.historyTd}><strong>v{s.version}</strong></td>
                  <td style={styles.historyTd}>
                    <span style={{ ...statusBadge(s.status), padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{s.status}</span>
                  </td>
                  <td style={styles.historyTd}>{s.prepared_by ?? "—"}</td>
                  <td style={styles.historyTd}>{s.reviewed_by ?? "—"}</td>
                  <td style={styles.historyTd}>{s.approved_by ?? "—"}</td>
                  <td style={styles.historyTd}>{s.component_count}</td>
                  <td style={styles.historyTd}>{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRepin && draft && (
        <SrsRepinModal
          composite={draft}
          allCategoryBaselines={allCategoryBaselines}
          onClose={() => setShowRepin(false)}
          onSaved={() => { setShowRepin(false); onMutated(); }}
        />
      )}
    </div>
  );
}

function SignoffRow({ label, name, at }: { label: string; name: string | null; at: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0", fontSize: 12 }}>
      <span style={{ width: 90, color: "#78909c" }}>{label}:</span>
      <span style={{ fontWeight: name ? 600 : 400, color: name ? "#1a237e" : "#bdbdbd", flex: 1 }}>
        {name ?? "— not signed —"}
      </span>
      {at && <span style={{ color: "#78909c", fontSize: 11 }}>{new Date(at).toLocaleDateString()}</span>}
    </div>
  );
}

function statusBadge(status: ReqBaselineStatus) {
  const c = STATUS_COLOR[status];
  return { background: c.bg, color: c.fg };
}

function pinChip(status: ReqBaselineStatus): React.CSSProperties {
  const c = STATUS_COLOR[status];
  return {
    background: c.bg, color: c.fg,
    border: `1px solid ${c.fg}33`,
    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
  };
}

const styles = {
  wrap: { background: "#fff", border: "1px solid #c5cae9", borderRadius: 8, padding: "10px 14px", marginBottom: 10, borderLeft: "4px solid #1a237e" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 } as React.CSSProperties,
  meta: { fontSize: 12, color: "#78909c" } as React.CSSProperties,
  manifest: { marginTop: 8, padding: "8px 10px", background: "#f5faff", border: "1px solid #c5cae9", borderRadius: 6 } as React.CSSProperties,
  btn: { background: "#fff", color: "#1a237e", border: "1px solid #c5cae9", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  btnPrimary: { background: "#1a237e", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  btnSubtle: { background: "transparent", color: "#546e7a", border: "1px solid #cfd8dc", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
  signoffPanel: { marginTop: 8, padding: "6px 10px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  formPanel: { marginTop: 8, padding: "8px 10px", background: "#f5faff", border: "1px solid #c5cae9", borderRadius: 6 } as React.CSSProperties,
  formTitle: { fontWeight: 700, fontSize: 13, color: "#1a237e", marginBottom: 4 } as React.CSSProperties,
  formActions: { display: "flex", gap: 6, marginTop: 6 } as React.CSSProperties,
  label: { fontSize: 11, color: "#546e7a", fontWeight: 600, display: "block", marginTop: 4, marginBottom: 2 } as React.CSSProperties,
  input: { width: "100%", padding: "5px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 12, boxSizing: "border-box" } as React.CSSProperties,
  warnBanner: { marginTop: 8, padding: "6px 10px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, color: "#e65100", fontSize: 12 } as React.CSSProperties,
  errorBanner: { marginTop: 8, padding: "6px 10px", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 6, color: "#b71c1c", fontSize: 12 } as React.CSSProperties,
  historyPanel: { marginTop: 8, padding: "8px 10px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  historyTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 } as React.CSSProperties,
  historyTh: { background: "#eceff1", color: "#37474f", padding: "4px 6px", textAlign: "left" as const, border: "1px solid #cfd8dc", fontWeight: 600 } as React.CSSProperties,
  historyTd: { padding: "3px 6px", border: "1px solid #eceff1" } as React.CSSProperties,
};
