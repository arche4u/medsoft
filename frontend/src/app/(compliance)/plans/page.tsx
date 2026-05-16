"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, PlanSummary } from "@/lib/api";
import { useActiveProject } from "@/lib/useActiveProject";
import { STATUS_META, sty } from "@/components/plan/shared";

const BUILTIN_TYPES = new Set(["MAINTENANCE", "RISK_MGMT", "CONFIG_MGMT", "PROBLEM_RESOLUTION", "CYBERSECURITY"]);

function toTypeKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatTypeLabel(typeKey: string): string {
  return typeKey
    .split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default function CustomPlansPage() {
  const router = useRouter();
  const [activeProjectId] = useActiveProject();
  const [allPlans, setAllPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [iecClause, setIecClause] = useState("");
  const [safetyClass, setSafetyClass] = useState("C");
  const [author, setAuthor] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyEdited, setKeyEdited] = useState(false);

  function loadPlans(pid: string) {
    if (!pid) { setAllPlans([]); setLoading(false); return; }
    setLoading(true);
    api.plans
      .list(pid)
      .then(setAllPlans)
      .catch(() => setAllPlans([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPlans(activeProjectId); }, [activeProjectId]);

  useEffect(() => {
    if (!keyEdited) setTypeKey(toTypeKey(planName));
  }, [planName, keyEdited]);

  const customTypes: [string, PlanSummary[]][] = Object.entries(
    allPlans
      .filter(p => !BUILTIN_TYPES.has(p.plan_type))
      .reduce<Record<string, PlanSummary[]>>((acc, p) => {
        (acc[p.plan_type] ??= []).push(p);
        return acc;
      }, {})
  );

  function resetForm() {
    setKeyEdited(false);
    setPlanName("");
    setTypeKey("");
    setIecClause("");
    setSafetyClass("C");
    setAuthor("");
    setError(null);
  }

  async function handleCreate() {
    if (!activeProjectId || !planName.trim() || !typeKey.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.plans.create({
        project_id: activeProjectId,
        plan_type: typeKey,
        title: planName.trim(),
        iec_clause: iecClause.trim() || null,
        safety_class: safetyClass,
        created_by: author.trim() || null,
      });
      router.push(`/plans/custom/${encodeURIComponent(typeKey)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  if (!activeProjectId) {
    return (
      <div style={sty.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 600 }}>No project selected</div>
        <div style={{ color: "#78909c", marginTop: 4 }}>
          Select a project from the sidebar to manage custom plans.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>Custom Plans</h1>
          <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
            Project-specific plan documents beyond the four built-in IEC 62304 types
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(v => !v); if (showCreate) resetForm(); }}
          style={sty.btn}
        >
          {showCreate ? "Cancel" : "+ New Custom Plan"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ ...sty.panel, maxWidth: 540, marginBottom: 24 }}>
          <div style={sty.panelTitle}>Create New Custom Plan</div>

          <label style={sty.label}>Plan Name *</label>
          <input
            value={planName}
            onChange={e => setPlanName(e.target.value)}
            placeholder="e.g. Cybersecurity Plan"
            style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" as const }}
          />

          <label style={sty.label}>Plan Type ID *</label>
          <input
            value={typeKey}
            onChange={e => {
              setTypeKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""));
              setKeyEdited(true);
            }}
            placeholder="AUTO_GENERATED"
            style={{ ...sty.input, width: "100%", marginBottom: 4, boxSizing: "border-box" as const, fontFamily: "monospace" }}
          />
          <div style={{ fontSize: 11, color: "#90a4ae", marginBottom: 12 }}>
            Unique identifier for this plan type (UPPERCASE_WITH_UNDERSCORES). Auto-derived from the name above.
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" as const }}>
            <div>
              <label style={sty.label}>Safety Class</label>
              <select
                value={safetyClass}
                onChange={e => setSafetyClass(e.target.value)}
                style={{ ...sty.input, width: 110 }}
              >
                <option value="A">Class A</option>
                <option value="B">Class B</option>
                <option value="C">Class C</option>
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label style={sty.label}>IEC/ISO Clause</label>
              <input
                value={iecClause}
                onChange={e => setIecClause(e.target.value)}
                placeholder="e.g. 4.3"
                style={{ ...sty.input, width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={sty.label}>Author</label>
              <input
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="Name / role"
                style={{ ...sty.input, width: "100%" }}
              />
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#78909c", marginBottom: 12 }}>
            A placeholder section is seeded automatically. You can add, edit, and remove sections in the plan editor.
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !planName.trim() || !typeKey.trim()}
            style={{ ...sty.btn, opacity: creating || !planName.trim() || !typeKey.trim() ? 0.5 : 1 }}
          >
            {creating ? "Creating…" : "Create & Open Plan"}
          </button>
        </div>
      )}

      {/* Plan type cards */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : customTypes.length === 0 && !showCreate ? (
        <div style={sty.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <div style={{ fontWeight: 600, color: "#37474f" }}>No custom plans yet</div>
          <div style={{ color: "#78909c", marginTop: 4, fontSize: 13, maxWidth: 360, margin: "4px auto 0" }}>
            Create project-specific plan documents — cybersecurity plans, usability plans, SOUP management plans, or any other compliance document your project needs.
          </div>
          <button onClick={() => setShowCreate(true)} style={{ ...sty.btn, marginTop: 16 }}>
            Create First Custom Plan
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {customTypes.map(([type, versions]) => {
            const latest = versions[0];
            const m = STATUS_META[latest.status] ?? STATUS_META.DRAFT;
            const approved = versions.find(v => v.status === "APPROVED");
            return (
              <Link key={type} href={`/plans/custom/${encodeURIComponent(type)}`} style={{ textDecoration: "none" }}>
                <div style={{
                  ...sty.panel, cursor: "pointer",
                  borderLeft: `4px solid ${m.border}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a237e", flex: 1 }}>
                      {formatTypeLabel(type)}
                    </div>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 10,
                      background: m.bg, color: m.color, flexShrink: 0, marginLeft: 8,
                    }}>
                      {latest.status.replace("_", " ")}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "#90a4ae", marginBottom: 8, fontFamily: "monospace" }}>
                    {type}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#78909c" }}>
                    <span>{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
                    {approved ? (
                      <span style={{ color: "#1b5e20", fontWeight: 500 }}>
                        ✓ v{approved.version} approved
                      </span>
                    ) : (
                      <span>Latest: v{latest.version}</span>
                    )}
                  </div>

                  {latest.iec_clause && (
                    <div style={{ fontSize: 11, color: "#90a4ae", marginTop: 4 }}>§{latest.iec_clause}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
