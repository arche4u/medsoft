"use client";
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import { api, Project, Release, ReleaseDetail, ReleaseStatus, TestCase, Requirement, DesignElement, ReadinessCheck, Approval } from "@/lib/api";

const STATUS_COLORS: Record<ReleaseStatus, string> = {
  DRAFT: "#546e7a",
  UNDER_REVIEW: "#e65100",
  APPROVED: "#2e7d32",
  RELEASED: "#4a148c",
};

const NEXT_STATUS: Partial<Record<ReleaseStatus, ReleaseStatus>> = {
  DRAFT: "UNDER_REVIEW",
  UNDER_REVIEW: "APPROVED",
  APPROVED: "RELEASED",
};

export default function ReleasePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selected, setSelected] = useState<ReleaseDetail | null>(null);
  const [readiness, setReadiness] = useState<ReadinessCheck | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const [projectId, setProjectId] = useActiveProject();
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");

  // Add item form
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [designElements, setDesignElements] = useState<DesignElement[]>([]);
  const [itemType, setItemType] = useState<"testcase" | "requirement" | "design">("testcase");
  const [itemId, setItemId] = useState("");

  // Approval form
  const [approverName, setApproverName] = useState("");
  const [approvalComments, setApprovalComments] = useState("");
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  useEffect(() => {
    api.projects.list().then(setProjects);
  }, []);

  const loadReleases = (pid: string) => {
    api.release.list(pid).then(setReleases);
    api.testcases.list(pid).then(setTestcases);
    api.requirements.list(pid).then(setRequirements);
    api.design.listElements(pid).then(setDesignElements);
  };

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    setSelected(null);
    loadReleases(pid);
  };

  const createRelease = async () => {
    if (!projectId || !version.trim()) return;
    try {
      setError("");
      await api.release.create({ project_id: projectId, version });
      setVersion("");
      loadReleases(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectRelease = async (id: string) => {
    const detail = await api.release.get(id);
    setSelected(detail);
    const r = await api.release.readiness(id);
    setReadiness(r);
    const appr = await api.approvals.list({ entity_type: "RELEASE", entity_id: id });
    setApprovals(appr);
    setShowApprovalForm(false);
  };

  const transition = async (rel: Release, newStatus: ReleaseStatus) => {
    try {
      setError("");
      await api.release.transition(rel.id, newStatus);
      loadReleases(projectId);
      await selectRelease(rel.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addItem = async () => {
    if (!selected || !itemId) return;
    try {
      setError("");
      const d: { release_id: string; testcase_id?: string; requirement_id?: string; design_element_id?: string } = { release_id: selected.id };
      if (itemType === "testcase") d.testcase_id = itemId;
      else if (itemType === "requirement") d.requirement_id = itemId;
      else d.design_element_id = itemId;
      await api.release.addItem(d);
      setItemId("");
      await selectRelease(selected.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    await api.release.deleteItem(itemId);
    await selectRelease(selected.id);
  };

  const submitApproval = async (decision: "APPROVED" | "REJECTED") => {
    if (!selected || !approverName.trim()) return;
    try {
      setError("");
      await api.approvals.create({
        entity_type: "RELEASE",
        entity_id: selected.id,
        approver_name: approverName,
        decision,
        comments: approvalComments || undefined,
      });
      setApproverName(""); setApprovalComments(""); setShowApprovalForm(false);
      const appr = await api.approvals.list({ entity_type: "RELEASE", entity_id: selected.id });
      setApprovals(appr);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const getItemOptions = () => {
    if (itemType === "testcase") return testcases.map(tc => ({ id: tc.id, label: tc.title }));
    if (itemType === "requirement") return requirements.map(r => ({ id: r.id, label: `[${r.type}] ${r.title}` }));
    return designElements.map(de => ({ id: de.id, label: `[${de.type}] ${de.title}` }));
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });
  const badge = (status: string, color: string): React.CSSProperties => ({ background: color, color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: "0.7rem", fontWeight: "bold", display: "inline-block" });

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>Release Management</h1>

      {error && <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "1.5rem" }}>
        {/* Left panel */}
        <div>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>New Release</h3>
            <div style={{ marginBottom: "0.75rem" }}>
              <select style={inputStyle} value={projectId} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <input style={inputStyle} placeholder="Version (e.g. v1.0.0)" value={version} onChange={e => setVersion(e.target.value)} />
            </div>
            <button style={btnStyle()} onClick={createRelease}>Create Release</button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Releases</h3>
            {releases.length === 0 && <p style={{ color: "#888", fontSize: "0.85rem" }}>No releases yet.</p>}
            {releases.map(rel => (
              <div
                key={rel.id}
                onClick={() => selectRelease(rel.id)}
                style={{
                  border: selected?.id === rel.id ? "2px solid #1565c0" : "1px solid #eee",
                  borderRadius: 6, padding: "0.75rem", marginBottom: "0.5rem", cursor: "pointer",
                  background: selected?.id === rel.id ? "#e3f2fd" : "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{rel.version}</strong>
                  <span style={badge(rel.status, STATUS_COLORS[rel.status])}>{rel.status}</span>
                </div>
                <div style={{ color: "#888", fontSize: "0.75rem", marginTop: 4 }}>{new Date(rel.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {selected ? (
            <>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ marginTop: 0 }}>Release {selected.version}</h3>
                  <span style={badge(selected.status, STATUS_COLORS[selected.status])}>{selected.status}</span>
                </div>

                {readiness && (
                  <div style={{
                    background: readiness.ready ? "#e8f5e9" : "#fff3e0",
                    border: `1px solid ${readiness.ready ? "#a5d6a7" : "#ffcc02"}`,
                    borderRadius: 6, padding: "0.75rem", marginBottom: "1rem",
                  }}>
                    <strong style={{ fontSize: "0.85rem" }}>
                      {readiness.ready ? "✓ Release Ready" : "⚠ Not Ready for Release"}
                    </strong>
                    <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
                      Test Cases: {readiness.passed}/{readiness.total_testcases} passed
                      {readiness.not_passed.length > 0 && ` · ${readiness.not_passed.length} failing`}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {NEXT_STATUS[selected.status] && (
                    <button style={btnStyle("#2e7d32")} onClick={() => transition(selected, NEXT_STATUS[selected.status]!)}>
                      → {NEXT_STATUS[selected.status]}
                    </button>
                  )}
                  {selected.status === "UNDER_REVIEW" && (
                    <button style={btnStyle("#e65100")} onClick={() => setShowApprovalForm(v => !v)}>
                      {showApprovalForm ? "Cancel" : "Submit Approval"}
                    </button>
                  )}
                </div>

                {showApprovalForm && (
                  <div style={{ marginTop: "1rem", padding: "1rem", background: "#f9f9f9", borderRadius: 6, border: "1px solid #eee" }}>
                    <h4 style={{ marginTop: 0 }}>Approval Decision</h4>
                    <input style={{ ...inputStyle, marginBottom: "0.5rem" }} placeholder="Approver name" value={approverName} onChange={e => setApproverName(e.target.value)} />
                    <textarea style={{ ...inputStyle, height: 50, marginBottom: "0.5rem" }} placeholder="Comments (optional)" value={approvalComments} onChange={e => setApprovalComments(e.target.value)} />
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button style={btnStyle("#2e7d32")} onClick={() => submitApproval("APPROVED")}>Approve</button>
                      <button style={btnStyle("#b71c1c")} onClick={() => submitApproval("REJECTED")}>Reject</button>
                    </div>
                  </div>
                )}
              </div>

              {approvals.length > 0 && (
                <div style={cardStyle}>
                  <h4 style={{ marginTop: 0 }}>Approval History</h4>
                  {approvals.map(a => (
                    <div key={a.id} style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid #eee", fontSize: "0.8rem" }}>
                      <strong>{a.approver_name}</strong>
                      <span style={badge(a.decision, a.decision === "APPROVED" ? "#2e7d32" : "#b71c1c")}>{a.decision}</span>
                      <span style={{ color: "#666" }}>{a.comments || "—"}</span>
                      <span style={{ marginLeft: "auto", color: "#888" }}>{new Date(a.timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === "DRAFT" && (
                <div style={cardStyle}>
                  <h4 style={{ marginTop: 0 }}>Add Release Item</h4>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    {(["testcase", "requirement", "design"] as const).map(t => (
                      <button
                        key={t}
                        style={{ ...btnStyle(itemType === t ? "#1565c0" : "#90a4ae"), padding: "0.3rem 0.6rem" }}
                        onClick={() => { setItemType(t); setItemId(""); }}
                      >
                        {t === "testcase" ? "Test Case" : t === "requirement" ? "Requirement" : "Design Element"}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <select style={{ ...inputStyle, flex: 1 }} value={itemId} onChange={e => setItemId(e.target.value)}>
                      <option value="">Select {itemType}…</option>
                      {getItemOptions().map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button style={btnStyle()} onClick={addItem}>Add</button>
                  </div>
                </div>
              )}

              <div style={cardStyle}>
                <h4 style={{ marginTop: 0 }}>Release Items ({selected.items.length})</h4>
                {selected.items.length === 0 ? (
                  <p style={{ color: "#888", fontSize: "0.85rem" }}>No items added yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        {["Type", "Entity ID", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map(item => {
                        const type = item.testcase_id ? "Test Case" : item.requirement_id ? "Requirement" : "Design Element";
                        const id = item.testcase_id || item.requirement_id || item.design_element_id || "";
                        return (
                          <tr key={item.id}>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>
                              <span style={{ background: "#e3f2fd", borderRadius: 4, padding: "1px 6px", fontSize: "0.75rem" }}>{type}</span>
                            </td>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee", fontFamily: "monospace", fontSize: "0.7rem", color: "#888" }}>{id.slice(0, 8)}…</td>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>
                              {selected.status === "DRAFT" && (
                                <button style={{ ...btnStyle("#b71c1c"), padding: "2px 6px" }} onClick={() => removeItem(item.id)}>✕</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ ...cardStyle, color: "#888", textAlign: "center", padding: "3rem" }}>
              Select a release to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
