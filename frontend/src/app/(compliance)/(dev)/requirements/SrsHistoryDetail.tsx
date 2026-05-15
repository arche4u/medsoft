"use client";
/**
 * SRS history detail + diff.
 *
 * Renders the frozen requirements snapshot of a single baseline (clicked from
 * the history table) and offers a "Compare with" dropdown that diffs against
 * any other baseline of the same project. Diff is matched by `readable_id`
 * (stable across versions for the same logical requirement).
 */
import { useEffect, useMemo, useState } from "react";
import {
  api, RequirementCategory, RequirementCategoryBaseline, RequirementCategoryBaselineItem, RequirementCategoryBaselineSummary,
} from "@/lib/api";
import { downloadSrsSnapshotPdf } from "./pdf";

type Props = {
  selectedId: string;
  history: RequirementCategoryBaselineSummary[];
  /** Project name used in the PDF subtitle when the user downloads the snapshot. */
  projectName?: string;
  /** Project category definitions — drives display label + color per category
   *  with no hardcoded USER/SYSTEM/SOFTWARE maps. */
  categories: RequirementCategory[];
  onClose: () => void;
};

type ItemDiff = {
  added: RequirementCategoryBaselineItem[];
  removed: RequirementCategoryBaselineItem[];
  changed: { readable_id: string; before: RequirementCategoryBaselineItem; after: RequirementCategoryBaselineItem }[];
  unchanged: number;
};

function diffItems(
  before: RequirementCategoryBaselineItem[],
  after: RequirementCategoryBaselineItem[],
): ItemDiff {
  const beforeMap = new Map(before.map(i => [i.readable_id, i]));
  const afterMap  = new Map(after.map(i => [i.readable_id, i]));
  const added: RequirementCategoryBaselineItem[] = [];
  const removed: RequirementCategoryBaselineItem[] = [];
  const changed: ItemDiff["changed"] = [];
  let unchanged = 0;

  afterMap.forEach((aItem, rid) => {
    const bItem = beforeMap.get(rid);
    if (!bItem) {
      added.push(aItem);
    } else if (bItem.title !== aItem.title || bItem.description !== aItem.description) {
      changed.push({ readable_id: rid, before: bItem, after: aItem });
    } else {
      unchanged += 1;
    }
  });
  beforeMap.forEach((bItem, rid) => {
    if (!afterMap.has(rid)) removed.push(bItem);
  });
  return { added, removed, changed, unchanged };
}

export default function SrsHistoryDetail({ selectedId, history, projectName = "", categories, onClose }: Props) {
  const [selected, setSelected] = useState<RequirementCategoryBaseline | null>(null);
  const [compareId, setCompareId] = useState<string>("");
  const [compareWith, setCompareWith] = useState<RequirementCategoryBaseline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the selected category baseline's full detail (with frozen items).
  useEffect(() => {
    setLoading(true); setError("");
    api.requirements.categoryBaselines.get(selectedId)
      .then(b => setSelected(b))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [selectedId]);

  // Load the comparison baseline when picked.
  useEffect(() => {
    if (!compareId) { setCompareWith(null); return; }
    api.requirements.categoryBaselines.get(compareId)
      .then(b => setCompareWith(b))
      .catch(() => setCompareWith(null));
  }, [compareId]);

  const otherVersions = useMemo(
    () => history.filter(b => b.id !== selectedId),
    [history, selectedId],
  );

  const diff = useMemo(() => {
    if (!selected || !compareWith) return null;
    return diffItems(compareWith.items, selected.items);
  }, [selected, compareWith]);

  if (loading) return <div style={styles.loading}>Loading snapshot…</div>;
  if (error)   return <div style={styles.error}>{error}</div>;
  if (!selected) return null;

  const groupedByType = groupItemsByType(selected.items);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14, color: "#1a237e" }}>v{selected.version} snapshot</strong>
          <span style={{ fontSize: 12, color: "#546e7a" }}>{selected.items.length} frozen requirement(s)</span>
          {selected.approved_at && (
            <span style={{ fontSize: 11, color: "#78909c" }}>
              approved {new Date(selected.approved_at).toLocaleDateString()} by {selected.approved_by}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {otherVersions.length > 0 && (
            <>
              <span style={{ fontSize: 11, color: "#78909c" }}>Compare with:</span>
              <select value={compareId} onChange={e => setCompareId(e.target.value)} style={styles.select}>
                <option value="">— pick a version —</option>
                {otherVersions.map(b => (
                  <option key={b.id} value={b.id}>v{b.version} ({b.status})</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={() => downloadSrsSnapshotPdf(selected, projectName, categories, history)}
            title="Download this snapshot as a PDF (frozen requirements as approved)"
            style={styles.btnPdf}
          >
            ⬇ PDF
          </button>
          <button onClick={onClose} style={styles.btnClose}>Close</button>
        </div>
      </div>

      {diff && compareWith ? (
        <DiffView diff={diff} fromVersion={compareWith.version} toVersion={selected.version} />
      ) : (
        <div>
          {/* Render groups in the project's configured category order so any
              customer-defined categorisation is honoured (no hardcoded
              USER/SYSTEM/SOFTWARE ordering). */}
          {Array.from(groupedByType.entries())
            .sort(([a], [b]) => {
              const oa = categories.find(c => c.name === a)?.sort_order ?? 999;
              const ob = categories.find(c => c.name === b)?.sort_order ?? 999;
              return oa - ob || a.localeCompare(b);
            })
            .map(([type, items]) => {
              const def = categories.find(c => c.name === type);
              return (
                <ItemGroup
                  key={type}
                  title={def?.label ?? type}
                  color={def?.color ?? "#546e7a"}
                  items={items}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function groupItemsByType(items: RequirementCategoryBaselineItem[]): Map<string, RequirementCategoryBaselineItem[]> {
  const out = new Map<string, RequirementCategoryBaselineItem[]>();
  items.forEach(i => {
    if (!out.has(i.type)) out.set(i.type, []);
    out.get(i.type)!.push(i);
  });
  out.forEach(arr => arr.sort((a, b) => a.readable_id.localeCompare(b.readable_id)));
  return out;
}

// ── sub-components ───────────────────────────────────────────────────────────

function ItemGroup({ title, color, items }: { title: string; color: string; items: RequirementCategoryBaselineItem[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, color, fontSize: 12, marginBottom: 4 }}>
        {title} <span style={{ color: "#888", fontWeight: "normal" }}>({items.length})</span>
      </div>
      <table style={styles.itemTable}>
        <thead>
          <tr>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Title</th>
            <th style={styles.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td style={{ ...styles.td, fontFamily: "monospace", color: "#6b7280", whiteSpace: "nowrap" }}>{i.readable_id}</td>
              <td style={{ ...styles.td, fontWeight: 600 }}>{i.title}</td>
              <td style={{ ...styles.td, color: "#475569" }}>{i.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffView({ diff, fromVersion, toVersion }: { diff: ItemDiff; fromVersion: string; toVersion: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#546e7a", marginTop: 6, marginBottom: 8 }}>
        Diff <strong>v{fromVersion} → v{toVersion}</strong>
        {" · "}
        <span style={{ color: "#1b5e20" }}>+{diff.added.length} added</span>
        {" · "}
        <span style={{ color: "#b71c1c" }}>−{diff.removed.length} removed</span>
        {" · "}
        <span style={{ color: "#e65100" }}>~{diff.changed.length} changed</span>
        {" · "}
        <span style={{ color: "#9e9e9e" }}>{diff.unchanged} unchanged</span>
      </div>

      {diff.added.length > 0 && (
        <DiffSection title={`Added (${diff.added.length})`} bg="#f0fdf4" fg="#1b5e20">
          {diff.added.map(i => <DiffRow key={i.id} item={i} />)}
        </DiffSection>
      )}
      {diff.removed.length > 0 && (
        <DiffSection title={`Removed (${diff.removed.length})`} bg="#fef2f2" fg="#b71c1c">
          {diff.removed.map(i => <DiffRow key={i.id} item={i} />)}
        </DiffSection>
      )}
      {diff.changed.length > 0 && (
        <DiffSection title={`Changed (${diff.changed.length})`} bg="#fff8e1" fg="#e65100">
          {diff.changed.map(c => (
            <div key={c.readable_id} style={{ borderTop: "1px solid #ffe0b2", padding: "6px 0" }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{c.readable_id}</div>
              <ChangedField label="Title" before={c.before.title} after={c.after.title} />
              <ChangedField label="Description" before={c.before.description ?? ""} after={c.after.description ?? ""} />
            </div>
          ))}
        </DiffSection>
      )}
      {diff.added.length + diff.removed.length + diff.changed.length === 0 && (
        <div style={{ color: "#78909c", fontSize: 13, padding: "10px 0" }}>No differences between these two versions.</div>
      )}
    </div>
  );
}

function DiffRow({ item }: { item: RequirementCategoryBaselineItem }) {
  return (
    <div style={{ padding: "4px 0", borderTop: "1px solid #eee" }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280", marginRight: 8 }}>{item.readable_id}</span>
      <strong style={{ fontSize: 13 }}>{item.title}</strong>
      {item.description && <div style={{ fontSize: 12, color: "#475569", marginLeft: 80 }}>{item.description}</div>}
    </div>
  );
}

function DiffSection({ title, bg, fg, children }: { title: string; bg: string; fg: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: "8px 12px", background: bg, border: `1px solid ${fg}33`, borderRadius: 6 }}>
      <div style={{ fontWeight: 700, color: fg, fontSize: 12, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function ChangedField({ label, before, after }: { label: string; before: string; after: string }) {
  if (before === after) return null;
  return (
    <div style={{ fontSize: 12, marginTop: 3 }}>
      <span style={{ color: "#78909c", marginRight: 6 }}>{label}:</span>
      <span style={{ background: "#ffebee", color: "#b71c1c", padding: "0 4px", borderRadius: 3, textDecoration: "line-through" }}>{before || <em>—</em>}</span>
      <span style={{ margin: "0 6px", color: "#9e9e9e" }}>→</span>
      <span style={{ background: "#f0fdf4", color: "#1b5e20", padding: "0 4px", borderRadius: 3 }}>{after || <em>—</em>}</span>
    </div>
  );
}

const styles = {
  wrap: { marginTop: 10, padding: "10px 12px", background: "#fff", border: "1px solid #cfd8dc", borderRadius: 6 } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, paddingBottom: 8, borderBottom: "1px solid #eceff1" } as React.CSSProperties,
  loading: { padding: 12, color: "#78909c", fontSize: 13 } as React.CSSProperties,
  error: { padding: 12, color: "#b71c1c", fontSize: 13, background: "#ffebee", borderRadius: 6 } as React.CSSProperties,
  select: { padding: "4px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 12 } as React.CSSProperties,
  btnPdf: { background: "#fff", color: "#4a148c", border: "1px solid #ce93d8", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  btnClose: { background: "transparent", border: "1px solid #cfd8dc", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: "#546e7a" } as React.CSSProperties,
  itemTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 } as React.CSSProperties,
  th: { background: "#eceff1", color: "#37474f", padding: "5px 8px", textAlign: "left" as const, border: "1px solid #cfd8dc", fontWeight: 600 } as React.CSSProperties,
  td: { padding: "4px 8px", border: "1px solid #eceff1", verticalAlign: "top" as const } as React.CSSProperties,
};
