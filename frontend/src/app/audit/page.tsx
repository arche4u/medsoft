"use client";
import { useEffect, useState } from "react";
import { api, AuditLog } from "@/lib/api";

// ── Human-readable entity type labels ────────────────────────────────────────
const ENTITY_LABELS: Record<string, string> = {
  design_element:          "Design Element",
  requirement_design_link: "Req → Design Link",
  requirement:             "Requirement",
  testcase:                "Test Case",
  risk:                    "Risk",
  tracelink:               "Trace Link",
  validation_record:       "Validation Record",
  test_execution:          "Test Execution",
  change_request:          "Change Request",
  change_impact:           "Change Impact",
  release:                 "Release",
  release_item:            "Release Item",
  dhf_document:            "DHF Document",
  document:                "Document",
  user:                    "User",
  role:                    "Role",
};

const ACTION_CFG = {
  CREATE: { label: "Created",  bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
  UPDATE: { label: "Updated",  bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  DELETE: { label: "Deleted",  bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
};

const ALL_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActivityLogPage() {
  const [logs,         setLogs]        = useState<AuditLog[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [filterAction, setFilterAction] = useState<string>("ALL");
  const [filterEntity, setFilterEntity] = useState<string>("ALL");
  const [search,       setSearch]      = useState("");

  useEffect(() => {
    setLoading(true);
    api.audit.logs({ limit: 500 })
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const entityTypes = [...new Set(logs.map(l => l.entity_type))].sort();

  const filtered = logs.filter(l => {
    if (filterAction !== "ALL" && l.action !== filterAction) return false;
    if (filterEntity !== "ALL" && l.entity_type !== filterEntity) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = (ENTITY_LABELS[l.entity_type] ?? l.entity_type).toLowerCase();
      const actor = (l.actor_name ?? "system").toLowerCase();
      const details = (l.details ?? "").toLowerCase();
      if (!label.includes(q) && !actor.includes(q) && !details.includes(q)) return false;
    }
    return true;
  });

  // Summary counts
  const total   = logs.length;
  const creates = logs.filter(l => l.action === "CREATE").length;
  const updates = logs.filter(l => l.action === "UPDATE").length;
  const deletes = logs.filter(l => l.action === "DELETE").length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Activity Log</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
          Complete record of all create, update and delete events across the platform
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", value: total,   bg: "#f8fafc", color: "#334155" },
          { label: "Created",      value: creates,  bg: "#f0fdf4", color: "#15803d" },
          { label: "Updated",      value: updates,  bg: "#eff6ff", color: "#1d4ed8" },
          { label: "Deleted",      value: deletes,  bg: "#fef2f2", color: "#b91c1c" },
        ].map(c => (
          <div key={c.label} style={{
            flex: "1 1 100px", background: c.bg, borderRadius: 8, padding: "12px 16px",
            border: "1px solid #e2e8f0", minWidth: 100,
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search actor, entity, details…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={filterInputStyle}
        />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={filterSelectStyle}>
          <option value="ALL">All Actions</option>
          {ALL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_CFG[a].label}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={filterSelectStyle}>
          <option value="ALL">All Entity Types</option>
          {entityTypes.map(t => <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>)}
        </select>
        {(filterAction !== "ALL" || filterEntity !== "ALL" || search) && (
          <button onClick={() => { setFilterAction("ALL"); setFilterEntity("ALL"); setSearch(""); }}
            style={{ padding: "6px 12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#64748b" }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
          {filtered.length} of {total} events
        </span>
      </div>

      {/* Log table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>Loading activity log…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>No events match the current filter.</div>
      ) : (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Time", "Actor", "Action", "Entity Type", "Details"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const cfg = ACTION_CFG[log.action] ?? ACTION_CFG.UPDATE;
                const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type.replace(/_/g, " ");
                return (
                  <tr key={log.id}
                    style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc", borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f0f7ff"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#fff" : "#fafbfc"; }}
                  >
                    {/* Time */}
                    <td style={tdStyle} title={absTime(log.timestamp)}>
                      <span style={{ fontSize: 13, color: "#475569", whiteSpace: "nowrap" }}>
                        {relTime(log.timestamp)}
                      </span>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                        {new Date(log.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" "}
                        {new Date(log.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    {/* Actor */}
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                          background: log.actor_name ? "#dbeafe" : "#f1f5f9",
                          color: log.actor_name ? "#1d4ed8" : "#94a3b8",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {log.actor_name ? log.actor_name.slice(0, 2).toUpperCase() : "SY"}
                        </div>
                        <span style={{ fontSize: 13, color: log.actor_name ? "#1e293b" : "#94a3b8", fontWeight: log.actor_name ? 500 : 400 }}>
                          {log.actor_name ?? "System"}
                        </span>
                      </div>
                    </td>
                    {/* Action */}
                    <td style={tdStyle}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: cfg.bg, color: cfg.color,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                    </td>
                    {/* Entity type */}
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: "#f1f5f9", color: "#475569", letterSpacing: 0.3,
                      }}>
                        {entityLabel}
                      </span>
                    </td>
                    {/* Details / entity id */}
                    <td style={{ ...tdStyle, maxWidth: 280 }}>
                      {log.details ? (
                        <span style={{ fontSize: 13, color: "#374151" }}>{log.details}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#cbd5e1", fontFamily: "monospace" }}>
                          {log.entity_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px", verticalAlign: "middle",
};
const filterInputStyle: React.CSSProperties = {
  padding: "7px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13,
  outline: "none", width: 240, color: "#374151",
};
const filterSelectStyle: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8,
  fontSize: 13, color: "#374151", background: "#fff", cursor: "pointer",
};
