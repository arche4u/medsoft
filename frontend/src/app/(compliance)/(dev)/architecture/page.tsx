"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ArchitectureBaselineBar from "./ArchitectureBaselineBar";
import ArchitectureDiagrams from "./ArchitectureDiagrams";
import { downloadArchitecturePdf } from "./pdf";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import MermaidView from "@/components/MermaidView";
import { useActiveProject } from "@/lib/useActiveProject";
import {
  api,
  SWComponent, SWComponentTreeNode, SWInterface, SWDataFlow,
  ComponentType, ComponentStatus, InterfaceType, DataFlowCriticality,
  ArchCompliance, ArchComplianceCheck,
  ArchitectureBaseline, ArchitectureBaselineSummary,
  ComponentTypeInfo,
  Risk, Requirement, SystemTestCase,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

// The component-type taxonomy (names, parent rules, ordering, chip colours)
// is owned by the backend — fetched from GET /architecture/component-types and
// threaded down as `typeMeta` / `componentTypes` props. No hardcoded
// SYSTEM/SUBSYSTEM/ITEM/UNIT chain in this file.
type TypeMeta = { color: string; bg: string; indent: number };
const FALLBACK_TYPE_META: TypeMeta = { color: "#546e7a", bg: "#eceff1", indent: 0 };
// Neutral chip style for component-name chips in the Interface Map (the chip
// is not driven by the component's own type, so it doesn't use typeMeta).
const COMP_CHIP_STYLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#1565c0", background: "#e3f2fd",
  padding: "3px 8px", borderRadius: 4,
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

const MERMAID_STARTERS: Record<string, { label: string; code: string }> = {
  flowchart: {
    label: "Flowchart",
    code: "flowchart TD\n    Start --> Validate\n    Validate --> Process\n    Process --> Output",
  },
  sequence: {
    label: "Sequence",
    code: "sequenceDiagram\n    participant UI\n    participant Controller\n    participant Sensor\n    UI->>Controller: request\n    Controller->>Sensor: read\n    Sensor-->>Controller: value\n    Controller-->>UI: result",
  },
  state: {
    label: "State Machine",
    code: "stateDiagram-v2\n    [*] --> Idle\n    Idle --> Running: start\n    Running --> Idle: stop\n    Running --> Error: fault\n    Error --> Idle: reset",
  },
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
  component, requirements, risks, systemTests,
  onSave,
}: {
  component: SWComponent;
  requirements: Requirement[];
  risks: Risk[];
  systemTests: SystemTestCase[];
  onSave: (reqs: string[], rks: string[], tcs: string[]) => void;
}) {
  const [selReqs, setSelReqs] = useState<Set<string>>(new Set(component.requirement_ids));
  const [selRisks, setSelRisks] = useState<Set<string>>(new Set(component.risk_ids));
  const [selTCs, setSelTCs] = useState<Set<string>>(new Set(component.system_test_ids));

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
          title: "System Tests (§5.7)", items: systemTests,
          sel: selTCs, setFn: (s: Set<string>) => setSelTCs(s),
          render: (t: SystemTestCase) => <><span style={{ fontSize: 10, color: "#546e7a", marginRight: 4 }}>{t.test_type}</span>{t.name}</>,
        },
      ].map(({ title, items, sel, setFn, render }) => (
        <div key={title} style={{ ...sty.panel, flex: "1 1 200px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1a237e", marginBottom: 8 }}>
            {title} <span style={{ fontSize: 11, color: "#78909c" }}>({sel.size} selected)</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" as const, marginBottom: 8 }}>
            {items.length === 0
              ? <div style={{ fontSize: 12, color: "#90a4ae" }}>None in project</div>
              : (items as (Requirement | Risk | SystemTestCase)[]).map(item => (
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
  node, depth, interfaces, requirements, risks, systemTests,
  typeMeta, onRefresh,
}: {
  node: SWComponentTreeNode;
  depth: number;
  interfaces: SWInterface[];
  requirements: Requirement[];
  risks: Risk[];
  systemTests: SystemTestCase[];
  typeMeta: Record<string, TypeMeta>;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"info" | "trace" | "compliance" | "diagram" | "files">("info");
  const [compliance, setCompliance] = useState<ArchCompliance | null>(null);
  const [fullComp, setFullComp] = useState<SWComponent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editDesc, setEditDesc] = useState(node.description ?? "");
  const [editClass, setEditClass] = useState(node.safety_class);
  const [editRationale, setEditRationale] = useState("");
  const [approver, setApprover] = useState("");
  const [saving, setSaving] = useState(false);
  const [diagramDraft, setDiagramDraft] = useState("");
  const [diagramSaved, setDiagramSaved] = useState("");
  const [diagramSaving, setDiagramSaving] = useState(false);

  const tm = typeMeta[node.component_type] ?? FALLBACK_TYPE_META;
  const sm = STATUS_META[node.status];

  async function open() {
    if (!expanded) {
      const c = await api.architecture.getComponent(node.id);
      setFullComp(c);
      setEditRationale(c.rationale ?? "");
      setDiagramDraft(c.diagram_source ?? "");
      setDiagramSaved(c.diagram_source ?? "");
    }
    setExpanded(v => !v);
  }

  async function handleSaveDiagram() {
    setDiagramSaving(true);
    try {
      const updated = await api.architecture.updateComponent(node.id, { diagram_source: diagramDraft || null });
      setFullComp(updated);
      setDiagramSaved(updated.diagram_source ?? "");
    } finally { setDiagramSaving(false); }
  }

  async function loadCompliance() {
    const c = await api.architecture.compliance(node.id);
    setCompliance(c);
  }

  async function handleTabChange(t: "info" | "trace" | "compliance" | "diagram" | "files") {
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
        api.architecture.setSystemTests(node.id, tcs),
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
          <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: 14, flexWrap: "wrap" }}>
            {(["info", "trace", "compliance", "diagram", "files"] as const).map(t => (
              <button key={t} onClick={() => handleTabChange(t)} style={{
                ...sty.tabBtn,
                borderBottom: tab === t ? "2px solid #1a237e" : "2px solid transparent",
                color: tab === t ? "#1a237e" : "#546e7a", fontWeight: tab === t ? 600 : 400,
              }}>
                {t === "info" ? "Info & Interfaces"
                  : t === "trace" ? "Traceability"
                  : t === "compliance" ? "Compliance"
                  : t === "diagram" ? `📐 Diagram${diagramSaved ? " ●" : ""}`
                  : "📎 Files"}
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
                  { label: "System Tests (§5.7)", count: node.system_test_ids.length, color: "#1b5e20" },
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
              systemTests={systemTests}
              onSave={handleSaveTrace}
            />
          )}

          {tab === "compliance" && (
            compliance
              ? <CompliancePanel compliance={compliance} />
              : <div style={{ padding: 20, textAlign: "center", color: "#78909c" }}>Loading…</div>
          )}

          {tab === "diagram" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={sty.label}>Mermaid source</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {Object.entries(MERMAID_STARTERS).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => setDiagramDraft(v.code)} style={sty.btnGhost}
                        title={`Insert a ${v.label} starter template`}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={diagramDraft}
                  onChange={e => setDiagramDraft(e.target.value)}
                  readOnly={node.status === "APPROVED"}
                  rows={14}
                  placeholder={"Type Mermaid source here, or insert a starter template above.\n\nExample:\nflowchart TD\n  A --> B"}
                  style={{ ...sty.textarea, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  {node.status !== "APPROVED" && (
                    <button onClick={handleSaveDiagram} disabled={diagramSaving || diagramDraft === diagramSaved} style={sty.btn}>
                      {diagramSaving ? "Saving…" : diagramDraft === diagramSaved ? "Saved" : "Save diagram"}
                    </button>
                  )}
                  {diagramDraft && (
                    <button type="button" onClick={() => setDiagramDraft("")} style={sty.btnGhost} disabled={node.status === "APPROVED"}>
                      Clear
                    </button>
                  )}
                  <a href="https://mermaid.js.org/intro/" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1565c0", marginLeft: "auto" }}>
                    Mermaid docs ↗
                  </a>
                </div>
              </div>
              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                <label style={sty.label}>Preview</label>
                {diagramDraft.trim()
                  ? <MermaidView source={diagramDraft} containerStyle={{ padding: 10, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }} />
                  : <div style={{ fontSize: 12, color: "#90a4ae", padding: 14, background: "#fafafa", border: "1px dashed #cfd8dc", borderRadius: 6 }}>
                      No diagram yet. Insert a starter template or type Mermaid source on the left.
                    </div>}
              </div>
            </div>
          )}

          {tab === "files" && fullComp && (
            <AttachmentsPanel
              projectId={fullComp.project_id}
              entityType="sw_component"
              entityId={node.id}
              readonly={node.status === "APPROVED"}
            />
          )}
        </div>
      )}

      {/* Children */}
      {node.children.map(child => (
        <ComponentRow
          key={child.id} node={child} depth={depth + 1}
          interfaces={interfaces} requirements={requirements} risks={risks} systemTests={systemTests}
          typeMeta={typeMeta} onRefresh={onRefresh}
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

  // Inline-edit state for an existing interface
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eType, setEType] = useState<InterfaceType>("API");
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eFmt, setEFmt] = useState("");
  const [eMethod, setEMethod] = useState("");
  const [eSafety, setESafety] = useState(false);

  function startEdit(iface: SWInterface) {
    setEditingId(iface.id);
    setEType(iface.interface_type);
    setEName(iface.name);
    setEDesc(iface.description ?? "");
    setEFmt(iface.data_format ?? "");
    setEMethod(iface.communication_method ?? "");
    setESafety(iface.safety_relevant);
    setExpandedId(null);
  }

  async function saveEdit(id: string) {
    if (!eName.trim()) return;
    setSaving(true);
    try {
      await api.architecture.updateInterface(id, {
        interface_type: eType, name: eName.trim(), description: eDesc || null,
        data_format: eFmt || null, communication_method: eMethod || null, safety_relevant: eSafety,
      });
      setEditingId(null);
      onRefresh();
    } finally { setSaving(false); }
  }

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
            {editingId === iface.id ? (
              /* ── Inline edit form ───────────────────────────────── */
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={COMP_CHIP_STYLE}>
                    {iface.source_component_name}
                  </span>
                  <span style={{ color: "#90a4ae", fontSize: 16 }}>→</span>
                  <span style={COMP_CHIP_STYLE}>
                    {iface.target_component_name}
                  </span>
                  <span style={{ fontSize: 11, color: "#90a4ae" }}>(endpoints can&apos;t change — delete &amp; re-add to repoint)</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <select value={eType} onChange={e => setEType(e.target.value as InterfaceType)} style={{ ...sty.input, width: 110 }}>
                    {["DATA", "CONTROL", "API", "SIGNAL"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input value={eName} onChange={e => setEName(e.target.value)} placeholder="Interface name *" style={{ ...sty.input, flex: "1 1 200px" }} />
                  <input value={eFmt} onChange={e => setEFmt(e.target.value)} placeholder="Data format" style={{ ...sty.input, flex: "1 1 140px" }} />
                  <input value={eMethod} onChange={e => setEMethod(e.target.value)} placeholder="Communication method" style={{ ...sty.input, flex: "1 1 160px" }} />
                </div>
                <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} placeholder="Description…" rows={2} style={{ ...sty.textarea, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={eSafety} onChange={e => setESafety(e.target.checked)} />
                    Safety-relevant interface
                  </label>
                  <button onClick={() => saveEdit(iface.id)} disabled={saving || !eName.trim()} style={sty.btn}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingId(null)} style={sty.btnGhost}>Cancel</button>
                </div>
              </div>
            ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Arrow diagram */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 300px" }}>
                <span style={COMP_CHIP_STYLE}>
                  {iface.source_component_name}
                </span>
                <span style={{ color: IFACE_TYPE_COLOR[iface.interface_type], fontSize: 16 }}>→</span>
                <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#e3f2fd", color: IFACE_TYPE_COLOR[iface.interface_type], fontWeight: 600 }}>
                  {iface.interface_type}
                </span>
                <span style={{ color: IFACE_TYPE_COLOR[iface.interface_type], fontSize: 16 }}>→</span>
                <span style={COMP_CHIP_STYLE}>
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
                <button onClick={() => startEdit(iface)} style={sty.iconBtn} title="Edit interface">✎</button>
                <button onClick={() => setExpandedId(expandedId === iface.id ? null : iface.id)} style={sty.iconBtn} title="Data flows">⋯</button>
                <button onClick={() => deleteInterface(iface.id)} style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
              </div>
            </div>
            )}

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
  projectId, components, componentTypes, onCreated,
}: {
  projectId: string;
  components: SWComponent[];
  componentTypes: ComponentTypeInfo[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [cls, setCls] = useState("A");
  const [desc, setDesc] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  // Default the type selector to the first non-root type once the taxonomy
  // loads (mirrors the previous "SUBSYSTEM" default without hardcoding it).
  useEffect(() => {
    if (!type && componentTypes.length > 0) {
      const firstChild = componentTypes.find(t => t.parents.length > 0) ?? componentTypes[0];
      setType(firstChild.name);
    }
  }, [componentTypes, type]);

  const selectedType = componentTypes.find(t => t.name === type);
  const allowedParentTypes = selectedType?.parents ?? [];
  const isRootType = !!selectedType && allowedParentTypes.length === 0;
  const allowedParents = components.filter(c => allowedParentTypes.includes(c.component_type));
  const parentHint = allowedParentTypes.length ? allowedParentTypes.join(" or ") : "none";

  async function handleCreate() {
    if (!name.trim() || !type) return;
    setSaving(true);
    try {
      await api.architecture.createComponent({
        project_id: projectId,
        name: name.trim(), description: desc || null,
        component_type: type as ComponentType, safety_class: cls,
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
        <select value={type} onChange={e => { setType(e.target.value); setParentId(""); }} style={{ ...sty.input, width: 120 }}>
          {componentTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <select value={cls} onChange={e => setCls(e.target.value)} style={{ ...sty.input, width: 90 }}>
          {["A", "B", "C"].map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
        {!isRootType && (
          <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ ...sty.input, flex: "1 1 180px" }}>
            <option value="">— parent ({parentHint}) —</option>
            {allowedParents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ ...sty.input, flex: "2 1 200px" }} />
        <button onClick={handleCreate} disabled={!name.trim() || !type || saving} style={sty.btn}>
          {saving ? "Adding…" : "+ Add"}
        </button>
      </div>
    </div>
  );
}

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
  // Shared project context — reads localStorage + follows sidebar switches.
  // A URL ?project= deep-link still overrides it (see effect below).
  const [projectId, setProjectId] = useActiveProject();

  const [tree, setTree] = useState<SWComponentTreeNode[]>([]);
  const [flatComponents, setFlatComponents] = useState<SWComponent[]>([]);
  const [interfaces, setInterfaces] = useState<SWInterface[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [systemTests, setSystemTests] = useState<SystemTestCase[]>([]);
  // Component-type taxonomy from the backend (single source of truth).
  const [componentTypes, setComponentTypes] = useState<ComponentTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tree" | "interfaces" | "diagrams">("tree");
  const [error, setError] = useState<string | null>(null);
  // Architecture baseline state — populated by ArchitectureBaselineBar via onState
  const [archBaselineSummaries, setArchBaselineSummaries] = useState<ArchitectureBaselineSummary[]>([]);
  const [archBaselineDetail, setArchBaselineDetail] = useState<ArchitectureBaseline | null>(null);
  // Bumped on every page reload so the baseline bar refetches its detail —
  // keeps the PDF / counts in sync after a component or interface changes.
  const [archReloadKey, setArchReloadKey] = useState(0);

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
        api.systemTesting.list(projectId),
      ]);
      setTree(t);
      setFlatComponents(fl);
      setInterfaces(ifaces);
      setRequirements(reqs);
      setRisks(rks);
      setSystemTests(tcs);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setArchReloadKey(k => k + 1);
    }
  }, [projectId]);

  // URL ?project= deep-link overrides the shared context (and persists it).
  useEffect(() => {
    const fromUrl = searchParams.get("project");
    if (fromUrl && fromUrl !== projectId) setProjectId(fromUrl);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload whenever the resolved project changes.
  useEffect(() => { load(); }, [load]);

  // Component-type taxonomy is project-independent — fetch once.
  useEffect(() => {
    api.architecture.componentTypes().then(setComponentTypes).catch(() => {});
  }, []);

  // Derive the typeMeta lookup (color/bg/indent by type name) from the taxonomy.
  const typeMeta: Record<string, TypeMeta> = {};
  for (const t of componentTypes) {
    typeMeta[t.name] = { color: t.color, bg: t.bg, indent: t.order * 20 };
  }

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
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>Software Architecture</h1>
          <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
            IEC 62304 §5.3 / §5.4 — Hierarchical component design with interface definitions
          </p>
        </div>
        {archBaselineDetail && (
          <button
            onClick={() => downloadArchitecturePdf(archBaselineDetail, "", archBaselineSummaries)}
            title="Download the Software Architecture Document as PDF"
            style={{
              background: "#fff", color: "#4a148c",
              border: "1px solid #ce93d8", borderRadius: 6,
              padding: "6px 14px", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
            }}
          >
            ⬇ Architecture PDF
          </button>
        )}
      </div>

      <ArchitectureBaselineBar
        projectId={projectId}
        reloadKey={archReloadKey}
        onMutated={load}
        onState={s => { setArchBaselineSummaries(s.baselines); setArchBaselineDetail(s.detail); }}
      />

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : (
        <>
          <SummaryCards components={flatComponents} interfaces={interfaces} />

          {tab === "tree" && (
            <AddComponentForm projectId={projectId} components={flatComponents} componentTypes={componentTypes} onCreated={load} />
          )}

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: 16, marginTop: 8 }}>
            {(["tree", "interfaces", "diagrams"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                ...sty.tabBtn,
                borderBottom: tab === t ? "2px solid #1a237e" : "2px solid transparent",
                color: tab === t ? "#1a237e" : "#546e7a",
                fontWeight: tab === t ? 600 : 400,
                fontSize: 14,
              }}>
                {t === "tree"
                  ? `Architecture Tree (${flatComponents.length})`
                  : t === "interfaces"
                    ? `Interface Map (${interfaces.length})`
                    : `Diagrams`}
              </button>
            ))}
          </div>
          {tab === "diagrams" && (
            <ArchitectureDiagrams components={flatComponents} interfaces={interfaces} />
          )}

          {tab === "tree" && (
            tree.length === 0 ? (
              <div style={sty.emptyState}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📐</div>
                <div style={{ fontWeight: 600 }}>No components yet for this project</div>
                <div style={{ color: "#78909c", marginTop: 4 }}>
                  Start with a SYSTEM component, then add SUBSYSTEM and ITEM children.
                </div>
                <div style={{ color: "#90a4ae", marginTop: 12, fontSize: 12 }}>
                  If you just re-seeded the database, your active project ID may be stale.{" "}
                  <a href="/projects" style={{ color: "#1565c0", textDecoration: "underline" }}>Pick a project</a>{" "}
                  to refresh the selection.
                </div>
              </div>
            ) : (
              <div>
                {tree.map(root => (
                  <ComponentRow
                    key={root.id} node={root} depth={0}
                    interfaces={interfaces} requirements={requirements} risks={risks} systemTests={systemTests}
                    typeMeta={typeMeta} onRefresh={load}
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
