"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, Requirement, RequirementCategory, UploadSummary, DesignElement, DesignLink, AIGeneratedRequirement, AICategoryMeta } from "@/lib/api";

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
  const [projectId,  setProjectId]  = useActiveProject();
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

  // AI generation state
  const [showAI,        setShowAI]        = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiFocus,       setAiFocus]       = useState("");
  const [aiCountPerCat, setAiCountPerCat] = useState(5);
  const [aiGenerating,  setAiGenerating]  = useState(false);
  const [aiError,       setAiError]       = useState("");
  const [aiResults,     setAiResults]     = useState<AIGeneratedRequirement[]>([]);
  const [aiSelected,    setAiSelected]    = useState<Set<number>>(new Set());
  const [aiEdited,      setAiEdited]      = useState<AIGeneratedRequirement[]>([]);
  const [aiImporting,   setAiImporting]   = useState(false);
  const [aiTokens,      setAiTokens]      = useState(0);
  const [aiCategories,  setAiCategories]  = useState<AICategoryMeta[]>([]);

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
    // default form type to first root-level category (e.g. USER, not SOFTWARE)
    if (!formType && c.length > 0) {
      const roots = c.filter(cat => cat.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
      setFormType(roots[0]?.name ?? c[0].name);
    }
  };

  // ── Create requirement ──────────────────────────────────────────────────

  const currentCat = categories.find(c => c.name === formType);
  // Only show types with a strictly lower sort_order (higher in hierarchy) as valid parents
  const eligibleParentTypes = new Set(
    categories.filter(c => currentCat && c.sort_order < currentCat.sort_order).map(c => c.name)
  );
  const eligibleParents = reqs.filter(r => eligibleParentTypes.has(r.type));
  const canHaveParent   = !!currentCat && categories.some(c => c.sort_order < currentCat.sort_order);

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
    const cat = categories.find(c => c.id === id);
    if (!confirm(`Permanently delete the "${cat?.label ?? "this"}" requirement type?\n\nThis cannot be undone. Requirements of this type must be removed first.`)) return;
    setTypeErr("");
    try { await api.requirements.categories.delete(id); await reload(); }
    catch (e: any) { setTypeErr(e.message); }
  }

  // ── AI generation ──────────────────────────────────────────────────────

  async function handleAIGenerate() {
    if (!projectId || !aiDescription.trim()) return;
    setAiGenerating(true); setAiError(""); setAiResults([]); setAiSelected(new Set()); setAiEdited([]); setAiCategories([]);
    try {
      const res = await api.ai.generateRequirements({
        project_id: projectId,
        product_description: aiDescription.trim(),
        focus_area: aiFocus.trim() || undefined,
        count_per_category: aiCountPerCat,
      });
      setAiResults(res.requirements);
      setAiEdited(res.requirements.map(r => ({ ...r })));
      setAiSelected(new Set(res.requirements.map((_, i) => i)));
      setAiTokens(res.tokens_used);
      setAiCategories(res.categories);
    } catch (e: any) { setAiError(e.message); }
    finally { setAiGenerating(false); }
  }

  async function handleAIImport() {
    if (!projectId) return;
    const toImport = aiEdited.filter((_, i) => aiSelected.has(i));
    if (!toImport.length) return;
    setAiImporting(true); setAiError("");
    try {
      for (const req of toImport) {
        await api.requirements.create({
          project_id: projectId,
          type: req.type,
          title: req.title,
          description: req.description,
        });
      }
      await reload();
      setShowAI(false);
      setAiResults([]); setAiEdited([]); setAiSelected(new Set());
      setAiDescription(""); setAiFocus("");
    } catch (e: any) { setAiError(e.message); }
    finally { setAiImporting(false); }
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
  const visibleIds = new Set(visibleReqs.map(r => r.id));
  const rootReqs = visibleReqs.filter(r => !r.parent_id || !visibleIds.has(r.parent_id));
  const childReqs = (parentId: string) => visibleReqs.filter(r => r.parent_id === parentId);

  const catByName = Object.fromEntries(categories.map(c => [c.name, c]));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <h1 style={{ margin: 0, color: "#0d1b2a" }}>Requirements</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {projectId && (
            <button
              onClick={() => setShowAI(true)}
              style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: "none", borderRadius: 6, padding: "0.45rem 1rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
            >
              ✨ Generate with AI
            </button>
          )}
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Manage requirement types in Projects → ⚙ Manage</span>
        </div>
      </div>

      {/* ── AI Generation Modal ──────────────────────────────────────────── */}
      {showAI && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 820, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            {/* Modal header */}
            <div style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", borderRadius: "12px 12px 0 0", padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.05rem" }}>✨ AI Requirements Generator</div>
                <div style={{ color: "#c4b5fd", fontSize: "0.78rem", marginTop: 2 }}>Powered by Claude — IEC 62304 aligned · Human review required</div>
              </div>
              <button onClick={() => setShowAI(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "1rem" }}>✕</button>
            </div>

            <div style={{ padding: "1.5rem" }}>
              {/* Input area */}
              {aiResults.length === 0 ? (
                <div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 6, color: "#374151" }}>
                      Describe your medical device / software system *
                    </label>
                    <textarea
                      value={aiDescription}
                      onChange={e => setAiDescription(e.target.value)}
                      placeholder="e.g. An ultrasound-guided robotic surgical system that assists surgeons in minimally invasive procedures. The software controls the robotic arm, processes real-time ultrasound images, and provides safety interlocks..."
                      rows={5}
                      style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.6rem 0.8rem", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: "1.25rem" }}>
                    <div>
                      <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 6, color: "#374151" }}>
                        Focus area (optional)
                      </label>
                      <input
                        value={aiFocus}
                        onChange={e => setAiFocus(e.target.value)}
                        placeholder="e.g. safety interlocks, image processing, data security, usability..."
                        style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 0.8rem", fontSize: "0.85rem", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 6, color: "#374151" }}>
                        Req. per category
                      </label>
                      <select
                        value={aiCountPerCat}
                        onChange={e => setAiCountPerCat(Number(e.target.value))}
                        style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 0.6rem", fontSize: "0.85rem", width: "100%" }}
                      >
                        <option value={3}>3 — quick</option>
                        <option value={5}>5 — standard</option>
                        <option value={8}>8 — detailed</option>
                        <option value={10}>10 — thorough</option>
                        <option value={15}>15 — comprehensive</option>
                      </select>
                    </div>
                  </div>
                  {aiError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "0.6rem 0.8rem", color: "#b91c1c", fontSize: "0.82rem", marginBottom: "1rem" }}>{aiError}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={() => setShowAI(false)} style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 1.2rem", cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
                    <button
                      onClick={handleAIGenerate}
                      disabled={!aiDescription.trim() || aiGenerating}
                      style={{ background: aiGenerating ? "#a78bfa" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem 1.4rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      {aiGenerating ? "Generating…" : "Generate Requirements"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Review area */
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>Review Generated Requirements</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 2 }}>
                        {aiSelected.size} of {aiResults.length} selected · {aiTokens} tokens used · Edit any requirement before importing
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setAiSelected(new Set(aiResults.map((_, i) => i)))} style={{ fontSize: "0.75rem", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 4, padding: "0.3rem 0.7rem", cursor: "pointer" }}>Select all</button>
                      <button onClick={() => setAiSelected(new Set())} style={{ fontSize: "0.75rem", background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 4, padding: "0.3rem 0.7rem", cursor: "pointer" }}>Deselect all</button>
                    </div>
                  </div>

                  {/* Group by project category (dynamic) */}
                  {(aiCategories.length > 0 ? aiCategories : [{ name: "OTHER", label: "Other", sort_order: 0, parent_name: null }])
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map(cat => {
                      const group = aiEdited.map((r, i) => ({ r, i })).filter(({ r }) => r.type === cat.name);
                      if (!group.length) return null;
                      // Pick a colour from a palette based on sort_order index
                      const PALETTES = [
                        { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
                        { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
                        { bg: "#faf5ff", border: "#e9d5ff", text: "#7e22ce" },
                        { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
                        { bg: "#fdf4ff", border: "#f0abfc", text: "#a21caf" },
                        { bg: "#f0fdfa", border: "#99f6e4", text: "#0f766e" },
                        { bg: "#fefce8", border: "#fde68a", text: "#b45309" },
                        { bg: "#fff1f2", border: "#fecdd3", text: "#be123c" },
                      ];
                      const tc = PALETTES[aiCategories.indexOf(cat) % PALETTES.length];
                      return (
                        <div key={cat.name} style={{ marginBottom: "1.25rem" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 6, padding: "0.3rem 0.75rem", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            {cat.label}
                            {cat.parent_name && <span style={{ fontWeight: 400, opacity: 0.7 }}>↳ {cat.parent_name}</span>}
                            <span style={{ fontWeight: 400, opacity: 0.7 }}>({group.length})</span>
                          </div>
                          {group.map(({ r, i }) => (
                            <div key={i} style={{ border: `1px solid ${aiSelected.has(i) ? tc.border : "#e5e7eb"}`, borderRadius: 8, marginBottom: 8, background: aiSelected.has(i) ? tc.bg : "#f9fafb", overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0.75rem 1rem" }}>
                                <input
                                  type="checkbox"
                                  checked={aiSelected.has(i)}
                                  onChange={e => {
                                    const s = new Set(aiSelected);
                                    e.target.checked ? s.add(i) : s.delete(i);
                                    setAiSelected(s);
                                  }}
                                  style={{ marginTop: 3, accentColor: "#7c3aed", width: 16, height: 16, cursor: "pointer" }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <input
                                    value={r.title}
                                    onChange={e => { const ed = [...aiEdited]; ed[i] = { ...ed[i], title: e.target.value }; setAiEdited(ed); }}
                                    style={{ width: "100%", fontWeight: 600, fontSize: "0.85rem", border: "1px solid #e5e7eb", borderRadius: 4, padding: "0.3rem 0.5rem", marginBottom: 6, boxSizing: "border-box" }}
                                  />
                                  <textarea
                                    value={r.description}
                                    onChange={e => { const ed = [...aiEdited]; ed[i] = { ...ed[i], description: e.target.value }; setAiEdited(ed); }}
                                    rows={2}
                                    style={{ width: "100%", fontSize: "0.78rem", border: "1px solid #e5e7eb", borderRadius: 4, padding: "0.3rem 0.5rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                                  />
                                  <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 4 }}>
                                    {r.rationale}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })
                  }

                  {aiError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "0.6rem 0.8rem", color: "#b91c1c", fontSize: "0.82rem", marginBottom: "1rem" }}>{aiError}</div>}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e7eb", paddingTop: "1rem", marginTop: "0.5rem" }}>
                    <button onClick={() => { setAiResults([]); setAiEdited([]); setAiSelected(new Set()); setAiError(""); }} style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 1rem", cursor: "pointer", fontSize: "0.82rem" }}>
                      ← Regenerate
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setShowAI(false)} style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 1rem", cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                      <button
                        onClick={handleAIImport}
                        disabled={aiSelected.size === 0 || aiImporting}
                        style={{ background: aiSelected.size === 0 ? "#a78bfa" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem 1.4rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
                      >
                        {aiImporting ? "Importing…" : `Confirm & Import ${aiSelected.size} requirement${aiSelected.size !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project selector */}
      <div style={{ marginBottom: "1rem" }}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* ── Type Manager (hidden — now in Projects page) ─────────────── */}
      {false && showMgr && projectId && (
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

            {/* Parent requirement — only shown when eligible parent types exist */}
            {canHaveParent && (
              <div>
                <label style={{ fontSize: "0.7rem", color: "#555", display: "block", marginBottom: 3 }}>
                  Parent requirement <span style={{ color: "#999" }}>(optional)</span>
                  {eligibleParentTypes.size > 0 && (
                    <span style={{ marginLeft: 6, color: "#888", fontStyle: "italic" }}>
                      — from: {[...eligibleParentTypes].map(t => catByName[t]?.label ?? t).join(", ")}
                    </span>
                  )}
                </label>
                <select value={formParent} onChange={e => setFormParent(e.target.value)} style={inputStyle}>
                  <option value="">— None (standalone)</option>
                  {eligibleParents.map(r => {
                    const c = catByName[r.type];
                    return (
                      <option key={r.id} value={r.id}>
                        {r.readable_id} [{c?.label ?? r.type}] {r.title}
                      </option>
                    );
                  })}
                </select>
                {eligibleParents.length === 0 && (
                  <div style={{ fontSize: 11, color: "#e65100", marginTop: 3 }}>
                    No eligible parent requirements yet — add {[...eligibleParentTypes].map(t => catByName[t]?.label ?? t).join(" or ")} requirements first.
                  </div>
                )}
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
              <ReqTree key={r.id} req={r} allReqs={reqs} cats={categories} depth={0} onReload={reload} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Inline edit form for a single requirement */
function EditReqForm({ req, cats, allReqs, onSave, onCancel }: {
  req: Requirement;
  cats: RequirementCategory[];
  allReqs: Requirement[];
  onSave: (updated: Requirement) => void;
  onCancel: () => void;
}) {
  const [title, setTitle]   = useState(req.title);
  const [desc, setDesc]     = useState(req.description ?? "");
  const [parentId, setParentId] = useState(req.parent_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    for (const ref of [titleRef, descRef]) {
      if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
    }
  }, []);

  // Only show types with lower sort_order (higher in hierarchy) as valid parents
  const myCat = cats.find(c => c.name === req.type);
  const eligibleParents = allReqs.filter(r => {
    if (r.id === req.id) return false;
    const parentCat = cats.find(c => c.name === r.type);
    return myCat && parentCat && parentCat.sort_order < myCat.sort_order;
  });
  const canHaveParent = !!myCat && cats.some(c => c.sort_order < myCat.sort_order);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await api.requirements.update(req.id, {
        title: title.trim(),
        description: desc.trim() || null,
        parent_id: parentId || null,
      });
      onSave(updated);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: "#fffde7", border: "1px solid #ffd54f",
      borderRadius: 6, padding: "10px 12px", marginBottom: 4,
    }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 200px" }}>
          <label style={editLabelStyle}>Title *</label>
          <textarea
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
            required
            rows={1}
            style={{ ...editInputStyle, resize: "none", overflow: "hidden", lineHeight: "1.5", minHeight: 32 }}
          />
        </div>
        <div style={{ flex: "3 1 280px" }}>
          <label style={editLabelStyle}>Description</label>
          <textarea
            ref={descRef}
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
            placeholder="Optional"
            rows={1}
            style={{ ...editInputStyle, resize: "none", overflow: "hidden", lineHeight: "1.5", minHeight: 32 }}
          />
        </div>
        {canHaveParent && (
          <div style={{ flex: "2 1 180px" }}>
            <label style={editLabelStyle}>Parent requirement</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={editInputStyle}>
              <option value="">— None</option>
              {eligibleParents.map(r => {
                const c = cats.find(c => c.name === r.type);
                return (
                  <option key={r.id} value={r.id}>
                    {r.readable_id} [{c?.label ?? r.type}] {r.title}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>
      {error && <p style={{ color: "red", margin: "0 0 6px", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" disabled={saving} style={editSaveStyle}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} style={editCancelStyle}>Cancel</button>
      </div>
    </form>
  );
}

/** Renders a requirement and all its visible children recursively */
function ReqTree({ req, allReqs, cats, depth, onReload }: {
  req: Requirement; allReqs: Requirement[]; cats: RequirementCategory[];
  depth: number; onReload: () => void;
}) {
  const [editing,    setEditing]    = useState(false);
  const [assigning,  setAssigning]  = useState(false);
  const [localReq,   setLocalReq]   = useState(req);

  const cat      = cats.find(c => c.name === localReq.type);
  const color    = catColor(cat);
  const children = allReqs.filter(r => r.parent_id === req.id);
  const childCount = children.length;

  async function handleDelete() {
    if (!confirm(`Delete "${localReq.readable_id} ${localReq.title}"? This cannot be undone.`)) return;
    try {
      await api.requirements.delete(req.id);
      onReload();
    } catch (e: any) { alert("Delete failed: " + e.message); }
  }

  return (
    <div>
      {/* Row */}
      <div style={{
        display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap",
        padding: "0.32rem 0.4rem 0.32rem 0",
        borderBottom: assigning ? "none" : "1px solid #f5f5f5",
        paddingLeft: `${depth * 1.5}rem`,
      }}>
        {depth > 0 && <span style={{ color: "#ccc", fontSize: "0.78rem", flexShrink: 0 }}>└</span>}
        <span style={{
          fontFamily: "monospace", fontWeight: 700, fontSize: "0.72rem",
          color: color, flexShrink: 0, minWidth: 68, letterSpacing: 0.3,
        }}>
          {localReq.readable_id}
        </span>
        <span style={{
          background: color, color: "#fff", borderRadius: 3,
          padding: "1px 7px", fontSize: "0.67rem", flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {cat?.label ?? localReq.type}
        </span>
        <span style={{ fontWeight: 500, fontSize: "0.84rem", flex: 1 }}>{localReq.title}</span>
        {localReq.description && (
          <span style={{ color: "#6b7280", fontSize: "0.76rem", flexBasis: "100%", lineHeight: 1.5, marginTop: 2, paddingLeft: 2 }}>
            {localReq.description}
          </span>
        )}
        {/* Inline child-count badge */}
        {childCount > 0 && !assigning && (
          <span style={{
            fontSize: "0.62rem", background: color + "22", color: color,
            border: `1px solid ${color}55`, borderRadius: 10,
            padding: "0px 6px", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
          }}>
            ↓{childCount}
          </span>
        )}
        {/* Assign toggle */}
        <button
          onClick={() => { setAssigning(a => !a); setEditing(false); }}
          title="Assign child requirements or design elements"
          style={{
            padding: "1px 8px", fontSize: "0.68rem", borderRadius: 4, cursor: "pointer",
            border: `1px solid ${assigning ? "#3949ab" : "#c5cae9"}`,
            background: assigning ? "#e8eaf6" : "#f5f7ff",
            color: assigning ? "#3949ab" : "#7986cb",
            flexShrink: 0,
          }}
        >
          {assigning ? "▲ Assign" : "↓ Assign"}
        </button>
        {/* Edit */}
        <button
          onClick={() => { setEditing(e => !e); setAssigning(false); }}
          style={{
            padding: "1px 8px", fontSize: "0.68rem", borderRadius: 4, cursor: "pointer",
            border: `1px solid ${editing ? "#1565c0" : "#ddd"}`,
            background: editing ? "#e3f2fd" : "#fafafa",
            color: editing ? "#1565c0" : "#666",
            flexShrink: 0,
          }}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
        <button
          onClick={handleDelete}
          style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: "0.8rem", flexShrink: 0, padding: "1px 4px" }}
        >✕</button>
      </div>

      {/* Assignment panel */}
      {assigning && (
        <div style={{ paddingLeft: `${depth * 1.5 + 0.5}rem`, borderBottom: "1px solid #f5f5f5" }}>
          <AssignmentPanel req={localReq} allReqs={allReqs} cats={cats} onReload={onReload} />
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <div style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
          <EditReqForm
            req={localReq}
            cats={cats}
            allReqs={allReqs}
            onSave={updated => { setLocalReq(updated); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {children.map(c => (
        <ReqTree key={c.id} req={c} allReqs={allReqs} cats={cats} depth={depth + 1} onReload={onReload} />
      ))}
    </div>
  );
}

/** Panel for assigning child requirements and design element links */
function AssignmentPanel({ req, allReqs, cats, onReload }: {
  req: Requirement;
  allReqs: Requirement[];
  cats: RequirementCategory[];
  onReload: () => void;
}) {
  const [designEls,   setDesignEls]   = useState<DesignElement[]>([]);
  const [designLinks, setDesignLinks] = useState<DesignLink[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [addChildId,  setAddChildId]  = useState("");
  const [addDesignId, setAddDesignId] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState("");

  const catByName = Object.fromEntries(cats.map(c => [c.name, c]));

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [els, links] = await Promise.all([
          api.design.listElements(req.project_id),
          api.design.listLinks(req.id),
        ]);
        setDesignEls(els);
        setDesignLinks(links);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [req.id, req.project_id]);

  const childReqs = allReqs.filter(r => r.parent_id === req.id);

  // Build ancestor set to prevent cycles
  const ancestors = (() => {
    const ids = new Set<string>();
    let cur = allReqs.find(r => r.id === req.parent_id);
    while (cur) { ids.add(cur.id); cur = allReqs.find(r => r.id === cur!.parent_id); }
    return ids;
  })();

  // Any req in the project: strictly lower level (any depth), not self, not already a child, not an ancestor
  const myCat = cats.find(c => c.name === req.type);
  const assignableReqs = allReqs.filter(r => {
    if (r.id === req.id) return false;
    if (r.parent_id === req.id) return false;
    if (ancestors.has(r.id)) return false;
    const rCat = cats.find(c => c.name === r.type);
    // strictly lower in hierarchy (higher sort_order number) — any depth allowed
    return !myCat || !rCat || rCat.sort_order > myCat.sort_order;
  });

  const linkedDesignIds = new Set(designLinks.map(l => l.design_element_id));
  const assignableDesigns = designEls.filter(d => !linkedDesignIds.has(d.id));
  const elById = Object.fromEntries(designEls.map(e => [e.id, e]));

  async function assignChildReq() {
    if (!addChildId) return;
    setSaving(true); setMsg("");
    try {
      await api.requirements.update(addChildId, { parent_id: req.id });
      setAddChildId("");
      onReload();
    } catch (e: any) { setMsg("Error: " + e.message); setSaving(false); }
  }

  async function unassignChildReq(childId: string) {
    setSaving(true); setMsg("");
    try {
      await api.requirements.update(childId, { parent_id: null });
      onReload();
    } catch (e: any) { setMsg("Error: " + e.message); setSaving(false); }
  }

  async function assignDesignEl() {
    if (!addDesignId) return;
    setSaving(true); setMsg("");
    try {
      const link = await api.design.createLink({ requirement_id: req.id, design_element_id: addDesignId });
      setDesignLinks(prev => [...prev, link]);
      setAddDesignId("");
    } catch (e: any) { setMsg("Error: " + e.message); }
    setSaving(false);
  }

  async function unassignDesignEl(linkId: string) {
    setSaving(true); setMsg("");
    try {
      await api.design.deleteLink(linkId);
      setDesignLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (e: any) { setMsg("Error: " + e.message); }
    setSaving(false);
  }

  return (
    <div style={{
      margin: "0 0 6px 0",
      background: "#f8f9ff",
      border: "1px solid #c5cae9",
      borderTop: "none",
      borderRadius: "0 0 6px 6px",
      padding: "10px 14px",
      fontSize: "0.8rem",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "0 1.5rem",
    }}>
      {msg && <div style={{ gridColumn: "1/-1", color: "#b71c1c", marginBottom: 6, fontSize: "0.75rem" }}>{msg}</div>}

      {/* ── Section A: Child Requirements ── */}
      <div>
        <div style={assignSectionHead}>↓ Child Requirements</div>
        {childReqs.length === 0 ? (
          <span style={assignEmptyStyle}>None assigned yet</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {childReqs.map(r => {
              const c = catByName[r.type];
              return (
                <span key={r.id} style={{ ...assignChipStyle, border: `1px solid ${c?.color ?? "#ccc"}` }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: c?.color ?? "#555", fontSize: "0.68rem" }}>
                    {r.readable_id}
                  </span>
                  <span style={{ color: "#444", fontSize: "0.72rem", marginLeft: 2 }}>{r.title}</span>
                  <button onClick={() => unassignChildReq(r.id)} disabled={saving}
                    style={assignChipRemoveStyle} title="Unlink">×</button>
                </span>
              );
            })}
          </div>
        )}
        {assignableReqs.length > 0 && (
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 4 }}>
            <select value={addChildId} onChange={e => setAddChildId(e.target.value)} style={assignSelectStyle}>
              <option value="">+ Assign child requirement…</option>
              {cats
                .filter(c => !myCat || c.sort_order > myCat.sort_order)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(cat => {
                  const group = assignableReqs.filter(r => r.type === cat.name);
                  if (!group.length) return null;
                  return (
                    <optgroup key={cat.name} label={`── ${cat.label} (Level ${cat.sort_order})`}>
                      {group.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.readable_id} {r.title}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </select>
            <button onClick={assignChildReq} disabled={!addChildId || saving} style={assignBtnStyle}>
              Assign
            </button>
          </div>
        )}
        {assignableReqs.length === 0 && childReqs.length > 0 && (
          <span style={{ fontSize: "0.7rem", color: "#aaa", fontStyle: "italic" }}>All eligible requirements already assigned</span>
        )}
      </div>

      {/* ── Section B: Design Elements ── */}
      <div>
        <div style={assignSectionHead}>⚙ Design Elements</div>
        {loading ? (
          <span style={assignEmptyStyle}>Loading…</span>
        ) : designLinks.length === 0 ? (
          <span style={assignEmptyStyle}>None linked yet</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {designLinks.map(link => {
              const el = elById[link.design_element_id];
              if (!el) return null;
              const elColor = el.type === "ARCHITECTURE" ? "#4e342e" : "#6d4c41";
              return (
                <span key={link.id} style={{ ...assignChipStyle, border: `1px solid ${elColor}` }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: elColor, fontSize: "0.68rem" }}>
                    {el.readable_id ?? el.type.slice(0, 4)}
                  </span>
                  <span style={{ fontSize: "0.6rem", color: "#888", marginLeft: 2 }}>[{el.type}]</span>
                  <span style={{ color: "#444", fontSize: "0.72rem", marginLeft: 2 }}>{el.title}</span>
                  <button onClick={() => unassignDesignEl(link.id)} disabled={saving}
                    style={assignChipRemoveStyle} title="Unlink">×</button>
                </span>
              );
            })}
          </div>
        )}
        {!loading && assignableDesigns.length > 0 && (
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 4 }}>
            <select value={addDesignId} onChange={e => setAddDesignId(e.target.value)} style={assignSelectStyle}>
              <option value="">+ Link design element…</option>
              {assignableDesigns.map(el => (
                <option key={el.id} value={el.id}>
                  {el.readable_id ?? el.type.slice(0, 4)} [{el.type}] {el.title}
                </option>
              ))}
            </select>
            <button onClick={assignDesignEl} disabled={!addDesignId || saving} style={assignBtnStyle}>
              Link
            </button>
          </div>
        )}
        {!loading && designEls.length === 0 && (
          <span style={{ fontSize: "0.7rem", color: "#aaa", fontStyle: "italic" }}>No design elements in this project yet</span>
        )}
      </div>
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
          {cat.is_builtin && (
            <span style={{ fontSize: "0.58rem", color: "#aaa", background: "#f5f5f5", borderRadius: 8, padding: "1px 5px" }}>built-in</span>
          )}
          <button onClick={() => onDelete(cat.id)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef5350", cursor: "pointer", fontSize: "0.72rem" }}>
            ✕
          </button>
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

const cardStyle: React.CSSProperties     = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.5rem" };
const inputStyle: React.CSSProperties    = { padding: "0.42rem 0.65rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "monospace", fontSize: "0.84rem", width: "100%", boxSizing: "border-box" };
const btnStyle: React.CSSProperties      = { padding: "0.52rem 1.1rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
const editInputStyle: React.CSSProperties  = { padding: "5px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.82rem", width: "100%", boxSizing: "border-box" as const };
const editLabelStyle: React.CSSProperties  = { display: "block", fontSize: "0.65rem", color: "#777", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const editSaveStyle: React.CSSProperties   = { padding: "4px 14px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem" };
const editCancelStyle: React.CSSProperties = { padding: "4px 12px", background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem" };
const assignSectionHead: React.CSSProperties = { fontWeight: 600, color: "#1a237e", fontSize: "0.7rem", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 6 };
const assignEmptyStyle: React.CSSProperties  = { color: "#aaa", fontStyle: "italic", fontSize: "0.75rem" };
const assignChipStyle: React.CSSProperties   = { display: "inline-flex", alignItems: "center", gap: 3, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "2px 6px" };
const assignChipRemoveStyle: React.CSSProperties = { background: "none", border: "none", color: "#e57373", cursor: "pointer", fontSize: "0.78rem", padding: "0 2px", lineHeight: 1 };
const assignSelectStyle: React.CSSProperties = { padding: "3px 6px", border: "1px solid #c5cae9", borderRadius: 4, fontSize: "0.74rem", maxWidth: 280, flex: 1 };
const assignBtnStyle: React.CSSProperties    = { padding: "3px 10px", background: "#3949ab", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.72rem", whiteSpace: "nowrap" as const };
