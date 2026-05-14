"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import { api, Requirement, ValidationRecord, ValidationStatus } from "@/lib/api";

// IEC 62304 §5.7 / ISO 13485 design validation — confirms the software meets
// USER needs ("did we build the right product"). Validation records link to
// USER requirements only.

const STATUS_META: Record<ValidationStatus, { label: string; color: string; bg: string; border: string }> = {
  PLANNED: { label: "Planned", color: "#546e7a", bg: "#eceff1", border: "#cfd8dc" },
  PASSED:  { label: "Passed",  color: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7" },
  FAILED:  { label: "Failed",  color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
};
const STATUS_ORDER: ValidationStatus[] = ["FAILED", "PLANNED", "PASSED"];

export default function ValidationPage() {
  const [projectId] = useActiveProject();
  const [records, setRecords] = useState<ValidationRecord[]>([]);
  const [userReqs, setUserReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [reqId, setReqId] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<ValidationStatus>("PLANNED");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!projectId) { setRecords([]); setUserReqs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [recs, reqs] = await Promise.all([
        api.validation.listRecords(projectId),
        api.requirements.list(projectId, "USER"),
      ]);
      setRecords(recs);
      setUserReqs(reqs);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reqById = Object.fromEntries(userReqs.map(r => [r.id, r]));

  async function handleCreate() {
    if (!projectId || !reqId || !desc.trim()) return;
    setSaving(true);
    try {
      await api.validation.createRecord({
        project_id: projectId,
        related_requirement_id: reqId,
        description: desc.trim(),
        status,
      });
      setReqId(""); setDesc(""); setStatus("PLANNED"); setShowCreate(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setRecordStatus(rec: ValidationRecord, next: ValidationStatus) {
    await api.validation.updateRecord(rec.id, { status: next });
    await load();
  }

  async function handleDelete(rec: ValidationRecord) {
    if (!confirm("Delete this validation record?")) return;
    await api.validation.deleteRecord(rec.id);
    await load();
  }

  if (!projectId) {
    return (
      <div style={sty.empty}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontWeight: 600 }}>No project selected</div>
        <div style={{ color: "#78909c", marginTop: 4 }}>
          Select a project from the sidebar to view validation records.
        </div>
      </div>
    );
  }

  const counts = {
    PLANNED: records.filter(r => r.status === "PLANNED").length,
    PASSED:  records.filter(r => r.status === "PASSED").length,
    FAILED:  records.filter(r => r.status === "FAILED").length,
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>Validation Records</h1>
          <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
            IEC 62304 §5.7 / ISO 13485 — design validation against USER requirements
            (&ldquo;did we build the right product&rdquo;)
          </p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} style={sty.btn}>
          {showCreate ? "Cancel" : "+ New Validation Record"}
        </button>
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {STATUS_ORDER.map(s => {
          const m = STATUS_META[s];
          return (
            <div key={s} style={{
              padding: "6px 12px", borderRadius: 8, background: m.bg,
              border: `1px solid ${m.border}`, color: m.color, fontSize: 13, fontWeight: 600,
            }}>
              {counts[s]} {m.label}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {showCreate && (
        <div style={{ ...sty.panel, marginBottom: 18 }}>
          <div style={sty.panelTitle}>New Validation Record</div>
          <label style={sty.label}>USER Requirement *</label>
          <select value={reqId} onChange={e => setReqId(e.target.value)} style={{ ...sty.input, width: "100%", marginBottom: 10 }}>
            <option value="">— Select a USER requirement —</option>
            {userReqs.map(r => (
              <option key={r.id} value={r.id}>{r.readable_id} — {r.title}</option>
            ))}
          </select>
          {userReqs.length === 0 && (
            <div style={{ fontSize: 12, color: "#e65100", marginBottom: 10 }}>
              This project has no USER requirements yet — validation records must link to one.
            </div>
          )}
          <label style={sty.label}>Validation Description / Method *</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={3}
            placeholder="How was this user requirement validated? (e.g. usability study, clinical evaluation, field trial…)"
            style={sty.textarea}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
            <div>
              <label style={sty.label}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as ValidationStatus)} style={{ ...sty.input, width: 140 }}>
                <option value="PLANNED">Planned</option>
                <option value="PASSED">Passed</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !reqId || !desc.trim()}
              style={{ ...sty.btn, opacity: saving || !reqId || !desc.trim() ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Create Record"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : records.length === 0 ? (
        <div style={sty.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 600, color: "#37474f" }}>No validation records yet</div>
          <div style={{ color: "#78909c", marginTop: 4, fontSize: 13 }}>
            Validation confirms each USER requirement is met by the delivered software.
          </div>
        </div>
      ) : (
        STATUS_ORDER.filter(s => counts[s] > 0).map(s => {
          const m = STATUS_META[s];
          return (
            <div key={s} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 8 }}>
                {m.label} <span style={{ color: "#90a4ae" }}>({counts[s]})</span>
              </div>
              {records.filter(r => r.status === s).map(rec => {
                const req = reqById[rec.related_requirement_id];
                return (
                  <div key={rec.id} style={{ ...sty.panel, marginBottom: 8, borderLeft: `4px solid ${m.border}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {req ? (
                            <a href={`/requirements?type=USER&highlight=${req.id}`}
                              style={{
                                fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#1565c0",
                                background: "#e3f2fd", borderRadius: 4, padding: "1px 7px", textDecoration: "none",
                              }}>
                              {req.readable_id}
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: "#b71c1c" }}>(requirement not found)</span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#37474f" }}>
                            {req?.title ?? ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#37474f", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                          {rec.description}
                        </div>
                        <div style={{ fontSize: 11, color: "#90a4ae", marginTop: 4 }}>
                          {new Date(rec.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                        <select
                          value={rec.status}
                          onChange={e => setRecordStatus(rec, e.target.value as ValidationStatus)}
                          style={{ ...sty.input, width: 110, background: m.bg, color: m.color, fontWeight: 600 }}
                        >
                          <option value="PLANNED">Planned</option>
                          <option value="PASSED">Passed</option>
                          <option value="FAILED">Failed</option>
                        </select>
                        <button onClick={() => handleDelete(rec)} style={sty.delBtn} title="Delete record">✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

const sty = {
  panel: {
    background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "14px 16px",
  } as React.CSSProperties,
  panelTitle: {
    fontWeight: 600, fontSize: 14, color: "#1a237e", marginBottom: 12,
  } as React.CSSProperties,
  btn: {
    background: "#1a237e", color: "#fff", border: "none", borderRadius: 6,
    padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
  } as React.CSSProperties,
  delBtn: {
    background: "transparent", border: "none", color: "#b71c1c",
    cursor: "pointer", fontSize: 14, padding: "2px 6px",
  } as React.CSSProperties,
  label: {
    display: "block", fontSize: 12, fontWeight: 500, color: "#546e7a", marginBottom: 4,
  } as React.CSSProperties,
  input: {
    border: "1px solid #cfd8dc", borderRadius: 5, padding: "7px 10px", fontSize: 13, outline: "none",
  } as React.CSSProperties,
  textarea: {
    width: "100%", border: "1px solid #cfd8dc", borderRadius: 5, padding: "7px 10px",
    fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box",
  } as React.CSSProperties,
  empty: {
    textAlign: "center", padding: "60px 24px", color: "#546e7a",
  } as React.CSSProperties,
};
