"use client";

import { useEffect, useState } from "react";
import { api, Project, DesignElement, DesignElementType, Requirement } from "@/lib/api";

const TYPE_COLOR: Record<DesignElementType, string> = { ARCHITECTURE: "#1565c0", DETAILED: "#4a148c" };

export default function DesignPage() {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [elements, setElements]     = useState<DesignElement[]>([]);
  const [swReqs, setSwReqs]         = useState<Requirement[]>([]);
  const [projectId, setProjectId]   = useState("");

  // create form
  const [elType, setElType]         = useState<DesignElementType>("ARCHITECTURE");
  const [parentId, setParentId]     = useState("");
  const [title, setTitle]           = useState("");
  const [desc, setDesc]             = useState("");
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState("");

  // link form
  const [linkReqId, setLinkReqId]   = useState("");
  const [linkElId, setLinkElId]     = useState("");
  const [linking, setLinking]       = useState(false);
  const [linkMsg, setLinkMsg]       = useState("");

  useEffect(() => { api.projects.list().then(setProjects).catch(console.error); }, []);

  useEffect(() => {
    if (!projectId) { setElements([]); setSwReqs([]); return; }
    api.design.listElements(projectId).then(setElements).catch(console.error);
    api.requirements.list(projectId, "SOFTWARE").then(setSwReqs).catch(console.error);
  }, [projectId]);

  const archElements = elements.filter((e) => e.type === "ARCHITECTURE");

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
      setElements(await api.design.listElements(projectId));
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
    setElements(await api.design.listElements(projectId));
  }

  return (
    <div>
      <h1>Design Elements</h1>

      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
        <option value="">— Select project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", margin: "1.5rem 0" }}>
        {/* Create */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Add Design Element</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <select value={elType} onChange={(e) => { setElType(e.target.value as DesignElementType); setParentId(""); }} style={inputStyle}>
              <option value="ARCHITECTURE">ARCHITECTURE (top-level)</option>
              <option value="DETAILED">DETAILED (under architecture)</option>
            </select>
            {elType === "DETAILED" && (
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} required style={inputStyle}>
                <option value="">— Select ARCHITECTURE parent *</option>
                {archElements.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            )}
            <input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} />
            {formErr && <p style={{ color: "red", margin: 0, fontSize: "0.85rem" }}>{formErr}</p>}
            <button type="submit" disabled={saving || !projectId} style={btnStyle}>{saving ? "Saving…" : "Add"}</button>
          </form>
        </section>

        {/* Link SOFTWARE req → design element */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Link SOFTWARE Req → Design</h2>
          <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <select value={linkReqId} onChange={(e) => setLinkReqId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— SOFTWARE requirement *</option>
              {swReqs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <select value={linkElId} onChange={(e) => setLinkElId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— Design element *</option>
              {elements.map((e) => <option key={e.id} value={e.id}>[{e.type}] {e.title}</option>)}
            </select>
            {linkMsg && <p style={{ color: linkMsg.startsWith("Error") ? "red" : "green", margin: 0, fontSize: "0.85rem" }}>{linkMsg}</p>}
            <button type="submit" disabled={linking || !linkReqId || !linkElId} style={btnStyle}>{linking ? "Linking…" : "Link"}</button>
          </form>
        </section>
      </div>

      {/* Tree view */}
      <section>
        <h2>Design Tree ({elements.length} elements)</h2>
        {!projectId ? <p style={{ color: "#888" }}>Select a project.</p>
          : elements.length === 0 ? <p style={{ color: "#888" }}>No design elements yet.</p>
          : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1rem" }}>
            {archElements.map((arch) => (
              <div key={arch.id}>
                <DesignRow el={arch} indent={0} onDelete={handleDelete} />
                {elements.filter((e) => e.parent_id === arch.id).map((det) => (
                  <DesignRow key={det.id} el={det} indent={1} onDelete={handleDelete} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DesignRow({ el, indent, onDelete }: { el: DesignElement; indent: number; onDelete: (id: string) => void }) {
  const colors: Record<DesignElementType, string> = { ARCHITECTURE: "#1565c0", DETAILED: "#4a148c" };
  const prefix = indent === 0 ? "" : "└── ";
  return (
    <div style={{ padding: "0.5rem 0.25rem", borderBottom: "1px solid #f0f0f0", display: "flex", gap: "0.75rem", alignItems: "flex-start", paddingLeft: `${indent * 2}rem` }}>
      <span style={{ color: "#aaa", minWidth: "3rem", fontSize: "0.85rem" }}>{prefix}</span>
      <span style={{ background: colors[el.type], color: "#fff", borderRadius: "3px", padding: "0 5px", fontSize: "0.7rem", flexShrink: 0, alignSelf: "center" }}>{el.type}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 500 }}>{el.title}</span>
        {el.description && <div style={{ color: "#666", fontSize: "0.8rem" }}>{el.description}</div>}
      </div>
      <button onClick={() => onDelete(el.id)} style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem" };
const btnStyle: React.CSSProperties   = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
