"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Project, Requirement, TestCase, Risk, RequirementCategory, DesignCategory, TestCategory } from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";

type PendingType = { key: string; label: string; color: string; parentId: string };

// ── Reusable folder/category manager panel ────────────────────────────────────
type FolderCat = { id: string; name: string; label: string; color: string; sort_order: number; is_builtin: boolean };

function FolderPanel<T extends FolderCat>({
  title, description, icon, categories, projectId,
  onAdd, onDelete, onUpdate,
}: {
  title: string;
  description: string;
  icon: string;
  categories: T[];
  projectId: string;
  onAdd: (d: { project_id: string; name: string; label: string; color: string }) => Promise<T>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, d: { label?: string; color?: string; sort_order?: number }) => Promise<T>;
}) {
  const [cats,       setCats]       = useState<T[]>(categories);
  const [draftName,  setDraftName]  = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState("#546e7a");
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editLabel,  setEditLabel]  = useState("");

  // Sync with parent prop changes (on project switch)
  useEffect(() => { setCats(categories); }, [categories]);

  async function handleAdd() {
    if (!draftName || !draftLabel) return;
    setSaving(true); setMsg("");
    try {
      const created = await onAdd({ project_id: projectId, name: draftName, label: draftLabel, color: draftColor });
      setCats(cs => [...cs, created as T].sort((a, b) => a.sort_order - b.sort_order));
      setDraftName(""); setDraftLabel(""); setDraftColor("#546e7a");
      setMsg("✓ Added");
      setTimeout(() => setMsg(""), 2500);
    } catch (err: any) { setMsg("✗ " + err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    const cat = cats.find(c => c.id === id);
    if (cat?.is_builtin) { setMsg("✗ Built-in folders cannot be deleted"); setTimeout(() => setMsg(""), 2500); return; }
    if (!confirm(`Delete folder "${cat?.label}"? This cannot be undone.`)) return;
    try {
      await onDelete(id);
      setCats(cs => cs.filter(c => c.id !== id));
    } catch (err: any) { setMsg("✗ " + err.message); }
  }

  async function handleSaveLabel(id: string) {
    try {
      const updated = await onUpdate(id, { label: editLabel });
      setCats(cs => cs.map(c => c.id === id ? { ...c, label: updated.label } as T : c));
      setEditId(null);
    } catch (err: any) { setMsg("✗ " + err.message); }
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{description}</div>
        </div>
      </div>

      {/* Category list */}
      <div style={{ marginBottom: 14 }}>
        {cats.length === 0 && (
          <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0", fontStyle: "italic" }}>No folders yet.</div>
        )}
        {cats.map(c => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
            borderBottom: "1px solid #f3f4f6",
          }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            {editId === c.id ? (
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleSaveLabel(c.id); if (e.key === "Escape") setEditId(null); }}
                style={{ flex: 1, padding: "3px 7px", border: "1px solid #3b82f6", borderRadius: 4, fontSize: 13 }}
              />
            ) : (
              <span
                style={{ flex: 1, fontSize: 13, fontWeight: 500, cursor: c.is_builtin ? "default" : "pointer" }}
                onClick={() => { if (!c.is_builtin) { setEditId(c.id); setEditLabel(c.label); } }}
                title={c.is_builtin ? undefined : "Click to rename"}
              >
                {c.label}
              </span>
            )}
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9ca3af" }}>{c.name}</span>
            {c.is_builtin && (
              <span style={{ fontSize: 9, background: "#f5f5f5", color: "#bbb", borderRadius: 8, padding: "1px 5px" }}>built-in</span>
            )}
            {editId === c.id ? (
              <button onClick={() => handleSaveLabel(c.id)}
                style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 8px", cursor: "pointer" }}>
                Save
              </button>
            ) : (
              !c.is_builtin && (
                <button onClick={() => handleDelete(c.id)}
                  style={{ background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}>
                  ✕
                </button>
              )
            )}
          </div>
        ))}
      </div>

      {/* Add new folder form */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Add Folder
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", gap: 7 }}>
            <div style={{ flex: 1 }}>
              <label style={microLabel}>Key (e.g. UI_DESIGN)</label>
              <input
                value={draftName}
                onChange={e => setDraftName(e.target.value.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, ""))}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="KEY"
                style={miniInput}
              />
            </div>
            <div style={{ flex: 2 }}>
              <label style={microLabel}>Display name</label>
              <input
                value={draftLabel}
                onChange={e => setDraftLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="UI Design"
                style={miniInput}
              />
            </div>
            <div>
              <label style={microLabel}>Colour</label>
              <input type="color" value={draftColor} onChange={e => setDraftColor(e.target.value)}
                style={{ width: 40, height: 32, padding: 2, border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", display: "block" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={handleAdd} disabled={saving || !draftName || !draftLabel}
              style={{ padding: "5px 14px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {saving ? "Adding…" : "+ Add Folder"}
            </button>
            {msg && (
              <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#2e7d32" : "#b71c1c" }}>{msg}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function ProjectDashboardPage() {
  const router = useRouter();
  const [activeId, setActiveId] = useActiveProject();

  const [projects,     setProjects]     = useState<Project[]>([]);
  const [project,      setProject]      = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testcases,    setTestcases]    = useState<TestCase[]>([]);
  const [risks,        setRisks]        = useState<Risk[]>([]);
  const [cats,         setCats]         = useState<RequirementCategory[]>([]);
  const [designCats,   setDesignCats]   = useState<DesignCategory[]>([]);
  const [testCats,     setTestCats]     = useState<TestCategory[]>([]);

  // ── Staged changes ─────────────────────────────────────────────────────────
  const [name,           setName]           = useState("");
  const [desc,           setDesc]           = useState("");
  const [pendingDeletes, setPendingDeletes]  = useState<Set<string>>(new Set());
  const [pendingTypes,   setPendingTypes]    = useState<PendingType[]>([]);

  // new-type draft
  const [draftKey,    setDraftKey]    = useState("");
  const [draftLabel,  setDraftLabel]  = useState("");
  const [draftColor,  setDraftColor]  = useState("#546e7a");
  const [draftParent, setDraftParent] = useState("");

  // save state
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState("");
  // per-category level edits: catId → new sort_order value
  const [levelEdits, setLevelEdits] = useState<Record<string, number>>({});

  const isDirty =
    (project && (name !== project.name || desc !== (project.description ?? ""))) ||
    pendingDeletes.size > 0 ||
    pendingTypes.length > 0 ||
    Object.keys(levelEdits).length > 0;

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  useEffect(() => {
    if (!activeId) { setProject(null); setRequirements([]); setTestcases([]); setRisks([]); setCats([]); setDesignCats([]); setTestCats([]); return; }
    setPendingDeletes(new Set());
    setPendingTypes([]);
    setLevelEdits({});
    setDraftKey(""); setDraftLabel(""); setDraftColor("#546e7a"); setDraftParent("");
    Promise.all([
      api.projects.list(),
      api.requirements.list(activeId),
      api.testcases.list(activeId),
      api.risks.list(undefined, activeId),
      api.requirements.categories.list(activeId),
      api.design.categories.list(activeId),
      api.testcases.categories.list(activeId),
    ]).then(([projs, reqs, tcs, rks, cs, dcs, tcs2]) => {
      const p = projs.find(x => x.id === activeId) ?? null;
      setProject(p);
      setName(p?.name ?? "");
      setDesc(p?.description ?? "");
      setRequirements(reqs);
      setTestcases(tcs);
      setRisks(rks);
      setCats(cs);
      setDesignCats(dcs);
      setTestCats(tcs2);
    });
  }, [activeId]);

  // ── Stage a new type (no API call yet) ────────────────────────────────────
  function handleStageDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draftKey || !draftLabel) return;
    if (cats.some(c => c.name === draftKey) || pendingTypes.some(t => t.key === draftKey)) {
      setSaveMsg("Error: type key already exists"); return;
    }
    setPendingTypes(ts => [...ts, { key: draftKey, label: draftLabel, color: draftColor, parentId: draftParent }]);
    setDraftKey(""); setDraftLabel(""); setDraftColor("#546e7a"); setDraftParent("");
    setSaveMsg("");
  }

  // ── Mark existing type for deletion (no API call yet) ────────────────────
  function handleMarkDelete(id: string) {
    const cat = cats.find(c => c.id === id);
    if (!confirm(`Mark "${cat?.label}" for deletion?\n\nIt will be removed when you click Save All Changes.\nRequirements of this type must be removed first.`)) return;
    setPendingDeletes(s => new Set([...s, id]));
  }

  // ── Undo staged delete ────────────────────────────────────────────────────
  function handleUndoDelete(id: string) {
    setPendingDeletes(s => { const n = new Set(s); n.delete(id); return n; });
  }

  // ── Remove a pending (not-yet-saved) new type ─────────────────────────────
  function handleRemovePending(key: string) {
    setPendingTypes(ts => ts.filter(t => t.key !== key));
  }

  // ── Save ALL changes ──────────────────────────────────────────────────────
  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !activeId) return;
    setSaving(true); setSaveMsg("");
    try {
      // 1. Update project details if changed
      if (name !== project.name || desc !== (project.description ?? "")) {
        const updated = await api.projects.update(project.id, {
          name: name.trim(),
          description: desc.trim() || undefined,
        });
        setProject(updated);
        setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      }

      // 2. Delete marked types
      for (const id of pendingDeletes) {
        await api.requirements.categories.delete(id);
      }
      setCats(cs => cs.filter(c => !pendingDeletes.has(c.id)));
      setPendingDeletes(new Set());

      // 3. Add staged new types
      for (const t of pendingTypes) {
        const created = await api.requirements.categories.create({
          project_id: activeId,
          name: t.key,
          label: t.label,
          color: t.color,
          parent_id: t.parentId || undefined,
        });
        setCats(cs => [...cs, created]);
      }
      setPendingTypes([]);

      // 4. Save level changes
      for (const [catId, newLevel] of Object.entries(levelEdits)) {
        const updated = await api.requirements.categories.update(catId, { sort_order: newLevel });
        setCats(cs => cs.map(c => c.id === catId ? updated : c));
      }
      setLevelEdits({});

      setSaveMsg("✓ All changes saved successfully");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err: any) {
      setSaveMsg("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const swReqs     = requirements.filter(r => r.type === "SOFTWARE");
  const highRisks  = risks.filter(r => r.risk_level === "HIGH").length;
  const openRisks  = risks.filter(r => !r.mitigation).length;
  const userReqs   = requirements.filter(r => r.type === "USER").length;
  const systemReqs = requirements.filter(r => r.type === "SYSTEM").length;
  const reqByCat   = Object.fromEntries(cats.map(c => [c.name, requirements.filter(r => r.type === c.name).length]));
  const allCatsForParent = [...cats.filter(c => !pendingDeletes.has(c.id))];

  if (!activeId) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", textAlign: "center" }}>
        <h1 style={{ marginBottom: 8 }}>Project Dashboard</h1>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>Select a project to view and manage it.</p>
        <select value="" onChange={e => setActiveId(e.target.value)} style={{ ...inputStyle, maxWidth: 360, margin: "0 auto" }}>
          <option value="">— Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    );
  }

  return (
    <form onSubmit={handleSaveAll} style={{ maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0 }}>{project?.name ?? "…"}</h1>
            <span style={{ fontSize: 11, background: "#1565c0", color: "#fff", borderRadius: 10, padding: "2px 10px", fontWeight: 700 }}>ACTIVE</span>
            {isDirty && (
              <span style={{ fontSize: 11, background: "#fff3e0", color: "#e65100", borderRadius: 10, padding: "2px 10px", fontWeight: 700, border: "1px solid #ffcc80" }}>
                Unsaved changes
              </span>
            )}
          </div>
          <p style={{ margin: "3px 0 0", color: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}>
            {project?.id} · Created {project ? new Date(project.created_at).toLocaleDateString() : ""}
          </p>
        </div>
        <select value={activeId} onChange={e => setActiveId(e.target.value)} style={{ ...inputStyle, width: 240 }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 10 }}>
        <StatCard label="Requirements" value={requirements.length} sub={`${cats.length} types`} color="#1565c0" />
        <StatCard label="Test Cases"   value={testcases.length}    color="#0d47a1" />
        <StatCard label="Risks Total"  value={risks.length}        color="#6a1b9a" />
        <StatCard label="High Risks"   value={highRisks}           color={highRisks > 0 ? "#b71c1c" : "#2e7d32"} />
        <StatCard label="Open Risks"   value={openRisks}           color={openRisks > 0 ? "#e65100" : "#2e7d32"} />
      </div>

      {/* Requirements breakdown — wraps gracefully with any number of types */}
      {cats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, padding: "10px 14px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {[...cats].sort((a, b) => a.sort_order - b.sort_order).map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${c.color}50`, borderRadius: 20, padding: "4px 12px 4px 8px", whiteSpace: "nowrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: c.color }}>{c.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", marginLeft: 2 }}>{reqByCat[c.name] ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Left column: Project settings ── */}
        <div style={cardStyle}>
          <h2 style={h2}>Project Settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={lblStyle}>Project Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={lblStyle}>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional"
                style={{ ...inputStyle, height: 70, resize: "vertical" }} />
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Quick Links</div>
            {[
              { label: "Requirements",    href: "/requirements" },
              { label: "Risk Register",   href: "/risks" },
              { label: "Test Cases",      href: "/testcases" },
              { label: "Trace Matrix",    href: "/tracelinks" },
              { label: "Design Elements", href: "/design" },
              { label: "Documents",       href: "/documents" },
              { label: "Change Control",  href: "/change-control" },
              { label: "Releases",        href: "/release" },
            ].map(lk => (
              <button key={lk.href} type="button" onClick={() => router.push(lk.href)}
                style={{ display: "block", background: "none", border: "none", color: "#1565c0", cursor: "pointer", fontSize: 13, padding: "3px 0", textAlign: "left" }}>
                → {lk.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right column: Requirement types + Breakdown ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ ...h2, margin: 0 }}>Requirement Types</h2>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Level = hierarchy depth · lower # = parent</span>
          </div>

          {/* Column header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0 6px", borderBottom: "2px solid #f3f4f6", marginBottom: 2 }}>
            <span style={{ width: 10, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Type</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", width: 84, textAlign: "center" }}>Level (1–10)</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", width: 48, textAlign: "right" }}>Reqs</span>
            <span style={{ width: 52 }} />
          </div>

          {/* Existing types */}
          {[...cats].sort((a, b) => a.sort_order - b.sort_order).map(c => {
            const markedForDelete = pendingDeletes.has(c.id);
            const currentLevel = levelEdits[c.id] ?? c.sort_order;
            const levelChanged = levelEdits[c.id] !== undefined && levelEdits[c.id] !== c.sort_order;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                borderBottom: "1px solid #f3f4f6",
                opacity: markedForDelete ? 0.45 : 1,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, textDecoration: markedForDelete ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.label}
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 1 }}>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9ca3af" }}>{c.name}</span>
                    {c.is_builtin && <span style={{ fontSize: 9, background: "#f5f5f5", color: "#bbb", borderRadius: 8, padding: "1px 5px" }}>built-in</span>}
                  </div>
                </div>

                {/* Level editor */}
                <div style={{ width: 84, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                  <input
                    type="number"
                    min={0} max={9}
                    value={currentLevel}
                    disabled={markedForDelete}
                    onChange={e => {
                      const v = Math.max(0, Math.min(9, parseInt(e.target.value) || 0));
                      setLevelEdits(le => ({ ...le, [c.id]: v }));
                    }}
                    title="Hierarchy level: 0 = root/top. Higher numbers = lower in tree. Only types with lower levels appear as parent options."
                    style={{
                      width: 44, padding: "3px 6px", border: `1px solid ${levelChanged ? "#f59e0b" : "#d1d5db"}`,
                      borderRadius: 4, fontSize: 12, textAlign: "center",
                      background: levelChanged ? "#fffbeb" : "#fff",
                      fontWeight: levelChanged ? 700 : 400,
                    }}
                  />
                  {levelChanged && (
                    <button
                      type="button"
                      title="Reset level"
                      onClick={() => setLevelEdits(le => { const n = { ...le }; delete n[c.id]; return n; })}
                      style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>
                      ↺
                    </button>
                  )}
                </div>

                <span style={{ fontSize: 12, color: "#6b7280", width: 48, textAlign: "right", flexShrink: 0 }}>{reqByCat[c.name] ?? 0} reqs</span>
                {markedForDelete ? (
                  <button type="button" onClick={() => handleUndoDelete(c.id)}
                    style={{ fontSize: 11, background: "#fff3e0", color: "#e65100", border: "1px solid #ffcc80", borderRadius: 4, padding: "1px 8px", cursor: "pointer", flexShrink: 0 }}>
                    Undo
                  </button>
                ) : (
                  <button type="button" onClick={() => handleMarkDelete(c.id)}
                    style={{ background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/* Pending new types (staged, not yet saved) */}
          {pendingTypes.map(t => (
            <div key={t.key} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: "1px solid #f3f4f6", background: "#f0fdf4",
            }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#15803d" }}>{t.label}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>{t.key}</span>
              <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", borderRadius: 8, padding: "1px 6px", fontWeight: 700 }}>new</span>
              <button type="button" onClick={() => handleRemovePending(t.key)}
                style={{ background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>
                ✕
              </button>
            </div>
          ))}

          {/* Hierarchy preview */}
          {cats.length > 0 && (() => {
            const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);
            return (
              <div style={{ margin: "10px 0", padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Parent → Child Flow</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {sorted.map((c, i) => (
                    <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {i > 0 && <span style={{ color: "#94a3b8", fontSize: 12 }}>→</span>}
                      <span style={{
                        background: c.color + "20", border: `1px solid ${c.color}60`,
                        color: c.color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
                      }}>
                        {c.label}
                        <span style={{ fontWeight: 400, color: c.color + "99", marginLeft: 4, fontSize: 10 }}>L{c.sort_order}</span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Add type draft form */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", marginBottom: 8 }}>Add Custom Type</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Key</label>
                  <input value={draftKey} onChange={e => setDraftKey(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                    placeholder="UI" style={inputStyle} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={lblStyle}>Display Label</label>
                  <input value={draftLabel} onChange={e => setDraftLabel(e.target.value)}
                    placeholder="UI Requirements" style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Colour</label>
                  <input type="color" value={draftColor} onChange={e => setDraftColor(e.target.value)}
                    style={{ width: 44, height: 34, padding: 2, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", display: "block" }} />
                </div>
              </div>
              <div>
                <label style={lblStyle}>Parent (optional)</label>
                <select value={draftParent} onChange={e => setDraftParent(e.target.value)} style={inputStyle}>
                  <option value="">— Top level</option>
                  {allCatsForParent.map(c => <option key={c.id} value={c.id}>{c.parent_id ? "  └ " : ""}{c.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={handleStageDraft} disabled={!draftKey || !draftLabel}
                style={{ padding: "6px 14px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600, alignSelf: "flex-start" }}>
                + Stage for Save
              </button>
            </div>
          </div>
        </div>

        </div>{/* end right column */}
      </div>

      {/* ── Design & Test folder panels ── */}
      {activeId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
          <FolderPanel
            title="Design Element Folders"
            description="Group and categorize architecture & detailed design elements"
            icon="□"
            categories={designCats}
            projectId={activeId}
            onAdd={api.design.categories.create}
            onDelete={api.design.categories.delete}
            onUpdate={api.design.categories.update}
          />
          <FolderPanel
            title="Test Folders"
            description="Organize test cases into suites, phases, or test levels"
            icon="✓"
            categories={testCats}
            projectId={activeId}
            onAdd={api.testcases.categories.create}
            onDelete={api.testcases.categories.delete}
            onUpdate={api.testcases.categories.update}
          />
        </div>
      )}

      {/* ── Sticky Save All Changes bar ── */}
      <div style={{
        position: "sticky", bottom: 0, left: 0, right: 0,
        background: "#fff", borderTop: "2px solid #e5e7eb",
        padding: "14px 20px", marginTop: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {isDirty ? (
            <span style={{ color: "#e65100", fontWeight: 600 }}>
              You have unsaved changes — click Save All Changes to apply them permanently.
            </span>
          ) : (
            <span style={{ color: "#9ca3af" }}>No pending changes.</span>
          )}
          {saveMsg && (
            <span style={{ marginLeft: 16, color: saveMsg.startsWith("✓") ? "#2e7d32" : "#b71c1c", fontWeight: 600 }}>
              {saveMsg}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {isDirty && (
            <button type="button" onClick={() => {
              setName(project?.name ?? "");
              setDesc(project?.description ?? "");
              setPendingDeletes(new Set());
              setPendingTypes([]);
              setLevelEdits({});
              setSaveMsg("");
            }} style={{ padding: "8px 18px", background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
              Discard
            </button>
          )}
          <button type="submit" disabled={saving || !isDirty} style={{
            padding: "8px 24px", background: isDirty ? "#1565c0" : "#d1d5db",
            color: "#fff", border: "none", borderRadius: 4,
            cursor: isDirty ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700,
          }}>
            {saving ? "Saving…" : "Save All Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "18px 20px" };
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "18px 20px" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: "monospace", width: "100%", boxSizing: "border-box" as const };
const miniInput: React.CSSProperties  = { padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, width: "100%", boxSizing: "border-box" as const };
const h2: React.CSSProperties         = { margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1f2937" };
const lblStyle: React.CSSProperties   = { display: "block", fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 3 };
const microLabel: React.CSSProperties = { display: "block", fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 3 };
