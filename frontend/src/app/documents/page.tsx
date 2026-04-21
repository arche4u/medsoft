"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Doc, DocumentStatus, Project } from "@/lib/api";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<DocumentStatus, { label: string; bg: string; color: string; dot: string }> = {
  NOT_STARTED: { label: "Not Started", bg: "#f0f0f0",  color: "#555",    dot: "#bbb" },
  DRAFT:       { label: "Draft",       bg: "#fff8e1",  color: "#b45309", dot: "#f59e0b" },
  IN_REVIEW:   { label: "In Review",   bg: "#eff6ff",  color: "#1d4ed8", dot: "#3b82f6" },
  APPROVED:    { label: "Approved",    bg: "#f0fdf4",  color: "#15803d", dot: "#22c55e" },
  OBSOLETE:    { label: "Obsolete",    bg: "#fef2f2",  color: "#991b1b", dot: "#ef4444" },
};

const CATEGORIES = ["PLANS", "TECHNICAL", "DEVELOPMENT", "SOP"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string }> = {
  PLANS:       { label: "Plans",                color: "#1e40af", bg: "#eff6ff" },
  TECHNICAL:   { label: "Technical Documents",  color: "#6d28d9", bg: "#f5f3ff" },
  DEVELOPMENT: { label: "Development Documents",color: "#065f46", bg: "#ecfdf5" },
  SOP:         { label: "Standard Operating Procedures", color: "#92400e", bg: "#fffbeb" },
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DocumentStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_STARTED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ doc, onSave, onClose }: {
  doc: Doc;
  onSave: (updated: Doc) => void;
  onClose: () => void;
}) {
  const [status, setStatus]   = useState<DocumentStatus>(doc.status as DocumentStatus);
  const [version, setVersion] = useState(doc.version ?? "");
  const [notes, setNotes]     = useState(doc.notes ?? "");
  const [saving, setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.documents.update(doc.id, {
        status, version: version || undefined, notes: notes || undefined,
      });
      onSave(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div style={{
            background: (CATEGORY_META[doc.category as Category]?.bg ?? "#f0f0f0"),
            border: `1px solid ${CATEGORY_META[doc.category as Category]?.color ?? "#999"}33`,
            borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700,
            color: CATEGORY_META[doc.category as Category]?.color ?? "#555",
            flexShrink: 0, letterSpacing: 0.5,
          }}>{doc.doc_type}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>{doc.title}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{CATEGORY_META[doc.category as Category]?.label ?? doc.category}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888", lineHeight: 1 }}>×</button>
        </div>

        <label style={labelStyle}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value as DocumentStatus)} style={inputStyle}>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <label style={labelStyle}>Version</label>
        <input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1.0, 2.3" style={inputStyle} />

        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          placeholder="Enter notes, review comments, or document location…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button onClick={save} disabled={saving} style={btnStyle}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// Doc types that have a structured editor
const EDITABLE_TYPES = new Set([
  "SDP", "SMP", "SPRP", "SCP", "SVP", "SBRP",
  "SRS", "SADS", "SDDS", "SVPROT", "SVREP",
  "SOP-SDLC", "SOP-CM", "SOP-CR", "SOP-RA", "SOP-VV",
  "SOP-NCR", "SOP-AU", "SOP-TR", "SOP-DOC", "SOP-REL",
]);

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({ doc, onEdit, highlight }: { doc: Doc; onEdit: (d: Doc) => void; highlight?: boolean }) {
  const catColor = CATEGORY_META[doc.category as Category]?.color ?? "#555";
  const hasEditor = EDITABLE_TYPES.has(doc.doc_type);
  const hasDraft  = !!doc.content;
  return (
    <tr style={{ background: highlight ? "#fefce8" : undefined, transition: "background 0.15s" }}
        onMouseEnter={e => { if (!highlight) (e.currentTarget as HTMLElement).style.background = "#f9f9f9"; }}
        onMouseLeave={e => { if (!highlight) (e.currentTarget as HTMLElement).style.background = ""; }}>
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
            fontWeight: 700, background: catColor + "15", color: catColor,
            letterSpacing: 0.4, flexShrink: 0, fontFamily: "monospace",
          }}>{doc.doc_type}</span>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>{doc.title}</span>
          {hasDraft && (
            <span style={{ fontSize: 11, color: "#10b981", background: "#f0fdf4", padding: "1px 7px", borderRadius: 10, border: "1px solid #bbf7d0" }}>
              has content
            </span>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, width: 80, color: doc.version ? "#333" : "#ccc", fontSize: 13 }}>
        {doc.version ?? "—"}
      </td>
      <td style={{ ...tdStyle, width: 130 }}>
        <StatusBadge status={doc.status as DocumentStatus} />
      </td>
      <td style={{ ...tdStyle, color: doc.notes ? "#555" : "#ccc", fontSize: 13, cursor: "pointer" }}
          onClick={() => onEdit(doc)} title={doc.notes ?? "Click to add notes"}>
        {doc.notes
          ? (doc.notes.length > 70 ? doc.notes.slice(0, 70) + "…" : doc.notes)
          : "click to add notes"}
      </td>
      <td style={{ ...tdStyle, width: hasEditor ? 130 : 70, textAlign: "right" }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {hasEditor && (
            <a href={`/documents/edit?id=${doc.id}`} style={{
              ...editBtnStyle, display: "inline-block", textDecoration: "none",
              background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe",
            }}>
              {hasDraft ? "Open" : "Write"} ↗
            </a>
          )}
          <button onClick={() => onEdit(doc)} style={editBtnStyle}>Edit</button>
        </div>
      </td>
    </tr>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, color: "#6b7280", minWidth: 40 }}>{done}/{total}</span>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ category, docs, onEdit, activeType }: {
  category: string; docs: Doc[]; onEdit: (d: Doc) => void; activeType?: string;
}) {
  const [open, setOpen] = useState(true);
  const meta     = CATEGORY_META[category as Category] ?? { label: category, color: "#555", bg: "#f5f5f5" };
  const approved = docs.filter(d => d.status === "APPROVED").length;

  return (
    <div style={{ marginBottom: 20, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
          background: meta.bg, borderBottom: open ? `1px solid ${meta.color}22` : "none",
          padding: "12px 16px",
        }}
      >
        <span style={{ fontSize: 13, color: meta.color, minWidth: 14 }}>{open ? "▾" : "▸"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: meta.color, fontSize: 14 }}>{meta.label}</div>
          <div style={{ marginTop: 4, maxWidth: 300 }}>
            <ProgressBar done={approved} total={docs.length} color={meta.color} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
            const count = docs.filter(d => d.status === s).length;
            if (!count) return null;
            return (
              <span key={s} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 20,
                background: cfg.bg, color: cfg.color, fontWeight: 600, border: `1px solid ${cfg.dot}44`,
              }}>{count} {cfg.label}</span>
            );
          })}
        </div>
      </div>
      {open && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Document</th>
              <th style={{ ...thStyle, width: 80 }}>Version</th>
              <th style={{ ...thStyle, width: 140 }}>Status</th>
              <th style={thStyle}>Notes</th>
              <th style={{ ...thStyle, width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => <DocRow key={d.id} doc={d} onEdit={onEdit} highlight={!!activeType && d.doc_type === activeType} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ docs }: { docs: Doc[] }) {
  const total    = docs.length;
  const approved = docs.filter(d => d.status === "APPROVED").length;
  const draft    = docs.filter(d => d.status === "DRAFT").length;
  const review   = docs.filter(d => d.status === "IN_REVIEW").length;
  const none     = docs.filter(d => d.status === "NOT_STARTED").length;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {[
        { label: "Total",       value: total,    bg: "#f8f9fa", color: "#374151" },
        { label: "Approved",    value: approved, bg: "#f0fdf4", color: "#15803d" },
        { label: "In Review",   value: review,   bg: "#eff6ff", color: "#1d4ed8" },
        { label: "Draft",       value: draft,    bg: "#fff8e1", color: "#b45309" },
        { label: "Not Started", value: none,     bg: "#f9fafb", color: "#6b7280" },
      ].map(c => (
        <div key={c.label} style={{
          flex: "1 1 100px", background: c.bg, borderRadius: 8, padding: "12px 16px",
          border: "1px solid #e5e7eb", minWidth: 90,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page (inner, uses useSearchParams) ───────────────────────────────────
function DocumentsPageInner() {
  const params    = useSearchParams();
  const typeParam = params.get("type") ?? "";
  const catParam  = params.get("category") ?? "";

  const [projects, setProjects]   = useState<Project[]>([]);
  const [selProj, setSelProj]     = useState("");
  const [docs, setDocs]           = useState<Doc[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState<Doc | null>(null);
  const [catFilter, setCatFilter] = useState<string>(catParam || "ALL");

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  useEffect(() => {
    if (!selProj) return;
    setLoading(true);
    api.documents.list(selProj)
      .then(setDocs)
      .finally(() => setLoading(false));
  }, [selProj]);

  function handleSaved(updated: Doc) {
    setDocs(ds => ds.map(d => d.id === updated.id ? updated : d));
    setEditing(null);
  }

  const allCategories = [...CATEGORIES];
  const displayed = catFilter === "ALL" ? docs : docs.filter(d => d.category === catFilter);
  const grouped = allCategories.reduce<Record<string, Doc[]>>((acc, c) => {
    acc[c] = displayed.filter(d => d.category === c);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#111", fontWeight: 700 }}>Document Register</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>IEC 62304 document control and status tracking</p>
        </div>
        <select value={selProj} onChange={e => setSelProj(e.target.value)}
          style={{ marginLeft: "auto", ...selectStyle }}>
          <option value="">— Select project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      {selProj && docs.length > 0 && <SummaryCards docs={docs} />}

      {/* Category filter tabs */}
      {selProj && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={() => setCatFilter("ALL")} style={{ ...tabBtnStyle, ...(catFilter === "ALL" ? tabActiveStyle : {}) }}>
            All Documents
            <span style={{ marginLeft: 6, opacity: 0.65 }}>({docs.length})</span>
          </button>
          {allCategories.map(c => {
            const meta  = CATEGORY_META[c];
            const count = docs.filter(d => d.category === c).length;
            if (!count) return null;
            const isActive = catFilter === c;
            return (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                ...tabBtnStyle,
                ...(isActive ? { background: meta.color, color: "#fff", borderColor: meta.color } : {}),
              }}>
                {meta.label}
                <span style={{ marginLeft: 6, opacity: 0.65 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && <p style={{ color: "#888", padding: "20px 0" }}>Loading documents…</p>}

      {!selProj && !loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#6b7280" }}>Select a project to view its document register</div>
        </div>
      )}

      {/* Document categories */}
      {selProj && !loading && allCategories.map(c => {
        const catDocs = grouped[c];
        if (!catDocs?.length) return null;
        return (
          <CategorySection key={c} category={c} docs={catDocs} onEdit={setEditing} activeType={typeParam} />
        );
      })}

      {editing && (
        <EditModal doc={editing} onSave={handleSaved} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <DocumentsPageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8,
  fontSize: 14, background: "#fff", color: "#374151", outline: "none",
  boxSizing: "border-box",
};
const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "8px 10px",
  border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14,
  boxSizing: "border-box", outline: "none", color: "#111", background: "#fff",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151",
  marginBottom: 4, marginTop: 14,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 20px", background: "#1e40af", color: "#fff", border: "none",
  borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600,
};
const btnSecStyle: React.CSSProperties = {
  ...btnStyle, background: "#f3f4f6", color: "#374151",
};
const editBtnStyle: React.CSSProperties = {
  padding: "4px 12px", background: "#eff6ff", color: "#1e40af",
  border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
};
const tabBtnStyle: React.CSSProperties = {
  padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 20,
  cursor: "pointer", fontSize: 13, fontWeight: 500, background: "#fff",
  color: "#374151", transition: "all 0.15s",
};
const tabActiveStyle: React.CSSProperties = {
  background: "#1e40af", color: "#fff", borderColor: "#1e40af",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", background: "#fff",
};
const thStyle: React.CSSProperties = {
  padding: "9px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
  textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280",
  letterSpacing: "0.03em", textTransform: "uppercase",
};
const tdStyle: React.CSSProperties = {
  padding: "11px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle",
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24, width: 460, maxWidth: "95vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};
