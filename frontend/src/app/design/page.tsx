"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, DesignElement, DesignElementType, Requirement } from "@/lib/api";

const TYPE_META: Record<DesignElementType, { label: string; color: string }> = {
  ARCHITECTURE: { label: "Architecture", color: "#1565c0" },
  DETAILED:     { label: "Detailed",     color: "#4a148c" },
};

// ── Mermaid renderer ──────────────────────────────────────────────────────────
function MermaidPreview({ source }: { source: string }) {
  const ref  = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!source.trim() || !ref.current) return;
    let cancelled = false;
    setErr("");

    import("mermaid").then(mod => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      const id = `mm-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, source)
        .then(({ svg }) => {
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(e => {
          if (!cancelled) setErr(String(e?.message ?? e));
          if (ref.current) ref.current.innerHTML = "";
        });
    });

    return () => { cancelled = true; };
  }, [source]);

  return (
    <div>
      {err && (
        <div style={{ color: "#b71c1c", background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 8 }}>
          ⚠ {err}
        </div>
      )}
      <div ref={ref} style={{ minHeight: 40 }} />
    </div>
  );
}

// ── Diagram editor panel ──────────────────────────────────────────────────────
const MERMAID_EXAMPLES: Record<string, { label: string; code: string }> = {
  state: {
    label: "State Machine",
    code: `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start()
  Running --> Paused : pause()
  Paused --> Running : resume()
  Running --> Error : fault
  Error --> Idle : reset()
  Running --> [*] : stop()`,
  },
  sequence: {
    label: "Sequence Diagram",
    code: `sequenceDiagram
  participant UI
  participant Controller
  participant Sensor
  UI->>Controller: startMonitoring()
  Controller->>Sensor: enable()
  Sensor-->>Controller: dataReady
  Controller-->>UI: displayReading(value)`,
  },
  flowchart: {
    label: "Flowchart",
    code: `flowchart TD
  A([Start]) --> B{Input valid?}
  B -- Yes --> C[Process data]
  B -- No --> D[Show error]
  C --> E{Threshold exceeded?}
  E -- Yes --> F[Trigger alarm]
  E -- No --> G([Done])
  F --> G`,
  },
  class: {
    label: "Class Diagram",
    code: `classDiagram
  class Controller {
    +String id
    +start()
    +stop()
  }
  class Sensor {
    +float threshold
    +read() float
  }
  Controller --> Sensor : uses`,
  },
};

function DiagramPanel({ element, onSaved }: {
  element: DesignElement;
  onSaved: (updated: DesignElement) => void;
}) {
  const [source,  setSource]  = useState(element.diagram_source ?? "");
  const [preview, setPreview] = useState(element.diagram_source ?? "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const dirty = source !== (element.diagram_source ?? "");

  async function save() {
    setSaving(true); setMsg("");
    try {
      const updated = await api.design.updateElement(element.id, { diagram_source: source || null });
      onSaved(updated);
      setMsg("Saved.");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) { setMsg("Error: " + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{
      border: "1px solid #c5cae9", borderTop: "none",
      borderRadius: "0 0 8px 8px", background: "#fafbff",
      padding: "14px 16px",
    }}>
      {/* Template picker */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Templates:</span>
        {Object.entries(MERMAID_EXAMPLES).map(([key, ex]) => (
          <button key={key}
            onClick={() => { setSource(ex.code); setPreview(ex.code); }}
            style={{
              padding: "3px 10px", borderRadius: 12, border: "1px solid #c5cae9",
              background: "#fff", color: "#3949ab", cursor: "pointer", fontSize: 12,
            }}>
            {ex.label}
          </button>
        ))}
        {source && (
          <button onClick={() => { setSource(""); setPreview(""); }}
            style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>
            Clear
          </button>
        )}
      </div>

      {/* Editor + Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Editor */}
        <div>
          <div style={panelLabelStyle}>Mermaid Source</div>
          <textarea
            value={source}
            onChange={e => setSource(e.target.value)}
            onBlur={() => setPreview(source)}
            placeholder={`stateDiagram-v2\n  [*] --> Idle\n  Idle --> Active : trigger`}
            style={{
              width: "100%", height: 220, fontFamily: "monospace", fontSize: 12,
              padding: "10px", border: "1px solid #c5cae9", borderRadius: 6,
              resize: "vertical", boxSizing: "border-box", lineHeight: 1.5,
              background: "#1e1e2e", color: "#cdd6f4", outline: "none",
            }}
            spellCheck={false}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <button onClick={save} disabled={saving || !dirty}
              style={{
                padding: "6px 18px", background: dirty ? "#3949ab" : "#e2e8f0",
                color: dirty ? "#fff" : "#94a3b8", border: "none", borderRadius: 6,
                cursor: dirty ? "pointer" : "default", fontSize: 13, fontWeight: 600,
              }}>
              {saving ? "Saving…" : "Save Diagram"}
            </button>
            <button onClick={() => setPreview(source)}
              style={{ padding: "6px 14px", background: "#fff", border: "1px solid #c5cae9", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#475569" }}>
              Preview ↻
            </button>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("Error") ? "#b91c1c" : "#15803d" }}>{msg}</span>}
          </div>
        </div>

        {/* Preview */}
        <div>
          <div style={panelLabelStyle}>Preview</div>
          <div style={{
            border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff",
            padding: "12px", minHeight: 220, overflowX: "auto",
          }}>
            {preview.trim()
              ? <MermaidPreview source={preview} />
              : <span style={{ color: "#cbd5e1", fontSize: 13 }}>Select a template or type Mermaid source to preview</span>
            }
          </div>
        </div>
      </div>

      {/* Mermaid syntax hint */}
      <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
        Supports: <code>stateDiagram-v2</code>, <code>sequenceDiagram</code>, <code>flowchart</code>, <code>classDiagram</code>, <code>erDiagram</code> —
        <a href="https://mermaid.js.org/syntax/stateDiagram.html" target="_blank" rel="noreferrer" style={{ color: "#3949ab", marginLeft: 4 }}>Mermaid docs ↗</a>
      </div>
    </div>
  );
}

// ── Single element row used in filtered (non-ALL) view ───────────────────────
function ElementRow({ el, onDelete, onUpdate }: {
  el: DesignElement;
  onDelete: (id: string) => void;
  onUpdate: (el: DesignElement) => void;
}) {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const color = TYPE_META[el.type].color;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px",
        borderBottom: diagramOpen ? "none" : "1px solid #f5f5f5",
      }}>
        <span style={{
          background: color, color: "#fff",
          borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{el.type === "ARCHITECTURE" ? "ARCH" : "DTL"}</span>
        {el.readable_id && (
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
            {el.readable_id}
          </span>
        )}
        <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{el.title}</span>
        {el.description && <span style={{ color: "#888", fontSize: 12 }}>{el.description}</span>}
        {el.diagram_source && (
          <span style={{ fontSize: 11, color, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 10, padding: "1px 7px" }}>
            diagram
          </span>
        )}
        <button
          onClick={() => setDiagramOpen(o => !o)}
          title="Edit diagram"
          style={{
            padding: "2px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
            border: `1px solid ${diagramOpen ? color : "#c5cae9"}`,
            background: diagramOpen ? color + "20" : "#fff",
            color: diagramOpen ? color : "#64748b",
          }}>
          ◈ Diagram
        </button>
        <button onClick={() => onDelete(el.id)} style={deleteBtnStyle}>✕</button>
      </div>
      {diagramOpen && (
        <DiagramPanel element={el} onSaved={updated => { onUpdate(updated); setDiagramOpen(true); }} />
      )}
    </div>
  );
}

// ── Collapsible ARCHITECTURE node ─────────────────────────────────────────────
function ArchNode({ arch, children, onDelete, onUpdate }: {
  arch: DesignElement;
  children: DesignElement[];
  onDelete: (id: string) => void;
  onUpdate: (el: DesignElement) => void;
}) {
  const [open,    setOpen]    = useState(true);
  const [diagram, setDiagram] = useState(false);
  const [detDiagramId, setDetDiagramId] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: 4 }}>
      {/* ARCHITECTURE row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px",
        background: diagram ? "#e8eaf6" : "#e8eaf6",
        borderRadius: diagram ? "6px 6px 0 0" : 6,
        borderLeft: "4px solid #1565c0",
        borderBottom: diagram ? "none" : undefined,
      }}>
        <span onClick={() => setOpen(o => !o)} style={{ color: "#1565c0", fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none", minWidth: 16 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ background: "#1565c0", color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          ARCH
        </span>
        {arch.readable_id && (
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#1565c0", background: "#dce3f5", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
            {arch.readable_id}
          </span>
        )}
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{arch.title}</span>
        {arch.description && <span style={{ color: "#666", fontSize: 12 }}>{arch.description}</span>}
        {arch.diagram_source && (
          <span style={{ fontSize: 11, color: "#3949ab", background: "#e8eaf6", border: "1px solid #c5cae9", borderRadius: 10, padding: "1px 7px" }}>
            diagram
          </span>
        )}
        <span style={{ fontSize: 12, color: "#888" }}>{children.length} detailed</span>
        <button
          onClick={e => { e.stopPropagation(); setDiagram(d => !d); setOpen(true); }}
          title="Edit diagram"
          style={{
            padding: "2px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
            border: `1px solid ${diagram ? "#3949ab" : "#c5cae9"}`,
            background: diagram ? "#e8eaf6" : "#fff",
            color: diagram ? "#3949ab" : "#64748b",
          }}>
          ◈ Diagram
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(arch.id); }} style={deleteBtnStyle}>✕</button>
      </div>

      {/* Diagram panel for ARCH */}
      {diagram && (
        <DiagramPanel element={arch} onSaved={updated => { onUpdate(updated); }} />
      )}

      {/* DETAILED children */}
      {open && children.map(det => (
        <div key={det.id}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 10px 7px 36px",
            borderBottom: detDiagramId === det.id ? "none" : "1px solid #f0f0f0",
            borderLeft: "4px solid #e8eaf6",
            marginLeft: 12,
          }}>
            <span style={{ color: "#aaa", fontSize: 12, flexShrink: 0 }}>└</span>
            <span style={{ background: "#4a148c", color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              DTL
            </span>
            {det.readable_id && (
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#4a148c", background: "#f3e5f5", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
                {det.readable_id}
              </span>
            )}
            <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{det.title}</span>
            {det.description && <span style={{ color: "#888", fontSize: 12 }}>{det.description}</span>}
            {det.diagram_source && (
              <span style={{ fontSize: 11, color: "#6d28d9", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "1px 7px" }}>
                diagram
              </span>
            )}
            <button
              onClick={() => setDetDiagramId(id => id === det.id ? null : det.id)}
              title="Edit diagram"
              style={{
                padding: "2px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                border: `1px solid ${detDiagramId === det.id ? "#6d28d9" : "#c5cae9"}`,
                background: detDiagramId === det.id ? "#f5f3ff" : "#fff",
                color: detDiagramId === det.id ? "#6d28d9" : "#64748b",
              }}>
              ◈ Diagram
            </button>
            <button onClick={() => onDelete(det.id)} style={deleteBtnStyle}>✕</button>
          </div>
          {detDiagramId === det.id && (
            <div style={{ marginLeft: 12 }}>
              <DiagramPanel element={det} onSaved={updated => { onUpdate(updated); }} />
            </div>
          )}
        </div>
      ))}

      {open && children.length === 0 && (
        <div style={{ padding: "5px 10px 5px 48px", color: "#ccc", fontSize: 12, fontStyle: "italic" }}>
          No detailed elements yet
        </div>
      )}
    </div>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────
function DesignPageInner() {
  const params    = useSearchParams();
  const typeParam = params.get("type") ?? "ALL";

  const [projects, setProjects]   = useState<Project[]>([]);
  const [elements, setElements]   = useState<DesignElement[]>([]);
  const [swReqs, setSwReqs]       = useState<Requirement[]>([]);
  const [projectId, setProjectId] = useActiveProject();
  const [filter, setFilter]       = useState<string>(typeParam);

  // create form
  const [elType, setElType]     = useState<DesignElementType>("ARCHITECTURE");
  const [parentId, setParentId] = useState("");
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState("");

  // link form
  const [linkReqId, setLinkReqId] = useState("");
  const [linkElId, setLinkElId]   = useState("");
  const [linking, setLinking]     = useState(false);
  const [linkMsg, setLinkMsg]     = useState("");

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async () => {
    if (!projectId) return;
    const [els, reqs] = await Promise.all([
      api.design.listElements(projectId),
      api.requirements.list(projectId, "SOFTWARE"),
    ]);
    setElements(els);
    setSwReqs(reqs);
  };

  useEffect(() => {
    if (!projectId) { setElements([]); setSwReqs([]); return; }
    reload();
  }, [projectId]);

  // Optimistic update for diagram saves — avoids full reload
  const handleElementUpdate = (updated: DesignElement) => {
    setElements(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormErr("");
    try {
      await api.design.createElement({
        project_id: projectId, type: elType,
        parent_id: parentId || undefined,
        title: title.trim(), description: desc.trim() || undefined,
      });
      setTitle(""); setDesc(""); setParentId("");
      await reload();
    } catch (e: any) { setFormErr(e.message); }
    finally { setSaving(false); }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true); setLinkMsg("");
    try {
      await api.design.createLink({ requirement_id: linkReqId, design_element_id: linkElId });
      setLinkMsg("Linked successfully.");
      setLinkReqId(""); setLinkElId("");
    } catch (e: any) { setLinkMsg(`Error: ${e.message}`); }
    finally { setLinking(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this design element?")) return;
    await api.design.deleteElement(id);
    await reload();
  }

  const archElements  = elements.filter(e => e.type === "ARCHITECTURE");
  const detailedOf    = (archId: string) => elements.filter(e => e.parent_id === archId);
  const filteredElements = filter === "ALL" ? elements : elements.filter(e => e.type === filter);
  const counts = {
    ALL:          elements.length,
    ARCHITECTURE: elements.filter(e => e.type === "ARCHITECTURE").length,
    DETAILED:     elements.filter(e => e.type === "DETAILED").length,
  };
  const diagramCount = elements.filter(e => e.diagram_source).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Design Elements</h1>
        {diagramCount > 0 && (
          <span style={{ fontSize: 12, background: "#e8eaf6", color: "#3949ab", border: "1px solid #c5cae9", borderRadius: 12, padding: "2px 10px", fontWeight: 600 }}>
            ◈ {diagramCount} diagram{diagramCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Create */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Add Design Element</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={elType} onChange={e => { setElType(e.target.value as DesignElementType); setParentId(""); }} style={inputStyle}>
              <option value="ARCHITECTURE">Architecture (top-level)</option>
              <option value="DETAILED">Detailed (under architecture)</option>
            </select>
            {elType === "DETAILED" && (
              <select value={parentId} onChange={e => setParentId(e.target.value)} required style={inputStyle}>
                <option value="">— Select Architecture parent *</option>
                {archElements.map(e => <option key={e.id} value={e.id}>{e.readable_id ? `${e.readable_id} ` : ""}{e.title}</option>)}
              </select>
            )}
            <input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
            {formErr && <p style={{ color: "red", margin: 0, fontSize: 13 }}>{formErr}</p>}
            <button type="submit" disabled={saving || !projectId} style={btnStyle}>{saving ? "Saving…" : "Add Element"}</button>
          </form>
        </section>

        {/* Link */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Link Req → Design Element</h2>
          <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={linkReqId} onChange={e => setLinkReqId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— Requirement *</option>
              {swReqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} {r.title}</option>)}
            </select>
            <select value={linkElId} onChange={e => setLinkElId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— Design element *</option>
              {elements.map(e => <option key={e.id} value={e.id}>{e.readable_id ? `${e.readable_id} ` : ""}[{e.type === "ARCHITECTURE" ? "ARCH" : "DTL"}] {e.title}</option>)}
            </select>
            {linkMsg && <p style={{ color: linkMsg.startsWith("Error") ? "red" : "#2e7d32", margin: 0, fontSize: 13 }}>{linkMsg}</p>}
            <button type="submit" disabled={linking || !linkReqId || !linkElId} style={btnStyle}>{linking ? "Linking…" : "Link"}</button>
          </form>
        </section>
      </div>

      {/* Filter tabs */}
      {projectId && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(["ALL", "ARCHITECTURE", "DETAILED"] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 500,
              background: filter === t ? (t === "ARCHITECTURE" ? "#1565c0" : t === "DETAILED" ? "#4a148c" : "#37474f") : "#f0f0f0",
              color: filter === t ? "#fff" : "#555",
            }}>
              {t === "ALL" ? "All" : TYPE_META[t].label}
              <span style={{ marginLeft: 6, opacity: 0.75 }}>({counts[t]})</span>
            </button>
          ))}
        </div>
      )}

      {/* Tree / list */}
      <section>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>
          Design Tree ({filteredElements.length} elements{filter !== "ALL" ? ` — ${TYPE_META[filter as DesignElementType]?.label ?? filter}` : ""})
        </h2>
        {!projectId ? (
          <p style={{ color: "#888" }}>Select a project.</p>
        ) : elements.length === 0 ? (
          <p style={{ color: "#888" }}>No design elements yet.</p>
        ) : filter === "ALL" ? (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {archElements.length === 0
              ? <p style={{ color: "#aaa", margin: 0 }}>No architecture elements yet.</p>
              : archElements.map(arch => (
                  <ArchNode
                    key={arch.id}
                    arch={arch}
                    children={detailedOf(arch.id)}
                    onDelete={handleDelete}
                    onUpdate={handleElementUpdate}
                  />
                ))
            }
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            {filteredElements.map(el => (
              <ElementRow key={el.id} el={el} onDelete={handleDelete} onUpdate={handleElementUpdate} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DesignPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <DesignPageInner />
    </Suspense>
  );
}

const panelLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 6,
};
const cardStyle: React.CSSProperties      = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.25rem" };
const inputStyle: React.CSSProperties     = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnStyle: React.CSSProperties       = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, alignSelf: "flex-start" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13, flexShrink: 0, padding: "2px 4px" };
