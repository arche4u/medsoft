"use client";
import { useEffect, useState } from "react";
import { useActiveProject } from "@/lib/useActiveProject";
import { api, KnowledgeEntry, Project } from "@/lib/api";

const STANDARDS = ["IEC62304", "ISO14971", "IEC62366", "ISO13485", "FDA", "MDR", "COMPANY"];
const CATEGORIES = ["STANDARD_CLAUSE", "CHECKLIST", "COMPANY_RULE", "REGULATORY", "GUIDANCE"];

const STANDARD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  IEC62304:  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  ISO14971:  { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  IEC62366:  { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  ISO13485:  { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
  FDA:       { bg: "#fefce8", text: "#b45309", border: "#fde68a" },
  MDR:       { bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
  COMPANY:   { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" },
};

const CATEGORY_LABELS: Record<string, string> = {
  STANDARD_CLAUSE: "Standard Clause",
  CHECKLIST:       "Checklist",
  COMPANY_RULE:    "Company Rule",
  REGULATORY:      "Regulatory",
  GUIDANCE:        "Guidance",
};

function standardChip(standard: string | null) {
  if (!standard) return null;
  const c = STANDARD_COLORS[standard] ?? { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
  return (
    <span style={{ fontSize: "0.68rem", fontWeight: 700, background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 4, padding: "1px 7px", marginRight: 4 }}>
      {standard}
    </span>
  );
}

function EntryCard({
  entry,
  onCopy,
  onEdit,
  onDelete,
  projectId,
}: {
  entry: KnowledgeEntry;
  onCopy?: (id: string) => void;
  onEdit?: (entry: KnowledgeEntry) => void;
  onDelete?: (entry: KnowledgeEntry) => void;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: "0.85rem 1rem", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {standardChip(entry.standard)}
            {entry.clause_ref && (
              <span style={{ fontSize: "0.68rem", background: "#f3f4f6", color: "#6b7280", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>
                {entry.clause_ref}
              </span>
            )}
            <span style={{ fontSize: "0.68rem", background: "#f8fafc", color: "#94a3b8", borderRadius: 4, padding: "1px 6px" }}>
              {CATEGORY_LABELS[entry.category] ?? entry.category}
            </span>
            {entry.is_global && (
              <span style={{ fontSize: "0.65rem", background: "#fffbeb", color: "#d97706", borderRadius: 4, padding: "1px 6px", border: "1px solid #fde68a" }}>
                Global
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#1f2937" }}>{entry.title}</div>
          {entry.summary && !expanded && (
            <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 3 }}>{entry.summary}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {onEdit && (
            <button onClick={e => { e.stopPropagation(); onEdit(entry); }}
              style={{ fontSize: "0.72rem", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
              Edit
            </button>
          )}
          {entry.is_global && onCopy && projectId && (
            <button onClick={e => { e.stopPropagation(); onCopy(entry.id); }}
              style={{ fontSize: "0.72rem", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
              Copy to project
            </button>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(entry); }}
              style={{ fontSize: "0.72rem", background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
              Delete
            </button>
          )}
          <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && entry.content && (
        <div style={{ borderTop: "1px solid #f3f4f6", padding: "1rem 1.25rem", background: "#fafafa" }}>
          <pre style={{ fontFamily: "inherit", whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "#374151", margin: 0, lineHeight: 1.7 }}>
            {entry.content}
          </pre>
          {entry.tags && entry.tags.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {entry.tags.map(t => (
                <span key={t} style={{ fontSize: "0.68rem", background: "#f3f4f6", color: "#6b7280", borderRadius: 10, padding: "1px 8px", border: "1px solid #e5e7eb" }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type EntryForm = {
  title: string;
  summary: string;
  content: string;
  category: string;
  standard: string;
  clause_ref: string;
  tags: string;
  sort_order: string;
};

const EMPTY_FORM: EntryForm = { title: "", summary: "", content: "", category: "GUIDANCE", standard: "", clause_ref: "", tags: "", sort_order: "99" };

export default function KnowledgePage() {
  const [projectId, setProjectId] = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);

  const [globalEntries, setGlobalEntries] = useState<KnowledgeEntry[]>([]);
  const [projectEntries, setProjectEntries] = useState<KnowledgeEntry[]>([]);

  const [tab, setTab] = useState<"global" | "project">("global");
  const [filterStandard, setFilterStandard] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsGlobal, setEditingIsGlobal] = useState(false);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.projects.list().then(setProjects);
  }, []);

  useEffect(() => {
    api.knowledge.listGlobal().then(setGlobalEntries).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projectId) { setProjectEntries([]); return; }
    api.knowledge.listProject(projectId).then(setProjectEntries).catch(console.error);
  }, [projectId]);

  const reloadGlobal = () => api.knowledge.listGlobal().then(setGlobalEntries).catch(console.error);
  const reloadProject = () => { if (projectId) api.knowledge.listProject(projectId).then(setProjectEntries); };

  const handleCopy = async (entryId: string) => {
    if (!projectId) { alert("Select a project first"); return; }
    try {
      await api.knowledge.copyToProject(entryId, projectId);
      reloadProject();
      setTab("project");
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingIsGlobal(false); setForm(EMPTY_FORM); setError(""); };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setEditingIsGlobal(entry.is_global);
    setForm({
      title: entry.title,
      summary: entry.summary ?? "",
      content: entry.content ?? "",
      category: entry.category,
      standard: entry.standard ?? "",
      clause_ref: entry.clause_ref ?? "",
      tags: (entry.tags ?? []).join(", "),
      sort_order: String(entry.sort_order),
    });
    setShowForm(true);
  };

  const handleDelete = async (entry: KnowledgeEntry) => {
    if (!confirm(`Delete "${entry.title}"?`)) return;
    try {
      if (entry.is_global) { await api.knowledge.deleteGlobal(entry.id); reloadGlobal(); }
      else { await api.knowledge.delete(entry.id); reloadProject(); }
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError("");
    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim() || undefined,
      content: form.content.trim() || undefined,
      category: form.category,
      standard: form.standard.trim() || undefined,
      clause_ref: form.clause_ref.trim() || undefined,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      sort_order: parseInt(form.sort_order) || 99,
    };
    try {
      if (editingId) {
        if (editingIsGlobal) await api.knowledge.updateGlobal(editingId, payload);
        else await api.knowledge.update(editingId, payload);
      } else if (tab === "global") {
        await api.knowledge.createGlobal(payload);
        reloadGlobal();
      } else {
        if (!projectId) { setError("Select a project first"); setSaving(false); return; }
        await api.knowledge.createProject(projectId, payload);
        reloadProject();
      }
      if (editingIsGlobal || tab === "global") reloadGlobal();
      else reloadProject();
      closeForm();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const filterEntries = (entries: KnowledgeEntry[]) => {
    return entries.filter(e => {
      if (filterStandard && e.standard !== filterStandard) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.title.toLowerCase().includes(q) ||
          (e.summary ?? "").toLowerCase().includes(q) ||
          (e.clause_ref ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  };

  const displayed = filterEntries(tab === "global" ? globalEntries : projectEntries);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.45rem 1.1rem", cursor: "pointer", border: "none", borderRadius: 6,
    fontWeight: active ? 700 : 400, fontSize: "0.85rem",
    background: active ? "#1e40af" : "#f3f4f6",
    color: active ? "#fff" : "#374151",
  });

  const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "0.45rem 0.7rem", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "#0d1b2a" }}>Knowledge Base</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.85rem" }}>
            IEC 62304, ISO 14971, ISO 13485, IEC 62366 reference library · Used by AI to generate requirements
          </p>
        </div>
        <button
          onClick={() => { closeForm(); setShowForm(true); }}
          style={{ background: "#1e40af", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem 1.1rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
        >
          + Add {tab === "global" ? "Global" : "Project"} Entry
        </button>
      </div>

      {/* Project selector */}
      <div style={{ marginBottom: "1rem" }}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          style={{ ...inputStyle, width: 280 }}>
          <option value="">— Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem" }}>
        <button style={tabStyle(tab === "global")} onClick={() => setTab("global")}>
          📚 Global Standards Library ({globalEntries.length})
        </button>
        <button style={tabStyle(tab === "project")} onClick={() => setTab("project")}>
          🏢 Project-Specific ({projectEntries.length})
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Search title, summary, clause…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <select value={filterStandard} onChange={e => setFilterStandard(e.target.value)} style={{ ...inputStyle, width: 160 }}>
          <option value="">All Standards</option>
          {STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: 180 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        {(filterStandard || filterCategory || search) && (
          <button onClick={() => { setFilterStandard(""); setFilterCategory(""); setSearch(""); }}
            style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 6, padding: "0.45rem 0.8rem", cursor: "pointer", fontSize: "0.82rem" }}>
            Clear
          </button>
        )}
      </div>

      {/* Stats bar */}
      {tab === "global" && (
        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {STANDARDS.map(s => {
            const count = globalEntries.filter(e => e.standard === s).length;
            if (!count) return null;
            const c = STANDARD_COLORS[s] ?? { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
            return (
              <button key={s} onClick={() => setFilterStandard(filterStandard === s ? "" : s)}
                style={{ fontSize: "0.72rem", fontWeight: 700, background: filterStandard === s ? c.text : c.bg, color: filterStandard === s ? "#fff" : c.text, border: `1px solid ${c.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                {s} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Entries */}
      {displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af", background: "#fafafa", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          {tab === "project" && !projectId
            ? "Select a project to view project-specific entries"
            : tab === "project"
            ? "No project entries yet. Add your company-specific rules or copy from Global Standards."
            : "No entries found"}
        </div>
      ) : (
        <div>
          {displayed.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              projectId={projectId}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onDelete={e => handleDelete(e)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>{editingId ? "Edit Entry" : `Add ${tab === "global" ? "Global" : "Project"} Entry`}</h3>
                {tab === "global" && !editingId && <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 2 }}>Visible to all projects · Used by AI globally</div>}
              </div>
              <button onClick={closeForm}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="e.g. Company SOUP policy" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Standard</label>
                  <select value={form.standard} onChange={e => setForm(f => ({ ...f, standard: e.target.value }))} style={inputStyle}>
                    <option value="">— None</option>
                    {STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Clause Ref</label>
                  <input value={form.clause_ref} onChange={e => setForm(f => ({ ...f, clause_ref: e.target.value }))} style={inputStyle} placeholder="e.g. §5.2" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Summary (one line)</label>
                <input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} style={inputStyle} placeholder="Brief description shown in list view" />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Full Content (used by AI)</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={8}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                  placeholder="Detailed guidance, checklists, rules, standard interpretations…&#10;&#10;This content is included as AI context when generating requirements for this project."
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Tags (comma-separated)</label>
                  <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} style={inputStyle} placeholder="safety, planning, software, regulatory" />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Sort Order</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} style={{ ...inputStyle, width: 80 }} placeholder="99" />
                </div>
              </div>
              {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "0.5rem 0.75rem", color: "#b91c1c", fontSize: "0.82rem" }}>{error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: "0.25rem" }}>
                <button onClick={closeForm}
                  style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 1.1rem", cursor: "pointer", fontSize: "0.85rem" }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ background: "#1e40af", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem 1.4rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Entry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
