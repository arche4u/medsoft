"use client";
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import { api, Project, ChangeRequest, ChangeRequestDetail, ChangeRequestState, Approval } from "@/lib/api";

const STATUS_COLORS: Record<ChangeRequestState, string> = {
  OPEN: "#1565c0",
  IMPACT_ANALYSIS: "#e65100",
  APPROVED: "#2e7d32",
  REJECTED: "#b71c1c",
  IMPLEMENTED: "#4a148c",
};

const NEXT_STATUS: Partial<Record<ChangeRequestState, ChangeRequestState>> = {
  OPEN: "IMPACT_ANALYSIS",
  IMPACT_ANALYSIS: "APPROVED",
  APPROVED: "IMPLEMENTED",
};

const REJECT_FROM: Set<ChangeRequestState> = new Set(["IMPACT_ANALYSIS"]);

export default function ChangeControlPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [selected, setSelected] = useState<ChangeRequestDetail | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const [projectId, setProjectId] = useActiveProject();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");

  const [approverName, setApproverName] = useState("");
  const [approvalComments, setApprovalComments] = useState("");
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  useEffect(() => {
    api.projects.list().then(setProjects);
  }, []);

  const loadRequests = (pid: string) => {
    api.changeControl.listRequests(pid).then(setRequests);
  };

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    setSelected(null);
    loadRequests(pid);
  };

  const createRequest = async () => {
    if (!projectId || !title.trim()) return;
    try {
      setError("");
      await api.changeControl.createRequest({ project_id: projectId, title, description: desc || undefined });
      setTitle(""); setDesc("");
      loadRequests(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectRequest = async (id: string) => {
    const detail = await api.changeControl.getRequest(id);
    setSelected(detail);
    const appr = await api.approvals.list({ entity_type: "CHANGE", entity_id: id });
    setApprovals(appr);
    setShowApprovalForm(false);
  };

  const transition = async (cr: ChangeRequest, newStatus: ChangeRequestState) => {
    try {
      setError("");
      await api.changeControl.transition(cr.id, newStatus);
      loadRequests(projectId);
      await selectRequest(cr.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitApproval = async (decision: "APPROVED" | "REJECTED") => {
    if (!selected || !approverName.trim()) return;
    try {
      setError("");
      await api.approvals.create({
        entity_type: "CHANGE",
        entity_id: selected.id,
        approver_name: approverName,
        decision,
        comments: approvalComments || undefined,
      });
      setApproverName(""); setApprovalComments(""); setShowApprovalForm(false);
      const appr = await api.approvals.list({ entity_type: "CHANGE", entity_id: selected.id });
      setApprovals(appr);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteImpact = async (impactId: string) => {
    if (!selected) return;
    await api.changeControl.deleteImpact(impactId);
    await selectRequest(selected.id);
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });
  const badge = (status: string, color: string): React.CSSProperties => ({ background: color, color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: "0.7rem", fontWeight: "bold" });

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>Change Control</h1>

      {error && <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" }}>
        {/* Left panel */}
        <div>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>New Change Request</h3>
            <div style={{ marginBottom: "0.75rem" }}>
              <select style={inputStyle} value={projectId} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <input style={inputStyle} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <textarea style={{ ...inputStyle, height: 60 }} placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <button style={btnStyle()} onClick={createRequest}>Create Request</button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Change Requests</h3>
            {requests.length === 0 && <p style={{ color: "#888", fontSize: "0.85rem" }}>No change requests yet.</p>}
            {requests.map(cr => (
              <div
                key={cr.id}
                onClick={() => selectRequest(cr.id)}
                style={{
                  border: selected?.id === cr.id ? "2px solid #1565c0" : "1px solid #eee",
                  borderRadius: 6, padding: "0.75rem", marginBottom: "0.5rem", cursor: "pointer",
                  background: selected?.id === cr.id ? "#e3f2fd" : "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{cr.title}</strong>
                  <span style={badge(cr.status, STATUS_COLORS[cr.status])}>{cr.status}</span>
                </div>
                <div style={{ color: "#888", fontSize: "0.75rem", marginTop: 4 }}>{new Date(cr.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {selected ? (
            <>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ marginTop: 0 }}>{selected.title}</h3>
                    {selected.description && <p style={{ color: "#555", fontSize: "0.85rem" }}>{selected.description}</p>}
                  </div>
                  <span style={badge(selected.status, STATUS_COLORS[selected.status])}>{selected.status}</span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  {NEXT_STATUS[selected.status] && (
                    <button style={btnStyle("#2e7d32")} onClick={() => transition(selected, NEXT_STATUS[selected.status]!)}>
                      → Move to {NEXT_STATUS[selected.status]}
                    </button>
                  )}
                  {REJECT_FROM.has(selected.status) && (
                    <button style={btnStyle("#b71c1c")} onClick={() => transition(selected, "REJECTED")}>
                      ✗ Reject
                    </button>
                  )}
                  {(selected.status === "IMPACT_ANALYSIS") && (
                    <button style={btnStyle("#e65100")} onClick={() => setShowApprovalForm(v => !v)}>
                      {showApprovalForm ? "Cancel" : "Submit Approval"}
                    </button>
                  )}
                </div>

                {showApprovalForm && (
                  <div style={{ marginTop: "1rem", padding: "1rem", background: "#f9f9f9", borderRadius: 6, border: "1px solid #eee" }}>
                    <h4 style={{ marginTop: 0 }}>Submit Approval Decision</h4>
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
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        {["Approver", "Decision", "Comments", "Date"].map(h => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {approvals.map(a => (
                        <tr key={a.id}>
                          <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>{a.approver_name}</td>
                          <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>
                            <span style={badge(a.decision, a.decision === "APPROVED" ? "#2e7d32" : "#b71c1c")}>{a.decision}</span>
                          </td>
                          <td style={{ padding: "6px 8px", border: "1px solid #eee", color: "#666" }}>{a.comments || "—"}</td>
                          <td style={{ padding: "6px 8px", border: "1px solid #eee", color: "#888" }}>{new Date(a.timestamp).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={cardStyle}>
                <h4 style={{ marginTop: 0 }}>
                  Impact Analysis ({selected.impacts.length} items)
                  {selected.status === "OPEN" && (
                    <span style={{ fontWeight: "normal", fontSize: "0.75rem", color: "#888", marginLeft: 8 }}>
                      Impacts are auto-populated when moved to IMPACT_ANALYSIS
                    </span>
                  )}
                </h4>
                {selected.impacts.length === 0 ? (
                  <p style={{ color: "#888", fontSize: "0.85rem" }}>No impact records yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        {["Type", "Entity ID", "Description", ""].map(h => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.impacts.map(imp => {
                        const type = imp.impacted_requirement_id ? "Requirement"
                          : imp.impacted_design_id ? "Design"
                          : "Test Case";
                        const entityId = imp.impacted_requirement_id || imp.impacted_design_id || imp.impacted_testcase_id || "";
                        return (
                          <tr key={imp.id}>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>
                              <span style={{ background: "#e3f2fd", borderRadius: 4, padding: "1px 6px", fontSize: "0.75rem" }}>{type}</span>
                            </td>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee", fontFamily: "monospace", fontSize: "0.7rem", color: "#888" }}>{entityId.slice(0, 8)}…</td>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee", color: "#555" }}>{imp.impact_description || "—"}</td>
                            <td style={{ padding: "6px 8px", border: "1px solid #eee" }}>
                              <button style={{ ...btnStyle("#b71c1c"), padding: "2px 6px" }} onClick={() => deleteImpact(imp.id)}>✕</button>
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
              Select a change request to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
