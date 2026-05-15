"use client";
/**
 * Architecture baseline bar (IEC 62304 §5.3).
 *
 * Sits at the top of the /architecture page. Mirrors the SrsCompositeCard
 * pattern: version + status badges, prepared/reviewed/approved signoff
 * trail, history toggle, workflow buttons (Submit / Approve / Fork), lock
 * banner. Refs hold the parent-supplied callbacks so the polling effect
 * has a stable identity (same pattern as SrsBaselineBar).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api, ArchitectureBaseline, ArchitectureBaselineSummary,
  ArchitectureLockState, ArchBaselineStatus,
} from "@/lib/api";

const STATUS_COLOR: Record<ArchBaselineStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "#eceff1", fg: "#546e7a" },
  IN_REVIEW: { bg: "#fff3e0", fg: "#e65100" },
  APPROVED:  { bg: "#e8f5e9", fg: "#1b5e20" },
  OBSOLETE:  { bg: "#f5f5f5", fg: "#9e9e9e" },
};

type Props = {
  projectId: string;
  projectName?: string;
  /** Bump to force a refetch — e.g. after the page adds/edits a component. */
  reloadKey?: number;
  onLockChange?: (state: ArchitectureLockState | null) => void;
  onState?: (s: {
    baselines: ArchitectureBaselineSummary[];
    detail: ArchitectureBaseline | null;
    lock: ArchitectureLockState | null;
  }) => void;
  onMutated?: () => void;
  /**
   * Fires when a row in the history table is clicked. Pass the full baseline
   * detail (so the page can show the frozen snapshot in the tree, interfaces,
   * and PDF). Fires with `null` when the user clicks "Back to current".
   */
  onSnapshotView?: (snapshot: ArchitectureBaseline | null) => void;
};

export default function ArchitectureBaselineBar({
  projectId, projectName, reloadKey, onLockChange, onState, onMutated, onSnapshotView,
}: Props) {
  const [summaries, setSummaries] = useState<ArchitectureBaselineSummary[]>([]);
  const [current, setCurrent] = useState<ArchitectureBaseline | null>(null);
  const [lock, setLock] = useState<ArchitectureLockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingBusy, setViewingBusy] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");

  const onLockChangeRef = useRef(onLockChange);
  const onStateRef = useRef(onState);
  const onMutatedRef = useRef(onMutated);
  const onSnapshotViewRef = useRef(onSnapshotView);
  useEffect(() => {
    onLockChangeRef.current = onLockChange;
    onStateRef.current = onState;
    onMutatedRef.current = onMutated;
    onSnapshotViewRef.current = onSnapshotView;
  });

  async function selectSnapshot(summary: ArchitectureBaselineSummary) {
    if (viewingId === summary.id) {
      setViewingId(null);
      onSnapshotViewRef.current?.(null);
      return;
    }
    setViewingBusy(true); setError("");
    try {
      const detail = await api.architecture.baselines.get(summary.id);
      setViewingId(summary.id);
      onSnapshotViewRef.current?.(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewingBusy(false);
    }
  }

  function backToCurrent() {
    setViewingId(null);
    onSnapshotViewRef.current?.(null);
  }

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const [list, lk] = await Promise.all([
        api.architecture.baselines.list(projectId),
        api.architecture.baselines.lockState(projectId),
      ]);
      setSummaries(list);
      setLock(lk);
      const target = list.find(b => b.status === "DRAFT" || b.status === "IN_REVIEW")
        ?? list.find(b => b.status === "APPROVED")
        ?? list[0];
      const detail = target ? await api.architecture.baselines.get(target.id) : null;
      setCurrent(detail);
      onLockChangeRef.current?.(lk);
      onStateRef.current?.({ baselines: list, detail, lock: lk });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, reloadKey]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!projectId) return null;

  const draft = current?.status === "DRAFT" || current?.status === "IN_REVIEW" ? current : null;
  const approved = current?.status === "APPROVED" ? current : null;

  function reset() {
    setShowSubmit(false); setShowApprove(false);
    setPreparedBy(""); setReviewedBy(""); setApprovedBy("");
    setError(""); setWarnings([]);
  }

  async function callTransition(id: string, payload: Parameters<typeof api.architecture.baselines.transition>[1]) {
    setBusy(true); setError(""); setWarnings([]);
    try {
      const r = await api.architecture.baselines.transition(id, payload);
      setWarnings(r.warnings ?? []);
      reset();
      await refresh();
      onMutatedRef.current?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fork(id: string) {
    if (!window.confirm("Fork architecture baseline to a new DRAFT? Live architecture becomes editable again.")) return;
    setBusy(true); setError("");
    try {
      await api.architecture.baselines.fork(id);
      await refresh();
      onMutatedRef.current?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createInitial() {
    setBusy(true); setError("");
    try {
      await api.architecture.baselines.create({ project_id: projectId, version: "1.0" });
      await refresh();
      onMutatedRef.current?.();
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
          <span style={{ fontWeight: 700, color: "#0d47a1", fontSize: 13 }}>
            Software Architecture Document
          </span>
          {current ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>v{current.version}</span>
              <span style={{ ...statusBadge(current.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {current.status}
              </span>
              <span style={styles.meta}>
                {current.components.length} component(s) · {current.interfaces.length} interface(s)
              </span>
              {summaries.length >= 1 && (
                <button onClick={() => setShowHistory(h => !h)} style={styles.btnSubtle}>
                  {showHistory ? "▾" : "▸"} History ({summaries.length})
                </button>
              )}
              {viewingId && (
                <button onClick={backToCurrent} disabled={viewingBusy} style={{ ...styles.btnSubtle, color: "#0d47a1", border: "1px solid #0d47a1" }}>
                  ← Back to current
                </button>
              )}
            </>
          ) : (
            <span style={styles.meta}>— no architecture baseline yet —</span>
          )}
          {projectName && (
            <span style={{ ...styles.meta, marginLeft: "auto" }}>{projectName}</span>
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
              <button
                onClick={() => { setShowApprove(true); setReviewedBy(draft.reviewed_by ?? ""); setApprovedBy(draft.approved_by ?? ""); }}
                disabled={busy} style={styles.btnPrimary}
              >
                Approve v{draft.version}
              </button>
              <button onClick={() => callTransition(draft.id, { status: "DRAFT" })} disabled={busy} style={styles.btnSubtle}>
                Return to DRAFT
              </button>
            </>
          )}
          {approved && (
            <button onClick={() => fork(approved.id)} disabled={busy} style={styles.btn}>
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
          <div style={styles.formTitle}>Submit Architecture v{draft.version} for review</div>
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
          <div style={styles.formTitle}>Approve Architecture v{draft.version}</div>
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
              ✓ Approve and lock architecture
            </button>
            <button onClick={reset} style={styles.btnSubtle}>Cancel</button>
          </div>
        </div>
      )}

      {warnings.length > 0 && <div style={styles.warnBanner}>⚠ {warnings.join(" · ")}</div>}
      {lock?.is_locked && (
        <div style={styles.lockBanner}>
          🔒 Architecture locked by approved baseline v{lock.locked_by_version}. Fork to a new draft to edit components, interfaces, or data flows.
        </div>
      )}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {showHistory && summaries.length > 0 && (
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
                <th style={styles.historyTh}>Interfaces</th>
                <th style={styles.historyTh}>Created</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => {
                const selected = viewingId === s.id;
                return (
                  <tr
                    key={s.id}
                    onClick={() => !viewingBusy && selectSnapshot(s)}
                    title={selected ? "Click again to return to current" : "View this version's snapshot in tree, interfaces, diagrams, and PDF"}
                    style={{
                      cursor: viewingBusy ? "wait" : "pointer",
                      background: selected ? "#e3f2fd" : "transparent",
                    }}
                  >
                    <td style={styles.historyTd}>
                      {selected && <span style={{ color: "#0d47a1", marginRight: 4 }}>▸</span>}
                      <strong>v{s.version}</strong>
                    </td>
                    <td style={styles.historyTd}>
                      <span style={{ ...statusBadge(s.status), padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{s.status}</span>
                    </td>
                    <td style={styles.historyTd}>{s.prepared_by ?? "—"}</td>
                    <td style={styles.historyTd}>{s.reviewed_by ?? "—"}</td>
                    <td style={styles.historyTd}>{s.approved_by ?? "—"}</td>
                    <td style={styles.historyTd}>{s.component_count}</td>
                    <td style={styles.historyTd}>{s.interface_count}</td>
                    <td style={styles.historyTd}>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
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
      <span style={{ width: 100, color: "#78909c" }}>{label}:</span>
      <span style={{ fontWeight: name ? 600 : 400, color: name ? "#1a237e" : "#bdbdbd", flex: 1 }}>
        {name ?? "— not signed —"}
      </span>
      {at && <span style={{ color: "#78909c", fontSize: 11 }}>{new Date(at).toLocaleDateString()}</span>}
    </div>
  );
}

function statusBadge(status: ArchBaselineStatus) {
  const c = STATUS_COLOR[status];
  return { background: c.bg, color: c.fg };
}

const styles = {
  wrap: { background: "#fff", border: "1px solid #c5cae9", borderRadius: 8, padding: "10px 14px", marginBottom: 14, borderLeft: "4px solid #0d47a1" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 } as React.CSSProperties,
  meta: { fontSize: 12, color: "#78909c" } as React.CSSProperties,
  btn: { background: "#fff", color: "#0d47a1", border: "1px solid #c5cae9", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  btnPrimary: { background: "#0d47a1", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  btnSubtle: { background: "transparent", color: "#546e7a", border: "1px solid #cfd8dc", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
  signoffPanel: { marginTop: 10, padding: "8px 12px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  formPanel: { marginTop: 10, padding: "10px 12px", background: "#f5faff", border: "1px solid #c5cae9", borderRadius: 6 } as React.CSSProperties,
  formTitle: { fontWeight: 700, fontSize: 13, color: "#0d47a1", marginBottom: 6 } as React.CSSProperties,
  formActions: { display: "flex", gap: 6, marginTop: 8 } as React.CSSProperties,
  label: { fontSize: 11, color: "#546e7a", fontWeight: 600, display: "block", marginTop: 6, marginBottom: 3 } as React.CSSProperties,
  input: { width: "100%", padding: "6px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 13, boxSizing: "border-box" } as React.CSSProperties,
  warnBanner: { marginTop: 10, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, color: "#e65100", fontSize: 13 } as React.CSSProperties,
  lockBanner: { marginTop: 10, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, color: "#e65100", fontSize: 13 } as React.CSSProperties,
  errorBanner: { marginTop: 10, padding: "8px 12px", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 6, color: "#b71c1c", fontSize: 13 } as React.CSSProperties,
  historyPanel: { marginTop: 12, padding: "10px 12px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
  historyTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 } as React.CSSProperties,
  historyTh: { background: "#eceff1", color: "#37474f", padding: "5px 8px", textAlign: "left" as const, border: "1px solid #cfd8dc", fontWeight: 600 } as React.CSSProperties,
  historyTd: { padding: "4px 8px", border: "1px solid #eceff1" } as React.CSSProperties,
};
