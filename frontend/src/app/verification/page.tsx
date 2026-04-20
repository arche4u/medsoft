"use client";

import { useEffect, useState } from "react";
import { api, Project, TestCase, TestExecution, ExecStatus } from "@/lib/api";

const STATUS_COLOR: Record<ExecStatus, string> = { PASS: "#2e7d32", FAIL: "#b71c1c", BLOCKED: "#e65100" };
const STATUS_BG: Record<ExecStatus, string>    = { PASS: "#e8f5e9", FAIL: "#ffebee", BLOCKED: "#fff3e0" };

export default function VerificationPage() {
  const [projects, setProjects]       = useState<Project[]>([]);
  const [testcases, setTestcases]     = useState<TestCase[]>([]);
  const [executions, setExecutions]   = useState<TestExecution[]>([]);
  const [latestMap, setLatestMap]     = useState<Record<string, TestExecution>>({});
  const [projectId, setProjectId]     = useState("");
  const [selectedTc, setSelectedTc]   = useState("");

  // run form
  const [status, setStatus]   = useState<ExecStatus>("PASS");
  const [notes, setNotes]     = useState("");
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg]   = useState("");

  useEffect(() => { api.projects.list().then(setProjects).catch(console.error); }, []);

  useEffect(() => {
    if (!projectId) { setTestcases([]); setLatestMap({}); setSelectedTc(""); return; }
    api.testcases.list(projectId).then(async (tcs) => {
      setTestcases(tcs);
      // Fetch latest execution for each test case
      const map: Record<string, TestExecution> = {};
      await Promise.all(tcs.map(async (tc) => {
        const ex = await api.verification.latest(tc.id);
        if (ex) map[tc.id] = ex;
      }));
      setLatestMap(map);
    }).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!selectedTc) { setExecutions([]); return; }
    api.verification.listExecutions(selectedTc).then(setExecutions).catch(console.error);
  }, [selectedTc]);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTc) return;
    setRunning(true); setRunMsg("");
    try {
      await api.verification.execute({ testcase_id: selectedTc, status, notes: notes.trim() || undefined });
      setNotes("");
      setExecutions(await api.verification.listExecutions(selectedTc));
      // update latest map
      const ex = await api.verification.latest(selectedTc);
      if (ex) setLatestMap((m) => ({ ...m, [selectedTc]: ex }));
      setRunMsg(`Recorded ${status}`);
    } catch (e: any) { setRunMsg(`Error: ${e.message}`); }
    finally { setRunning(false); }
  }

  return (
    <div>
      <h1>Test Execution</h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Test case overview table */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Test Cases — Latest Status ({testcases.length})</h2>
        {!projectId ? <p style={{ color: "#888" }}>Select a project.</p>
          : testcases.length === 0 ? <p style={{ color: "#888" }}>No test cases.</p>
          : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={thStyle}>Test Case</th>
                <th style={thStyle}>Latest Status</th>
                <th style={thStyle}>Executed At</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {testcases.map((tc) => {
                const ex = latestMap[tc.id];
                return (
                  <tr key={tc.id} style={{ background: selectedTc === tc.id ? "#e3f2fd" : undefined }}>
                    <td style={tdStyle}>{tc.title}</td>
                    <td style={tdStyle}>
                      {ex ? (
                        <span style={{ background: STATUS_BG[ex.status], color: STATUS_COLOR[ex.status], padding: "2px 8px", borderRadius: "3px", fontWeight: "bold", fontSize: "0.85rem" }}>
                          {ex.status}
                        </span>
                      ) : <span style={{ color: "#aaa" }}>Not run</span>}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{ex ? new Date(ex.executed_at).toLocaleString() : "—"}</td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{ex?.notes ?? "—"}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => setSelectedTc(tc.id === selectedTc ? "" : tc.id)}
                        style={{ ...btnStyle, padding: "0.3rem 0.75rem", fontSize: "0.8rem", background: tc.id === selectedTc ? "#455a64" : "#1a1a2e" }}
                      >
                        {tc.id === selectedTc ? "Close" : "Run"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Run execution panel */}
      {selectedTc && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>
              Record Execution — <span style={{ color: "#1565c0" }}>{testcases.find((tc) => tc.id === selectedTc)?.title}</span>
            </h2>
            <form onSubmit={handleRun} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {(["PASS", "FAIL", "BLOCKED"] as ExecStatus[]).map((s) => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                    <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                    <span style={{ fontWeight: "bold", color: STATUS_COLOR[s] }}>{s}</span>
                  </label>
                ))}
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              {runMsg && <p style={{ color: runMsg.startsWith("Error") ? "red" : "green", margin: 0, fontSize: "0.85rem" }}>{runMsg}</p>}
              <button type="submit" disabled={running} style={{ ...btnStyle, background: STATUS_COLOR[status] }}>
                {running ? "Saving…" : `Record ${status}`}
              </button>
            </form>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Execution History ({executions.length})</h2>
            {executions.length === 0 ? <p style={{ color: "#888" }}>No executions yet.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "300px", overflowY: "auto" }}>
                {executions.map((ex) => (
                  <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "0.6rem 0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.25rem" }}>
                      <span style={{ background: STATUS_BG[ex.status], color: STATUS_COLOR[ex.status], padding: "1px 7px", borderRadius: "3px", fontWeight: "bold", fontSize: "0.8rem" }}>{ex.status}</span>
                      <span style={{ color: "#666", fontSize: "0.8rem" }}>{new Date(ex.executed_at).toLocaleString()}</span>
                    </div>
                    {ex.notes && <div style={{ fontSize: "0.8rem", color: "#444" }}>{ex.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.5rem" };
const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem" };
const btnStyle: React.CSSProperties   = { padding: "0.6rem 1.25rem", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff" };
const thStyle: React.CSSProperties    = { padding: "0.6rem 0.75rem", textAlign: "left", border: "1px solid #ddd" };
const tdStyle: React.CSSProperties    = { padding: "0.6rem 0.75rem", border: "1px solid #ddd" };
