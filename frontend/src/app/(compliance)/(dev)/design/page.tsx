"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, DesignElement, Requirement, DesignLink, SWComponent } from "@/lib/api";
import { InlineEditPanel, type FieldDef } from "@/components/InlineEditPanel";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import MermaidView from "@/components/MermaidView";

// IEC 62304 §5.4 — design elements detail a §5.3 SWComponent. They are grouped
// under their component here; the cross-component hierarchy lives in §5.3.
const COMP_TYPE_COLOR: Record<string, string> = {
  SYSTEM: "#1a237e", SUBSYSTEM: "#1565c0", ITEM: "#6a1b9a", UNIT: "#1b5e20",
};
const DET_COLOR = "#4a148c";

// Shared field config used by all design element edit panels
const designFields: FieldDef[] = [
  { name: "title",       label: "Title",       type: "textarea", required: true, autoResize: true, flex: "2 1 200px" },
  { name: "description", label: "Description", type: "textarea", autoResize: true, placeholder: "Optional", flex: "3 1 280px" },
];

// ── Diagram editor panel ──────────────────────────────────────────────────────
const MERMAID_EXAMPLES: Record<string, { label: string; code: string }> = {
  state: {
    label: "State Machine",
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running: start
    Running --> Idle: stop
    Running --> Error: fault
    Error --> Idle: reset`,
  },
  sequence: {
    label: "Sequence Diagram",
    code: `sequenceDiagram
    participant UI
    participant Controller
    participant Sensor
    UI->>Controller: request
    Controller->>Sensor: read
    Sensor-->>Controller: value
    Controller-->>UI: result`,
  },
  flowchart: {
    label: "Flowchart",
    code: `flowchart TD
    Start --> Validate
    Validate --> Process
    Process --> Output`,
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
    } catch (e) { setMsg("Error: " + (e instanceof Error ? e.message : String(e))); }
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
              ? <MermaidView source={preview} />
              : <span style={{ color: "#cbd5e1", fontSize: 13 }}>Select a template or type Mermaid source to preview</span>
            }
          </div>
        </div>
      </div>

      {/* Mermaid syntax hint */}
      <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
        Supports: <code>stateDiagram-v2</code>, <code>sequenceDiagram</code>, <code>flowchart</code>, <code>classDiagram</code>, <code>erDiagram</code> —
        <a href="https://mermaid.js.org/intro/" target="_blank" rel="noreferrer" style={{ color: "#3949ab", marginLeft: 4 }}>Mermaid docs ↗</a>
      </div>
    </div>
  );
}

// ── Recursive design element row (handles parent_id sub-nesting) ─────────────
function DesignElementRow({ el, childrenOf, depth, onDelete, onUpdate, highlightId, linkedReqsForEl }: {
  el: DesignElement;
  childrenOf: (id: string) => DesignElement[];
  depth: number;
  onDelete: (id: string) => void;
  onUpdate: (el: DesignElement) => void;
  highlightId?: string;
  linkedReqsForEl: (id: string) => Requirement[];
}) {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [filesOpen,   setFilesOpen]   = useState(false);
  const [editing,     setEditing]     = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const highlighted = el.id === highlightId;
  const kids = childrenOf(el.id);

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <div>
      <div ref={rowRef} style={{
        transition: "background 0.4s",
        background: highlighted ? "#fefce8" : "transparent",
        outline: highlighted ? "2px solid #fbbf24" : "none",
        borderRadius: highlighted ? 4 : 0,
      }}>
        {editing ? (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #e0e0e0", marginLeft: depth * 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ background: DET_COLOR, color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>DESIGN</span>
              {el.readable_id && (
                <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: DET_COLOR }}>{el.readable_id}</span>
              )}
            </div>
            <InlineEditPanel
              fields={designFields}
              initialValues={{ title: el.title, description: el.description ?? "" }}
              accentColor="#ce93d8"
              accentBg="#fdf4ff"
              onSave={async (vals) => {
                const updated = await api.design.updateElement(el.id, { title: vals.title.trim(), description: vals.description.trim() || undefined });
                onUpdate(updated);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 10px",
            paddingLeft: 10 + depth * 22,
            borderBottom: diagramOpen || filesOpen ? "none" : "1px solid #e0e0e0",
            borderLeft: depth > 0 ? "4px solid #e8eaf6" : "none",
          }}>
            {depth > 0 && <span style={{ color: "#aaa", fontSize: 12, flexShrink: 0 }}>└</span>}
            <span style={{ background: DET_COLOR, color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              DESIGN
            </span>
            {el.readable_id && (
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: DET_COLOR, background: "#f3e5f5", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
                {el.readable_id}
              </span>
            )}
            <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{el.title}</span>
            {linkedReqsForEl(el.id).map(r => (
              <a key={r.id} href={`/requirements?type=${r.type}&highlight=${r.id}`}
                title={r.title}
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center",
                  background: "#ede7f6", border: "1px solid #ce93d8", borderRadius: 4,
                  padding: "1px 7px", fontSize: 11, fontWeight: 700, color: "#6a1b9a",
                  flexShrink: 0, fontFamily: "monospace" }}>
                {r.readable_id ?? "REQ"}
              </a>
            ))}
            {el.description && <span style={{ color: "#888", fontSize: 12 }}>{el.description}</span>}
            {el.diagram_source && (
              <span style={{ fontSize: 11, color: "#6d28d9", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "1px 7px" }}>
                diagram
              </span>
            )}
            <button onClick={() => setEditing(true)} style={editBtnStyle} title="Edit">✎</button>
            <button
              onClick={() => setDiagramOpen(o => !o)}
              title="Edit diagram"
              style={{
                padding: "2px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                border: `1px solid ${diagramOpen ? "#6d28d9" : "#c5cae9"}`,
                background: diagramOpen ? "#f5f3ff" : "#fff",
                color: diagramOpen ? "#6d28d9" : "#64748b",
              }}>
              ◈ Diagram
            </button>
            <button
              onClick={() => setFilesOpen(o => !o)}
              title="Attach images / PDF supporting documents"
              style={{
                padding: "2px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                border: `1px solid ${filesOpen ? "#6d28d9" : "#c5cae9"}`,
                background: filesOpen ? "#f5f3ff" : "#fff",
                color: filesOpen ? "#6d28d9" : "#64748b",
              }}>
              📎 Files
            </button>
            <button onClick={() => onDelete(el.id)} style={deleteBtnStyle}>✕</button>
          </div>
        )}
        {!editing && diagramOpen && (
          <div style={{ marginLeft: depth * 22 }}>
            <DiagramPanel element={el} onSaved={updated => { onUpdate(updated); }} />
          </div>
        )}
        {!editing && filesOpen && (
          <div style={{ padding: "6px 12px 12px", borderBottom: "1px solid #e0e0e0", marginLeft: depth * 22 }}>
            <AttachmentsPanel projectId={el.project_id} entityType="design_element" entityId={el.id} />
          </div>
        )}
      </div>

      {/* Sub-nested children */}
      {kids.map(child => (
        <DesignElementRow
          key={child.id} el={child} childrenOf={childrenOf} depth={depth + 1}
          onDelete={onDelete} onUpdate={onUpdate}
          highlightId={highlightId} linkedReqsForEl={linkedReqsForEl}
        />
      ))}
    </div>
  );
}

// ── Component group — a §5.3 component header + its §5.4 design element tree ──
function ComponentGroup({ component, elements, onDelete, onUpdate, highlightId, linkedReqsForEl }: {
  component: SWComponent;
  elements: DesignElement[];
  onDelete: (id: string) => void;
  onUpdate: (el: DesignElement) => void;
  highlightId?: string;
  linkedReqsForEl: (id: string) => Requirement[];
}) {
  const [open, setOpen] = useState(true);
  const color = COMP_TYPE_COLOR[component.component_type] ?? "#546e7a";
  const roots = elements.filter(e => !e.parent_id);
  const childrenOf = (id: string) => elements.filter(e => e.parent_id === id);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        background: "#eef1fa", borderRadius: open ? "6px 6px 0 0" : 6,
        borderLeft: `4px solid ${color}`,
      }}>
        <span onClick={() => setOpen(o => !o)} style={{ color, fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none", minWidth: 16 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ background: color, color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {component.component_type}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{component.name}</span>
        <span style={{ fontSize: 12, color: "#888" }}>
          {elements.length} design element{elements.length !== 1 ? "s" : ""}
        </span>
      </div>
      {open && (
        <div style={{ background: "#fff", border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px" }}>
          {roots.length === 0
            ? <p style={{ color: "#ccc", fontSize: 12, fontStyle: "italic", padding: "8px 14px", margin: 0 }}>No design elements for this component yet.</p>
            : roots.map(el => (
                <DesignElementRow
                  key={el.id} el={el} childrenOf={childrenOf} depth={0}
                  onDelete={onDelete} onUpdate={onUpdate}
                  highlightId={highlightId} linkedReqsForEl={linkedReqsForEl}
                />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────
function DesignPageInner() {
  const params      = useSearchParams();
  const highlightId = params.get("highlight") ?? "";

  const [projects, setProjects]   = useState<Project[]>([]);
  const [components, setComponents] = useState<SWComponent[]>([]);
  const [elements, setElements]   = useState<DesignElement[]>([]);
  const [swReqs, setSwReqs]       = useState<Requirement[]>([]);
  const [allReqs, setAllReqs]     = useState<Requirement[]>([]);
  const [desLinks, setDesLinks]   = useState<DesignLink[]>([]);
  const [projectId, setProjectId] = useActiveProject();

  // create form
  const [componentId, setComponentId] = useState("");
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
    const [comps, els, reqs, allR, links] = await Promise.all([
      api.architecture.listComponents(projectId),
      api.design.listElements(projectId),
      api.requirements.list(projectId, "SOFTWARE"),
      api.requirements.list(projectId),
      api.design.listLinks(),
    ]);
    setComponents(comps);
    setElements(els);
    setSwReqs(reqs);
    setAllReqs(allR);
    setDesLinks(links);
  };

  useEffect(() => {
    if (!projectId) { setComponents([]); setElements([]); setSwReqs([]); setAllReqs([]); setDesLinks([]); return; }
    reload();
  }, [projectId]);

  // Optimistic update for diagram/edit saves — avoids full reload
  const handleElementUpdate = (updated: DesignElement) => {
    setElements(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormErr("");
    try {
      await api.design.createElement({
        project_id: projectId,
        component_id: componentId,
        parent_id: parentId || null,
        title: title.trim(), description: desc.trim() || null,
      });
      setTitle(""); setDesc(""); setParentId("");
      await reload();
    } catch (e) { setFormErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true); setLinkMsg("");
    try {
      await api.design.createLink({ requirement_id: linkReqId, design_element_id: linkElId });
      setLinkMsg("Linked successfully.");
      setLinkReqId(""); setLinkElId("");
      await reload();
    } catch (e) { setLinkMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setLinking(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this design element? Any sub-nested elements are detached, not deleted.")) return;
    await api.design.deleteElement(id);
    await reload();
  }

  // Component-type sort order so the tree mirrors the §5.3 hierarchy ordering.
  const TYPE_ORDER: Record<string, number> = { SYSTEM: 0, SUBSYSTEM: 1, ITEM: 2, UNIT: 3 };
  const sortedComponents = [...components].sort(
    (a, b) => (TYPE_ORDER[a.component_type] ?? 9) - (TYPE_ORDER[b.component_type] ?? 9) || a.name.localeCompare(b.name)
  );
  const elementsOf = (componentId: string) => elements.filter(e => e.component_id === componentId);
  const componentsWithElements = sortedComponents.filter(c => elementsOf(c.id).length > 0);

  const componentById = Object.fromEntries(components.map(c => [c.id, c]));
  const reqById = Object.fromEntries(allReqs.map(r => [r.id, r]));
  const linkedReqsForEl = (elId: string) =>
    desLinks.filter(l => l.design_element_id === elId).map(l => reqById[l.requirement_id]).filter(Boolean) as Requirement[];

  // Parent options for the create form: design elements already on the chosen component.
  const parentOptions = componentId ? elementsOf(componentId) : [];
  const diagramCount = elements.filter(e => e.diagram_source).length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Detailed Design</h1>
        {diagramCount > 0 && (
          <span style={{ fontSize: 12, background: "#e8eaf6", color: "#3949ab", border: "1px solid #c5cae9", borderRadius: 12, padding: "2px 10px", fontWeight: 600 }}>
            ◈ {diagramCount} diagram{diagramCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 16px", color: "#546e7a", fontSize: 13 }}>
        IEC 62304 §5.4 — detailed design of the §5.3 software architecture components.
      </p>

      <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Create */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Add Design Element</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={componentId} onChange={e => { setComponentId(e.target.value); setParentId(""); }} required style={inputStyle} disabled={!projectId}>
              <option value="">— §5.3 Component *</option>
              {sortedComponents.map(c => (
                <option key={c.id} value={c.id}>[{c.component_type}] {c.name}</option>
              ))}
            </select>
            {parentOptions.length > 0 && (
              <select value={parentId} onChange={e => setParentId(e.target.value)} style={inputStyle}>
                <option value="">— Sub-nest under (optional)</option>
                {parentOptions.map(el => (
                  <option key={el.id} value={el.id}>{el.readable_id ? `${el.readable_id} ` : ""}{el.title}</option>
                ))}
              </select>
            )}
            <input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
            {formErr && <p style={{ color: "red", margin: 0, fontSize: 13 }}>{formErr}</p>}
            <button type="submit" disabled={saving || !projectId || !componentId || !title.trim()} style={btnStyle}>
              {saving ? "Saving…" : "Add Element"}
            </button>
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
              {elements.map(el => {
                const c = componentById[el.component_id];
                return (
                  <option key={el.id} value={el.id}>
                    {el.readable_id ? `${el.readable_id} ` : ""}{el.title}{c ? ` — ${c.name}` : ""}
                  </option>
                );
              })}
            </select>
            {linkMsg && <p style={{ color: linkMsg.startsWith("Error") ? "red" : "#2e7d32", margin: 0, fontSize: 13 }}>{linkMsg}</p>}
            <button type="submit" disabled={linking || !linkReqId || !linkElId} style={btnStyle}>{linking ? "Linking…" : "Link"}</button>
          </form>
        </section>
      </div>

      {/* Tree grouped by §5.3 component */}
      <section>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>
          Design Tree ({elements.length} element{elements.length !== 1 ? "s" : ""} across {componentsWithElements.length} component{componentsWithElements.length !== 1 ? "s" : ""})
        </h2>
        {!projectId ? (
          <p style={{ color: "#888" }}>Select a project.</p>
        ) : components.length === 0 ? (
          <p style={{ color: "#888" }}>
            No §5.3 architecture components yet — define them in <a href="/architecture" style={{ color: "#1565c0" }}>SW Architecture</a> first.
          </p>
        ) : elements.length === 0 ? (
          <p style={{ color: "#888" }}>No design elements yet. Pick a component above and add one.</p>
        ) : (
          <div>
            {componentsWithElements.map(c => (
              <ComponentGroup
                key={c.id}
                component={c}
                elements={elementsOf(c.id)}
                onDelete={handleDelete}
                onUpdate={handleElementUpdate}
                highlightId={highlightId}
                linkedReqsForEl={linkedReqsForEl}
              />
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
const editBtnStyle: React.CSSProperties   = { background: "none", border: "1px solid #c5cae9", color: "#546e7a", cursor: "pointer", fontSize: 13, flexShrink: 0, padding: "2px 7px", borderRadius: 4 };
