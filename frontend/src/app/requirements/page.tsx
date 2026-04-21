"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, Requirement, RequirementCategory, UploadSummary } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function catColor(cat?: RequirementCategory | null): string {
  return cat?.color ?? "#546e7a";
}

/** Build a tree from a flat category list */
function buildCatTree(cats: RequirementCategory[]): RequirementCategory[] {
  return cats.filter(c => c.parent_id === null);
}

function childCats(cats: RequirementCategory[], parentId: string): RequirementCategory[] {
  return cats.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
}

/** Get all descendant category names (inclusive) for a given category id */
function descendantNames(cats: RequirementCategory[], id: string): string[] {
  const cat = cats.find(c => c.id === id);
  if (!cat) return [];
  const children = childCats(cats, id);
  return [cat.name, ...children.flatMap(ch => descendantNames(cats, ch.id))];
}

// ── Main page ─────────────────────────────────────────────────────────────────

function RequirementsPageInner() {
  const searchParams = useSearchParams();
  const urlType      = searchParams.get("type") ?? "";

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [reqs,       setReqs]       = useState<Requirement[]>([]);
  const [categories, setCategories] = useState<RequirementCategory[]>([]);
  const [projectId,  setProjectId]  = useState("");
  const [filterType, setFilterType] = useState<string>(urlType || "ALL");

  // Create-form state
  const [formType,    setFormType]   = useState("");
  const [formParent,  setFormParent] = useState("");
  const [formTitle,   setFormTitle]  = useState("");
  const [formDesc,    setFormDesc]   = useState("");
  const [formError,   setFormError]  = useState("");
  const [saving,      setSaving]     = useState(false);

  // Type-manager state
  const [showMgr,      setShowMgr]     = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newLabel,     setNewLabel]     = useState("");
  const [newColor,     setNewColor]     = useState("#546e7a");
  const [newParentCat, setNewParentCat] = useState("");   // parent CATEGORY id
  const [typeErr,      setTypeErr]      = useState("");

  // Upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<UploadSummary | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState("");

  useEffect(() => {
    if (urlType) { setFilterType(urlType); setFormType(urlType); }
  }, [urlType]);

  useEffect(() => { api.projects.list().then(setProjects).catch(console.error); }, []);

  useEffect(() => {
    if (!projectId) { setReqs([]); setCategories([]); return; }
    reload();
  }, [projectId]);

  const reload = async () => {
    const [r, c] = await Promise.all([
      api.requirements.list(projectId),
      api.requirements.categories.list(projectId),
    ]);
    setReqs(r);
    setCategories(c);
    // default form type to first category
    if (!formType && c.length > 0) setFormType(c[0].name);
  };

  // ── Create requirement ──────────────────────────────────────────────────

  const eligibleParents = reqs.filter(r => r.type !== "USER" || formType !== "USER"
    ? formType !== "USER"   // any non-USER type can pick any parent
    : false
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) { setFormError("Select a project first"); return; }
    setSaving(true); setFormError("");
    try {
      await api.requirements.create({
        project_id: projectId,
        type: formType,
        parent_id: formParent || undefined,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
      });
      setFormTitle(""); setFormDesc(""); setFormParent("");
      await reload();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  // ── Upload ──────────────────────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !projectId) { setUploadError("Select a project and .xlsx file"); return; }
    setUploading(true); setUploadError(""); setUploadResult(null);
    try {
      const result = await api.requirements.upload(projectId, file);
      setUploadResult(result);
      await reload();
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) { setUploadError(e.message); }
    finally { setUploading(false); }
  }

  // ── Add custom type ─────────────────────────────────────────────────────

  async function handleAddType(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newName || !newLabel) return;
    setTypeErr("");
    try {
      await api.requirements.categories.create({
        project_id: projectId,
        name: newName,
        label: newLabel,
        color: newColor,
        parent_id: newParentCat || undefined,
      });
      setNewName(""); setNewLabel(""); setNewColor("#546e7a"); setNewParentCat("");
      await reload();
    } catch (e: any) { setTypeErr(e.message); }
  }

  async function handleDeleteType(id: string) {
    setTypeErr("");
    try { await api.requirements.categories.delete(id); await reload(); }
    catch (e: any) { setTypeErr(e.message); }
  }

  // ── Tree building ───────────────────────────────────────────────────────

  // For display: filter reqs by filterType (include sub-category descendants)
  const visibleReqs = (() => {
    if (filterType === "ALL") return reqs;
    const cat = categories.find(c => c.name === filterType);
    if (!cat) return reqs.filter(r => r.type === filterType);
    const names = descendantNames(categories, cat.id);
    return reqs.filter(r => names.includes(r.type));
  })();

  // Build requirement tree: each req may have a parent_id pointing to another req
  const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));
  const rootReqs = visibleReqs.filter(r => !r.parent_id || !reqById[r.parent_id]);
  const childReqs = (parentId: string) => visibleReqs.filter(r => r.parent_id === parentId);

  const catByName = Object.fromEntries(categories.map(c => [c.name, c]));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <h1 style={{ margin: 0, color: "#0d1b2a" }}>Requirements</h1>
        {projectId && (
          <button
            onClick={() => setShowMgr(v => !v)}
            style={{ padding: "0.4rem 0.9rem", borderRadius: 6, border: `1px solid #1565c0`,
              background: showMgr ? "#1565c0" : "#e3f2fd", color: showMgr ? "#fff" : "#1565c0",
              cursor: "pointer", fontSize: "0.8rem" }}
          >
            ⚙ Manage Types
          </button>
        )}
      </div>

      {/* Project selector */}
      <div style={{ marginBottom: "1rem" }}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* ── Type Manager ─────────────────────────────────────────────── */}
      {showMgr && projectId && (
        <div style={{ ...cardStyle, marginBottom: "1.5rem", background: "#f8f9ff", border: "1px solid #c5cae9" }}>
          <h3 style={{ marginTop: 0, color: "#1a237e", fontSize: "0.95rem" }}>
            Requirement Types — {projects.find(p => p.id === projectId)?.name}
          </h3>

          {/* Category tree */}
          <CategoryTree
            cats={categories}
            onDelete={handleDeleteType}
          />

          {typeErr && (
            <div style={{ color: "#b71c1c", fontSize: "0.8rem", background: "#ffebee",
              borderRadius: 4, padding: "0.4rem 0.6rem", margin: "0.75rem 0" }}>
              {typeErr}
            </div>
          )}

          {/* Add custom type form */}
          <div style={{ borderTop: "1px solid #e8eaf6", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#3949ab", marginBottom: "0.6rem" }}>
              Add Custom Type
            </div>
            <form onSubmit={handleAddType} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <label style={{ fontSize: "0.68rem", color: "#555" }}>Parent category (optional)</label>
                <select
                  style={{ ...inputStyle, width: 190 }}
                  value={newParentCat}
                  onChange={e => setNewParentCat(e.target.value)}
                >
                  <option value="">— Top level (no parent)</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.parent_id ? "  └ " : ""}{c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <label style={{ fontSize: "0.68rem", color: "#555" }}>Internal key (e.g. UI)</label>
                <input
                  style={{ ...inputStyle, width: 140 }}
                  placeholder="UI"
                  value={newName}
                  onChange={e => setNewName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <label style={{ fontSize: "0.68rem", color: "#555" }}>Display label</label>
                <input
                  style={{ ...inputStyle, width: 180 }}
                  placeholder="UI Requirements"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <label style={{ fontSize: "0.68rem", color: "#555" }}>Colour</label>
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                  style={{ width: 48, height: 34, padding: 2, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }} />
              </div>
              <button type="submit" disabled={!newName || !newLabel}
                style={{ ...btnStyle, background: "#2e7d32", marginBottom: 0 }}>
                + Add
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Filter tabs (dynamic, category tree aware) ────────────────── */}
      {projectId && categories.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <FilterTab label="All" value="ALL" count={reqs.length}
            active={filterType === "ALL"} color="#546e7a" onClick={() => setFilterType("ALL")} />
          {buildCatTree(categories).map(root => (
            <CategoryTabGroup
              key={root.id}
              root={root}
              all={categories}
              reqs={reqs}
              filterType={filterType}
              onFilter={setFilterType}
            />
          ))}
        </div>
      )}

      {/* ── Create + Upload forms ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Add Requirement</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {/* Type selector — hierarchical options */}
            <div>
              <label style={{ fontSize: "0.7rem", color: "#555", display: "block", marginBottom: 3 }}>Type</label>
              <select value={formType} onChange={e => { setFormType(e.target.value); setFormParent(""); }}
                style={inputStyle} disabled={!projectId}>
                {categories.length === 0 && <option value="">— Select project first</option>}
                {buildCatTree(categories).map(root => (
                  <CategoryOptGroup key={root.id} root={root} all={categories} />
                ))}
              </select>
            </div>

            {/* Optional parent requirement (not shown for USER) */}
            {formType !== "USER" && (
              <div>
                <label style={{ fontSize: "0.7rem", color: "#555", display: "block", marginBottom: 3 }}>
                  Parent requirement <span style={{ color: "#999" }}>(optional)</span>
                </label>
                <select value={formParent} onChange={e => setFormParent(e.target.value)} style={inputStyle}>
                  <option value="">— None (standalone)</option>
                  {reqs.filter(r => r.type !== formType).map(r => {
                    const c = catByName[r.type];
                    return (
                      <option key={r.id} value={r.id}>
                        {r.readable_id} [{c?.label ?? r.type}] {r.title}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <input placeholder="Title *" value={formTitle} onChange={e => setFormTitle(e.target.value)} required style={inputStyle} />
            <textarea placeholder="Description (optional)" value={formDesc} onChange={e => setFormDesc(e.target.value)}
              style={{ ...inputStyle, height: 56, resize: "vertical" }} />
            {formError && <p style={{ color: "red", margin: 0, fontSize: "0.82rem" }}>{formError}</p>}
            <button type="submit" disabled={saving || !projectId || !formType} style={btnStyle}>
              {saving ? "Saving…" : "Add Requirement"}
            </button>
          </form>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Upload Excel</h2>
          <p style={{ color: "#666", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
            Columns: <code>type</code>, <code>title</code>, <code>description</code>, <code>parent_title</code>
            <br /><span style={{ color: "#888" }}>parent_title is optional for all types.</span>
          </p>
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            <input type="file" accept=".xlsx" ref={fileRef} style={inputStyle} />
            {uploadError && <p style={{ color: "red", margin: 0, fontSize: "0.82rem" }}>{uploadError}</p>}
            <button type="submit" disabled={uploading || !projectId} style={btnStyle}>
              {uploading ? "Uploading…" : "Upload .xlsx"}
            </button>
          </form>
          {uploadResult && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ color: "#2e7d32", margin: "0 0 0.25rem" }}>✓ Added: {uploadResult.total_added}</p>
              {uploadResult.total_skipped > 0 && (
                <details>
                  <summary style={{ color: "#e65100", cursor: "pointer", fontSize: "0.82rem" }}>
                    ⚠ Skipped: {uploadResult.total_skipped}
                  </summary>
                  <ul style={{ fontSize: "0.78rem", margin: "0.4rem 0" }}>
                    {uploadResult.skipped.map((s, i) => <li key={i}><b>{s.title}</b>: {s.reason}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ── Requirements tree ─────────────────────────────────────────── */}
      <section style={{ marginTop: "2rem" }}>
        <h2>Requirements ({visibleReqs.length}{filterType !== "ALL" ? ` — ${catByName[filterType]?.label ?? filterType}` : ""})</h2>
        {!projectId ? (
          <p style={{ color: "#888" }}>Select a project.</p>
        ) : reqs.length === 0 ? (
          <p style={{ color: "#888" }}>No requirements yet.</p>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "0.75rem 1rem" }}>
            {rootReqs.length === 0 && <p style={{ color: "#aaa", fontSize: "0.82rem" }}>Nothing matches the current filter.</p>}
            {rootReqs.map(r => (
              <ReqTree key={r.id} req={r} allReqs={visibleReqs} cats={categories} depth={0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Renders a requirement and all its visible children recursively */
function ReqTree({ req, allReqs, cats, depth }: {
  req: Requirement; allReqs: Requirement[]; cats: RequirementCategory[]; depth: number;
}) {
  const cat   = cats.find(c => c.name === req.type);
  const color = catColor(cat);
  const children = allReqs.filter(r => r.parent_id === req.id);

  return (
    <div>
      <div style={{
        display: "flex", gap: "0.6rem", alignItems: "baseline",
        padding: "0.36rem 0", borderBottom: "1px solid #f5f5f5",
        paddingLeft: `${depth * 1.5}rem`,
      }}>
        {depth > 0 && <span style={{ color: "#ccc", fontSize: "0.78rem", flexShrink: 0 }}>└</span>}
        <span style={{
          fontFamily: "monospace", fontWeight: 700, fontSize: "0.72rem",
          color: color, flexShrink: 0, minWidth: 68, letterSpacing: 0.3,
        }}>
          {req.readable_id}
        </span>
        <span style={{
          background: color, color: "#fff", borderRadius: 3,
          padding: "1px 7px", fontSize: "0.67rem", flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {cat?.label ?? req.type}
        </span>
        <span style={{ fontWeight: 500, fontSize: "0.84rem" }}>{req.title}</span>
        {req.description && <span style={{ color: "#999", fontSize: "0.76rem" }}>— {req.description}</span>}
      </div>
      {children.map(c => (
        <ReqTree key={c.id} req={c} allReqs={allReqs} cats={cats} depth={depth + 1} />
      ))}
    </div>
  );
}

/** Category tree display in the type manager */
function CategoryTree({ cats, onDelete }: {
  cats: RequirementCategory[]; onDelete: (id: string) => void;
}) {
  const roots = buildCatTree(cats);
  const renderCat = (cat: RequirementCategory, depth = 0) => {
    const children = childCats(cats, cat.id);
    return (
      <div key={cat.id}>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.3rem 0.4rem",
          paddingLeft: `${depth * 1.2 + 0.4}rem`,
          borderRadius: 4,
          background: depth === 0 ? "#f0f4ff" : "transparent",
          marginBottom: 2,
        }}>
          {depth > 0 && <span style={{ color: "#bbb", fontSize: "0.72rem" }}>└</span>}
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: catColor(cat), flexShrink: 0 }} />
          <span style={{ fontSize: "0.8rem", fontWeight: depth === 0 ? "600" : "normal", color: "#222" }}>
            {cat.label}
          </span>
          <span style={{ fontSize: "0.65rem", color: "#999", fontFamily: "monospace" }}>({cat.name})</span>
          {cat.is_builtin
            ? <span style={{ fontSize: "0.58rem", color: "#aaa", background: "#f5f5f5", borderRadius: 8, padding: "1px 5px" }}>built-in</span>
            : <button onClick={() => onDelete(cat.id)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: "0.72rem" }}>
                ✕
              </button>
          }
        </div>
        {children.map(ch => renderCat(ch, depth + 1))}
      </div>
    );
  };
  return <div style={{ marginBottom: "0.25rem" }}>{roots.map(r => renderCat(r))}</div>;
}

/** <optgroup>/<option> tree for the type selector in the create form */
function CategoryOptGroup({ root, all }: { root: RequirementCategory; all: RequirementCategory[] }) {
  const children = childCats(all, root.id);
  if (children.length === 0) {
    return <option value={root.name}>{root.label}</option>;
  }
  return (
    <optgroup label={root.label}>
      <option value={root.name}>{root.label} (general)</option>
      {children.map(ch => (
        <option key={ch.id} value={ch.name}>  └ {ch.label}</option>
      ))}
    </optgroup>
  );
}

/** Filter tab group: root cat + expandable sub-cats */
function CategoryTabGroup({ root, all, reqs, filterType, onFilter }: {
  root: RequirementCategory; all: RequirementCategory[];
  reqs: Requirement[]; filterType: string; onFilter: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = childCats(all, root.id);
  const rootNames = descendantNames(all, root.id);
  const rootCount = reqs.filter(r => rootNames.includes(r.type)).length;
  const rootActive = filterType === root.name || children.some(c => filterType === c.name);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      <FilterTab
        label={root.label}
        value={root.name}
        count={rootCount}
        active={filterType === root.name}
        color={catColor(root)}
        onClick={() => { onFilter(root.name); }}
      />
      {children.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            title="Show sub-types"
            style={{
              background: rootActive ? catColor(root) + "20" : "transparent",
              border: `1px solid ${catColor(root)}60`,
              borderRadius: 10, color: catColor(root),
              fontSize: "0.6rem", cursor: "pointer", padding: "0.15rem 0.35rem",
            }}
          >
            {expanded ? "▲" : "▼"}
          </button>
          {expanded && children.map(ch => (
            <FilterTab
              key={ch.id}
              label={`└ ${ch.label}`}
              value={ch.name}
              count={reqs.filter(r => r.type === ch.name).length}
              active={filterType === ch.name}
              color={catColor(ch)}
              onClick={() => onFilter(ch.name)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function FilterTab({ label, value, count, active, color, onClick }: {
  label: string; value: string; count: number; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "0.26rem 0.8rem", borderRadius: 16,
      border: `1px solid ${color}`,
      background: active ? color : "transparent",
      color: active ? "#fff" : color,
      fontSize: "0.73rem", cursor: "pointer",
      fontWeight: active ? "bold" : "normal",
      whiteSpace: "nowrap",
    }}>
      {label} <span style={{ opacity: 0.7 }}>({count})</span>
    </button>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function RequirementsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "#888" }}>Loading…</div>}>
      <RequirementsPageInner />
    </Suspense>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.42rem 0.65rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "monospace", fontSize: "0.84rem", width: "100%", boxSizing: "border-box" };
const btnStyle: React.CSSProperties   = { padding: "0.52rem 1.1rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
