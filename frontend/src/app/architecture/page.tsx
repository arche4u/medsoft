"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  SWComponent, SWComponentTreeNode, SWInterface, SWDataFlow,
  ComponentType, ComponentStatus, InterfaceType, DataFlowCriticality,
  ArchCompliance, ArchComplianceCheck,
  Risk, Requirement, TestCase,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<ComponentType, { color: string; bg: string; indent: number }> = {
  SYSTEM:    { color: "#1a237e", bg: "#e8eaf6", indent: 0 },
  SUBSYSTEM: { color: "#1565c0", bg: "#e3f2fd", indent: 20 },
  ITEM:      { color: "#6a1b9a", bg: "#f3e5f5", indent: 40 },
  UNIT:      { color: "#1b5e20", bg: "#e8f5e9", indent: 60 },
};

const STATUS_META: Record<ComponentStatus, { color: string; bg: string }> = {
  DRAFT:    { color: "#546e7a", bg: "#eceff1" },
  REVIEW:   { color: "#e65100", bg: "#fff3e0" },
  APPROVED: { color: "#1b5e20", bg: "#e8f5e9" },
};

const CLASS_COLOR: Record<string, string> = { A: "#1b5e20", B: "#e65100", C: "#b71c1c" };

const IFACE_TYPE_COLOR: Record<InterfaceType, string> = {
  DATA: "#1565c0", CONTROL: "#e65100", API: "#6a1b9a", SIGNAL: "#b71c1c",
};

const CRITICALITY_COLOR: Record<DataFlowCriticality, string> = {
  LOW: "#1b5e20", MEDIUM: "#e65100", HIGH: "#b71c1c", CRITICAL: "#880e4f",
};

// ── Compliance badge ──────────────────────────────────────────────────────────

function ComplianceBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 4, marginLeft: 6,
      background: ok ? "#e8f5e9" : "#ffebee",
      color: ok ? "#1b5e20" : "#b71c1c",
    }}>
      {ok ? "✓" : "⚠"}
    </span>
  );
}

// ── Compliance panel ──────────────────────────────────────────────────────────

function CompliancePanel({ compliance }: { compliance: ArchCompliance }) {
  const passed = compliance.checks.filter(c => c.satisfied).length;
  const total = compliance.checks.length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 100;

  return (
    <div style={sty.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: compliance.is_compliant ? "#1b5e20" : "#b71c1c" }}>
          {compliance.is_compliant ? "✓ Compliant" : "✗ Non-compliant"} — Class {compliance.safety_class}
        </span>
        <span style={{ fontSize: 12, color: "#78909c" }}>{passed}/{total}</span>
      </div>
      <div style={{ height: 6, background: "#e0e0e0", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: compliance.is_compliant ? "#4caf50" : pct >= 60 ? "#ff9800" : "#f44336" }} />
      </div>
      {compliance.checks.map(c => (
        <div key={c.rule} style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14, color: c.satisfied ? "#1b5e20" : c.required ? "#b71c1c" : "#90a4ae", flexShrink: 0 }}>
            {c.satisfied ? "✓" : c.required ? "✗" : "○"}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: c.satisfied ? "#1b5e20" : c.required ? "#b71c1c" : "#546e7a" }}>{c.label}</div>
            <div style={{ fontSize: 11, color: "#78909c" }}>{c.detail}</div>
          </div>
        </div>
      ))}
      {compliance.blocks.length > 0 && (
        <div style={{ marginTop: 10, padding: "7px 10px", background: "#fff3e0", borderRadius: 5, fontSize: 12 }}>
          <span style={{ color: "#e65100", fontWeight: 600 }}>Blocked: </span>
          <span style={{ color: "#bf360c" }}>{compliance.blocks.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

// ── Traceability links panel ──────────────────────────────────────────────────

function TracePanel({
  component, requirements, risks, testcases,
  onSave,
}: {
  component: SWComponent;
  requirements: Requirement[];
  risks: Risk[];
  testcases: TestCase[];
  onSave: (reqs: string[], rks: string[], tcs: string[]) => void;
}) {
  const [selReqs, setSelReqs] = useState<Set<string>>(new Set(component.requirement_ids));
  const [selRisks, setSelRisks] = useState<Set<string>>(new Set(component.risk_ids));
  const [selTCs, setSelTCs] = useState<Set<string>>(new Set(component.testcase_ids));

  function toggle(set: Set<string>, id: string): Set<string> {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {[
        {
          title: "Requirements", items: requirements.filter(r => r.type === "SOFTWARE"),
          sel: selReqs, setFn: (s: Set<string>) => setSelReqs(s),
          render: (r: Requirement) => <><span style={{ fontSize: 10, color: "#1b5e20", marginRight: 4 }}>{r.readable_id}</span>{r.title}</>,
        },
        {
          title: "Risks", items: risks,
          sel: selRisks, setFn: (s: Set<string>) => setSelRisks(s),
          render: (r: Risk) => <><span style={{ fontSize: 10, color: "#b71c1c", marginRight: 4 }}>{r.risk_level}</span>{r.title ?? r.hazard}</>,
        },
        {
          title: "Test Cases", items: testcases,
          sel: selTCs, setFn: (s: Set<string>) => setSelTCs(s),
          render: (t: TestCase) => <><span style={{ fontSize: 10, color: "#546e7a", marginRight: 4 }}>{t.readable_id ?? ""}</span>{t.title}</>,
        },
      ].map(({ title, items, sel, setFn, render }) => (
        <div key={title} style={{ ...sty.panel, flex: "1 1 200px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1a237e", marginBottom: 8 }}>
            {title} <span style={{ fontSize: 11, color: "#78909c" }}>({sel.size} selected)</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" as const, marginBottom: 8 }}>
            {items.length === 0
              ? <div style={{ fontSize: 12, color: "#90a4ae" }}>None in project</div>
              : (items as (Requirement | Risk | TestCase)[]).map(item => (
                <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(item.id)} onChange={() => setFn(toggle(sel, item.id))} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(render as (i: typeof item) => React.ReactNode)(item)}</span>
                </label>
              ))}
          </div>
        </div>
      ))}
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => onSave([...selReqs], [...selRisks], [...selTCs])} style={sty.btn}>
          Save Trace Links
        </button>
      </div>
    </div>
  );
}

// ── Component row (tree node) ─────────────────────────────────────────────────

function ComponentRow({
  node, depth, interfaces, requirements, risks, testcases,
  onRefresh,
}: {
  node: SWComponentTreeNode;
  depth: number;
  interfaces: SWInterface[];
  requirements: Requirement[];
  risks: Risk[];
  testcases: TestCase[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"info" | "trace" | "compliance">("info");
  const [compliance, setCompliance] = useState<ArchCompliance | null>(null);
  const [fullComp, setFullComp] = useState<SWComponent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editDesc, setEditDesc] = useState(node.description ?? "");
  const [editClass, setEditClass] = useState(node.safety_class);
  const [editRationale, setEditRationale] = useState("");
  const [approver, setApprover] = useState("");
  const [saving, setSaving] = useState(false);

  const tm = TYPE_META[node.component_type];
  const sm = STATUS_META[node.status];

  async function open() {
    if (!expanded) {
      const c = await api.architecture.getComponent(node.id);
      setFullComp(c);
      setEditRationale(c.rationale ?? "");
    }
    setExpanded(v => !v);
  }

  async function loadCompliance() {
    const c = await api.architecture.compliance(node.id);
    setCompliance(c);
  }

  async function handleTabChange(t: "info" | "trace" | "compliance") {
    setTab(t);
    if (t === "compliance" && !compliance) loadCompliance();
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.architecture.updateComponent(node.id, {
        name: editName, description: editDesc || null,
        safety_class: editClass, rationale: editRationale || null,
      });
      setEditing(false);
      setCompliance(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}"?`)) return;
    await api.architecture.deleteComponent(node.id);
    onRefresh();
  }

  async function handleTransition(status: ComponentStatus) {
    try {
      await api.architecture.transitionStatus(node.id, status, approver || undefined);
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/\d+: ([\s\S]*)/);
      try { alert(JSON.parse(m?.[1] ?? "{}").detail ?? msg); } catch { alert(msg); }
    }
  }

  async function handleSaveTrace(reqs: string[], rks: string[], tcs: string[]) {
    setSaving(true);
    try {
      await Promise.all([
        api.architecture.setRequirements(node.id, reqs),
        api.architecture.setRisks(node.id, rks),
        api.architecture.setTestcases(node.id, tcs),
      ]);
      setCompliance(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  const myInterfaces = interfaces.filter(
    i => i.source_component_id === node.id || i.target_component_id === node.id
  );

  return (
    <div style={{ marginLeft: depth * 20 }}>
      {/* Header row */}
      <div style={{ ...sty.compRow, borderLeft: `3px solid ${tm.color}` }}>
        <button onClick={open} style={sty.expander}>{expanded ? "▾" : "▸"}</button>

        {editing ? (
          <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...sty.input, flex: "1 1 150px" }} />
            <select value={editClass} onChange={e => setEditClass(e.target.value)} style={{ ...sty.input, width: 90 }}>
              {["A", "B", "C"].map(c => <option key={c} value={c}>Class {c}</option>)}
            </select>
            <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description…" style={{ ...sty.input, flex: "2 1 200px" }} />
            <button onClick={handleSaveEdit} disabled={saving} style={sty.btn}>Save</button>
            <button onClick={() => setEditing(false)} style={sty.btnGhost}>Cancel</button>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: tm.bg, color: tm.color, fontWeight: 600, flexShrink: 0 }}>
              {node.component_type}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{node.name}</span>
            {node.description && (
              <span style={{ fontSize: 12, color: "#78909c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                {node.description}
              </span>
            )}
          </div>
        )}

        {/* Badges */}
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: CLASS_COLOR[node.safety_class] ?? "#333" }}>
            Class {node.safety_class}
          </span>
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: sm.bg, color: sm.color }}>
            {node.status}
          </span>
          {node.interface_count > 0 && (
            <span style={{ fontSize: 11, background: "#e3f2fd", color: "#1565c0", padding: "2px 6px", borderRadius: 4 }}>
              {node.interface_count} iface{node.interface_count !== 1 ? "s" : ""}
            </span>
          )}
          <ComplianceBadge ok={node.is_compliant} />
          {!editing && node.status !== "APPROVED" && (
            <>
              <button onClick={() => setEditing(true)} style={sty.iconBtn} title="Edit">✎</button>
              <button onClick={handleDelete} style={{ ...sty.iconBtn, color: "#b71c1c" }} title="Delete">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={sty.expandedPanel}>
          {/* Status + transitions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#546e7a" }}>Status:</span>
            {node.status === "DRAFT" && (
              <button onClick={() => handleTransition("REVIEW")} style={sty.btnSmall}>→ Submit for Review</button>
            )}
            {node.status === "REVIEW" && (
              <>
                <input value={approver} onChange={e => setApprover(e.target.value)}
                  placeholder="Approver name" style={{ ...sty.input, width: 160 }} />
                <button onClick={() => handleTransition("APPROVED")} style={{ ...sty.btnSmall, background: "#e8f5e9", color: "#1b5e20", border: "1px solid #c8e6c9" }}>
                  ✓ Approve
                </button>
                <button onClick={() => handleTransition("DRAFT")} style={{ ...sty.btnSmall }}>← Return to Draft</button>
              </>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: 14 }}>
            {(["info", "trace", "compliance"] as const).map(t => (
              <button key={t} onClick={() => handleTabChange(t)} style={{
                ...sty.tabBtn,
                borderBottom: tab === t ? "2px solid #1a237e" : "2px solid transparent",
                color: tab === t ? "#1a237e" : "#546e7a", fontWeight: tab === t ? 600 : 400,
              }}>
                {t === "info" ? "Info & Interfaces" : t === "trace" ? "Traceability" : "Compliance"}
              </button>
            ))}
          </div>

          {tab === "info" && (
            <div>
              {/* Edit rationale inline */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ flex: "1 1 300px" }}>
                  <label style={sty.label}>Classification Rationale</label>
                  <textarea value={editRationale} onChange={e => setEditRationale(e.target.value)}
                    rows={3} style={sty.textarea}
                    readOnly={node.status === "APPROVED"}
                    placeholder="Why was this safety class assigned?" />
                  {node.status !== "APPROVED" && (
                    <button onClick={async () => {
                      await api.architecture.updateComponent(node.id, { rationale: editRationale || null });
                      onRefresh();
                    }} style={{ ...sty.btnSecondary, marginTop: 6 }}>Save Rationale</button>
                  )}
                </div>

                <div style={{ flex: "1 1 300px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a237e", marginBottom: 8 }}>
                    Interfaces ({myInterfaces.length})
                  </div>
                  {myInterfaces.length === 0
                    ? <div style={{ fontSize: 12, color: "#90a4ae" }}>No interfaces — add them in the Interface Map tab</div>
                    : myInterfaces.map(i => (
                      <div key={i.id} style={{ fontSize: 12, padding: "5px 8px", background: "#f5f5f5", borderRadius: 4, marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "#e3f2fd", color: IFACE_TYPE_COLOR[i.interface_type] }}>
                          {i.interface_type}
                        </span>
                        <span style={{ fontWeight: 500 }}>{i.name}</span>
                        <span style={{ color: "#78909c", fontSize: 11 }}>
                          {i.source_component_id === node.id
                            ? `→ ${i.target_component_name}`
                            : `← ${i.source_component_name}`}
                        </span>
                        {i.safety_relevant && (
                          <span style={{ fontSize: 10, color: "#b71c1c", background: "#ffebee", padding: "1px 5px", borderRadius: 3 }}>SAFETY</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Trace summary */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Requirements", count: node.requirement_ids.length, color: "#1565c0" },
                  { label: "Risks", count: node.risk_ids.length, color: "#b71c1c" },
                  { label: "Test Cases", count: node.testcase_ids.length, color: "#1b5e20" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{ padding: "8px 14px", borderRadius: 6, background: "#f5f5f5", textAlign: "center" as const }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
                    <div style={{ fontSize: 11, color: "#546e7a" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "trace" && fullComp && (
            <TracePanel
              component={fullComp}
              requirements={requirements}
              risks={risks}
              testcases={testcases}
              onSave={handleSaveTrace}
            />
          )}

          {tab === "compliance" && (
            compliance
              ? <CompliancePanel compliance={compliance} />
              : <div style={{ padding: 20, textAlign: "center", color: "#78909c" }}>Loading…</div>
          )}
        </div>
      )}

      {/* Children */}
      {node.children.map(child => (
        <ComponentRow
          key={child.id} node={child} depth={depth + 1}
          interfaces={interfaces} requirements={requirements} risks={risks} testcases={testcases}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

// ── Interface Map tab ─────────────────────────────────────────────────────────

function InterfaceMap({
  projectId, interfaces, components, onRefresh,
}: {
  projectId: string;
  interfaces: SWInterface[];
  components: SWComponent[];
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [srcId, setSrcId] = useState("");
  const [tgtId, setTgtId] = useState("");
  const [ifType, setIfType] = useState<InterfaceType>("API");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [fmt, setFmt] = useState("");
  const [method, setMethod] = useState("");
  const [safety, setSafety] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Data flow add state
  const [dfName, setDfName] = useState("");
  const [dfType, setDfType] = useState("");
  const [dfFreq, setDfFreq] = useState("");
  const [dfCrit, setDfCrit] = useState<DataFlowCriticality>("LOW");
  const [dfDesc, setDfDesc] = useState("");

  async function addInterface() {
    if (!srcId || !tgtId || !name.trim()) return;
    setSaving(true);
    try {
      await api.architecture.createInterface({
        project_id: projectId, source_component_id: srcId, target_component_id: tgtId,
        interface_type: ifType, name, description: desc || null,
        data_format: fmt || null, communication_method: method || null, safety_relevant: safety,
      });
      setName(""); setDesc(""); setFmt(""); setMethod(""); setSafety(false);
      setShowAdd(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deleteInterface(id: string) {
    if (!confirm("Delete this interface?")) return;
    await api.architecture.deleteInterface(id);
    onRefresh();
  }

  async function addDataFlow(interfaceId: string) {
    if (!dfName.trim()) return;
    setSaving(true);
    try {
      await api.architecture.addDataFlow(interfaceId, {
        data_name: dfName, data_type: dfType || null,
        frequency: dfFreq || null, criticality: dfCrit, description: dfDesc || null,
      });
      setDfName(""); setDfType(""); setDfFreq(""); setDfDesc("");
      onRefresh();
    } finally { setSaving(false); }
  }

  const safetyCount = interfaces.filter(i => i.safety_relevant).length;

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total Interfaces", val: interfaces.length, color: "#1565c0" },
          { label: "Safety-Relevant", val: safetyCount, color: "#b71c1c" },
          ...["DATA", "CONTROL", "API", "SIGNAL"].map(t => ({
            label: t, val: interfaces.filter(i => i.interface_type === t).length,
            color: IFACE_TYPE_COLOR[t as InterfaceType],
          })),
        ].map(({ label, val, color }) => (
          <div key={label} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, textAlign: "center" as const }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: "#546e7a" }}>{label}</div>
          </div>
        ))}
        <button onClick={() => setShowAdd(v => !v)} style={{ ...sty.btn, marginLeft: "auto", alignSelf: "center" }}>
          {showAdd ? "Cancel" : "+ Add Interface"}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...sty.panel, marginBottom: 14, background: "#f3e5f5" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Define Interface</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={sty.label}>Source Component *</label>
              <select value={srcId} onChange={e => setSrcId(e.target.value)} style={{ ...sty.input, width: "100%" }}>
                <option value="">— select —</option>
                {components.map(c => <option key={c.id} value={c.id}>{c.component_type}: {c.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={sty.label}>Target Component *</label>
              <select value={tgtId} onChange={e => setTgtId(e.target.value)} style={{ ...sty.input, width: "100%" }}>
                <option value="">— select —</option>
                {components.filter(c => c.id !== srcId).map(c => <option key={c.id} value={c.id}>{c.component_type}: {c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={sty.label}>Type</label>
              <select value={ifType} onChange={e => setIfType(e.target.value as InterfaceType)} style={{ ...sty.input, width: 100 }}>
                {["DATA", "CONTROL", "API", "SIGNAL"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Interface name *" style={{ ...sty.input, flex: "1 1 200px" }} />
            <input value={fmt} onChange={e => setFmt(e.target.value)} placeholder="Data format (e.g. JSON, HL7)" style={{ ...sty.input, flex: "1 1 160px" }} />
            <input value={method} onChange={e => setMethod(e.target.value)} placeholder="Communication method" style={{ ...sty.input, flex: "1 1 160px" }} />
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description…" rows={2} style={{ ...sty.textarea, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} />
              Safety-relevant interface
            </label>
            <button onClick={addInterface} disabled={saving || !srcId || !tgtId || !name.trim()} style={sty.btn}>
              Add Interface
            </button>
          </div>
        </div>
      )}

      {interfaces.length === 0 ? (
        <div style={sty.emptyState}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>↔</div>
          <div style={{ fontWeight: 600 }}>No interfaces defined</div>
          <div style={{ color: "#78909c", marginTop: 4 }}>Add interfaces to define how components communicate.</div>
        </div>
      ) : (
        interfaces.map(iface => (
          <div key={iface.id} style={{ ...sty.panel, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Arrow diagram */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 300px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: TYPE_META["SUBSYSTEM"].color, background: TYPE_META["SUBSYSTEM"].bg, padding: "3px 8px", borderRadius: 4 }}>
                  {iface.source_component_name}
                </span>
                <span style={{ color: IFACE_TYPE_COLOR[iface.interface_type], fontSize: 16 }}>→</span>
                <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#e3f2fd", color: IFACE_TYPE_COLOR[iface.interface_type], fontWeight: 600 }}>
                  {iface.interface_type}
                </span>
                <span style={{ color: IFACE_TYPE_COLOR[iface.interface_type], fontSize: 16 }}>→</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: TYPE_META["SUBSYSTEM"].color, background: TYPE_META["SUBSYSTEM"].bg, padding: "3px 8px", borderRadius: 4 }}>
                  {iface.target_component_name}
                </span>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{iface.name}</span>
                {iface.description && <span style={{ fontSize: 12, color: "#78909c", marginLeft: 8 }}>{iface.description}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                {iface.safety_relevant && (
                  <span style={{ fontSize: 10, padding: "2px 6px", background: "#ffebee", color: "#b71c1c", borderRadius: 4, fontWeight: 600 }}>SAFETY</span>
                )}
                {iface.data_format && <span style={{ fontSize: 10, color: "#546e7a", background: "#f5f5f5", padding: "2px 6px", borderRadius: 3 }}>{iface.data_format}</span>}
                <span style={{ fontSize: 11, color: "#78909c" }}>{iface.data_flows.length} flow{iface.data_flows.length !== 1 ? "s" : ""}</span>
                <button onClick={() => setExpandedId(expandedId === iface.id ? null : iface.id)} style={sty.iconBtn} title="Data flows">⋯</button>
                <button onClick={() => deleteInterface(iface.id)} style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
              </div>
            </div>

            {/* Data flows */}
            {expandedId === iface.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#1a237e", marginBottom: 8 }}>Data Flows</div>
                {iface.data_flows.map(df => (
                  <div key={df.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f5f5f5", fontSize: 12 }}>
                    <span style={{ fontWeight: 500 }}>{df.data_name}</span>
                    {df.data_type && <span style={{ color: "#546e7a" }}>{df.data_type}</span>}
                    {df.frequency && <span style={{ color: "#78909c" }}>@ {df.frequency}</span>}
                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "#f5f5f5", color: CRITICALITY_COLOR[df.criticality as DataFlowCriticality] }}>
                      {df.criticality}
                    </span>
                    <button onClick={() => { api.architecture.deleteDataFlow(df.id); onRefresh(); }} style={{ ...sty.iconBtn, color: "#b71c1c", marginLeft: "auto" }}>✕</button>
                  </div>
                ))}
                {/* Add data flow */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <input value={dfName} onChange={e => setDfName(e.target.value)} placeholder="Data name *" style={{ ...sty.input, flex: "1 1 120px" }} />
                  <input value={dfType} onChange={e => setDfType(e.target.value)} placeholder="Type (e.g. int32)" style={{ ...sty.input, flex: "1 1 100px" }} />
                  <input value={dfFreq} onChange={e => setDfFreq(e.target.value)} placeholder="Frequency" style={{ ...sty.input, width: 100 }} />
                  <select value={dfCrit} onChange={e => setDfCrit(e.target.value as DataFlowCriticality)} style={{ ...sty.input, width: 100 }}>
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => addDataFlow(iface.id)} disabled={saving || !dfName.trim()} style={sty.btnSecondary}>
                    + Add Flow
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Add component form ────────────────────────────────────────────────────────

function AddComponentForm({
  projectId, components, onCreated,
}: {
  projectId: string;
  components: SWComponent[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ComponentType>("SUBSYSTEM");
  const [cls, setCls] = useState("A");
  const [desc, setDesc] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  const allowedParents = components.filter(c => {
    if (type === "SYSTEM") return false;
    if (type === "SUBSYSTEM") return c.component_type === "SYSTEM";
    if (type === "ITEM") return c.component_type === "SUBSYSTEM";
    if (type === "UNIT") return c.component_type === "ITEM" || c.component_type === "SUBSYSTEM";
    return false;
  });

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.architecture.createComponent({
        project_id: projectId,
        name: name.trim(), description: desc || null,
        component_type: type, safety_class: cls,
        parent_id: parentId || null,
      });
      setName(""); setDesc(""); setParentId("");
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/\d+: ([\s\S]*)/);
      try { alert(JSON.parse(m?.[1] ?? "{}").detail ?? msg); } catch { alert(msg); }
    } finally { setSaving(false); }
  }

  return (
    <div style={sty.addForm}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Add Component</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name *" style={{ ...sty.input, flex: "1 1 180px" }} />
        <select value={type} onChange={e => { setType(e.target.value as ComponentType); setParentId(""); }} style={{ ...sty.input, width: 120 }}>
          {["SYSTEM", "SUBSYSTEM", "ITEM", "UNIT"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={cls} onChange={e => setCls(e.target.value)} style={{ ...sty.input, width: 90 }}>
          {["A", "B", "C"].map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
        {type !== "SYSTEM" && (
          <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ ...sty.input, flex: "1 1 180px" }}>
            <option value="">— parent ({VALID_PARENT_TYPES[type]}) —</option>
            {allowedParents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ ...sty.input, flex: "2 1 200px" }} />
        <button onClick={handleCreate} disabled={!name.trim() || saving} style={sty.btn}>
          {saving ? "Adding…" : "+ Add"}
        </button>
      </div>
    </div>
  );
}

const VALID_PARENT_TYPES: Record<ComponentType, string> = {
  SYSTEM: "none", SUBSYSTEM: "SYSTEM", ITEM: "SUBSYSTEM", UNIT: "ITEM or SUBSYSTEM",
};

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ components, interfaces }: { components: SWComponent[]; interfaces: SWInterface[] }) {
  const byClass = { A: 0, B: 0, C: 0 };
  const byStatus = { DRAFT: 0, REVIEW: 0, APPROVED: 0 };
  for (const c of components) {
    byClass[c.safety_class as "A" | "B" | "C"]++;
    byStatus[c.status]++;
  }
  const noDesc = components.filter(c => !c.description).length;
  const safetyIfaces = interfaces.filter(i => i.safety_relevant).length;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
      {(["C", "B", "A"] as const).map(c => (
        <div key={c} style={{ ...sty.card, borderTop: `3px solid ${CLASS_COLOR[c]}` }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: CLASS_COLOR[c] }}>{byClass[c]}</div>
          <div style={{ fontSize: 12, color: "#546e7a" }}>Class {c}</div>
        </div>
      ))}
      <div style={{ ...sty.card, borderTop: "3px solid #1565c0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Status</div>
        {(["APPROVED", "REVIEW", "DRAFT"] as ComponentStatus[]).map(s => (
          <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
            <span style={{ color: STATUS_META[s].color }}>{s}</span>
            <span style={{ fontWeight: 600 }}>{byStatus[s]}</span>
          </div>
        ))}
      </div>
      <div style={{ ...sty.card, borderTop: "3px solid #1a237e" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#1a237e" }}>{interfaces.length}</div>
        <div style={{ fontSize: 12, color: "#546e7a" }}>Interfaces</div>
        <div style={{ fontSize: 11, color: "#b71c1c" }}>{safetyIfaces} safety-relevant</div>
      </div>
      {noDesc > 0 && (
        <div style={{ ...sty.card, borderTop: "3px solid #ff9800" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#e65100" }}>{noDesc}</div>
          <div style={{ fontSize: 12, color: "#546e7a" }}>Missing Description</div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ArchitecturePageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? (
    typeof window !== "undefined" ? localStorage.getItem("medsoft_active_project") ?? "" : ""
  );

  const [tree, setTree] = useState<SWComponentTreeNode[]>([]);
  const [flatComponents, setFlatComponents] = useState<SWComponent[]>([]);
  const [interfaces, setInterfaces] = useState<SWInterface[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tree" | "interfaces">("tree");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [t, fl, ifaces, reqs, rks, tcs] = await Promise.all([
        api.architecture.tree(projectId),
        api.architecture.listComponents(projectId),
        api.architecture.listInterfaces(projectId),
        api.requirements.list(projectId),
        api.risks.list(undefined, projectId),
        api.testcases.list(projectId),
      ]);
      setTree(t);
      setFlatComponents(fl);
      setInterfaces(ifaces);
      setRequirements(reqs);
      setRisks(rks);
      setTestcases(tcs);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("medsoft:project_changed", h);
    return () => window.removeEventListener("medsoft:project_changed", h);
  }, [load]);

  if (!projectId) {
    return (
      <div style={sty.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏗️</div>
        <div style={{ fontWeight: 600 }}>No project selected</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>Software Architecture</h1>
        <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
          IEC 62304 §5.3 / §5.4 — Hierarchical component design with interface definitions
        </p>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : (
        <>
          <SummaryCards components={flatComponents} interfaces={interfaces} />

          {tab === "tree" && (
            <AddComponentForm projectId={projectId} components={flatComponents} onCreated={load} />
          )}

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: 16, marginTop: 8 }}>
            {(["tree", "interfaces"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                ...sty.tabBtn,
                borderBottom: tab === t ? "2px solid #1a237e" : "2px solid transparent",
                color: tab === t ? "#1a237e" : "#546e7a",
                fontWeight: tab === t ? 600 : 400,
                fontSize: 14,
              }}>
                {t === "tree"
                  ? `Architecture Tree (${flatComponents.length})`
                  : `Interface Map (${interfaces.length})`}
              </button>
            ))}
          </div>

          {tab === "tree" && (
            tree.length === 0 ? (
              <div style={sty.emptyState}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📐</div>
                <div style={{ fontWeight: 600 }}>No components yet</div>
                <div style={{ color: "#78909c", marginTop: 4 }}>Start with a SYSTEM component, then add SUBSYSTEM and ITEM children.</div>
              </div>
            ) : (
              <div>
                {tree.map(root => (
                  <ComponentRow
                    key={root.id} node={root} depth={0}
                    interfaces={interfaces} requirements={requirements} risks={risks} testcases={testcases}
                    onRefresh={load}
                  />
                ))}
              </div>
            )
          )}

          {tab === "interfaces" && (
            <InterfaceMap
              projectId={projectId}
              interfaces={interfaces}
              components={flatComponents}
              onRefresh={load}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>}>
      <ArchitecturePageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sty = {
  compRow: {
    display: "flex" as const, alignItems: "center" as const, gap: 10,
    padding: "10px 12px", background: "#fff",
    border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: 2, cursor: "pointer" as const,
  },
  expandedPanel: {
    margin: "0 0 6px 0", padding: 16, background: "#fafafa",
    border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 6px 6px",
  },
  panel: {
    background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 14px",
  },
  addForm: {
    background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 14px", marginBottom: 8,
  },
  card: {
    background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 16px", minWidth: 90,
  },
  btn: {
    background: "#1a237e", color: "#fff", border: "none", borderRadius: 6,
    padding: "8px 14px", cursor: "pointer" as const, fontSize: 13, fontWeight: 500,
  },
  btnSmall: {
    background: "#eceff1", color: "#546e7a", border: "1px solid #cfd8dc",
    borderRadius: 5, padding: "5px 10px", cursor: "pointer" as const, fontSize: 12,
  },
  btnSecondary: {
    background: "#e8f5e9", color: "#1b5e20", border: "1px solid #c8e6c9",
    borderRadius: 5, padding: "6px 12px", cursor: "pointer" as const, fontSize: 12, fontWeight: 500,
  },
  btnGhost: {
    background: "transparent", color: "#546e7a", border: "1px solid #cfd8dc",
    borderRadius: 6, padding: "8px 12px", cursor: "pointer" as const, fontSize: 13,
  },
  iconBtn: {
    background: "transparent", border: "none", cursor: "pointer" as const,
    color: "#78909c", fontSize: 16, padding: "0 4px",
  },
  tabBtn: {
    background: "transparent", border: "none", padding: "10px 16px",
    cursor: "pointer" as const, fontSize: 13,
  },
  expander: {
    background: "transparent", border: "none", cursor: "pointer" as const,
    color: "#546e7a", fontSize: 14, padding: "0 4px", flexShrink: 0,
  },
  label: { display: "block" as const, fontSize: 12, fontWeight: 500, color: "#546e7a", marginBottom: 4 },
  input: {
    border: "1px solid #cfd8dc", borderRadius: 5, padding: "7px 10px",
    fontSize: 13, outline: "none" as const,
  },
  textarea: {
    width: "100%" as const, border: "1px solid #cfd8dc", borderRadius: 5,
    padding: "7px 10px", fontSize: 13, outline: "none" as const,
    resize: "vertical" as const, boxSizing: "border-box" as const,
  },
  emptyState: { textAlign: "center" as const, padding: "48px 24px", color: "#546e7a" },
};
