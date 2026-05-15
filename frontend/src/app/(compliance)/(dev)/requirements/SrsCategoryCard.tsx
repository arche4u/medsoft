"use client";
/**
 * Per-category SRS baseline card.
 *
 * Shows the current state of one requirement category (USER/SYSTEM/SOFTWARE/
 * custom): its latest baseline version + status, the prepared/reviewed/
 * approved signoff trail, lock state, and the workflow buttons (submit for
 * review, approve, fork, mark obsolete). One of these renders per category
 * in `SrsBaselineBar`.
 */
import { useState } from "react";
import {
  api, RequirementCategoryBaselineSummary, CategoryLockEntry, ReqBaselineStatus,
} from "@/lib/api";

const STATUS_COLOR: Record<ReqBaselineStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "#eceff1", fg: "#546e7a" },
  IN_REVIEW: { bg: "#fff3e0", fg: "#e65100" },
  APPROVED:  { bg: "#e8f5e9", fg: "#1b5e20" },
  OBSOLETE:  { bg: "#f5f5f5", fg: "#9e9e9e" },
};

type Props = {
  projectId: string;
  /** Raw category name (e.g. "USER", "SYSTEM", "REGULATORY"). */
  category: string;
  /** Display label from the project's category definition. */
  categoryLabel: string;
  /** Hex color from the project's category definition. */
  categoryColor: string;
  /** All baselines for this category (newest first). */
  baselines: RequirementCategoryBaselineSummary[];
  lock?: CategoryLockEntry;
  onMutated: () => void;
  onOpenSnapshot: (baselineId: string) => void;
};

export default function SrsCategoryCard({
  projectId, category, categoryLabel, categoryColor, baselines, lock, onMutated, onOpenSnapshot,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");

  const current = baselines[0];                     // most recent for this category
  const draft = baselines.find(b => b.status === "DRAFT" || b.status === "IN_REVIEW");
  const latestApproved = baselines.find(b => b.status === "APPROVED");
  const color = categoryColor;

  function reset() {
    setShowSubmit(false); setShowApprove(false);
    setPreparedBy(""); setReviewedBy(""); setApprovedBy("");
    setWarnings([]); setError("");
  }

  async function callTransition(id: string, payload: Parameters<typeof api.requirements.categoryBaselines.transition>[1]) {
    setBusy(true); setError(""); setWarnings([]);
    try {
      const r = await api.requirements.categoryBaselines.transition(id, payload);
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
    if (!window.confirm(`Fork ${category} approved baseline → new DRAFT?\n\n${category} requirements will become editable again.`)) return;
    setBusy(true); setError("");
    try {
      await api.requirements.categoryBaselines.fork(id);
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
      await api.requirements.categoryBaselines.create({
        project_id: projectId, category_name: category, version: "1.0",
      });
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...styles.wrap, borderLeft: `4px solid ${color}` }}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color, fontSize: 13 }}>{categoryLabel}</span>
          {current ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 14 }}>v{current.version}</span>
              <span style={{ ...statusBadge(current.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {current.status}
              </span>
              <span style={styles.meta}>{current.item_count} req(s) frozen</span>
              {baselines.length >= 1 && (
                <button onClick={() => setShowHistory(h => !h)} style={styles.btnSubtle}>
                  {showHistory ? "▾" : "▸"} History ({baselines.length})
                </button>
              )}
            </>
          ) : (
            <span style={styles.meta}>— no baseline yet —</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!current && (
            <button onClick={createInitial} disabled={busy} style={styles.btnPrimary}>
              Create v1.0 (DRAFT)
            </button>
          )}
          {draft?.status === "DRAFT" && !showSubmit && (
            <button onClick={() => { setShowSubmit(true); setPreparedBy(draft.prepared_by ?? ""); }} disabled={busy} style={styles.btn}>
              Submit v{draft.version} for review
            </button>
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
          <div style={styles.formTitle}>Submit {category} v{draft.version} for review</div>
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
          <div style={styles.formTitle}>Approve {category} v{draft.version}</div>
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
              ✓ Approve and lock {category}
            </button>
            <button onClick={reset} style={styles.btnSubtle}>Cancel</button>
          </div>
        </div>
      )}

      {warnings.length > 0 && <div style={styles.warnBanner}>⚠ {warnings.join(" · ")}</div>}
      {lock?.is_locked && (
        <div style={styles.lockBanner}>
          🔒 {category} requirements locked by v{lock.locked_by_version}. Fork to edit.
        </div>
      )}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {showHistory && baselines.length > 0 && (
        <div style={styles.historyPanel}>
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={styles.historyTh}>Version</th>
                <th style={styles.historyTh}>Status</th>
                <th style={styles.historyTh}>Prepared by</th>
                <th style={styles.historyTh}>Reviewed by</th>
                <th style={styles.historyTh}>Approved by</th>
                <th style={styles.historyTh}>Items</th>
                <th style={styles.historyTh}>Created</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map(b => (
                <tr key={b.id} onClick={() => onOpenSnapshot(b.id)} style={{ cursor: "pointer" }} title="View this snapshot">
                  <td style={styles.historyTd}>▸ <strong>v{b.version}</strong></td>
                  <td style={styles.historyTd}>
                    <span style={{ ...statusBadge(b.status), padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{b.status}</span>
                  </td>
                  <td style={styles.historyTd}>{b.prepared_by ?? "—"}</td>
                  <td style={styles.historyTd}>{b.reviewed_by ?? "—"}</td>
                  <td style={styles.historyTd}>{b.approved_by ?? "—"}</td>
                  <td style={styles.historyTd}>{b.item_count}</td>
                  <td style={styles.historyTd}>{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

const styles = {
  wrap: { background: "#fff", border: "1px solid #cfd8dc", borderRadius: 6, padding: "8px 12px", marginBottom: 8 } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 } as React.CSSProperties,
  meta: { fontSize: 11, color: "#78909c" } as React.CSSProperties,
  btn: { background: "#fff", color: "#1a237e", border: "1px solid #c5cae9", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  btnPrimary: { background: "#1a237e", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  btnSubtle: { background: "transparent", color: "#546e7a", border: "1px solid #cfd8dc", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 } as React.CSSProperties,
  signoffPanel: { marginTop: 8, padding: "6px 10px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  formPanel: { marginTop: 8, padding: "8px 10px", background: "#f5faff", border: "1px solid #c5cae9", borderRadius: 6 } as React.CSSProperties,
  formTitle: { fontWeight: 700, fontSize: 12, color: "#1a237e", marginBottom: 4 } as React.CSSProperties,
  formActions: { display: "flex", gap: 6, marginTop: 6 } as React.CSSProperties,
  label: { fontSize: 10, color: "#546e7a", fontWeight: 600, display: "block", marginTop: 4, marginBottom: 2 } as React.CSSProperties,
  input: { width: "100%", padding: "5px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 12, boxSizing: "border-box" } as React.CSSProperties,
  warnBanner: { marginTop: 8, padding: "6px 10px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, color: "#e65100", fontSize: 12 } as React.CSSProperties,
  lockBanner: { marginTop: 8, padding: "6px 10px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, color: "#e65100", fontSize: 12 } as React.CSSProperties,
  errorBanner: { marginTop: 8, padding: "6px 10px", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 6, color: "#b71c1c", fontSize: 12 } as React.CSSProperties,
  historyPanel: { marginTop: 8, padding: "8px 10px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  historyTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 } as React.CSSProperties,
  historyTh: { background: "#eceff1", color: "#37474f", padding: "4px 6px", textAlign: "left" as const, border: "1px solid #cfd8dc", fontWeight: 600 } as React.CSSProperties,
  historyTd: { padding: "3px 6px", border: "1px solid #eceff1" } as React.CSSProperties,
};
