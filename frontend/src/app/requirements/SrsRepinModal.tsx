"use client";
/**
 * Re-pin manifest confirmation modal.
 *
 * Opened from the composite section when the user wants to change which
 * per-category baseline versions are pinned in a DRAFT composite. The
 * primary purpose of the modal is *clarity*: re-pinning the manifest does
 * NOT touch any underlying category requirement — it only changes which
 * version of each category is part of this release.
 *
 * Per-category dropdown picks from any baseline of that category (DRAFT,
 * IN_REVIEW, APPROVED, OBSOLETE). Backend enforces "all components must be
 * APPROVED" only at composite-approval time, not here, so the user can
 * freely re-pin while planning.
 */
import { useMemo, useState } from "react";
import {
  api, CompositeBaseline, RequirementCategoryBaselineSummary,
} from "@/lib/api";

type Props = {
  composite: CompositeBaseline;
  /** All category baselines for the project (any status) — used to populate the dropdowns. */
  allCategoryBaselines: RequirementCategoryBaselineSummary[];
  onClose: () => void;
  onSaved: () => void;
};

export default function SrsRepinModal({ composite, allCategoryBaselines, onClose, onSaved }: Props) {
  // Group by category, newest first.
  const byCategory = useMemo(() => {
    const m = new Map<string, RequirementCategoryBaselineSummary[]>();
    [...allCategoryBaselines]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach(b => {
        if (!m.has(b.category_name)) m.set(b.category_name, []);
        m.get(b.category_name)!.push(b);
      });
    return m;
  }, [allCategoryBaselines]);

  // Initial selection mirrors the current pinning.
  const initial = new Map<string, string | null>();
  byCategory.forEach((_, cat) => {
    const pinned = composite.components.find(c => c.category_baseline.category_name === cat);
    initial.set(cat, pinned?.category_baseline_id ?? null);
  });
  const [selection, setSelection] = useState<Map<string, string | null>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(category: string, baselineId: string | "") {
    const next = new Map(selection);
    next.set(category, baselineId || null);
    setSelection(next);
  }

  async function save() {
    const ids = Array.from(selection.values()).filter((x): x is string => !!x);
    setBusy(true); setError("");
    try {
      await api.requirements.baselines.updateComponents(composite.id, ids);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <strong>Re-pin manifest — Composite SRS v{composite.version}</strong>
          <button onClick={onClose} style={styles.btnSubtle}>✕</button>
        </div>

        <div style={styles.notice}>
          <strong>This changes the manifest only.</strong> Re-pinning does not edit any
          category baseline or its requirements — it just changes which version of
          each category is part of this release. To edit category requirements you
          must fork that category to a new DRAFT.
        </div>

        <div style={{ marginTop: 12 }}>
          {Array.from(byCategory.entries()).map(([cat, baselines]) => (
            <div key={cat} style={styles.row}>
              <span style={styles.catLabel}>{cat}</span>
              <select
                value={selection.get(cat) ?? ""}
                onChange={e => pick(cat, e.target.value)}
                style={styles.select}
              >
                <option value="">— unpinned —</option>
                {baselines.map(b => (
                  <option key={b.id} value={b.id}>v{b.version} ({b.status}) · {b.item_count} reqs</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.footer}>
          <button onClick={save} disabled={busy} style={styles.btnPrimary}>Confirm re-pin</button>
          <button onClick={onClose} style={styles.btnSubtle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 } as React.CSSProperties,
  modal: { background: "#fff", borderRadius: 10, padding: 18, minWidth: 460, maxWidth: 600, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #eceff1" } as React.CSSProperties,
  notice: { padding: "10px 12px", background: "#fff8e1", border: "1px solid #ffe0b2", borderRadius: 6, fontSize: 12, color: "#5d4037" } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px dashed #eceff1" } as React.CSSProperties,
  catLabel: { width: 100, fontWeight: 700, color: "#1a237e", fontSize: 12 } as React.CSSProperties,
  select: { flex: 1, padding: "5px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 12 } as React.CSSProperties,
  error: { marginTop: 10, padding: "6px 10px", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 6, color: "#b71c1c", fontSize: 12 } as React.CSSProperties,
  footer: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" } as React.CSSProperties,
  btnPrimary: { background: "#1a237e", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  btnSubtle: { background: "transparent", color: "#546e7a", border: "1px solid #cfd8dc", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
};
