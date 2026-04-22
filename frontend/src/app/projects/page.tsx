"use client";

import { useEffect, useState } from "react";
import { api, Project, RequirementCategory } from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";

// ── Category tree display ─────────────────────────────────────────────────────
function CategoryTree({ cats, onDelete }: {
  cats: RequirementCategory[];
  onDelete: (id: string) => void;
}) {
  const roots = cats.filter(c => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
  const children = (id: string) => cats.filter(c => c.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);

  const renderCat = (cat: RequirementCategory, depth = 0) => (
    <div key={cat.id}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px",
        paddingLeft: `${depth * 1.2 + 0.5}rem`,
        background: depth === 0 ? "#f0f4ff" : "transparent",
        borderRadius: 4, marginBottom: 2,
      }}>
        {depth > 0 && <span style={{ color: "#bbb", fontSize: 11 }}>└</span>}
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, flex: 1 }}>{cat.label}</span>
        <span style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>({cat.name})</span>
        {cat.is_builtin && (
          <span style={{ fontSize: 10, color: "#aaa", background: "#f5f5f5", borderRadius: 8, padding: "1px 6px" }}>built-in</span>
        )}
        <button
          onClick={() => onDelete(cat.id)}
          style={{ background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: 13, padding: "0 2px" }}
        >✕</button>
      </div>
      {children(cat.id).map(ch => renderCat(ch, depth + 1))}
    </div>
  );

  return <div>{roots.map(r => renderCat(r))}</div>;
}

// ── Project edit panel ────────────────────────────────────────────────────────
function ProjectPanel({ project, onUpdate, onDelete, isActive, onSetActive }: {
  project: Project;
  onUpdate: (p: Project) => void;
  onDelete: (p: Project) => void;
  isActive: boolean;
  onSetActive: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // edit fields
  const [name, setName]   = useState(project.name);
  const [desc, setDesc]   = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // categories
  const [cats, setCats]       = useState<RequirementCategory[]>([]);
  const [catErr, setCatErr]   = useState("");
  const [newName, setNewName]     = useState("");
  const [newLabel, setNewLabel]   = useState("");
  const [newColor, setNewColor]   = useState("#546e7a");
  const [newParent, setNewParent] = useState("");

  useEffect(() => {
    if (open) api.requirements.categories.list(project.id).then(setCats).catch(() => {});
  }, [open, project.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr("");
    try {
      const updated = await api.projects.update(project.id, { name: name.trim(), description: desc.trim() || undefined });
      onUpdate(updated);
      setSaveErr("✓ Saved");
    } catch (e: any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeleteCat(id: string) {
    const cat = cats.find(c => c.id === id);
    if (!confirm(`Permanently delete the "${cat?.label ?? "this"}" type?\n\nRequirements of this type must be removed first.`)) return;
    setCatErr("");
    try { await api.requirements.categories.delete(id); setCats(cs => cs.filter(c => c.id !== id)); }
    catch (e: any) { setCatErr(e.message); }
  }

  async function handleAddCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newLabel) return;
    setCatErr("");
    try {
      const cat = await api.requirements.categories.create({
        project_id: project.id,
        name: newName,
        label: newLabel,
        color: newColor,
        parent_id: newParent || undefined,
      });
      setCats(cs => [...cs, cat]);
      setNewName(""); setNewLabel(""); setNewColor("#546e7a"); setNewParent("");
    } catch (e: any) { setCatErr(e.message); }
  }

  return (
    <div style={{ border: `2px solid ${isActive ? "#1565c0" : "#e5e7eb"}`, borderRadius: 8, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: isActive ? "#e3f2fd" : "#fff" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{project.name}</span>
            {isActive && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "#1565c0", color: "#fff", borderRadius: 10, padding: "1px 8px" }}>
                ACTIVE
              </span>
            )}
          </div>
          {project.description && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{project.description}</div>}
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, fontFamily: "monospace" }}>
            {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
        {!isActive && (
          <button onClick={() => onSetActive(project.id)}
            style={{ ...btnSmall, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #c8e6c9" }}>
            Set Active
          </button>
        )}
        <button onClick={() => setOpen(o => !o)}
          style={{ ...btnSmall, background: open ? "#1565c0" : "#f3f4f6", color: open ? "#fff" : "#374151", border: "none" }}>
          {open ? "▲ Close" : "⚙ Manage"}
        </button>
        <button onClick={() => onDelete(project)}
          style={{ ...btnSmall, background: "#ffebee", color: "#b71c1c", border: "1px solid #ffcdd2" }}>
          Delete
        </button>
      </div>

      {/* Expand panel */}
      {open && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: "16px 20px", background: "#fafafa" }}>

          {/* Name / description */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>Project Details</div>
            <form onSubmit={handleSave} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={lblStyle}>Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required style={{ ...inputStyle, width: 220 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 200 }}>
                <label style={lblStyle}>Description</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
              <button type="submit" disabled={saving} style={{ ...btnSmall, background: "#1565c0", color: "#fff", border: "none", padding: "7px 18px" }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </form>
            {saveErr && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: saveErr.startsWith("✓") ? "#2e7d32" : "#b71c1c" }}>
                {saveErr}
              </p>
            )}
          </div>

          {/* Requirement types */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>Requirement Types</div>
            {cats.length > 0
              ? <CategoryTree cats={cats} onDelete={handleDeleteCat} />
              : <p style={{ color: "#aaa", fontSize: 12 }}>No types defined.</p>
            }
            {catErr && (
              <p style={{ margin: "6px 0", fontSize: 12, color: "#b71c1c", background: "#ffebee", borderRadius: 4, padding: "4px 8px" }}>{catErr}</p>
            )}
            <form onSubmit={handleAddCat} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={lblStyle}>Parent category</label>
                <select value={newParent} onChange={e => setNewParent(e.target.value)} style={{ ...inputStyle, width: 170 }}>
                  <option value="">— Top level</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.parent_id ? "  └ " : ""}{c.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={lblStyle}>Key (e.g. UI)</label>
                <input value={newName} onChange={e => setNewName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                  placeholder="UI" style={{ ...inputStyle, width: 100 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={lblStyle}>Display label</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  placeholder="UI Requirements" style={{ ...inputStyle, width: 180 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={lblStyle}>Colour</label>
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                  style={{ width: 44, height: 34, padding: 2, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }} />
              </div>
              <button type="submit" disabled={!newName || !newLabel}
                style={{ ...btnSmall, background: "#2e7d32", color: "#fff", border: "none", padding: "7px 16px" }}>
                + Add Type
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [activeProjectId, setActiveProjectId] = useActiveProject();

  async function load() {
    try { setProjects(await api.projects.list()); }
    catch (e: any) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setError("");
    try {
      await api.projects.create({ name: name.trim(), description: desc.trim() || undefined });
      setName(""); setDesc("");
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(p: Project) {
    if (!confirm(`Are you sure you want to permanently delete "${p.name}"?\n\nThis will remove all its requirements, test cases, risks and linked data. This action cannot be undone.`)) return;
    try {
      await api.projects.delete(p.id);
      setProjects(ps => ps.filter(x => x.id !== p.id));
      if (activeProjectId === p.id) setActiveProjectId("");
    } catch (e: any) { setError("Delete failed: " + e.message); }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Projects</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        Select a project to set it as active — it will be pre-selected across all modules.
      </p>

      {/* Create form */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Create New Project</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 200px" }}>
            <label style={lblStyle}>Name *</label>
            <input placeholder="e.g. Infusion Pump v2" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "2 1 300px" }}>
            <label style={lblStyle}>Description</label>
            <input placeholder="Optional" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
          </div>
          {error && <p style={{ color: "red", margin: 0, width: "100%" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ ...btnSmall, background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 20px", fontSize: 13 }}>
            {loading ? "Creating…" : "Create Project"}
          </button>
        </form>
      </div>

      {/* Project list */}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: "0 0 8px" }}>All Projects ({projects.length})</h2>
        {projects.length === 0
          ? <p style={{ color: "#888" }}>No projects yet.</p>
          : projects.map(p => (
            <ProjectPanel
              key={p.id}
              project={p}
              isActive={activeProjectId === p.id}
              onSetActive={setActiveProjectId}
              onUpdate={updated => setProjects(ps => ps.map(x => x.id === updated.id ? updated : x))}
              onDelete={handleDelete}
            />
          ))
        }
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" as const, width: "100%" };
const btnSmall: React.CSSProperties   = { padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" as const };
const lblStyle: React.CSSProperties   = { fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" };
