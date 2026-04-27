"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Project, Requirement, TestCase, Risk, RequirementCategory, DesignCategory, TestCategory, RiskCategory } from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";

// ── Reusable folder/category manager panel (with level editor) ───────────────
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
  const [cats,        setCats]        = useState<T[]>(categories);
  const [draftName,   setDraftName]   = useState("");
  const [draftLabel,  setDraftLabel]  = useState("");
  const [draftColor,  setDraftColor]  = useState("#546e7a");
  const [draftLevel,  setDraftLevel]  = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState("");
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editLabel,   setEditLabel]   = useState("");
  const [levelEdits,  setLevelEdits]  = useState<Record<string, number>>({});

  useEffect(() => { setCats(categories); }, [categories]);

  const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);

  async function handleAdd() {
    if (!draftName || !draftLabel) return;
    setSaving(true); setMsg("");
    try {
      const created = await onAdd({ project_id: projectId, name: draftName, label: draftLabel, color: draftColor });
      // Set level immediately after creation if non-zero
      const withLevel = draftLevel !== created.sort_order
        ? await onUpdate(created.id, { sort_order: draftLevel })
        : created;
      setCats(cs => [...cs, withLevel as T].sort((a, b) => a.sort_order - b.sort_order));
      setDraftName(""); setDraftLabel(""); setDraftColor("#546e7a"); setDraftLevel(0);
      setMsg("✓ Added");
      setTimeout(() => setMsg(""), 2000);
    } catch (err: any) { setMsg("✗ " + err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    const cat = cats.find(c => c.id === id);
    if (cat?.is_builtin) { setMsg("✗ Built-in folders cannot be deleted"); setTimeout(() => setMsg(""), 2000); return; }
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

  async function handleSaveLevel(id: string, level: number) {
    try {
      const updated = await onUpdate(id, { sort_order: level });
      setCats(cs => [...cs.map(c => c.id === id ? { ...c, sort_order: updated.sort_order } as T : c)]
        .sort((a, b) => a.sort_order - b.sort_order));
      setLevelEdits(le => { const n = { ...le }; delete n[id]; return n; });
    } catch (err: any) { setMsg("✗ " + err.message); }
  }

  return (
    <div style={panelStyle}>
      {/* Panel header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{description}</div>
        </div>
      </div>

      {/* Column header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 6px", borderBottom: "2px solid #f3f4f6", marginBottom: 2 }}>
        <span style={{ width: 10, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Folder</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", width: 72, textAlign: "center" }}>Level (0–9)</span>
        <span style={{ width: 30 }} />
      </div>

      {/* Folder rows */}
      <div style={{ marginBottom: 12 }}>
        {cats.length === 0 && (
          <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0", fontStyle: "italic" }}>No folders yet.</div>
        )}
        {sorted.map(c => {
          const currentLevel = levelEdits[c.id] ?? c.sort_order;
          const levelChanged = levelEdits[c.id] !== undefined;
          return (
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ fontSize: 13, fontWeight: 500, cursor: c.is_builtin ? "default" : "pointer", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    onClick={() => { if (!c.is_builtin) { setEditId(c.id); setEditLabel(c.label); } }}
                    title={c.is_builtin ? c.label : `${c.label} — click to rename`}
                  >
                    {c.label}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9ca3af" }}>{c.name}
                    {c.is_builtin && <span style={{ marginLeft: 5, background: "#f5f5f5", color: "#bbb", borderRadius: 8, padding: "1px 5px" }}>built-in</span>}
                  </span>
                </div>
              )}

              {/* Level editor */}
              <div style={{ width: 72, display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                <input
                  type="number" min={0} max={9}
                  value={currentLevel}
                  onChange={e => setLevelEdits(le => ({ ...le, [c.id]: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) }))}
                  onBlur={() => { if (levelChanged) handleSaveLevel(c.id, currentLevel); }}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveLevel(c.id, currentLevel); if (e.key === "Escape") setLevelEdits(le => { const n = { ...le }; delete n[c.id]; return n; }); }}
                  title="Hierarchy level: 0 = root/top. Higher = deeper in tree. Items with lower levels appear as parent options."
                  style={{
                    width: 42, padding: "3px 5px", textAlign: "center", fontSize: 12,
                    border: `1px solid ${levelChanged ? "#f59e0b" : "#d1d5db"}`,
                    background: levelChanged ? "#fffbeb" : "#fff",
                    borderRadius: 4, fontWeight: levelChanged ? 700 : 400,
                  }}
                />
              </div>

              {editId === c.id ? (
                <button type="button" onClick={() => handleSaveLabel(c.id)}
                  style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 8px", cursor: "pointer", flexShrink: 0 }}>
                  Save
                </button>
              ) : (
                !c.is_builtin && (
                  <button type="button" onClick={() => handleDelete(c.id)}
                    style={{ background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}>
                    ✕
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Hierarchy flow preview */}
      {sorted.length > 0 && (
        <div style={{ margin: "4px 0 12px", padding: "6px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Parent → Child Flow
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {sorted.map((c, i) => (
              <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: "#94a3b8", fontSize: 11 }}>→</span>}
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
      )}

      {/* Add new folder form */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Add Folder
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={microLabel}>Key</label>
              <input value={draftName}
                onChange={e => setDraftName(e.target.value.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, ""))}
                placeholder="KEY" style={miniInput} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={microLabel}>Display name</label>
              <input value={draftLabel} onChange={e => setDraftLabel(e.target.value)}
                placeholder="Name" style={miniInput} />
            </div>
            <div style={{ width: 52 }}>
              <label style={microLabel}>Level</label>
              <input type="number" min={0} max={9} value={draftLevel}
                onChange={e => setDraftLevel(Math.max(0, Math.min(9, parseInt(e.target.value) || 0)))}
                style={{ ...miniInput, width: "100%", textAlign: "center" }} />
            </div>
            <div>
              <label style={microLabel}>Color</label>
              <input type="color" value={draftColor} onChange={e => setDraftColor(e.target.value)}
                style={{ width: 38, height: 30, padding: 2, border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", display: "block" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={handleAdd} disabled={saving || !draftName || !draftLabel}
              style={{ padding: "5px 14px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {saving ? "Adding…" : "+ Add Folder"}
            </button>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#2e7d32" : "#b71c1c" }}>{msg}</span>}
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
  const [riskCats,     setRiskCats]     = useState<RiskCategory[]>([]);

  const [name,    setName]    = useState("");
  const [desc,    setDesc]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const isDirty = !!(project && (name !== project.name || desc !== (project.description ?? "")));

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  useEffect(() => {
    if (!activeId) { setProject(null); setRequirements([]); setTestcases([]); setRisks([]); setCats([]); setDesignCats([]); setTestCats([]); setRiskCats([]); return; }
    Promise.all([
      api.projects.list(),
      api.requirements.list(activeId),
      api.testcases.list(activeId),
      api.risks.list(undefined, activeId),
      api.requirements.categories.list(activeId),
      api.design.categories.list(activeId),
      api.testcases.categories.list(activeId),
      api.risks.categories.list(activeId),
    ]).then(([projs, reqs, tcs, rks, cs, dcs, tcs2, rcs]) => {
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
      setRiskCats(rcs);
    });
  }, [activeId]);

  // ── Save project name/description ────────────────────────────────────────
  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !activeId || !isDirty) return;
    setSaving(true); setSaveMsg("");
    try {
      const updated = await api.projects.update(project.id, {
        name: name.trim(),
        description: desc.trim() || undefined,
      });
      setProject(updated);
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2500);
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
  const reqByCat = Object.fromEntries(cats.map(c => [c.name, requirements.filter(r => r.type === c.name).length]));

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

      {/* Project settings — full width */}
      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ ...h2, margin: 0 }}>Project Settings</h2>
            <div>
              <label style={lblStyle}>Project Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={lblStyle}>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional"
                style={{ ...inputStyle, height: 60, resize: "vertical" }} />
            </div>
            <button type="submit" disabled={saving || !isDirty}
              style={{ padding: "7px 18px", background: isDirty ? "#1565c0" : "#d1d5db", color: "#fff", border: "none", borderRadius: 4, cursor: isDirty ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, alignSelf: "flex-start" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith("✓") ? "#2e7d32" : "#b71c1c" }}>{saveMsg}</span>}
          </div>
          <div>
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
      </div>


      {/* ── 4 Folder panels: Requirements, Design, Test, Risk ── */}
      {activeId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
          <FolderPanel
            title="Requirement Folders"
            description="Organize requirement categories (types) and their hierarchy levels"
            icon="📋"
            categories={cats}
            projectId={activeId}
            onAdd={d => api.requirements.categories.create(d)}
            onDelete={api.requirements.categories.delete}
            onUpdate={api.requirements.categories.update}
          />
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
          <FolderPanel
            title="Risk Register Folders"
            description="Categorize risks by type (safety, cybersecurity, performance, etc.)"
            icon="⚠"
            categories={riskCats}
            projectId={activeId}
            onAdd={api.risks.categories.create}
            onDelete={api.risks.categories.delete}
            onUpdate={api.risks.categories.update}
          />
        </div>
      )}

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
