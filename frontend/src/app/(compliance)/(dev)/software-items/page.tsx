"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  SoftwareItem, SoftwareItemType, SoftwareSafetyClass, SoftwareItemStatus,
  ComplianceStatus, ComplianceCheck,
  Risk, Requirement, SafetyProfile,
} from "@/lib/api";

// ── Class metadata ─────────────────────────────────────────────────────────────

const CLASS_META: Record<SoftwareSafetyClass, { color: string; bg: string; label: string; desc: string }> = {
  A: { color: "#1b5e20", bg: "#e8f5e9", label: "Class A", desc: "No injury possible" },
  B: { color: "#e65100", bg: "#fff3e0", label: "Class B", desc: "Non-serious injury" },
  C: { color: "#b71c1c", bg: "#ffebee", label: "Class C", desc: "Serious injury / death" },
};

const TYPE_LABEL: Record<SoftwareItemType, string> = {
  SYSTEM: "System",
  SUBSYSTEM: "Subsystem",
  UNIT: "Unit",
};

const STATUS_META: Record<SoftwareItemStatus, { color: string; bg: string }> = {
  DRAFT:    { color: "#546e7a", bg: "#eceff1" },
  REVIEWED: { color: "#1565c0", bg: "#e3f2fd" },
  APPROVED: { color: "#1b5e20", bg: "#e8f5e9" },
};

// IEC 62304 §4.3 — a software item inherits its parent's safety class and may
// only be classified *lower* with a documented segregation justification.
const CLASS_RANK: Record<SoftwareSafetyClass, number> = { A: 1, B: 2, C: 3 };

// ── Compliance Indicator ──────────────────────────────────────────────────────

function ComplianceIndicator({ compliance }: { compliance: ComplianceStatus }) {
  const passed = compliance.checks.filter(c => c.satisfied).length;
  const total  = compliance.checks.length;
  const pct    = total > 0 ? Math.round((passed / total) * 100) : 100;

  return (
    <div style={sty.complianceBox}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          Compliance Status
          {compliance.is_compliant
            ? <span style={{ marginLeft: 8, color: "#1b5e20", fontSize: 13 }}>✓ COMPLIANT</span>
            : <span style={{ marginLeft: 8, color: "#b71c1c", fontSize: 13 }}>✗ NON-COMPLIANT</span>}
        </span>
        <span style={{ fontSize: 13, color: "#546e7a" }}>{passed}/{total} checks passed</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: "#e0e0e0", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4, transition: "width 0.3s",
          width: `${pct}%`,
          background: compliance.is_compliant ? "#4caf50" : pct >= 60 ? "#ff9800" : "#f44336",
        }} />
      </div>

      {/* Individual checks */}
      {compliance.checks.map(c => (
        <div key={c.rule} style={sty.checkRow}>
          <span style={{ fontSize: 16, marginRight: 8, flexShrink: 0 }}>
            {c.satisfied ? "✓" : c.required ? "✗" : "○"}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 500,
              color: c.satisfied ? "#1b5e20" : c.required ? "#b71c1c" : "#546e7a",
            }}>{c.label}</div>
            <div style={{ fontSize: 12, color: "#78909c", marginTop: 2 }}>{c.detail}</div>
          </div>
          {c.required && !c.satisfied && (
            <span style={{ fontSize: 11, color: "#b71c1c", background: "#ffebee", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>
              REQUIRED
            </span>
          )}
        </div>
      ))}

      {/* Blocks */}
      {compliance.blocks.length > 0 && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: "#fff3e0", borderRadius: 6, border: "1px solid #ffcc02" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e65100" }}>Blocked actions: </span>
          <span style={{ fontSize: 12, color: "#bf360c" }}>{compliance.blocks.join(", ")}</span>
        </div>
      )}

      {/* Classification suggestion */}
      {compliance.suggested_class !== "A" || compliance.safety_class !== compliance.suggested_class ? (
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#f3e5f5", borderRadius: 6, border: "1px solid #ce93d8" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6a1b9a" }}>Suggested class: {compliance.suggested_class} — </span>
          <span style={{ fontSize: 12, color: "#4a148c" }}>{compliance.suggestion_reason}</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Classification Panel ──────────────────────────────────────────────────────

function ClassificationPanel({
  item, parent, risks, requirements,
  onUpdate, onLinkRisks, onLinkReqs,
}: {
  item: SoftwareItem;
  parent: SoftwareItem | null;
  risks: Risk[];
  requirements: Requirement[];
  onUpdate: (d: Partial<SoftwareItem>) => void;
  onLinkRisks: (ids: string[]) => void;
  onLinkReqs: (ids: string[]) => void;
}) {
  const [cls, setCls] = useState<SoftwareSafetyClass>(item.safety_class);
  const [just, setJust] = useState(item.classification_justification ?? "");
  const [dirty, setDirty] = useState(false);

  // IEC 62304 §4.3 — a lower class than the parent needs a documented rationale.
  const belowParent = parent ? CLASS_RANK[cls] < CLASS_RANK[parent.safety_class] : false;
  const justRequired = belowParent && !just.trim();

  // Linked risk multi-select
  const [selectedRisks, setSelectedRisks] = useState<Set<string>>(new Set(item.risk_ids));
  const [selectedReqs, setSelectedReqs] = useState<Set<string>>(new Set(item.requirement_ids));

  function toggleRisk(id: string) {
    setSelectedRisks(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleReq(id: string) {
    setSelectedReqs(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const meta = CLASS_META[cls];

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* Left: classification form */}
      <div style={{ ...sty.panel, flex: "1 1 300px" }}>
        <div style={sty.panelTitle}>Safety Classification</div>

        {/* Class selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["A", "B", "C"] as SoftwareSafetyClass[]).map(c => {
            const m = CLASS_META[c];
            const active = cls === c;
            return (
              <button key={c} onClick={() => { setCls(c); setDirty(true); }}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 8, cursor: "pointer",
                  border: active ? `2px solid ${m.color}` : "2px solid #e0e0e0",
                  background: active ? m.bg : "#fafafa",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: m.color }}>{c}</div>
                <div style={{ fontSize: 11, color: m.color, marginTop: 2 }}>{m.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Selected class badge */}
        <div style={{ ...sty.classBadge, background: meta.bg, color: meta.color, marginBottom: 12 }}>
          {meta.label} — {meta.desc}
        </div>

        {/* IEC 62304 §4.3 inheritance context */}
        {parent && (
          <div style={{
            fontSize: 12, padding: "8px 10px", borderRadius: 6, marginBottom: 12,
            background: belowParent ? "#fff3e0" : "#eceff1",
            border: `1px solid ${belowParent ? "#ffcc80" : "#cfd8dc"}`,
            color: belowParent ? "#e65100" : "#546e7a",
          }}>
            Parent <strong>{parent.name}</strong> is {CLASS_META[parent.safety_class].label}.
            {belowParent
              ? " §4.3: a lower class requires a documented segregation justification below."
              : " This item inherits or exceeds the parent's class — no justification required."}
          </div>
        )}

        {/* Process requirements for selected class */}
        <div style={{ background: "#f5f5f5", borderRadius: 6, padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#37474f" }}>IEC 62304 Process Requirements</div>
          {cls === "A" && (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#546e7a", lineHeight: 1.8 }}>
              <li>§5.1 — Software development planning</li>
              <li>§5.2 — Software requirements analysis</li>
              <li>§6.1 — Software problem resolution</li>
            </ul>
          )}
          {cls === "B" && (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#546e7a", lineHeight: 1.8 }}>
              <li>All Class A activities</li>
              <li>§5.3 — Software architectural design</li>
              <li>§5.5 — Software unit implementation and testing</li>
              <li>§5.6 — Software integration and testing</li>
              <li>§5.7 — Software system testing</li>
            </ul>
          )}
          {cls === "C" && (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#546e7a", lineHeight: 1.8 }}>
              <li>All Class B activities</li>
              <li>§5.4 — Software detailed design</li>
              <li>§5.5.3 — Formal unit testing required</li>
              <li>§5.6.3 — Integration test verification</li>
              <li>§9 — Software risk management (ISO 14971)</li>
              <li>§5.8 — Software release</li>
            </ul>
          )}
        </div>

        {/* Justification */}
        <label style={sty.label}>
          Classification Justification
          {belowParent && <span style={{ color: "#e65100", marginLeft: 4 }}>* required (§4.3)</span>}
        </label>
        <textarea
          value={just}
          onChange={e => { setJust(e.target.value); setDirty(true); }}
          rows={3}
          placeholder={belowParent
            ? "Required: document the segregation rationale for classifying below the parent…"
            : "Explain why this safety class was assigned…"}
          style={{
            ...sty.textarea,
            ...(justRequired ? { border: "1px solid #ffab40" } : {}),
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            disabled={!dirty || justRequired}
            onClick={() => { onUpdate({ safety_class: cls, classification_justification: just || null }); setDirty(false); }}
            style={{ ...sty.btn, opacity: !dirty || justRequired ? 0.5 : 1 }}
          >
            Save Classification
          </button>
        </div>
      </div>

      {/* Right: hazard + requirement linking */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: "1 1 300px" }}>
        {/* Hazard linking */}
        <div style={sty.panel}>
          <div style={sty.panelTitle}>
            Linked Hazards (Risks)
            <span style={{ marginLeft: 8, fontSize: 12, color: "#78909c" }}>
              {selectedRisks.size} selected
            </span>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8 }}>
            {risks.length === 0 ? (
              <div style={sty.empty}>No risks in this project</div>
            ) : risks.map(r => {
              const sel = selectedRisks.has(r.id);
              return (
                <label key={r.id} style={{ ...sty.checkItem, background: sel ? "#e8f5e9" : undefined }}>
                  <input type="checkbox" checked={sel} onChange={() => toggleRisk(r.id)} style={{ marginRight: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title ?? r.hazard}
                    </div>
                    <div style={{ fontSize: 11, color: "#78909c" }}>
                      S:{r.severity} P:{r.probability} · {r.risk_level}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 5px", borderRadius: 4,
                    background: r.risk_level === "HIGH" ? "#ffebee" : r.risk_level === "MEDIUM" ? "#fff3e0" : "#e8f5e9",
                    color: r.risk_level === "HIGH" ? "#b71c1c" : r.risk_level === "MEDIUM" ? "#e65100" : "#1b5e20",
                  }}>{r.risk_level}</span>
                </label>
              );
            })}
          </div>
          <button onClick={() => onLinkRisks([...selectedRisks])} style={sty.btnSecondary}>
            Update Hazard Links
          </button>
        </div>

        {/* Requirement linking */}
        <div style={sty.panel}>
          <div style={sty.panelTitle}>
            Linked Requirements
            <span style={{ marginLeft: 8, fontSize: 12, color: "#78909c" }}>
              {selectedReqs.size} selected
            </span>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8 }}>
            {requirements.length === 0 ? (
              <div style={sty.empty}>No SOFTWARE requirements in this project</div>
            ) : requirements.filter(r => r.type === "SOFTWARE").map(r => {
              const sel = selectedReqs.has(r.id);
              return (
                <label key={r.id} style={{ ...sty.checkItem, background: sel ? "#e8f5e9" : undefined }}>
                  <input type="checkbox" checked={sel} onChange={() => toggleReq(r.id)} style={{ marginRight: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: "#1b5e20", marginRight: 6 }}>{r.readable_id}</span>
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
          <button onClick={() => onLinkReqs([...selectedReqs])} style={sty.btnSecondary}>
            Update Requirement Links
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, parent, risks, requirements, depth,
  onRefresh,
}: {
  item: SoftwareItem;
  parent: SoftwareItem | null;
  risks: Risk[];
  requirements: Requirement[];
  depth: number;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"classification" | "compliance">("classification");
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editDesc, setEditDesc] = useState(item.description ?? "");
  const [editType, setEditType] = useState<SoftwareItemType>(item.item_type);
  const [saving, setSaving] = useState(false);

  const meta = CLASS_META[item.safety_class];
  const statusMeta = STATUS_META[item.status];

  async function loadCompliance() {
    if (compliance) return;
    setLoadingCompliance(true);
    try {
      const c = await api.softwareItems.compliance(item.id);
      setCompliance(c);
    } finally {
      setLoadingCompliance(false);
    }
  }

  async function handleTabChange(t: "classification" | "compliance") {
    setTab(t);
    if (t === "compliance") loadCompliance();
  }

  async function handleUpdate(d: Partial<SoftwareItem>) {
    await api.softwareItems.update(item.id, d as Parameters<typeof api.softwareItems.update>[1]);
    setCompliance(null); // invalidate cached compliance
    onRefresh();
  }

  async function handleLinkRisks(ids: string[]) {
    await api.softwareItems.setRisks(item.id, ids);
    setCompliance(null);
    onRefresh();
  }

  async function handleLinkReqs(ids: string[]) {
    await api.softwareItems.setRequirements(item.id, ids);
    setCompliance(null);
    onRefresh();
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.softwareItems.update(item.id, { name: editName, description: editDesc || null, item_type: editType });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(status: SoftwareItemStatus) {
    try {
      await api.softwareItems.transitionStatus(item.id, status);
      setCompliance(null);
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const match = msg.match(/\d+: ([\s\S]*)/);
      try {
        const body = JSON.parse(match?.[1] ?? "{}");
        alert(body.detail ?? msg);
      } catch {
        alert(msg);
      }
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    await api.softwareItems.delete(item.id);
    onRefresh();
  }

  return (
    <div style={{ marginLeft: depth * 20, marginBottom: 4 }}>
      {/* Header row */}
      <div style={{ ...sty.itemRow, borderLeft: `3px solid ${meta.color}` }}>
        <button onClick={() => setExpanded(v => !v)} style={sty.expander}>
          {expanded ? "▾" : "▸"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ ...sty.input, flex: "1 1 200px" }} />
              <select value={editType} onChange={e => setEditType(e.target.value as SoftwareItemType)}
                style={{ ...sty.input, width: 110 }}>
                {(["SYSTEM", "SUBSYSTEM", "UNIT"] as SoftwareItemType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
              <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                placeholder="Description..." style={{ ...sty.input, flex: "2 1 200px" }} />
              <button onClick={handleSaveEdit} disabled={saving} style={sty.btn}>Save</button>
              <button onClick={() => setEditing(false)} style={sty.btnGhost}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "#eceff1", color: "#546e7a" }}>
                {TYPE_LABEL[item.item_type]}
              </span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</span>
              {item.is_legacy && (
                <span title="IEC 62304 §4.4 — legacy software"
                      style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3,
                               background: "#efebe9", color: "#5d4037", border: "1px solid #d7ccc8",
                               fontWeight: 700, letterSpacing: "0.05em" }}>
                  LEGACY §4.4
                </span>
              )}
              {item.description && (
                <span style={{ fontSize: 12, color: "#78909c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                  {item.description}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ ...sty.classBadge, background: meta.bg, color: meta.color, fontSize: 11 }}>
            {meta.label}
          </span>
          <span style={{ ...sty.classBadge, background: statusMeta.bg, color: statusMeta.color, fontSize: 11 }}>
            {item.status}
          </span>
          {item.risk_ids.length > 0 && (
            <span style={{ fontSize: 11, color: "#b71c1c", background: "#ffebee", padding: "2px 6px", borderRadius: 4 }}>
              {item.risk_ids.length} hazard{item.risk_ids.length !== 1 ? "s" : ""}
            </span>
          )}
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} style={sty.iconBtn} title="Edit">✎</button>
              <button onClick={handleDelete} style={{ ...sty.iconBtn, color: "#b71c1c" }} title="Delete">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={sty.expandedPanel}>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid #e0e0e0" }}>
            {(["classification", "compliance"] as const).map(t => (
              <button key={t} onClick={() => handleTabChange(t)}
                style={{ ...sty.tab, borderBottom: tab === t ? "2px solid #1565c0" : "2px solid transparent" }}>
                {t === "classification" ? "Classification & Links" : "Compliance Checker"}
              </button>
            ))}
          </div>

          {/* Status transitions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: "#546e7a" }}>Status:</span>
            {item.status !== "REVIEWED" && (
              <button onClick={() => handleTransition("REVIEWED")} style={sty.btnSmall}>
                → Mark Reviewed
              </button>
            )}
            {item.status === "REVIEWED" && (
              <button onClick={() => handleTransition("APPROVED")} style={{ ...sty.btnSmall, background: "#1b5e20", color: "#fff" }}>
                → Approve (checks compliance)
              </button>
            )}
            {item.status !== "DRAFT" && (
              <button onClick={() => handleTransition("DRAFT")} style={{ ...sty.btnSmall, background: "#eceff1", color: "#546e7a" }}>
                ← Revert to Draft
              </button>
            )}
          </div>

          {tab === "classification" && (
            <ClassificationPanel
              item={item} parent={parent} risks={risks} requirements={requirements}
              onUpdate={handleUpdate}
              onLinkRisks={handleLinkRisks}
              onLinkReqs={handleLinkReqs}
            />
          )}

          {tab === "compliance" && (
            loadingCompliance ? (
              <div style={{ padding: 24, textAlign: "center", color: "#78909c" }}>Loading compliance data…</div>
            ) : compliance ? (
              <ComplianceIndicator compliance={compliance} />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Item Form ─────────────────────────────────────────────────────────────

function AddItemForm({
  projectId, allItems, hasLegacySoftware,
  onCreated,
}: {
  projectId: string;
  allItems: SoftwareItem[];
  hasLegacySoftware: boolean;   // §4.4 gate from SoftwareSafetyProfile
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [itemType, setItemType] = useState<SoftwareItemType>("SUBSYSTEM");
  const [safetyClass, setSafetyClass] = useState<SoftwareSafetyClass>("C");
  const [parentId, setParentId] = useState("");
  const [just, setJust] = useState("");
  // IEC 62304 §4.4 — legacy software flag + assessment narrative
  const [isLegacy, setIsLegacy] = useState(false);
  const [legacyAssessment, setLegacyAssessment] = useState("");
  const [saving, setSaving] = useState(false);

  // IEC 62304 §4.3 — selecting a parent inherits its class by default; a class
  // below the parent's needs a documented segregation justification.
  const parent = allItems.find(i => i.id === parentId) ?? null;
  const belowParent = parent ? CLASS_RANK[safetyClass] < CLASS_RANK[parent.safety_class] : false;
  const justRequired = belowParent && !just.trim();

  function handleParentChange(pid: string) {
    setParentId(pid);
    // Inherit the parent's class on selection (user can still override down).
    const p = allItems.find(i => i.id === pid);
    if (p) setSafetyClass(p.safety_class);
  }

  async function handleCreate() {
    if (!name.trim() || justRequired) return;
    setSaving(true);
    try {
      await api.softwareItems.create({
        project_id: projectId,
        name: name.trim(),
        description: desc.trim() || null,
        item_type: itemType,
        safety_class: safetyClass,
        parent_id: parentId || null,
        classification_justification: just.trim() || null,
        is_legacy: isLegacy,
        legacy_assessment: isLegacy ? (legacyAssessment.trim() || null) : null,
      });
      setName(""); setDesc(""); setParentId(""); setJust("");
      setIsLegacy(false); setLegacyAssessment("");
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={sty.addForm}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Add Software Item</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Name *" value={name} onChange={e => setName(e.target.value)}
          style={{ ...sty.input, flex: "1 1 200px" }} />
        <select value={itemType} onChange={e => setItemType(e.target.value as SoftwareItemType)}
          style={{ ...sty.input, width: 120 }}>
          <option value="SYSTEM">System</option>
          <option value="SUBSYSTEM">Subsystem</option>
          <option value="UNIT">Unit</option>
        </select>
        <select value={safetyClass} onChange={e => setSafetyClass(e.target.value as SoftwareSafetyClass)}
          style={{ ...sty.input, width: 100 }}>
          <option value="A">Class A</option>
          <option value="B">Class B</option>
          <option value="C">Class C</option>
        </select>
        <select value={parentId} onChange={e => handleParentChange(e.target.value)}
          style={{ ...sty.input, width: 160 }}>
          <option value="">— No parent —</option>
          {allItems.map(i => (
            <option key={i.id} value={i.id}>{i.name} ({TYPE_LABEL[i.item_type]})</option>
          ))}
        </select>
        <input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)}
          style={{ ...sty.input, flex: "2 1 200px" }} />
        <button onClick={handleCreate} disabled={!name.trim() || saving || justRequired} style={sty.btn}>
          {saving ? "Adding…" : "+ Add"}
        </button>
      </div>

      {/* §4.4 — per-item legacy flag (only meaningful when project declared
          has_legacy_software=true on its Safety Profile). */}
      {hasLegacySoftware && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#efebe9", borderRadius: 4 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={isLegacy} onChange={e => setIsLegacy(e.target.checked)}
                   style={{ marginTop: 2 }} />
            <span><b>Legacy software (§4.4)</b> — this item was not developed under IEC 62304.</span>
          </label>
          {isLegacy && (
            <textarea value={legacyAssessment} onChange={e => setLegacyAssessment(e.target.value)}
                      rows={2} placeholder="§4.4(d) — document the manufacturer's risk-based decision regarding the application of IEC 62304 to this legacy item."
                      style={{ ...sty.textarea, marginTop: 8 }} />
          )}
        </div>
      )}

      {/* §4.3 — justification required when classifying below the parent */}
      {belowParent && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "#e65100", marginBottom: 4 }}>
            Class {safetyClass} is below parent <strong>{parent!.name}</strong> (Class {parent!.safety_class}).
            IEC 62304 §4.3 requires a segregation justification.
          </div>
          <textarea
            value={just}
            onChange={e => setJust(e.target.value)}
            rows={2}
            placeholder="Document the segregation rationale for classifying below the parent…"
            style={{ ...sty.textarea, border: justRequired ? "1px solid #ffab40" : sty.textarea.border }}
          />
        </div>
      )}
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ items }: { items: SoftwareItem[] }) {
  const byClass = { A: 0, B: 0, C: 0 };
  const byStatus = { DRAFT: 0, REVIEWED: 0, APPROVED: 0 };
  for (const it of items) {
    byClass[it.safety_class]++;
    byStatus[it.status]++;
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      {/* Class breakdown */}
      {(["C", "B", "A"] as SoftwareSafetyClass[]).map(c => {
        const m = CLASS_META[c];
        return (
          <div key={c} style={{ ...sty.card, borderTop: `3px solid ${m.color}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{byClass[c]}</div>
            <div style={{ fontSize: 12, color: "#546e7a" }}>{m.label}</div>
            <div style={{ fontSize: 11, color: "#90a4ae" }}>{m.desc}</div>
          </div>
        );
      })}
      {/* Status breakdown */}
      <div style={{ ...sty.card, borderTop: "3px solid #1565c0" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Status</div>
        {(["DRAFT", "REVIEWED", "APPROVED"] as SoftwareItemStatus[]).map(s => {
          const m = STATUS_META[s];
          return (
            <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: m.color }}>{s}</span>
              <span style={{ fontWeight: 600, color: m.color }}>{byStatus[s]}</span>
            </div>
          );
        })}
      </div>
      {/* Total */}
      <div style={{ ...sty.card, borderTop: "3px solid #546e7a" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#37474f" }}>{items.length}</div>
        <div style={{ fontSize: 12, color: "#546e7a" }}>Total Items</div>
        <div style={{ fontSize: 11, color: "#90a4ae" }}>IEC 62304 §5</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SoftwareItemsPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? (
    typeof window !== "undefined" ? localStorage.getItem("medsoft_active_project") ?? "" : ""
  );

  const [items, setItems] = useState<SoftwareItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  // IEC 62304 §4.4 — project-level legacy-software declaration on the
  // SoftwareSafetyProfile gates whether per-item is_legacy is meaningful.
  const [safetyProfile, setSafetyProfile] = useState<SafetyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [its, rks, reqs, prof] = await Promise.all([
        api.softwareItems.list(projectId),
        api.risks.list(undefined, projectId),
        api.requirements.list(projectId),
        api.risks.safetyProfile.get(projectId),
      ]);
      setItems(its);
      setRisks(rks);
      setRequirements(reqs);
      setSafetyProfile(prof);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, [load]);

  // Build tree: top-level items (no parent or parent not found)
  const itemMap = new Map(items.map(i => [i.id, i]));
  const roots = items.filter(i => !i.parent_id || !itemMap.has(i.parent_id));

  function renderTree(item: SoftwareItem, depth: number, parent: SoftwareItem | null): React.ReactNode {
    const children = items.filter(i => i.parent_id === item.id);
    return (
      <div key={item.id}>
        <ItemRow
          item={item} parent={parent} risks={risks} requirements={requirements}
          depth={depth} onRefresh={load}
        />
        {children.map(c => renderTree(c, depth + 1, item))}
      </div>
    );
  }

  if (!projectId) {
    return (
      <div style={sty.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No project selected</div>
        <div style={{ color: "#78909c" }}>Select a project from the sidebar to manage software items.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>
          Software Items
        </h1>
        <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
          IEC 62304 §5 software decomposition with safety classification enforcement
        </p>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : (
        <>
          {/* §4.4 — project-level legacy-software declaration banner. Read from
              the SoftwareSafetyProfile so users see the project's stated §4.4
              position without leaving this page. Edit on the /risks page. */}
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 6,
            borderLeft: `4px solid ${safetyProfile?.has_legacy_software ? "#5d4037" : "#2e7d32"}`,
            background: safetyProfile?.has_legacy_software ? "#efebe9" : "#e8f5e9",
            color: "#37474f", fontSize: 13,
          }}>
            <strong>IEC 62304 §4.4 — Legacy software</strong>:&nbsp;
            {!safetyProfile ? (
              <>
                no Safety Profile yet — <a href="/risks" style={{ color: "#1565c0" }}>configure on /risks</a> to declare the project's §4.4 position.
              </>
            ) : safetyProfile.has_legacy_software ? (
              <>this project contains legacy software. Flag affected items below with the <em>Legacy</em> checkbox; document the manufacturer's process in the <a href="/plans/legacy-software" style={{ color: "#1565c0" }}>Legacy Software Plan</a>.</>
            ) : (
              <>declared <strong>N/A</strong> for this project — no legacy software. <a href="/risks" style={{ color: "#1565c0" }}>Change on /risks</a> if that's wrong.</>
            )}
            {safetyProfile?.legacy_software_statement && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#5d4037", fontStyle: "italic" }}>
                “{safetyProfile.legacy_software_statement}”
              </div>
            )}
          </div>

          <SummaryCards items={items} />

          <AddItemForm projectId={projectId} allItems={items}
                       hasLegacySoftware={safetyProfile?.has_legacy_software ?? false}
                       onCreated={load} />

          <div style={{ marginTop: 20 }}>
            {roots.length === 0 ? (
              <div style={sty.emptyState}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 600 }}>No software items yet</div>
                <div style={{ color: "#78909c", marginTop: 4 }}>
                  Add items above to begin your IEC 62304 §5 software decomposition.
                </div>
              </div>
            ) : (
              roots.map(r => renderTree(r, 0, null))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SoftwareItemsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>}>
      <SoftwareItemsPageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sty = {
  itemRow: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: "10px 12px",
    background: "#fff",
    borderRadius: 6,
    border: "1px solid #e0e0e0",
    cursor: "pointer" as const,
    marginBottom: 2,
  },
  expandedPanel: {
    margin: "0 0 8px 0",
    padding: "16px",
    background: "#fafafa",
    border: "1px solid #e0e0e0",
    borderTop: "none",
    borderRadius: "0 0 6px 6px",
  },
  panel: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "14px 16px",
  },
  panelTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: "#1a237e",
    marginBottom: 12,
    display: "flex" as const,
    alignItems: "center" as const,
  },
  complianceBox: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "16px",
  },
  checkRow: {
    display: "flex" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    padding: "8px 0",
    borderBottom: "1px solid #f5f5f5",
  },
  classBadge: {
    display: "inline-block" as const,
    padding: "3px 10px",
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 12,
  },
  checkItem: {
    display: "flex" as const,
    alignItems: "center" as const,
    padding: "6px 8px",
    borderRadius: 4,
    cursor: "pointer" as const,
    fontSize: 13,
    marginBottom: 2,
    gap: 4,
  },
  addForm: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 8,
  },
  card: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "14px 18px",
    minWidth: 110,
  },
  btn: {
    background: "#1a237e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    cursor: "pointer" as const,
    fontSize: 13,
    fontWeight: 500,
  },
  btnSmall: {
    background: "#e3f2fd",
    color: "#1565c0",
    border: "1px solid #bbdefb",
    borderRadius: 5,
    padding: "5px 10px",
    cursor: "pointer" as const,
    fontSize: 12,
  },
  btnSecondary: {
    background: "#e8f5e9",
    color: "#1b5e20",
    border: "1px solid #c8e6c9",
    borderRadius: 5,
    padding: "6px 12px",
    cursor: "pointer" as const,
    fontSize: 12,
    fontWeight: 500,
    width: "100%" as const,
  },
  btnGhost: {
    background: "transparent",
    color: "#546e7a",
    border: "1px solid #cfd8dc",
    borderRadius: 6,
    padding: "8px 14px",
    cursor: "pointer" as const,
    fontSize: 13,
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer" as const,
    color: "#78909c",
    fontSize: 16,
    padding: "0 4px",
    lineHeight: 1,
  },
  expander: {
    background: "transparent",
    border: "none",
    cursor: "pointer" as const,
    color: "#546e7a",
    fontSize: 14,
    padding: "0 4px",
    flexShrink: 0,
  },
  tab: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "8px 16px",
    cursor: "pointer" as const,
    fontSize: 13,
    color: "#546e7a",
    fontWeight: 500,
  },
  label: {
    display: "block" as const,
    fontSize: 12,
    fontWeight: 500,
    color: "#546e7a",
    marginBottom: 4,
  },
  input: {
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 13,
    outline: "none" as const,
  },
  textarea: {
    width: "100%" as const,
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 13,
    outline: "none" as const,
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
  },
  empty: {
    padding: "12px 0",
    textAlign: "center" as const,
    color: "#90a4ae",
    fontSize: 13,
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "48px 24px",
    color: "#546e7a",
  },
};
