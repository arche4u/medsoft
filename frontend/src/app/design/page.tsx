"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, DesignElement, DesignElementType, Requirement } from "@/lib/api";

const TYPE_META: Record<DesignElementType, { label: string; color: string }> = {
  ARCHITECTURE: { label: "Architecture", color: "#1565c0" },
  DETAILED:     { label: "Detailed",     color: "#4a148c" },
};

// ── Collapsible ARCHITECTURE node ─────────────────────────────────────────────
function ArchNode({ arch, children, onDelete }: {
  arch: DesignElement;
  children: DesignElement[];
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 4 }}>
      {/* ARCHITECTURE row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", background: "#e8eaf6", borderRadius: 6,
        borderLeft: "4px solid #1565c0", cursor: "pointer",
      }} onClick={() => setOpen(o => !o)}>
        <span style={{ color: "#1565c0", fontSize: 13, fontWeight: 700, userSelect: "none", minWidth: 16 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ background: "#1565c0", color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          ARCH
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{arch.title}</span>
        {arch.description && <span style={{ color: "#666", fontSize: 12 }}>{arch.description}</span>}
        <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{children.length} detailed</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(arch.id); }}
          style={deleteBtnStyle}
        >✕</button>
      </div>

      {/* DETAILED children */}
      {open && children.map(det => (
        <div key={det.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px 7px 36px",
          borderBottom: "1px solid #f0f0f0",
          borderLeft: "4px solid #e8eaf6",
          marginLeft: 12,
        }}>
          <span style={{ color: "#aaa", fontSize: 12, flexShrink: 0 }}>└</span>
          <span style={{ background: "#4a148c", color: "#fff", borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            DTL
          </span>
          <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{det.title}</span>
          {det.description && <span style={{ color: "#888", fontSize: 12 }}>{det.description}</span>}
          <button onClick={() => onDelete(det.id)} style={deleteBtnStyle}>✕</button>
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
  const [projectId, setProjectId] = useState("");
  const [filter, setFilter]       = useState<string>(typeParam);

  // create form
  const [elType, setElType]   = useState<DesignElementType>("ARCHITECTURE");
  const [parentId, setParentId] = useState("");
  const [title, setTitle]     = useState("");
  const [desc, setDesc]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

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

  const archElements = elements.filter(e => e.type === "ARCHITECTURE");
  const detailedOf   = (archId: string) => elements.filter(e => e.parent_id === archId);

  // Filter for flat list view
  const filteredElements = filter === "ALL" ? elements
    : elements.filter(e => e.type === filter);

  const counts = {
    ALL:          elements.length,
    ARCHITECTURE: elements.filter(e => e.type === "ARCHITECTURE").length,
    DETAILED:     elements.filter(e => e.type === "DETAILED").length,
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px" }}>
      <h1 style={{ marginTop: 0, marginBottom: 20 }}>Design Elements</h1>

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
                {archElements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
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
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Link SOFTWARE Req → Design</h2>
          <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={linkReqId} onChange={e => setLinkReqId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— SOFTWARE requirement *</option>
              {swReqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} {r.title}</option>)}
            </select>
            <select value={linkElId} onChange={e => setLinkElId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— Design element *</option>
              {elements.map(e => <option key={e.id} value={e.id}>[{e.type === "ARCHITECTURE" ? "ARCH" : "DTL"}] {e.title}</option>)}
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
                  <ArchNode key={arch.id} arch={arch} children={detailedOf(arch.id)} onDelete={handleDelete} />
                ))
            }
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            {filteredElements.map(el => (
              <div key={el.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 12px", borderBottom: "1px solid #f5f5f5",
              }}>
                <span style={{
                  background: TYPE_META[el.type].color, color: "#fff",
                  borderRadius: 3, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{el.type === "ARCHITECTURE" ? "ARCH" : "DTL"}</span>
                <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{el.title}</span>
                {el.description && <span style={{ color: "#888", fontSize: 12 }}>{el.description}</span>}
                <button onClick={() => handleDelete(el.id)} style={deleteBtnStyle}>✕</button>
              </div>
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

const cardStyle: React.CSSProperties     = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.25rem" };
const inputStyle: React.CSSProperties    = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnStyle: React.CSSProperties      = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, alignSelf: "flex-start" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13, flexShrink: 0, padding: "2px 4px" };
