"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Doc, DocumentStatus, Project } from "@/lib/api";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<DocumentStatus, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: "Not Started", bg: "#f5f5f5",  color: "#757575" },
  DRAFT:       { label: "Draft",       bg: "#fff3e0",  color: "#e65100" },
  IN_REVIEW:   { label: "In Review",   bg: "#e3f2fd",  color: "#1565c0" },
  APPROVED:    { label: "Approved",    bg: "#e8f5e9",  color: "#2e7d32" },
  OBSOLETE:    { label: "Obsolete",    bg: "#fce4ec",  color: "#c62828" },
};

const CATEGORY_LABELS: Record<string, string> = {
  PLANS:       "Plans",
  TECHNICAL:   "Technical Documents",
  DEVELOPMENT: "Development Documents",
};

const CATEGORY_COLORS: Record<string, string> = {
  PLANS:       "#1565c0",
  TECHNICAL:   "#6a1b9a",
  DEVELOPMENT: "#1b5e20",
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DocumentStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_STARTED;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ doc, onSave, onClose }: {
  doc: Doc;
  onSave: (updated: Doc) => void;
  onClose: () => void;
}) {
  const [status, setStatus]  = useState<DocumentStatus>(doc.status as DocumentStatus);
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
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{doc.doc_type}</h3>
        <p style={{ margin: "0 0 16px", color: "#555", fontSize: 14 }}>{doc.title}</p>

        <label style={labelStyle}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value as DocumentStatus)} style={inputStyle}>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <label style={labelStyle}>Version</label>
        <input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1.0, 2.3" style={inputStyle} />

        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button onClick={save} disabled={saving} style={btnStyle}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({ doc, onEdit, highlight }: { doc: Doc; onEdit: (d: Doc) => void; highlight?: boolean }) {
  return (
    <tr style={highlight ? { background: "#fff8e1" } : undefined}>
      <td style={tdStyle}>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
          fontWeight: 700, background: CATEGORY_COLORS[doc.category] + "22",
          color: CATEGORY_COLORS[doc.category], marginRight: 8, letterSpacing: 0.5,
        }}>{doc.doc_type}</span>
        {doc.title}
      </td>
      <td style={tdStyle}>{doc.version ?? <span style={{ color: "#aaa" }}>—</span>}</td>
      <td style={tdStyle}><StatusBadge status={doc.status as DocumentStatus} /></td>
      <td style={tdStyle} title={doc.notes ?? ""}
        onClick={() => onEdit(doc)}
      >
        {doc.notes
          ? <span style={{ color: "#555", fontSize: 13, cursor: "pointer" }}>
              {doc.notes.length > 60 ? doc.notes.slice(0, 60) + "…" : doc.notes}
            </span>
          : <span style={{ color: "#ccc", fontSize: 13, cursor: "pointer" }}>click to add notes</span>
        }
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <button onClick={() => onEdit(doc)} style={editBtnStyle}>Edit</button>
      </td>
    </tr>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ category, docs, onEdit, activeType }: {
  category: string; docs: Doc[]; onEdit: (d: Doc) => void; activeType?: string;
}) {
  const [open, setOpen] = useState(true);
  const approved  = docs.filter(d => d.status === "APPROVED").length;
  const total     = docs.length;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          background: CATEGORY_COLORS[category] + "11",
          borderLeft: `4px solid ${CATEGORY_COLORS[category]}`,
          padding: "10px 14px", borderRadius: "0 6px 6px 0", marginBottom: open ? 0 : 4,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: CATEGORY_COLORS[category], flex: 1 }}>
          {open ? "▾" : "▸"} {CATEGORY_LABELS[category] ?? category}
        </span>
        <span style={{ fontSize: 12, color: "#888" }}>
          {approved}/{total} Approved
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
            const count = docs.filter(d => d.status === s).length;
            if (!count) return null;
            return (
              <span key={s} style={{
                fontSize: 11, padding: "1px 7px", borderRadius: 10,
                background: cfg.bg, color: cfg.color, fontWeight: 600,
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
              <th style={{ ...thStyle, width: 130 }}>Status</th>
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

// ── Main page (inner, uses useSearchParams) ───────────────────────────────────
function DocumentsPageInner() {
  const params    = useSearchParams();
  const projectId = params.get("project_id") ?? "";
  const typeParam = params.get("type") ?? "";
  const catParam  = params.get("category") ?? "";

  const [projects, setProjects]   = useState<Project[]>([]);
  const [selProj, setSelProj]     = useState(projectId);
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

  const categories = ["PLANS", "TECHNICAL", "DEVELOPMENT"];
  const displayed  = catFilter === "ALL" ? docs : docs.filter(d => d.category === catFilter);
  const grouped    = categories.reduce<Record<string, Doc[]>>((acc, c) => {
    acc[c] = displayed.filter(d => d.category === c);
    return acc;
  }, {});

  const totalApproved = docs.filter(d => d.status === "APPROVED").length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Document Register</h1>
        <select value={selProj} onChange={e => setSelProj(e.target.value)} style={{ ...inputStyle, width: 220 }}>
          <option value="">— Select project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selProj && (
          <span style={{ fontSize: 13, color: "#888" }}>
            {totalApproved}/{docs.length} documents approved
          </span>
        )}
      </div>

      {selProj && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["ALL", ...categories].map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              style={{
                ...filterBtnStyle,
                background: catFilter === c ? "#1565c0" : "#f5f5f5",
                color: catFilter === c ? "#fff" : "#333",
              }}
            >
              {c === "ALL" ? "All Documents" : CATEGORY_LABELS[c] ?? c}
              {c !== "ALL" && (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>
                  ({docs.filter(d => d.category === c).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading && <p style={{ color: "#888" }}>Loading…</p>}

      {!selProj && !loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa" }}>
          Select a project to view its document register
        </div>
      )}

      {selProj && !loading && categories.map(c => {
        const catDocs = grouped[c];
        if (!catDocs.length) return null;
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
const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "7px 10px", border: "1px solid #ddd",
  borderRadius: 6, fontSize: 14, boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, marginTop: 12 };
const btnStyle: React.CSSProperties   = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecStyle: React.CSSProperties = { ...btnStyle, background: "#eee", color: "#333" };
const editBtnStyle: React.CSSProperties = { padding: "4px 12px", background: "#e3f2fd", color: "#1565c0", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const filterBtnStyle: React.CSSProperties = { padding: "6px 14px", border: "none", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 500 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" };
const thStyle: React.CSSProperties   = { padding: "9px 12px", background: "#fafafa", borderBottom: "1px solid #eee", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#888" };
const tdStyle: React.CSSProperties   = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14, verticalAlign: "middle" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalStyle: React.CSSProperties  = { background: "#fff", borderRadius: 10, padding: 24, width: 440, maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };
