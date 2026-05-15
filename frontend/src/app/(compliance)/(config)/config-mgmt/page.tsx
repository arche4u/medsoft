"use client";
import { useState, useEffect, useCallback } from "react";
import {
  api,
  CMConfigItem, CMBaseline, CMChangeRequest, CMChangeImpact,
  CMItemStatus, CMChangeStatus, CMChangeType, CMPriority, CMReleaseCheck,
} from "@/lib/api";

// ── helpers ───────────────────────────────────────────────────────────────────
function useProject() {
  const [pid, setPid] = useState<string | null>(null);
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("medsoft_active_project") : null;
    if (stored) { try { setPid(JSON.parse(stored).id); } catch { /* noop */ } }
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: string }>;
      setPid(ce.detail?.id ?? null);
    };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);
  return pid;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "#64748b", APPROVED: "#2563eb", RELEASED: "#16a34a", OBSOLETE: "#9ca3af",
    OPEN: "#f59e0b", IN_REVIEW: "#8b5cf6", IMPLEMENTED: "#0ea5e9",
    CLOSED: "#6b7280", REJECTED: "#dc2626",
  };
  return (
    <span style={{
      background: colors[status] ?? "#6b7280", color: "#fff",
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
    }}>{status}</span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const c: Record<string, string> = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#f97316", CRITICAL: "#dc2626" };
  return (
    <span style={{
      background: c[priority] ?? "#6b7280", color: "#fff",
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
    }}>{priority}</span>
  );
}

// ── Release gate banner ───────────────────────────────────────────────────────
function ReleaseBanner({ projectId }: { projectId: string }) {
  const [check, setCheck] = useState<CMReleaseCheck | null>(null);
  useEffect(() => {
    api.configMgmt.releaseCheck(projectId).then(setCheck).catch(() => {});
  }, [projectId]);
  if (!check) return null;
  const bg = check.is_blocked ? "#fef2f2" : "#f0fdf4";
  const border = check.is_blocked ? "#fca5a5" : "#86efac";
  const color = check.is_blocked ? "#dc2626" : "#16a34a";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, color }}>
      {check.is_blocked
        ? `Release blocked: ${check.block_reasons.join(" · ")}`
        : "CM release gate: CLEAR — no blocking issues"}
    </div>
  );
}

// ── Config Items Tab ──────────────────────────────────────────────────────────
function ConfigItemsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<CMConfigItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", item_type: "REQUIREMENT", reference_id: "", version: "1.0", description: "" });
  const [newVersionForm, setNVForm] = useState({ version: "", change_summary: "", changed_by: "" });
  const [nvTarget, setNVTarget] = useState<string | null>(null);
  // IEC 62304 §8.2.2 — filter by item type (typically used to pull up the
  // SOUP register independently of other CM items). Defaults to "ALL".
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const load = useCallback(() => api.configMgmt.items.list(projectId).then(setItems).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.configMgmt.items.create({ project_id: projectId, ...form, reference_id: form.reference_id || null, description: form.description || null });
    setShowAdd(false); setForm({ name: "", item_type: "REQUIREMENT", reference_id: "", version: "1.0", description: "" });
    load();
  }

  async function submitNewVersion(e: React.FormEvent, id: string) {
    e.preventDefault();
    await api.configMgmt.items.newVersion(id, { ...newVersionForm, change_summary: newVersionForm.change_summary || null, changed_by: newVersionForm.changed_by || null });
    setNVTarget(null); setNVForm({ version: "", change_summary: "", changed_by: "" });
    load();
  }

  async function setStatus(id: string, status: CMItemStatus) {
    await api.configMgmt.items.setStatus(id, status).catch(err => alert(String(err)));
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this config item?")) return;
    await api.configMgmt.items.delete(id).catch(err => alert(String(err)));
    load();
  }

  // SOUP is the IEC 62304 §8.2.2 first-class item type ("Software of Unknown
  // Provenance" — third-party libs / drivers / OS components the manufacturer
  // didn't write). Surfaced as a distinct type so projects can pull the SOUP
  // register independently of the rest of the CM items.
  const itemTypes = ["REQUIREMENT", "DESIGN_ELEMENT", "TEST_CASE", "RISK", "DOCUMENT", "SOFTWARE_UNIT", "COMPONENT", "SOUP", "OTHER"];
  const statuses: CMItemStatus[] = ["DRAFT", "APPROVED", "RELEASED", "OBSOLETE"];

  const filteredItems = typeFilter === "ALL" ? items : items.filter(i => i.item_type === typeFilter);
  const soupCount = items.filter(i => i.item_type === "SOUP").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Configuration Items ({filteredItems.length}{typeFilter !== "ALL" ? ` of ${items.length}` : ""})</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.btn}>+ Add Item</button>
      </div>

      {/* §8.2.2 type filter — SOUP is highlighted as a first-class IEC 62304 concept */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Filter:</span>
        {["ALL", ...itemTypes].map(t => {
          const isActive = typeFilter === t;
          const isSoup = t === "SOUP";
          const label = t === "ALL"
            ? `All (${items.length})`
            : `${t}${isSoup ? ` (§8.2.2) · ${soupCount}` : ""}`;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer",
                border: `1px solid ${isActive ? (isSoup ? "#5d4037" : "#1565c0") : "#cfd8dc"}`,
                background: isActive ? (isSoup ? "#efebe9" : "#e3f2fd") : "#fff",
                color: isActive ? (isSoup ? "#5d4037" : "#1565c0") : "#546e7a",
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {showAdd && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.row}>
            <input placeholder="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required style={styles.input} />
            <select value={form.item_type} onChange={e => setForm(p => ({ ...p, item_type: e.target.value }))} style={styles.input}>
              {itemTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="Reference ID" value={form.reference_id} onChange={e => setForm(p => ({ ...p, reference_id: e.target.value }))} style={styles.input} />
            <input placeholder="Version" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} style={{ ...styles.input, width: 100 }} />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" style={styles.btn}>Create</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredItems.map(item => (
          <div key={item.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                {item.item_type === "SOUP" ? (
                  <span title="IEC 62304 §8.2.2 — Software of Unknown Provenance"
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3,
                                 background: "#efebe9", color: "#5d4037", border: "1px solid #d7ccc8",
                                 fontWeight: 700, letterSpacing: "0.05em" }}>
                    SOUP §8.2.2
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "#64748b" }}>{item.item_type}</span>
                )}
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                {item.reference_id && <span style={{ fontSize: 12, color: "#8b5cf6" }}>[{item.reference_id}]</span>}
                <span style={{ fontSize: 12, color: "#64748b" }}>v{item.version}</span>
                <StatusBadge status={item.status} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {item.status !== "RELEASED" && item.status !== "OBSOLETE" && (
                  <select
                    value={item.status}
                    onChange={e => setStatus(item.id, e.target.value as CMItemStatus)}
                    style={{ fontSize: 12, padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                  >
                    {statuses.map(s => <option key={s}>{s}</option>)}
                  </select>
                )}
                <button onClick={() => setNVTarget(nvTarget === item.id ? null : item.id)} style={styles.btnSm}>New Version</button>
                {item.status !== "RELEASED" && (
                  <button onClick={() => del(item.id)} style={{ ...styles.btnSm, background: "#fef2f2", color: "#dc2626" }}>Delete</button>
                )}
              </div>
            </div>

            {nvTarget === item.id && (
              <form onSubmit={e => submitNewVersion(e, item.id)} style={{ marginTop: 10, background: "#f8fafc", padding: 10, borderRadius: 6 }}>
                <div style={styles.row}>
                  <input placeholder="New Version *" required value={newVersionForm.version} onChange={e => setNVForm(p => ({ ...p, version: e.target.value }))} style={{ ...styles.input, width: 120 }} />
                  <input placeholder="Changed By" value={newVersionForm.changed_by} onChange={e => setNVForm(p => ({ ...p, changed_by: e.target.value }))} style={styles.input} />
                  <input placeholder="Change Summary" value={newVersionForm.change_summary} onChange={e => setNVForm(p => ({ ...p, change_summary: e.target.value }))} style={{ ...styles.input, flex: 1 }} />
                  <button type="submit" style={styles.btn}>Bump</button>
                  <button type="button" onClick={() => setNVTarget(null)} style={styles.btnGhost}>Cancel</button>
                </div>
              </form>
            )}

            {expandedId === item.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
                {item.description && <p style={{ fontSize: 13, color: "#475569", margin: "0 0 8px" }}>{item.description}</p>}
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Version History</div>
                {item.version_history.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No history</div>}
                {item.version_history.map(h => (
                  <div key={h.id} style={{ fontSize: 12, color: "#475569", padding: "3px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <strong>v{h.version}</strong> — {h.change_summary ?? "—"} {h.changed_by && `by ${h.changed_by}`}
                    <span style={{ float: "right", color: "#94a3b8" }}>{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Baselines Tab ─────────────────────────────────────────────────────────────
function BaselinesTab({ projectId }: { projectId: string }) {
  const [baselines, setBaselines] = useState<CMBaseline[]>([]);
  const [items, setItems] = useState<CMConfigItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", created_by: "", selectedIds: [] as string[] });

  const load = useCallback(() => {
    api.configMgmt.baselines.list(projectId).then(setBaselines).catch(() => {});
    api.configMgmt.items.list(projectId).then(setItems).catch(() => {});
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.configMgmt.baselines.create({
      project_id: projectId, name: form.name,
      description: form.description || null, created_by: form.created_by || null,
      config_item_ids: form.selectedIds,
    });
    setShowAdd(false); setForm({ name: "", description: "", created_by: "", selectedIds: [] });
    load();
  }

  async function releaseBaseline(id: string) {
    if (!confirm("Release this baseline? This action is irreversible and will lock all included items.")) return;
    await api.configMgmt.baselines.release(id).catch(err => alert(String(err)));
    load();
  }

  function toggleItem(id: string) {
    setForm(p => ({
      ...p,
      selectedIds: p.selectedIds.includes(id) ? p.selectedIds.filter(x => x !== id) : [...p.selectedIds, id],
    }));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Baselines ({baselines.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.btn}>+ New Baseline</button>
      </div>

      {showAdd && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.row}>
            <input placeholder="Baseline Name *" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={styles.input} />
            <input placeholder="Created By" value={form.created_by} onChange={e => setForm(p => ({ ...p, created_by: e.target.value }))} style={styles.input} />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 50, marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Include Config Items:</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 10 }}>
            {items.filter(i => i.status !== "OBSOLETE").map(i => (
              <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", background: form.selectedIds.includes(i.id) ? "#dbeafe" : "#f1f5f9", padding: "3px 8px", borderRadius: 4 }}>
                <input type="checkbox" checked={form.selectedIds.includes(i.id)} onChange={() => toggleItem(i.id)} />
                {i.name} v{i.version}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={styles.btn}>Create</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      {baselines.map(bl => (
        <div key={bl.id} style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === bl.id ? null : bl.id)}>
              <span style={{ fontWeight: 600 }}>{bl.name}</span>
              {bl.is_released
                ? <span style={{ fontSize: 11, background: "#16a34a", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>RELEASED</span>
                : <span style={{ fontSize: 11, background: "#f59e0b", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>DRAFT</span>}
              <span style={{ fontSize: 12, color: "#64748b" }}>{bl.item_count} item(s)</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {bl.created_by && <span style={{ fontSize: 12, color: "#64748b" }}>by {bl.created_by}</span>}
              {!bl.is_released && (
                <button onClick={() => releaseBaseline(bl.id)} style={{ ...styles.btn, background: "#16a34a" }}>Release</button>
              )}
            </div>
          </div>
          {bl.description && <p style={{ fontSize: 13, color: "#475569", margin: "8px 0 0" }}>{bl.description}</p>}
          {expandedId === bl.id && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Included Items</div>
              {bl.items.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No items</div>}
              {bl.items.map(bi => (
                <div key={bi.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: "#64748b", width: 120 }}>{bi.config_item_type}</span>
                  <span style={{ fontWeight: 500 }}>{bi.config_item_name}</span>
                  <span style={{ color: "#8b5cf6" }}>v{bi.config_item_version}</span>
                  <StatusBadge status={bi.config_item_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Change Requests Tab ───────────────────────────────────────────────────────
const CR_NEXT_STATUS: Record<string, string[]> = {
  OPEN: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["APPROVED", "REJECTED", "OPEN"],
  APPROVED: ["IMPLEMENTED", "REJECTED"],
  IMPLEMENTED: ["CLOSED"],
  REJECTED: ["OPEN"],
  CLOSED: [],
};

function ChangeRequestsTab({ projectId }: { projectId: string }) {
  const [changes, setChanges] = useState<CMChangeRequest[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", change_type: "ENHANCEMENT" as CMChangeType, priority: "MEDIUM" as CMPriority, created_by: "" });
  const [impactForm, setImpactForm] = useState({ affected_item_type: "REQUIREMENT", affected_item_id: "", affected_item_name: "", impact_description: "", revalidation_required: false });
  const [impactTarget, setImpactTarget] = useState<string | null>(null);

  const load = useCallback(() => api.configMgmt.changes.list(projectId).then(setChanges).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.configMgmt.changes.create({ project_id: projectId, ...form, created_by: form.created_by || null, description: form.description || null });
    setShowAdd(false); setForm({ title: "", description: "", change_type: "ENHANCEMENT", priority: "MEDIUM", created_by: "" });
    load();
  }

  async function transition(id: string, status: CMChangeStatus) {
    await api.configMgmt.changes.transition(id, status).catch(err => alert(String(err)));
    load();
  }

  async function submitImpact(e: React.FormEvent, crId: string) {
    e.preventDefault();
    await api.configMgmt.changes.addImpact(crId, {
      ...impactForm,
      affected_item_name: impactForm.affected_item_name || null,
      impact_description: impactForm.impact_description || null,
    });
    setImpactTarget(null); setImpactForm({ affected_item_type: "REQUIREMENT", affected_item_id: "", affected_item_name: "", impact_description: "", revalidation_required: false });
    load();
  }

  async function deleteImpact(impactId: string) {
    await api.configMgmt.changes.deleteImpact(impactId);
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete change request?")) return;
    await api.configMgmt.changes.delete(id).catch(err => alert(String(err)));
    load();
  }

  const changeTypes: CMChangeType[] = ["ENHANCEMENT", "BUG_FIX", "REGULATORY", "SECURITY", "EMERGENCY"];
  const priorities: CMPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const impactTypes = ["REQUIREMENT", "DESIGN_ELEMENT", "TEST_CASE", "RISK", "SOFTWARE_UNIT", "COMPONENT", "DOCUMENT"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Change Requests ({changes.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.btn}>+ New CR</button>
      </div>

      {showAdd && (
        <form onSubmit={submit} style={styles.card}>
          <input placeholder="Title *" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={{ ...styles.input, width: "100%", marginBottom: 8 }} />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, width: "100%", height: 60, marginBottom: 8 }} />
          <div style={styles.row}>
            <select value={form.change_type} onChange={e => setForm(p => ({ ...p, change_type: e.target.value as CMChangeType }))} style={styles.input}>
              {changeTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as CMPriority }))} style={styles.input}>
              {priorities.map(p => <option key={p}>{p}</option>)}
            </select>
            <input placeholder="Created By" value={form.created_by} onChange={e => setForm(p => ({ ...p, created_by: e.target.value }))} style={styles.input} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" style={styles.btn}>Create</button>
            <button type="button" onClick={() => setShowAdd(false)} style={styles.btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      {changes.map(cr => (
        <div key={cr.id} style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === cr.id ? null : cr.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{cr.title}</span>
                <StatusBadge status={cr.status} />
                <PriorityBadge priority={cr.priority} />
                <span style={{ fontSize: 11, color: "#64748b" }}>{cr.change_type}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {cr.impacts.length} impact(s)
                {cr.created_by && ` · by ${cr.created_by}`}
                {" · "}{new Date(cr.created_at).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, justifyContent: "flex-end", maxWidth: 280 }}>
              {(CR_NEXT_STATUS[cr.status] ?? []).map(s => (
                <button key={s} onClick={() => transition(cr.id, s as CMChangeStatus)} style={{ ...styles.btnSm, fontSize: 11 }}>→{s}</button>
              ))}
              {["OPEN", "REJECTED", "CLOSED"].includes(cr.status) && (
                <button onClick={() => del(cr.id)} style={{ ...styles.btnSm, background: "#fef2f2", color: "#dc2626" }}>Del</button>
              )}
            </div>
          </div>

          {expandedId === cr.id && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              {cr.description && <p style={{ fontSize: 13, color: "#475569", margin: "0 0 10px" }}>{cr.description}</p>}
              {cr.resolution_notes && (
                <div style={{ fontSize: 12, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6, marginBottom: 10 }}>
                  <strong>Resolution:</strong> {cr.resolution_notes}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Impact Analysis ({cr.impacts.length})</div>
                {!["CLOSED", "REJECTED"].includes(cr.status) && (
                  <button onClick={() => setImpactTarget(impactTarget === cr.id ? null : cr.id)} style={styles.btnSm}>+ Add Impact</button>
                )}
              </div>

              {impactTarget === cr.id && (
                <form onSubmit={e => submitImpact(e, cr.id)} style={{ background: "#f8fafc", padding: 10, borderRadius: 6, marginBottom: 10 }}>
                  <div style={styles.row}>
                    <select value={impactForm.affected_item_type} onChange={e => setImpactForm(p => ({ ...p, affected_item_type: e.target.value }))} style={styles.input}>
                      {impactTypes.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <input placeholder="Item ID / Reference *" required value={impactForm.affected_item_id} onChange={e => setImpactForm(p => ({ ...p, affected_item_id: e.target.value }))} style={styles.input} />
                    <input placeholder="Item Name" value={impactForm.affected_item_name} onChange={e => setImpactForm(p => ({ ...p, affected_item_name: e.target.value }))} style={styles.input} />
                  </div>
                  <input placeholder="Impact Description" value={impactForm.impact_description} onChange={e => setImpactForm(p => ({ ...p, impact_description: e.target.value }))} style={{ ...styles.input, width: "100%", marginBottom: 8 }} />
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <input type="checkbox" checked={impactForm.revalidation_required} onChange={e => setImpactForm(p => ({ ...p, revalidation_required: e.target.checked }))} />
                    Re-validation required
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={styles.btn}>Add</button>
                    <button type="button" onClick={() => setImpactTarget(null)} style={styles.btnGhost}>Cancel</button>
                  </div>
                </form>
              )}

              {cr.impacts.map(imp => (
                <div key={imp.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: "#64748b", width: 100, flexShrink: 0 }}>{imp.affected_item_type}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{imp.affected_item_name ?? imp.affected_item_id}</span>
                    {imp.impact_description && <div style={{ color: "#64748b", marginTop: 2 }}>{imp.impact_description}</div>}
                  </div>
                  {imp.revalidation_required && (
                    <span style={{ fontSize: 11, background: imp.revalidation_status === "PENDING" ? "#fef3c7" : "#dcfce7", color: imp.revalidation_status === "PENDING" ? "#92400e" : "#166534", padding: "2px 6px", borderRadius: 10, flexShrink: 0 }}>
                      Reval: {imp.revalidation_status}
                    </span>
                  )}
                  <button onClick={() => deleteImpact(imp.id)} style={{ fontSize: 11, background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Dashboard summary cards ───────────────────────────────────────────────────
function SummaryCards({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<CMConfigItem[]>([]);
  const [baselines, setBaselines] = useState<CMBaseline[]>([]);
  const [changes, setChanges] = useState<CMChangeRequest[]>([]);

  useEffect(() => {
    api.configMgmt.items.list(projectId).then(setItems).catch(() => {});
    api.configMgmt.baselines.list(projectId).then(setBaselines).catch(() => {});
    api.configMgmt.changes.list(projectId).then(setChanges).catch(() => {});
  }, [projectId]);

  const released = items.filter(i => i.status === "RELEASED").length;
  const draft = items.filter(i => i.status === "DRAFT").length;
  const openCRs = changes.filter(c => ["OPEN", "IN_REVIEW", "APPROVED"].includes(c.status)).length;
  const criticalOpen = changes.filter(c => c.priority === "CRITICAL" && ["OPEN", "IN_REVIEW"].includes(c.status)).length;

  const cards = [
    { label: "Config Items", value: items.length, sub: `${released} released · ${draft} draft`, color: "#2563eb" },
    { label: "Baselines", value: baselines.length, sub: `${baselines.filter(b => b.is_released).length} released`, color: "#7c3aed" },
    { label: "Open Changes", value: openCRs, sub: `${criticalOpen} CRITICAL`, color: openCRs > 0 ? "#dc2626" : "#16a34a" },
    { label: "Total CRs", value: changes.length, sub: `${changes.filter(c => c.status === "CLOSED").length} closed`, color: "#0ea5e9" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", flex: 1, borderLeft: `4px solid ${c.color}` }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.label}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ConfigMgmtPage() {
  const projectId = useProject();
  const [tab, setTab] = useState<"items" | "baselines" | "changes">("items");

  if (!projectId) {
    return <div style={{ padding: 32, color: "#64748b" }}>Select a project to view Configuration Management.</div>;
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>Configuration Management</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>IEC 62304 §8 — Version control, baselines, and change control</p>
      </div>

      <ReleaseBanner projectId={projectId} />
      <SummaryCards projectId={projectId} />

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
        {(["items", "baselines", "changes"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: tab === t ? "#2563eb" : "transparent",
            color: tab === t ? "#fff" : "#64748b",
            borderRadius: "6px 6px 0 0",
          }}>
            {t === "items" ? "Config Items" : t === "baselines" ? "Baselines" : "Change Requests"}
          </button>
        ))}
      </div>

      {tab === "items" && <ConfigItemsTab projectId={projectId} />}
      {tab === "baselines" && <BaselinesTab projectId={projectId} />}
      {tab === "changes" && <ChangeRequestsTab projectId={projectId} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  card: {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
    padding: "14px 16px", marginBottom: 8,
  } as React.CSSProperties,
  input: {
    padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 13, outline: "none",
  } as React.CSSProperties,
  btn: {
    padding: "6px 14px", background: "#2563eb", color: "#fff", border: "none",
    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
  } as React.CSSProperties,
  btnGhost: {
    padding: "6px 14px", background: "transparent", color: "#64748b",
    border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  btnSm: {
    padding: "3px 10px", background: "#f1f5f9", color: "#334155",
    border: "1px solid #cbd5e1", borderRadius: 5, cursor: "pointer", fontSize: 12,
  } as React.CSSProperties,
  row: {
    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 8,
  } as React.CSSProperties,
};
