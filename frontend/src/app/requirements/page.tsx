"use client";

import { useEffect, useRef, useState } from "react";
import { api, Project, Requirement, ReqType, UploadSummary } from "@/lib/api";

const TYPE_ORDER: ReqType[] = ["USER", "SYSTEM", "SOFTWARE"];
const TYPE_COLOR: Record<ReqType, string> = { USER: "#1565c0", SYSTEM: "#6a1b9a", SOFTWARE: "#1b5e20" };

export default function RequirementsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [reqs, setReqs]         = useState<Requirement[]>([]);
  const [projectId, setProjectId] = useState("");

  // form state
  const [type, setType]         = useState<ReqType>("USER");
  const [parentId, setParentId] = useState("");
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving]     = useState(false);

  // upload state
  const fileRef                 = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<UploadSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    api.projects.list().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projectId) { setReqs([]); return; }
    api.requirements.list(projectId).then(setReqs).catch(console.error);
    setParentId("");
  }, [projectId]);

  // eligible parents depend on selected type
  const eligibleParents = reqs.filter((r) => {
    if (type === "SYSTEM")   return r.type === "USER";
    if (type === "SOFTWARE") return r.type === "SYSTEM";
    return false;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) { setFormError("Select a project first"); return; }
    setSaving(true); setFormError("");
    try {
      await api.requirements.create({
        project_id: projectId,
        type,
        parent_id: parentId || undefined,
        title: title.trim(),
        description: desc.trim() || undefined,
      });
      setTitle(""); setDesc(""); setParentId("");
      setReqs(await api.requirements.list(projectId));
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !projectId) { setUploadError("Select a project and .xlsx file"); return; }
    setUploading(true); setUploadError(""); setUploadResult(null);
    try {
      const result = await api.requirements.upload(projectId, file);
      setUploadResult(result);
      setReqs(await api.requirements.list(projectId));
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // Build tree from flat list
  const userReqs   = reqs.filter((r) => r.type === "USER");
  const systemReqs = reqs.filter((r) => r.type === "SYSTEM");
  const swReqs     = reqs.filter((r) => r.type === "SOFTWARE");

  return (
    <div>
      <h1>Requirements</h1>

      {/* Project selector */}
      <div style={{ marginBottom: "1.5rem" }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Create form */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Add Requirement</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <select value={type} onChange={(e) => { setType(e.target.value as ReqType); setParentId(""); }} style={inputStyle}>
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            {(type === "SYSTEM" || type === "SOFTWARE") && (
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} required style={inputStyle}>
                <option value="">— Select parent ({type === "SYSTEM" ? "USER" : "SYSTEM"}) *</option>
                {eligibleParents.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}

            <input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} />
            {formError && <p style={{ color: "red", margin: 0, fontSize: "0.85rem" }}>{formError}</p>}
            <button type="submit" disabled={saving || !projectId} style={btnStyle}>{saving ? "Saving…" : "Add"}</button>
          </form>
        </section>

        {/* Excel upload */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Upload Excel</h2>
          <p style={{ color: "#555", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
            Columns: <code>type</code>, <code>title</code>, <code>description</code>, <code>parent_title</code>
          </p>
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input type="file" accept=".xlsx" ref={fileRef} style={inputStyle} />
            {uploadError && <p style={{ color: "red", margin: 0, fontSize: "0.85rem" }}>{uploadError}</p>}
            <button type="submit" disabled={uploading || !projectId} style={btnStyle}>{uploading ? "Uploading…" : "Upload .xlsx"}</button>
          </form>

          {uploadResult && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ color: "green", margin: "0 0 0.25rem" }}>✓ Added: {uploadResult.total_added}</p>
              {uploadResult.total_skipped > 0 && (
                <details>
                  <summary style={{ color: "orange", cursor: "pointer" }}>⚠ Skipped: {uploadResult.total_skipped}</summary>
                  <ul style={{ fontSize: "0.8rem", margin: "0.5rem 0" }}>
                    {uploadResult.skipped.map((s, i) => <li key={i}><b>{s.title}</b>: {s.reason}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Hierarchy tree */}
      <section style={{ marginTop: "2rem" }}>
        <h2>Hierarchy ({reqs.length} requirements)</h2>
        {!projectId ? (
          <p style={{ color: "#888" }}>Select a project to view requirements.</p>
        ) : reqs.length === 0 ? (
          <p style={{ color: "#888" }}>No requirements yet.</p>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1rem" }}>
            {userReqs.map((u) => (
              <div key={u.id}>
                <ReqRow req={u} indent={0} />
                {systemReqs.filter((s) => s.parent_id === u.id).map((s) => (
                  <div key={s.id}>
                    <ReqRow req={s} indent={1} />
                    {swReqs.filter((sw) => sw.parent_id === s.id).map((sw) => (
                      <ReqRow key={sw.id} req={sw} indent={2} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {/* orphaned / unlinked */}
            {systemReqs.filter((s) => !userReqs.find((u) => u.id === s.parent_id)).map((s) => (
              <ReqRow key={s.id} req={s} indent={0} orphan />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReqRow({ req, indent, orphan }: { req: Requirement; indent: number; orphan?: boolean }) {
  const colors: Record<ReqType, string> = { USER: "#1565c0", SYSTEM: "#6a1b9a", SOFTWARE: "#1b5e20" };
  const prefix = ["", "└── ", "    └── "][indent] ?? "";
  return (
    <div style={{ padding: "0.4rem 0.25rem", borderBottom: "1px solid #f0f0f0", display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
      <span style={{ color: "#aaa", minWidth: "6rem", fontFamily: "monospace", fontSize: "0.85rem" }}>{prefix}</span>
      <span style={{ background: colors[req.type], color: "#fff", borderRadius: "3px", padding: "0 5px", fontSize: "0.7rem", flexShrink: 0 }}>
        {req.type}{orphan ? " ⚠" : ""}
      </span>
      <span style={{ fontWeight: 500 }}>{req.title}</span>
      {req.description && <span style={{ color: "#888", fontSize: "0.8rem" }}>— {req.description}</span>}
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem", width: "100%", boxSizing: "border-box" };
const btnStyle: React.CSSProperties   = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", alignSelf: "flex-start" };
