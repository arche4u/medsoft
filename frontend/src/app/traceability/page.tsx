"use client";

import { useEffect, useState } from "react";
import { api, Project, TreeNode } from "@/lib/api";

const LEVEL_COLOR: Record<string, string> = { LOW: "#2e7d32", MEDIUM: "#e65100", HIGH: "#b71c1c" };
const TYPE_BG: Record<string, string> = { USER: "#1565c0", SYSTEM: "#6a1b9a", SOFTWARE: "#1b5e20" };

export default function TraceabilityPage() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tree, setTree]           = useState<TreeNode[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    api.projects.list().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projectId) { setTree([]); return; }
    setLoading(true); setError("");
    api.traceability.tree(projectId)
      .then(setTree)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const totalReqs = tree.reduce((acc, u) =>
    acc + 1 + (u.children?.reduce((a2, s) => a2 + 1 + (s.children?.length ?? 0), 0) ?? 0), 0);
  const totalTests = tree.reduce((acc, u) =>
    acc + (u.children?.reduce((a2, s) =>
      a2 + (s.children?.reduce((a3, sw) => a3 + (sw.testcases?.length ?? 0), 0) ?? 0), 0) ?? 0), 0);

  return (
    <div>
      <h1>Traceability Tree</h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
          <option value="">— Select project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && !loading && (
          <span style={{ fontSize: "0.85rem", color: "#555" }}>
            {totalReqs} requirements · {totalTests} test links
          </span>
        )}
      </div>

      {loading && <p>Loading tree…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && tree.length === 0 && projectId && (
        <p style={{ color: "#888" }}>No requirements found. Add USER → SYSTEM → SOFTWARE requirements first.</p>
      )}

      {tree.map((userNode) => (
        <UserBlock key={userNode.id} node={userNode} />
      ))}
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span style={{ background: LEVEL_COLOR[level] ?? "#555", color: "#fff", borderRadius: "3px", padding: "1px 6px", fontSize: "0.7rem", marginLeft: "0.5rem" }}>
      {level}
    </span>
  );
}

function RiskList({ risks }: { risks: TreeNode["risks"] }) {
  if (!risks.length) return null;
  return (
    <div style={{ marginTop: "0.4rem", paddingLeft: "0.5rem", borderLeft: "3px solid #ffcc80" }}>
      {risks.map((r) => (
        <div key={r.id} style={{ fontSize: "0.78rem", color: "#444", display: "flex", gap: "0.5rem", alignItems: "center", padding: "2px 0" }}>
          <RiskBadge level={r.risk_level} />
          <span><b>{r.hazard}</b> → {r.harm} (S{r.severity}×P{r.probability})</span>
        </div>
      ))}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{ background: TYPE_BG[type] ?? "#555", color: "#fff", borderRadius: "3px", padding: "1px 7px", fontSize: "0.72rem", fontWeight: "bold", flexShrink: 0 }}>
      {type}
    </span>
  );
}

function UserBlock({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "6px", marginBottom: "1rem", overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "0.75rem 1rem", cursor: "pointer", background: "#e3f2fd", display: "flex", gap: "0.75rem", alignItems: "center" }}
      >
        <span>{open ? "▼" : "▶"}</span>
        <TypeBadge type={node.type} />
        <span style={{ fontWeight: "bold" }}>{node.title}</span>
        {node.description && <span style={{ color: "#666", fontSize: "0.85rem" }}>— {node.description}</span>}
        {node.risks.map((r) => <RiskBadge key={r.id} level={r.risk_level} />)}
      </div>

      {open && (
        <div style={{ padding: "0.5rem 1rem 0.75rem 2rem" }}>
          <RiskList risks={node.risks} />

          {(node.children ?? []).length === 0 ? (
            <p style={{ color: "#aaa", fontSize: "0.8rem", margin: "0.5rem 0" }}>No SYSTEM requirements linked.</p>
          ) : (
            (node.children ?? []).map((sysNode) => (
              <SysBlock key={sysNode.id} node={sysNode} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SysBlock({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: "1px solid #e1bee7", borderRadius: "4px", margin: "0.5rem 0", overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "0.5rem 0.75rem", cursor: "pointer", background: "#f3e5f5", display: "flex", gap: "0.75rem", alignItems: "center" }}
      >
        <span>{open ? "▼" : "▶"}</span>
        <TypeBadge type={node.type} />
        <span style={{ fontWeight: 500 }}>{node.title}</span>
        {node.risks.map((r) => <RiskBadge key={r.id} level={r.risk_level} />)}
      </div>

      {open && (
        <div style={{ padding: "0.4rem 0.75rem 0.5rem 1.75rem" }}>
          <RiskList risks={node.risks} />
          {(node.children ?? []).length === 0 ? (
            <p style={{ color: "#aaa", fontSize: "0.8rem", margin: "0.4rem 0" }}>No SOFTWARE requirements linked.</p>
          ) : (
            (node.children ?? []).map((sw) => (
              <SwBlock key={sw.id} node={sw} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SwBlock({ node }: { node: TreeNode }) {
  return (
    <div style={{ border: "1px solid #c8e6c9", borderRadius: "4px", margin: "0.4rem 0", padding: "0.5rem 0.75rem", background: "#f1f8e9" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <TypeBadge type={node.type} />
        <span style={{ fontWeight: 500 }}>{node.title}</span>
        {node.risks.map((r) => <RiskBadge key={r.id} level={r.risk_level} />)}
      </div>
      <RiskList risks={node.risks} />
      {(node.testcases ?? []).length > 0 && (
        <div style={{ marginTop: "0.5rem", paddingLeft: "0.5rem" }}>
          {(node.testcases ?? []).map((tc) => (
            <div key={tc.id} style={{ fontSize: "0.82rem", color: "#1b5e20", padding: "2px 0" }}>
              🧪 {tc.title}
            </div>
          ))}
        </div>
      )}
      {(node.testcases ?? []).length === 0 && (
        <div style={{ fontSize: "0.78rem", color: "#aaa", marginTop: "0.35rem" }}>No test cases linked.</div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.875rem" };
