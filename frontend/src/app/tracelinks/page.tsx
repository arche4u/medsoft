"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, Project, Requirement, TestCase, TraceLink, Risk } from "@/lib/api";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const RISK_META: Record<RiskLevel, { color: string; bg: string }> = {
  HIGH:   { color: "#b71c1c", bg: "#ffebee" },
  MEDIUM: { color: "#e65100", bg: "#fff3e0" },
  LOW:    { color: "#2e7d32", bg: "#e8f5e9" },
};

const TYPE_COLOR: Record<string, string> = {
  USER:     "#1565c0",
  SYSTEM:   "#6a1b9a",
  SOFTWARE: "#1b5e20",
};

const TYPE_BG: Record<string, string> = {
  USER:     "#e3f2fd",
  SYSTEM:   "#f3e5f5",
  SOFTWARE: "#e8f5e9",
};

// ── ID chip ───────────────────────────────────────────────────────────────────
function IdChip({ req, size = 12, onClick }: { req: Requirement; size?: number; onClick?: () => void }) {
  const color = TYPE_COLOR[req.type] ?? "#546e7a";
  const bg    = TYPE_BG[req.type]    ?? "#f5f5f5";
  return (
    <span
      onClick={onClick}
      title={onClick ? `Click to open impact spider for ${req.readable_id}` : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        background: bg, border: `1px solid ${color}30`,
        borderRadius: 4, padding: "1px 6px",
        fontFamily: "monospace", fontWeight: 700, fontSize: size,
        color, whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        textDecoration: onClick ? "underline" : "none",
        textDecorationColor: color + "60",
      }}
    >
      {req.readable_id}
    </span>
  );
}

// ── Inline test-link panel (shown when a req is focused) ─────────────────────
function InlineLinkPanel({ req, testcases, tracelinks, onLink, onClose }: {
  req: Requirement;
  testcases: TestCase[];
  tracelinks: TraceLink[];
  onLink: (tcId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [tcId,    setTcId]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const panelRef = useRef<HTMLTableRowElement>(null);

  const linkedTcIds  = new Set(tracelinks.filter(l => l.requirement_id === req.id).map(l => l.testcase_id));
  const linkedTcs    = testcases.filter(tc => linkedTcIds.has(tc.id));
  const availableTcs = testcases.filter(tc => !linkedTcIds.has(tc.id));

  // Scroll panel into view on open
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!tcId) return;
    setSaving(true); setMsg("");
    try {
      await onLink(tcId);
      setTcId("");
      setMsg("✓ Test case linked successfully.");
    } catch (err: any) {
      setMsg("✗ " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const color = TYPE_COLOR[req.type] ?? "#546e7a";
  const bg    = TYPE_BG[req.type]    ?? "#f5f5f5";

  return (
    <tr ref={panelRef}>
      <td colSpan={8} style={{ padding: 0, borderBottom: "2px solid " + color }}>
        <div style={{
          padding: "14px 18px",
          background: "linear-gradient(135deg, " + bg + "cc, #fff)",
          borderLeft: "4px solid " + color,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontFamily: "monospace", fontWeight: 800, fontSize: 14, color,
                  background: bg, border: `1px solid ${color}40`,
                  borderRadius: 4, padding: "2px 8px",
                }}>{req.readable_id}</span>
                <span style={{
                  background: color, color: "#fff", borderRadius: 3,
                  padding: "1px 7px", fontSize: 10, fontWeight: 700,
                }}>{req.type}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{req.title}</div>
              {req.description && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>{req.description}</div>
              )}
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, color: "#999", lineHeight: 1, padding: "2px 6px",
            }} title="Close">✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Existing linked test cases */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Currently Linked Test Cases ({linkedTcs.length})
              </div>
              {linkedTcs.length === 0 ? (
                <div style={{
                  padding: "10px 12px", background: "#fff8e1",
                  border: "1px dashed #ffca28", borderRadius: 6,
                  fontSize: 12, color: "#f57f17",
                }}>
                  ⚠ No test cases linked — this {req.type} requirement has no verification coverage.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {linkedTcs.map(tc => (
                    <div key={tc.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", background: "#f1f8e9",
                      border: "1px solid #c8e6c9", borderRadius: 5,
                    }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#1b5e20" }}>
                        {tc.readable_id ?? "TC-?"}
                      </span>
                      <span style={{ fontSize: 12, color: "#33691e", flex: 1 }}>{tc.title}</span>
                      <span style={{ fontSize: 11, color: "#2e7d32" }}>✓ Linked</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new test case */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Link a Test Case
              </div>
              {availableTcs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                  All test cases are already linked.
                </div>
              ) : (
                <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <select
                    value={tcId}
                    onChange={e => setTcId(e.target.value)}
                    style={{ ...inputStyle, fontSize: 13 }}
                    required
                  >
                    <option value="">— Select test case to link *</option>
                    {availableTcs.map(tc => (
                      <option key={tc.id} value={tc.id}>
                        {tc.readable_id ? `${tc.readable_id} — ` : ""}{tc.title}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="submit"
                      disabled={saving || !tcId}
                      style={{ ...btnStyle, background: color }}
                    >
                      {saving ? "Linking…" : "Link Test Case →"}
                    </button>
                    {msg && (
                      <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#2e7d32" : "#b71c1c" }}>
                        {msg}
                      </span>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Matrix row ────────────────────────────────────────────────────────────────
function MatrixRow({ req, reqById, risks, tracelinks, allTcs, isEven, isFocused, onFocus, onSpider }: {
  req: Requirement;
  reqById: Record<string, Requirement>;
  risks: Risk[];
  tracelinks: TraceLink[];
  allTcs: TestCase[];
  isEven: boolean;
  isFocused: boolean;
  onFocus: (id: string | null) => void;
  onSpider: (id: string) => void;
}) {
  const parent      = req.parent_id ? reqById[req.parent_id] : null;
  const children    = Object.values(reqById).filter(r => r.parent_id === req.id);
  const linkedRisks = risks.filter(r => r.requirement_id === req.id);
  const linkedTcIds = new Set(tracelinks.filter(l => l.requirement_id === req.id).map(l => l.testcase_id));
  const linkedTcs   = allTcs.filter(tc => linkedTcIds.has(tc.id));
  const typeColor   = TYPE_COLOR[req.type] ?? "#546e7a";

  const needsCoverage = req.type === "SOFTWARE" && linkedTcs.length === 0;
  const rowBg = isFocused
    ? (TYPE_BG[req.type] ?? "#fff8e1")
    : isEven ? "#fafafa" : "#fff";

  return (
    <tr
      style={{
        background: rowBg,
        outline: isFocused ? `2px solid ${typeColor}` : "none",
        outlineOffset: -1,
        transition: "background 0.2s",
      }}
    >
      {/* ID — click to open spider */}
      <td style={{ ...td, minWidth: 90, whiteSpace: "nowrap" }}>
        <IdChip req={req} size={12} onClick={() => onSpider(req.id)} />
      </td>

      {/* Type */}
      <td style={{ ...td, minWidth: 88 }}>
        <span style={{
          background: typeColor, color: "#fff", borderRadius: 3,
          padding: "2px 7px", fontSize: 10, fontWeight: 700,
        }}>{req.type}</span>
      </td>

      {/* Title */}
      <td style={{ ...td, maxWidth: 220 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{req.title}</div>
      </td>

      {/* Uplink */}
      <td style={{ ...td, minWidth: 130 }}>
        {parent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <IdChip req={parent} size={11} onClick={() => onSpider(parent.id)} />
            <span style={{ fontSize: 10, color: "#888", lineHeight: 1.3 }}>
              {parent.title.length > 36 ? parent.title.slice(0, 36) + "…" : parent.title}
            </span>
          </div>
        ) : (
          <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
        )}
      </td>

      {/* Downlinks */}
      <td style={{ ...td, minWidth: 160 }}>
        {children.length === 0 ? (
          <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {children.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <IdChip req={c} size={11} onClick={() => onSpider(c.id)} />
                <span style={{ fontSize: 10, color: "#888", lineHeight: 1.4 }}>
                  {c.title.length > 32 ? c.title.slice(0, 32) + "…" : c.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Risks */}
      <td style={{ ...td, minWidth: 130 }}>
        {linkedRisks.length === 0 ? (
          <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {linkedRisks.map(r => (
              <span key={r.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10, fontWeight: 700,
                color: RISK_META[r.risk_level as RiskLevel]?.color ?? "#555",
                background: RISK_META[r.risk_level as RiskLevel]?.bg ?? "#f5f5f5",
                borderRadius: 3, padding: "2px 5px", whiteSpace: "nowrap",
              }}>
                ⚠ {r.risk_level}
                <span style={{ fontWeight: 400, color: "#555" }}>
                  — {r.hazard.length > 24 ? r.hazard.slice(0, 24) + "…" : r.hazard}
                </span>
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Test Cases */}
      <td style={{ ...td, minWidth: 160 }}>
        {linkedTcs.length === 0 ? (
          <span style={{ color: req.type === "SOFTWARE" ? "#ef5350" : "#ccc", fontSize: 12 }}>
            {req.type === "SOFTWARE" ? "⚠ No coverage" : "—"}
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {linkedTcs.map(tc => (
              <span key={tc.id} style={{
                fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                color: "#1565c0", whiteSpace: "nowrap",
              }}>
                {tc.readable_id ?? "TC-?"}
                <span style={{ fontFamily: "inherit", fontWeight: 400, color: "#555", marginLeft: 4 }}>
                  {tc.title.length > 28 ? tc.title.slice(0, 28) + "…" : tc.title}
                </span>
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Status + action */}
      <td style={{ ...td, textAlign: "center", minWidth: 100 }}>
        {needsCoverage ? (
          <button
            onClick={() => onFocus(isFocused ? null : req.id)}
            style={{
              padding: "3px 10px", fontSize: 11, fontWeight: 700,
              borderRadius: 4, cursor: "pointer",
              background: isFocused ? "#e8f5e9" : "#fff3e0",
              border: `1px solid ${isFocused ? "#66bb6a" : "#ffb300"}`,
              color: isFocused ? "#2e7d32" : "#e65100",
            }}
            title="Click to link a test case to this requirement"
          >
            {isFocused ? "▲ Linking" : "+ Add TC"}
          </button>
        ) : (() => {
          const hasRisk   = linkedRisks.length > 0;
          const mitigated = linkedRisks.every(r => r.mitigation);
          if (req.type === "SOFTWARE" && (!hasRisk || mitigated))
            return <span style={{ color: "#2e7d32", fontSize: 12, fontWeight: 700 }}>✓ OK</span>;
          if (hasRisk && !mitigated)
            return <span style={{ color: "#b71c1c", fontSize: 11, fontWeight: 600 }}>Risk open</span>;
          return <span style={{ color: "#bbb", fontSize: 12 }}>—</span>;
        })()}
      </td>
    </tr>
  );
}

// ── Impact Spider Modal ───────────────────────────────────────────────────────
const SP_NW = 148, SP_NH = 34;

function spEdgePt(cx: number, cy: number, dx: number, dy: number): [number, number] {
  const hw = SP_NW / 2 + 2, hh = SP_NH / 2 + 2;
  if (dx === 0 && dy === 0) return [cx, cy];
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / len, ny = dy / len;
  const tx = nx !== 0 ? hw / Math.abs(nx) : Infinity;
  const ty = ny !== 0 ? hh / Math.abs(ny) : Infinity;
  return [cx + nx * Math.min(tx, ty), cy + ny * Math.min(tx, ty)];
}

interface SpNode {
  id: string; label: string; sub?: string;
  cx: number; cy: number;
  color: string; bg: string; border: string;
  navigateTo?: string;
}

function ImpactSpiderModal({ req, reqById, risks, tracelinks, testcases, onNavigate, onClose }: {
  req: Requirement;
  reqById: Record<string, Requirement>;
  risks: Risk[];
  tracelinks: TraceLink[];
  testcases: TestCase[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const [designEls,  setDesignEls]  = useState<{ id: string; type: string; readable_id: string | null; title: string }[]>([]);
  const [designErr,  setDesignErr]  = useState("");
  useEffect(() => {
    setDesignEls([]); setDesignErr("");
    api.impact.analyze(req.id)
      .then(r => setDesignEls(r.linked_design_elements))
      .catch(e => setDesignErr(String(e.message ?? e)));
  }, [req.id]);

  const W = 740, H = 410, CX = 370, CY = 205;
  const color = TYPE_COLOR[req.type] ?? "#546e7a";
  const bg    = TYPE_BG[req.type]   ?? "#f5f5f5";

  const parent   = req.parent_id ? reqById[req.parent_id] : null;
  const children = Object.values(reqById).filter(r => r.parent_id === req.id).slice(0, 4);
  const myRisks  = risks.filter(r => r.requirement_id === req.id).slice(0, 4);
  const linkedTcIds = new Set(tracelinks.filter(l => l.requirement_id === req.id).map(l => l.testcase_id));
  const myTcs    = testcases.filter(tc => linkedTcIds.has(tc.id)).slice(0, 4);
  const myDesign = designEls.slice(0, 3);

  const nodes: SpNode[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; stroke: string; dashed?: boolean }[] = [];

  function addEdge(ax: number, ay: number, bx: number, by: number, stroke: string, dashed?: boolean) {
    const dx = bx - ax, dy = by - ay;
    const [x1, y1] = spEdgePt(ax, ay,  dx,  dy);
    const [x2, y2] = spEdgePt(bx, by, -dx, -dy);
    edges.push({ x1, y1, x2, y2, stroke, dashed });
  }

  if (parent) {
    const pcx = CX, pcy = 52;
    nodes.push({ id: parent.id, label: parent.readable_id, sub: parent.title,
      cx: pcx, cy: pcy, color: TYPE_COLOR[parent.type] ?? "#555",
      bg: TYPE_BG[parent.type] ?? "#f5f5f5", border: (TYPE_COLOR[parent.type] ?? "#aaa") + "70",
      navigateTo: parent.id });
    addEdge(CX, CY, pcx, pcy, (TYPE_COLOR[parent.type] ?? "#aaa") + "90");
  }

  myRisks.forEach((r, i) => {
    const rcx = 78, rcy = CY + (i - (myRisks.length - 1) / 2) * 56;
    const rm = RISK_META[r.risk_level as RiskLevel] ?? { color: "#555", bg: "#f5f5f5" };
    const riskId = `RSK-${String(i + 1).padStart(2, "0")}`;
    nodes.push({ id: r.id, label: riskId, sub: `${r.risk_level} · ${r.hazard}`,
      cx: rcx, cy: rcy, color: rm.color, bg: rm.bg, border: rm.color + "60" });
    addEdge(CX, CY, rcx, rcy, rm.color + "70");
  });

  myTcs.forEach((tc, i) => {
    const tcx = 662, tcy = CY + (i - (myTcs.length - 1) / 2) * 56;
    nodes.push({ id: tc.id, label: tc.readable_id ?? `TC-${String(i + 1).padStart(2, "0")}`, sub: tc.title,
      cx: tcx, cy: tcy, color: "#1565c0", bg: "#e3f2fd", border: "#90caf9" });
    addEdge(CX, CY, tcx, tcy, "#64b5f670");
  });

  myDesign.forEach((de, i) => {
    const dcx = 590, dcy = 52 + i * 52;
    const deLabel = de.readable_id ?? (de.type === "ARCHITECTURE" ? "ARCH" : "DETAIL");
    nodes.push({ id: de.id, label: deLabel, sub: de.title,
      cx: dcx, cy: dcy, color: "#4e342e", bg: "#efebe9", border: "#bcaaa4" });
    addEdge(CX, CY, dcx, dcy, "#bcaaa480", true);
  });

  const childGap = Math.min(160, children.length > 1 ? 580 / (children.length - 1) : 0);
  children.forEach((c, i) => {
    const ccx = children.length === 1 ? CX : CX - (children.length - 1) * childGap / 2 + i * childGap;
    const ccy = 370;
    nodes.push({ id: c.id, label: c.readable_id, sub: c.title,
      cx: ccx, cy: ccy, color: TYPE_COLOR[c.type] ?? "#555",
      bg: TYPE_BG[c.type] ?? "#f5f5f5", border: (TYPE_COLOR[c.type] ?? "#aaa") + "70",
      navigateTo: c.id });
    addEdge(CX, CY, ccx, ccy, (TYPE_COLOR[c.type] ?? "#aaa") + "90");
  });

  const empty = !parent && !myRisks.length && !myTcs.length && !myDesign.length && !children.length;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#00000090",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, boxShadow: "0 12px 40px #0005",
        maxWidth: 780, width: "calc(100% - 32px)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: bg, borderBottom: "1px solid " + color + "30" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15, color }}>{req.readable_id}</span>
          <span style={{ background: color, color: "#fff", borderRadius: 3, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{req.type}</span>
          <span style={{ flex: 1, fontSize: 13, color: "#374151", fontWeight: 600 }}>{req.title}</span>
          <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", marginRight: 8 }}>Impact Spider</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", lineHeight: 1 }}>✕</button>
        </div>

        {/* SVG Canvas */}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          <defs>
            <marker id="sp-arr" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <path d="M0,0 L8,2.5 L0,5 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke={e.stroke} strokeWidth={1.5}
              strokeDasharray={e.dashed ? "5,4" : undefined}
              markerEnd="url(#sp-arr)" />
          ))}

          {/* Satellite nodes */}
          {nodes.map(n => (
            <g key={n.id}
              onClick={n.navigateTo ? () => onNavigate(n.navigateTo!) : undefined}
              style={{ cursor: n.navigateTo ? "pointer" : "default" }}>
              <rect x={n.cx - SP_NW/2} y={n.cy - SP_NH/2} width={SP_NW} height={SP_NH}
                rx={6} fill={n.bg} stroke={n.border} strokeWidth={1.5} />
              <text x={n.cx} y={n.cy - (n.sub ? 5 : 0)}
                textAnchor="middle" dominantBaseline="middle"
                fill={n.color} fontSize={10} fontWeight={700} fontFamily="monospace"
                style={{ pointerEvents: "none" }}>
                {n.label.length > 17 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
              {n.sub && (
                <text x={n.cx} y={n.cy + 8}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={n.color} fontSize={8.5} fontFamily="sans-serif" opacity={0.8}
                  style={{ pointerEvents: "none" }}>
                  {n.sub.length > 22 ? n.sub.slice(0, 22) + "…" : n.sub}
                </text>
              )}
              {n.navigateTo && (
                <rect x={n.cx - SP_NW/2} y={n.cy - SP_NH/2} width={SP_NW} height={SP_NH}
                  rx={6} fill="transparent" stroke={n.color} strokeWidth={0}
                  style={{ filter: "drop-shadow(0 0 3px " + n.color + "44)" }} />
              )}
            </g>
          ))}

          {/* Center node (drawn last) */}
          <rect x={CX - SP_NW/2 - 6} y={CY - SP_NH/2 - 8} width={SP_NW + 12} height={SP_NH + 16}
            rx={8} fill={bg} stroke={color} strokeWidth={2.5} />
          <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle"
            fill={color} fontSize={13} fontWeight={800} fontFamily="monospace" style={{ pointerEvents: "none" }}>
            {req.readable_id}
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" dominantBaseline="middle"
            fill={color} fontSize={8.5} fontFamily="sans-serif" opacity={0.85} style={{ pointerEvents: "none" }}>
            {req.title.length > 30 ? req.title.slice(0, 30) + "…" : req.title}
          </text>

          {/* Zone labels */}
          {parent        && <text x={CX}  y={14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700} letterSpacing={1}>PARENT</text>}
          {myRisks.length > 0 && <text x={78}  y={14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700} letterSpacing={1}>RISKS</text>}
          {myTcs.length > 0   && <text x={662} y={14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700} letterSpacing={1}>TEST CASES</text>}
          {myDesign.length > 0 && <text x={590} y={14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700} letterSpacing={1}>DESIGN</text>}
          {children.length > 0 && <text x={CX}  y={H - 6} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700} letterSpacing={1}>CHILDREN</text>}

          {empty && (
            <text x={CX} y={CY + 60} textAnchor="middle" fontSize={12} fill="#cbd5e1">
              No linked items found for this requirement
            </text>
          )}
        </svg>

        {/* Footer */}
        <div style={{ padding: "9px 18px", borderTop: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {designErr && <span style={{ color: "#b71c1c" }}>⚠ Design fetch error: {designErr}</span>}
          <span>Click <b>parent</b> or <b>child</b> nodes to explore · Click backdrop or ✕ to close</span>
          <span style={{ marginLeft: "auto" }}>
            {[
              parent ? "↑ parent" : null,
              children.length ? `↓ ${children.length} child${children.length > 1 ? "ren" : ""}` : null,
              myRisks.length  ? `⚠ ${myRisks.length} risk${myRisks.length > 1 ? "s" : ""}` : null,
              myTcs.length    ? `✓ ${myTcs.length} TC${myTcs.length > 1 ? "s" : ""}` : null,
              myDesign.length ? `□ ${myDesign.length} design` : null,
            ].filter(Boolean).join(" · ") || "No links"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Group header ──────────────────────────────────────────────────────────────
function GroupHeader({ type, count, colSpan }: { type: string; count: number; colSpan: number }) {
  const color = TYPE_COLOR[type] ?? "#546e7a";
  const bg    = TYPE_BG[type]    ?? "#f5f5f5";
  return (
    <tr>
      <td colSpan={colSpan} style={{
        padding: "7px 12px", background: bg,
        borderBottom: `2px solid ${color}`, borderTop: "1px solid #e5e7eb",
      }}>
        <span style={{ fontWeight: 800, fontSize: 12, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {type} Requirements
        </span>
        <span style={{
          marginLeft: 8, background: color, color: "#fff",
          borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700,
        }}>{count}</span>
        {type === "USER"     && <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>→ allocates to SYSTEM</span>}
        {type === "SYSTEM"   && <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>↑ from USER · → refines to SOFTWARE</span>}
        {type === "SOFTWARE" && <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>↑ from SYSTEM · → verified by Test Cases</span>}
      </td>
    </tr>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────
function TraceMatrixInner() {
  const params    = useSearchParams();
  const router    = useRouter();

  const [projects,     setProjects]     = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testcases,    setTestcases]    = useState<TestCase[]>([]);
  const [tracelinks,   setTracelinks]   = useState<TraceLink[]>([]);
  const [risks,        setRisks]        = useState<Risk[]>([]);
  const [projectId,    setProjectId]    = useActiveProject();
  const [typeFilter,   setTypeFilter]   = useState<string>("ALL");
  const [spiderReqId,  setSpiderReqId]  = useState<string | null>(null);

  // focused requirement — from URL param or click
  const focusedReqId = params.get("req_id") ?? null;

  function setFocus(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("req_id", id);
    else url.searchParams.delete("req_id");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async (pid: string) => {
    const [reqs, tcs, tls, rks] = await Promise.all([
      api.requirements.list(pid),
      api.testcases.list(pid),
      api.tracelinks.list(),
      api.risks.list(undefined, pid),
    ]);
    setRequirements(reqs);
    setTestcases(tcs);
    setTracelinks(tls.filter(l => reqs.some(r => r.id === l.requirement_id)));
    setRisks(rks);
  };

  useEffect(() => {
    if (!projectId) {
      setRequirements([]); setTestcases([]); setTracelinks([]); setRisks([]);
      return;
    }
    reload(projectId);
  }, [projectId]);

  async function handleLink(reqId: string, tcId: string) {
    await api.tracelinks.create({ requirement_id: reqId, testcase_id: tcId });
    if (projectId) await reload(projectId);
  }

  const reqById    = Object.fromEntries(requirements.map(r => [r.id, r]));
  const swReqs     = requirements.filter(r => r.type === "SOFTWARE");
  const reqsByType = (type: string) => requirements.filter(r => r.type === type);

  const ORDERED_TYPES = ["USER", "SYSTEM", "SOFTWARE"];
  const allTypes      = ORDERED_TYPES.filter(t => requirements.some(r => r.type === t));
  const customTypes   = [...new Set(requirements.map(r => r.type))].filter(t => !ORDERED_TYPES.includes(t));
  const groupOrder    = [...allTypes, ...customTypes];

  const displayReqs   = typeFilter === "ALL" ? requirements : requirements.filter(r => r.type === typeFilter);
  const swWithTc      = swReqs.filter(r => tracelinks.some(l => l.requirement_id === r.id)).length;
  const uncovered     = swReqs.length - swWithTc;
  const highRisks     = risks.filter(r => r.risk_level === "HIGH").length;
  const openRisks     = risks.filter(r => !r.mitigation).length;
  const COL_SPAN      = 8;

  // Build rows array with InlineLinkPanel injected after the focused row
  function renderRows(reqs: Requirement[], startEven = true) {
    const out: React.ReactNode[] = [];
    reqs.forEach((r, i) => {
      const focused = r.id === focusedReqId;
      out.push(
        <MatrixRow
          key={r.id}
          req={r}
          reqById={reqById}
          risks={risks}
          tracelinks={tracelinks}
          allTcs={testcases}
          isEven={startEven ? i % 2 === 0 : i % 2 !== 0}
          isFocused={focused}
          onFocus={setFocus}
          onSpider={setSpiderReqId}
        />
      );
      if (focused) {
        out.push(
          <InlineLinkPanel
            key={`panel-${r.id}`}
            req={r}
            testcases={testcases}
            tracelinks={tracelinks}
            onLink={(tcId) => handleLink(r.id, tcId)}
            onClose={() => setFocus(null)}
          />
        );
      }
    });
    return out;
  }

  return (
    <div style={{ maxWidth: 1350, margin: "0 auto", padding: 20 }}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Traceability Matrix</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        IEC 62304 §5.2.7 — Click any <b>ID chip</b> to open the impact spider graph · Use <b style={{ color: "#e65100" }}>+ Add TC</b> to link test coverage inline
      </p>

      <select value={projectId} onChange={e => { setProjectId(e.target.value); setFocus(null); }}
        style={{ ...inputStyle, marginBottom: 20, maxWidth: 360 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {projectId && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Requirements",  value: requirements.length,            color: "#374151" },
              { label: "USER",          value: reqsByType("USER").length,       color: TYPE_COLOR.USER },
              { label: "SYSTEM",        value: reqsByType("SYSTEM").length,     color: TYPE_COLOR.SYSTEM },
              { label: "SOFTWARE",      value: reqsByType("SOFTWARE").length,   color: TYPE_COLOR.SOFTWARE },
              { label: "SW covered",    value: `${swWithTc}/${swReqs.length}`,  color: swWithTc === swReqs.length ? "#2e7d32" : "#e65100" },
              { label: "Need TC",       value: uncovered,                       color: uncovered > 0 ? "#b71c1c" : "#2e7d32" },
              { label: "High risks",    value: highRisks,                       color: highRisks > 0 ? "#b71c1c" : "#2e7d32" },
              { label: "Test cases",    value: testcases.length,                color: "#1565c0" },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* "Need coverage" alert bar */}
          {uncovered > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", marginBottom: 16,
              background: "#fff8e1", border: "1px solid #ffca28",
              borderLeft: "4px solid #f9a825", borderRadius: "0 6px 6px 0",
              fontSize: 13,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span>
                <b>{uncovered} SOFTWARE requirement{uncovered > 1 ? "s" : ""}</b> need test coverage.
                Click the <b style={{ color: "#e65100" }}>+ Add TC</b> button on any highlighted row to link a test case inline.
              </span>
            </div>
          )}

          {/* V-model chain */}
          <div style={{
            display: "flex", alignItems: "center", gap: 0, marginBottom: 16,
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 8, padding: "8px 14px", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 11, color: "#888", marginRight: 10, fontWeight: 600 }}>V-MODEL:</span>
            {[
              { label: "URQ-###", type: "USER",     desc: "User Req" },
              { label: "SYS-###", type: "SYSTEM",   desc: "System Req" },
              { label: "SWR-###", type: "SOFTWARE", desc: "Software Req" },
              { label: "TC-###",  type: "_TC",      desc: "Test Case" },
            ].map((item, i) => (
              <span key={item.type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: "#9ca3af", fontSize: 14, margin: "0 4px" }}>→</span>}
                <span style={{
                  background: item.type === "_TC" ? "#e3f2fd" : (TYPE_BG[item.type] ?? "#f5f5f5"),
                  color: item.type === "_TC" ? "#1565c0" : (TYPE_COLOR[item.type] ?? "#555"),
                  border: `1px solid ${item.type === "_TC" ? "#90caf9" : ((TYPE_COLOR[item.type] ?? "#ccc") + "40")}`,
                  borderRadius: 4, padding: "2px 8px",
                  fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 10, color: "#888" }}>{item.desc}</span>
              </span>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {["ALL", ...groupOrder].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: "4px 14px", borderRadius: 16, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 500,
                background: typeFilter === t ? (TYPE_COLOR[t] ?? "#374151") : "#f3f4f6",
                color: typeFilter === t ? "#fff" : "#374151",
              }}>
                {t === "ALL" ? "All types" : t}
                <span style={{ marginLeft: 5, opacity: 0.75 }}>
                  ({t === "ALL" ? requirements.length : reqsByType(t).length})
                </span>
              </button>
            ))}
          </div>

          {/* Matrix */}
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={th}>ID</th>
                  <th style={th}>Type</th>
                  <th style={th}>Requirement Title</th>
                  <th style={{ ...th, background: "#e8f4fd" }}>
                    ↑ Uplink
                    <div style={{ fontSize: 10, fontWeight: 400, color: "#888", marginTop: 1 }}>Parent req</div>
                  </th>
                  <th style={{ ...th, background: "#f0fdf4" }}>
                    ↓ Downlinks
                    <div style={{ fontSize: 10, fontWeight: 400, color: "#888", marginTop: 1 }}>Child reqs</div>
                  </th>
                  <th style={th}>⚠ Risks</th>
                  <th style={th}>✓ Test Cases</th>
                  <th style={{ ...th, textAlign: "center" }}>Status / Action</th>
                </tr>
              </thead>
              <tbody>
                {requirements.length === 0 ? (
                  <tr>
                    <td colSpan={COL_SPAN} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
                      No requirements. Select a project above.
                    </td>
                  </tr>
                ) : typeFilter === "ALL" ? (
                  groupOrder.map(type => {
                    const rows = reqsByType(type);
                    if (!rows.length) return null;
                    return [
                      <GroupHeader key={`hdr-${type}`} type={type} count={rows.length} colSpan={COL_SPAN} />,
                      ...renderRows(rows),
                    ];
                  })
                ) : (
                  renderRows(displayReqs)
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#6b7280" }}>
            <span>Click any <b>ID chip</b> to open the impact spider graph</span>
            <span>Click <b style={{ color: "#e65100" }}>+ Add TC</b> to link test cases inline</span>
            <span><b>↑ Uplink</b> — parent req · <b>↓ Downlinks</b> — child reqs</span>
            <span><b style={{ color: "#2e7d32" }}>✓ OK</b> — covered + risks mitigated</span>
            <span><b style={{ color: "#b71c1c" }}>Risk open</b> — unmitigated risk</span>
          </div>

          {/* Impact Spider Modal */}
          {spiderReqId && reqById[spiderReqId] && (
            <ImpactSpiderModal
              req={reqById[spiderReqId]}
              reqById={reqById}
              risks={risks}
              tracelinks={tracelinks}
              testcases={testcases}
              onNavigate={setSpiderReqId}
              onClose={() => setSpiderReqId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function TraceMatrixPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <TraceMatrixInner />
    </Suspense>
  );
}

const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" as const, width: "100%" };
const btnStyle:   React.CSSProperties = { padding: "7px 16px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const th:         React.CSSProperties = { padding: "9px 12px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, color: "#374151", borderRight: "1px solid #e2e8f0", whiteSpace: "nowrap" as const };
const td:         React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f1f5f9", borderRight: "1px solid #f1f5f9", verticalAlign: "top" as const };
