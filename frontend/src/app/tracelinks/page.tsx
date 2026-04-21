"use client";

import { useEffect, useState } from "react";
import { api, Project, Requirement, TestCase, TraceLink, Risk } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const RISK_META: Record<RiskLevel, { color: string; bg: string }> = {
  HIGH:   { color: "#b71c1c", bg: "#ffebee" },
  MEDIUM: { color: "#e65100", bg: "#fff3e0" },
  LOW:    { color: "#2e7d32", bg: "#e8f5e9" },
};

const REQ_TYPE_COLOR: Record<string, string> = {
  USER:     "#1565c0",
  SYSTEM:   "#2e7d32",
  SOFTWARE: "#6a1b9a",
};

// ── Trace Matrix row ──────────────────────────────────────────────────────────

function MatrixRow({ req, risks, tracelinks, testcases, allTcs }: {
  req: Requirement;
  risks: Risk[];
  tracelinks: TraceLink[];
  testcases: TestCase[];    // all test cases for the project (for column headers)
  allTcs: TestCase[];
}) {
  const linkedRisks = risks.filter(r => r.requirement_id === req.id);
  const linkedTcIds = new Set(tracelinks.filter(l => l.requirement_id === req.id).map(l => l.testcase_id));
  const linkedTcs   = allTcs.filter(tc => linkedTcIds.has(tc.id));

  const typeColor = REQ_TYPE_COLOR[req.type] ?? "#546e7a";

  return (
    <tr>
      {/* Requirement */}
      <td style={{ ...tdStyle, minWidth: 80, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: typeColor }}>
          {req.readable_id}
        </span>
      </td>
      <td style={{ ...tdStyle }}>
        <span style={{
          background: typeColor, color: "#fff", borderRadius: 3,
          padding: "1px 6px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
        }}>{req.type}</span>
      </td>
      <td style={{ ...tdStyle, maxWidth: 280 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{req.title}</div>
        {req.description && (
          <div style={{ fontSize: 11, color: "#888", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
            {req.description}
          </div>
        )}
      </td>

      {/* Risks */}
      <td style={{ ...tdStyle, minWidth: 120 }}>
        {linkedRisks.length === 0 ? (
          <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {linkedRisks.map(r => (
              <span key={r.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 700,
                color: RISK_META[r.risk_level as RiskLevel]?.color ?? "#555",
                background: RISK_META[r.risk_level as RiskLevel]?.bg ?? "#f5f5f5",
                borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: 10 }}>⚠</span>
                {r.risk_level}
                <span style={{ fontWeight: 400, color: "#555" }}>— {r.hazard.length > 30 ? r.hazard.slice(0, 30) + "…" : r.hazard}</span>
              </span>
            ))}
            {linkedRisks.some(r => r.mitigation) && (
              <span style={{ fontSize: 10, color: "#2e7d32", marginTop: 1 }}>
                ✓ {linkedRisks.filter(r => r.mitigation).length} mitigated
              </span>
            )}
          </div>
        )}
      </td>

      {/* Test Cases */}
      <td style={{ ...tdStyle, minWidth: 160 }}>
        {linkedTcs.length === 0 ? (
          <span style={{ color: req.type === "SOFTWARE" ? "#ef5350" : "#ccc", fontSize: 12 }}>
            {req.type === "SOFTWARE" ? "⚠ No test coverage" : "—"}
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {linkedTcs.map(tc => (
              <span key={tc.id} style={{
                fontSize: 11, color: "#1565c0",
                fontFamily: "monospace", fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {tc.readable_id ?? "TC-?"} {tc.title.length > 35 ? tc.title.slice(0, 35) + "…" : tc.title}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Coverage status */}
      <td style={{ ...tdStyle, textAlign: "center", minWidth: 90 }}>
        {(() => {
          const hasRisk = linkedRisks.length > 0;
          const hasTc   = linkedTcs.length > 0;
          const mitigated = linkedRisks.every(r => r.mitigation);
          if (req.type === "SOFTWARE" && hasTc && (!hasRisk || mitigated))
            return <span style={{ color: "#2e7d32", fontSize: 13, fontWeight: 700 }}>✓ OK</span>;
          if (req.type === "SOFTWARE" && !hasTc)
            return <span style={{ color: "#e65100", fontSize: 12, fontWeight: 600 }}>No TC</span>;
          if (hasRisk && !mitigated)
            return <span style={{ color: "#b71c1c", fontSize: 12, fontWeight: 600 }}>Risk open</span>;
          return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
        })()}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TraceMatrixPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testcases,    setTestcases]    = useState<TestCase[]>([]);
  const [tracelinks,   setTracelinks]   = useState<TraceLink[]>([]);
  const [risks,        setRisks]        = useState<Risk[]>([]);
  const [projectId,    setProjectId]    = useState("");
  const [typeFilter,   setTypeFilter]   = useState<string>("ALL");

  // link form
  const [reqId, setReqId]   = useState("");
  const [tcId, setTcId]     = useState("");
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  useEffect(() => {
    if (!projectId) {
      setRequirements([]); setTestcases([]); setTracelinks([]); setRisks([]);
      return;
    }
    Promise.all([
      api.requirements.list(projectId),
      api.testcases.list(projectId),
      api.tracelinks.list(),
      api.risks.list(undefined, projectId),
    ]).then(([reqs, tcs, tls, rks]) => {
      setRequirements(reqs);
      setTestcases(tcs);
      setTracelinks(tls.filter(l => reqs.some(r => r.id === l.requirement_id)));
      setRisks(rks);
    });
  }, [projectId]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true); setLinkMsg("");
    try {
      await api.tracelinks.create({ requirement_id: reqId, testcase_id: tcId });
      setLinkMsg("Linked successfully.");
      setReqId(""); setTcId("");
      const tls = await api.tracelinks.list();
      setTracelinks(tls.filter(l => requirements.some(r => r.id === l.requirement_id)));
    } catch (e: any) { setLinkMsg("Error: " + e.message); }
    finally { setLinking(false); }
  }

  const swReqs = requirements.filter(r => r.type === "SOFTWARE");
  const displayReqs = typeFilter === "ALL"
    ? requirements
    : requirements.filter(r => r.type === typeFilter);

  const reqTypes = [...new Set(requirements.map(r => r.type))];

  // Summary stats
  const swWithTc    = swReqs.filter(r => tracelinks.some(l => l.requirement_id === r.id)).length;
  const highRisks   = risks.filter(r => r.risk_level === "HIGH").length;
  const openRisks   = risks.filter(r => !r.mitigation).length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Traceability Matrix</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        IEC 62304 §5.2.7 — Requirements → Risk management → Test coverage
      </p>

      {/* Project selector */}
      <select value={projectId} onChange={e => setProjectId(e.target.value)}
        style={{ ...inputStyle, marginBottom: 20, maxWidth: 360 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {projectId && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Requirements", value: requirements.length, color: "#1565c0" },
              { label: "SW reqs covered", value: `${swWithTc}/${swReqs.length}`, color: swWithTc === swReqs.length ? "#2e7d32" : "#e65100" },
              { label: "Risks total", value: risks.length, color: "#6a1b9a" },
              { label: "High risks", value: highRisks, color: highRisks > 0 ? "#b71c1c" : "#2e7d32" },
              { label: "Risks open", value: openRisks, color: openRisks > 0 ? "#e65100" : "#2e7d32" },
              { label: "Test cases", value: testcases.length, color: "#1565c0" },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Link form */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Link SOFTWARE Requirement → Test Case</h3>
            <form onSubmit={handleLink} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <select value={reqId} onChange={e => setReqId(e.target.value)} required style={{ ...inputStyle, flex: "1 1 220px" }}>
                <option value="">— SOFTWARE requirement *</option>
                {swReqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} {r.title}</option>)}
              </select>
              <select value={tcId} onChange={e => setTcId(e.target.value)} required style={{ ...inputStyle, flex: "1 1 220px" }}>
                <option value="">— Test case *</option>
                {testcases.map(tc => <option key={tc.id} value={tc.id}>{tc.readable_id ? `${tc.readable_id} ` : ""}{tc.title}</option>)}
              </select>
              <button type="submit" disabled={linking || !reqId || !tcId} style={btnStyle}>
                {linking ? "Linking…" : "Link"}
              </button>
            </form>
            {linkMsg && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: linkMsg.startsWith("Error") ? "#b71c1c" : "#2e7d32" }}>
                {linkMsg}
              </p>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {["ALL", ...reqTypes].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: "4px 14px", borderRadius: 16, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 500,
                background: typeFilter === t ? (REQ_TYPE_COLOR[t] ?? "#374151") : "#f3f4f6",
                color: typeFilter === t ? "#fff" : "#374151",
              }}>
                {t === "ALL" ? "All types" : t}
                <span style={{ marginLeft: 5, opacity: 0.75 }}>
                  ({t === "ALL" ? requirements.length : requirements.filter(r => r.type === t).length})
                </span>
              </button>
            ))}
          </div>

          {/* Matrix table */}
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ ...thStyle, width: 80 }}>ID</th>
                  <th style={{ ...thStyle, width: 90 }}>Type</th>
                  <th style={{ ...thStyle }}>Requirement</th>
                  <th style={{ ...thStyle, width: 200 }}>
                    <span style={{ color: "#b71c1c" }}>⚠</span> Risks
                  </th>
                  <th style={{ ...thStyle, width: 220 }}>
                    <span style={{ color: "#1565c0" }}>✓</span> Test Cases
                  </th>
                  <th style={{ ...thStyle, width: 90, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayReqs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>
                      No requirements found.
                    </td>
                  </tr>
                ) : (
                  displayReqs.map((r, i) => (
                    <MatrixRow
                      key={r.id}
                      req={r}
                      risks={risks}
                      tracelinks={tracelinks}
                      testcases={testcases}
                      allTcs={testcases}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#6b7280" }}>
            <span><b style={{ color: "#2e7d32" }}>✓ OK</b> — Software req has test coverage and all risks mitigated</span>
            <span><b style={{ color: "#e65100" }}>No TC</b> — Software req lacks test case coverage</span>
            <span><b style={{ color: "#b71c1c" }}>Risk open</b> — Has risks without mitigation recorded</span>
          </div>
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem 1.25rem" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" as const };
const btnStyle: React.CSSProperties   = { padding: "7px 18px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const thStyle: React.CSSProperties    = { padding: "9px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#374151", borderRight: "1px solid #e5e7eb" };
const tdStyle: React.CSSProperties    = { padding: "8px 12px", borderBottom: "1px solid #f3f4f6", borderRight: "1px solid #f3f4f6", verticalAlign: "top" };
