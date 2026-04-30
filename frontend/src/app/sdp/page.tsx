"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  SDP, SDPSummary, SDPSection, SDPPhase, SDPRole,
  SDPStatus, SDPLifecycleModel, SDPCompliance,
} from "@/lib/api";

// ── Status metadata ────────────────────────────────────────────────────────────

const STATUS_META: Record<SDPStatus, { color: string; bg: string; border: string }> = {
  DRAFT:    { color: "#546e7a", bg: "#eceff1", border: "#cfd8dc" },
  IN_REVIEW:{ color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  APPROVED: { color: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7" },
  OBSOLETE: { color: "#9e9e9e", bg: "#f5f5f5", border: "#e0e0e0" },
};

const LC_LABELS: Record<SDPLifecycleModel, string> = {
  V_MODEL: "V-Model",
  AGILE: "Agile",
  HYBRID: "Hybrid",
};

const CLASS_COLOR: Record<string, string> = { A: "#1b5e20", B: "#e65100", C: "#b71c1c" };

// ── Version history sidebar ───────────────────────────────────────────────────

function VersionList({
  versions, selectedId, onSelect,
}: {
  versions: SDPSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={sty.versionList}>
      <div style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#546e7a", borderBottom: "1px solid #e0e0e0", letterSpacing: 1, textTransform: "uppercase" as const }}>
        Version History
      </div>
      {versions.length === 0 && (
        <div style={{ padding: "20px 14px", color: "#90a4ae", fontSize: 13 }}>No SDP versions yet</div>
      )}
      {versions.map(v => {
        const m = STATUS_META[v.status];
        const isSelected = v.id === selectedId;
        return (
          <button key={v.id} onClick={() => onSelect(v.id)} style={{
            display: "block", width: "100%", textAlign: "left" as const,
            padding: "12px 14px", border: "none", cursor: "pointer",
            borderLeft: isSelected ? "3px solid #1a237e" : "3px solid transparent",
            background: isSelected ? "#e8eaf6" : "transparent",
            borderBottom: "1px solid #f5f5f5",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? "#1a237e" : "#37474f" }}>
                v{v.version}
              </span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: m.bg, color: m.color }}>
                {v.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#78909c", marginTop: 3 }}>
              {new Date(v.created_at).toLocaleDateString()}
              {v.approved_by && ` · ${v.approved_by}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ sdp, onUpdate, onFork, readonly }: {
  sdp: SDP;
  onUpdate: (d: Parameters<typeof api.sdp.update>[1]) => void;
  onFork: () => void;
  readonly: boolean;
}) {
  const [title, setTitle] = useState(sdp.title);
  const [desc, setDesc] = useState(sdp.description ?? "");
  const [lm, setLm] = useState<SDPLifecycleModel>(sdp.lifecycle_model);
  const [sc, setSc] = useState(sdp.safety_class);
  const [author, setAuthor] = useState(sdp.created_by ?? "");
  const [dirty, setDirty] = useState(false);
  const m = STATUS_META[sdp.status];

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 400px" }}>
        <div style={sty.panel}>
          <div style={sty.panelTitle}>Document Information</div>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
            <tbody>
              {[
                ["Version", `v${sdp.version}`],
                ["Status", <span key="s" style={{ padding: "2px 10px", borderRadius: 10, background: m.bg, color: m.color, fontSize: 12 }}>{sdp.status}</span>],
                ["Lifecycle Model", LC_LABELS[sdp.lifecycle_model]],
                ["Safety Class", <span key="c" style={{ fontWeight: 700, color: CLASS_COLOR[sdp.safety_class] ?? "#333" }}>Class {sdp.safety_class}</span>],
                ["Created by", sdp.created_by ?? "—"],
                ["Approved by", sdp.approved_by ?? "—"],
                ["Approved at", sdp.approved_at ? new Date(sdp.approved_at).toLocaleString() : "—"],
                ["Created", new Date(sdp.created_at).toLocaleString()],
                ["Last updated", new Date(sdp.updated_at).toLocaleString()],
              ].map(([k, v]) => (
                <tr key={String(k)} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "7px 0", color: "#546e7a", width: 140, fontWeight: 500 }}>{k}</td>
                  <td style={{ padding: "7px 0" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readonly && (
          <div style={{ ...sty.panel, marginTop: 16 }}>
            <div style={sty.panelTitle}>Edit Metadata</div>
            <label style={sty.label}>Document Title</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" as const }} />

            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Lifecycle Model</label>
                <select value={lm} onChange={e => { setLm(e.target.value as SDPLifecycleModel); setDirty(true); }} style={{ ...sty.input, width: "100%" }}>
                  <option value="V_MODEL">V-Model</option>
                  <option value="AGILE">Agile</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <div style={{ width: 110 }}>
                <label style={sty.label}>Safety Class</label>
                <select value={sc} onChange={e => { setSc(e.target.value); setDirty(true); }} style={{ ...sty.input, width: "100%" }}>
                  <option value="A">Class A</option>
                  <option value="B">Class B</option>
                  <option value="C">Class C</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Author</label>
                <input value={author} onChange={e => { setAuthor(e.target.value); setDirty(true); }} style={{ ...sty.input, width: "100%" }} placeholder="Name / role" />
              </div>
            </div>

            <label style={sty.label}>Description / Purpose</label>
            <textarea value={desc} onChange={e => { setDesc(e.target.value); setDirty(true); }} rows={3} style={sty.textarea} />

            <button disabled={!dirty} onClick={() => {
              onUpdate({ title, lifecycle_model: lm, safety_class: sc, description: desc || null, created_by: author || null });
              setDirty(false);
            }} style={{ ...sty.btn, marginTop: 10, opacity: dirty ? 1 : 0.5 }}>
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 220px" }}>
        {/* IEC 62304 process requirements */}
        <div style={sty.panel}>
          <div style={sty.panelTitle}>IEC 62304 Scope</div>
          <div style={{ fontSize: 12, color: "#546e7a", lineHeight: 1.8 }}>
            <div style={{ fontWeight: 600, color: "#1a237e", marginBottom: 6 }}>Class {sdp.safety_class} Requirements</div>
            {sdp.safety_class === "A" && <>
              <div>§5.1 — Development planning</div>
              <div>§5.2 — Requirements analysis</div>
              <div>§6.1 — Problem resolution</div>
            </>}
            {sdp.safety_class === "B" && <>
              <div>All Class A activities</div>
              <div>§5.3 — Architecture design</div>
              <div>§5.5 — Unit implementation + testing</div>
              <div>§5.6 — Integration testing</div>
              <div>§5.7 — System testing</div>
            </>}
            {sdp.safety_class === "C" && <>
              <div>All Class B activities</div>
              <div>§5.4 — Detailed design</div>
              <div>§5.5.3 — Formal unit tests</div>
              <div>§5.6.3 — Integration verification</div>
              <div>§9 — Risk management (ISO 14971)</div>
              <div>§5.8 — Software release</div>
            </>}
          </div>
        </div>

        {/* Fork action */}
        <div style={{ ...sty.panel, marginTop: 12 }}>
          <div style={sty.panelTitle}>Versioning</div>
          <div style={{ fontSize: 12, color: "#546e7a", marginBottom: 10 }}>
            Approved SDPs cannot be edited. Fork to create a new version with all content copied.
          </div>
          <button onClick={onFork} style={{ ...sty.btnSecondary, width: "100%" }}>
            Fork → New Version
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sections tab ──────────────────────────────────────────────────────────────

function SectionsTab({ sdp, onRefresh, readonly }: { sdp: SDP; onRefresh: () => void; readonly: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newNum, setNewNum] = useState("");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");

  async function saveSection(id: string) {
    setSaving(true);
    try {
      await api.sdp.sections.update(id, { section_name: editName, content: editContent || null });
      setEditing(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deleteSection(id: string, name: string) {
    if (!confirm(`Delete section "${name}"?`)) return;
    await api.sdp.sections.delete(id);
    onRefresh();
  }

  async function addSection() {
    if (!newNum.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await api.sdp.sections.add(sdp.id, {
        section_number: newNum, section_name: newName,
        content: newContent || null, sort_order: sdp.sections.length + 1,
      });
      setNewNum(""); setNewName(""); setNewContent(""); setShowAdd(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  return (
    <div>
      {!readonly && (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowAdd(v => !v)} style={sty.btnSecondary}>
            {showAdd ? "Cancel" : "+ Add Section"}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={{ ...sty.panel, marginBottom: 16, background: "#f3e5f5" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input value={newNum} onChange={e => setNewNum(e.target.value)} placeholder="Number (e.g. 12)" style={{ ...sty.input, width: 100 }} />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Section name" style={{ ...sty.input, flex: 1 }} />
          </div>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Content…" rows={4} style={sty.textarea} />
          <button onClick={addSection} disabled={saving || !newNum.trim() || !newName.trim()} style={{ ...sty.btn, marginTop: 8 }}>
            Add Section
          </button>
        </div>
      )}

      {sdp.sections.map(s => (
        <div key={s.id} style={{ ...sty.panel, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: editing === s.id ? 10 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a237e", minWidth: 32 }}>{s.section_number}</span>
            {editing === s.id ? (
              <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...sty.input, flex: 1 }} />
            ) : (
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{s.section_name}</span>
            )}
            {!readonly && (
              <div style={{ display: "flex", gap: 4 }}>
                {editing === s.id ? (
                  <>
                    <button onClick={() => saveSection(s.id)} disabled={saving} style={sty.btn}>Save</button>
                    <button onClick={() => setEditing(null)} style={sty.btnGhost}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditing(s.id); setEditContent(s.content ?? ""); setEditName(s.section_name); }} style={sty.iconBtn}>✎</button>
                    <button onClick={() => deleteSection(s.id, s.section_name)} style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
                  </>
                )}
              </div>
            )}
          </div>

          {editing === s.id ? (
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={8} style={sty.textarea} />
          ) : (
            <div style={{ fontSize: 13, color: "#37474f", whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6, paddingTop: 6, borderTop: "1px solid #f0f0f0" }}>
              {s.content || <span style={{ color: "#bdbdbd", fontStyle: "italic" }}>No content yet</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Lifecycle tab ─────────────────────────────────────────────────────────────

function LifecycleTab({ sdp, onRefresh, readonly }: { sdp: SDP; onRefresh: () => void; readonly: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState("");
  const [editExit, setEditExit] = useState("");
  const [editActivities, setEditActivities] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newPhase, setNewPhase] = useState({ phase_name: "", entry_criteria: "", exit_criteria: "", activities: "" });

  async function savePhase(id: string) {
    setSaving(true);
    try {
      await api.sdp.phases.update(id, {
        phase_name: editName,
        entry_criteria: editEntry || null,
        exit_criteria: editExit || null,
        activities: editActivities || null,
      });
      setEditing(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deletePhase(id: string, name: string) {
    if (!confirm(`Delete phase "${name}"?`)) return;
    await api.sdp.phases.delete(id);
    onRefresh();
  }

  async function addPhase() {
    if (!newPhase.phase_name.trim()) return;
    setSaving(true);
    try {
      await api.sdp.phases.add(sdp.id, {
        ...newPhase,
        phase_order: sdp.phases.length + 1,
        entry_criteria: newPhase.entry_criteria || null,
        exit_criteria: newPhase.exit_criteria || null,
        activities: newPhase.activities || null,
      });
      setNewPhase({ phase_name: "", entry_criteria: "", exit_criteria: "", activities: "" });
      setShowAdd(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  const hasMissingCriteria = sdp.phases.some(p => !p.entry_criteria || !p.exit_criteria);

  return (
    <div>
      {hasMissingCriteria && (
        <div style={{ padding: "10px 14px", background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 6, marginBottom: 14, fontSize: 13, color: "#e65100" }}>
          ⚠ Some phases are missing entry or exit criteria — required for SDP approval
        </div>
      )}

      {/* Visual V-model timeline */}
      <div style={{ display: "flex", gap: 0, overflowX: "auto" as const, marginBottom: 20, paddingBottom: 8 }}>
        {sdp.phases.map((p, i) => {
          const hasCriteria = !!(p.entry_criteria && p.exit_criteria);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                minWidth: 110, padding: "8px 10px", borderRadius: 6, textAlign: "center" as const,
                background: hasCriteria ? "#e8f5e9" : "#fff3e0",
                border: `1px solid ${hasCriteria ? "#a5d6a7" : "#ffcc80"}`,
                fontSize: 12, color: hasCriteria ? "#1b5e20" : "#e65100",
              }}>
                <div style={{ fontSize: 10, marginBottom: 2, opacity: 0.7 }}>Phase {p.phase_order}</div>
                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{p.phase_name}</div>
                <div style={{ fontSize: 10, marginTop: 3 }}>{hasCriteria ? "✓ criteria set" : "⚠ incomplete"}</div>
              </div>
              {i < sdp.phases.length - 1 && (
                <div style={{ width: 24, height: 2, background: "#cfd8dc", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
        {!readonly && (
          <>
            <div style={{ width: 24, height: 2, background: "#cfd8dc", flexShrink: 0 }} />
            <button onClick={() => setShowAdd(true)} style={{
              minWidth: 80, padding: "8px", borderRadius: 6, border: "2px dashed #90a4ae",
              background: "transparent", cursor: "pointer", color: "#78909c", fontSize: 12,
            }}>+ Phase</button>
          </>
        )}
      </div>

      {showAdd && (
        <div style={{ ...sty.panel, marginBottom: 16, background: "#f3e5f5" }}>
          <div style={sty.panelTitle}>Add Phase</div>
          <input value={newPhase.phase_name} onChange={e => setNewPhase(p => ({ ...p, phase_name: e.target.value }))}
            placeholder="Phase name *" style={{ ...sty.input, width: "100%", marginBottom: 8, boxSizing: "border-box" as const }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={sty.label}>Entry Criteria</label>
              <textarea value={newPhase.entry_criteria} onChange={e => setNewPhase(p => ({ ...p, entry_criteria: e.target.value }))} rows={3} style={sty.textarea} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={sty.label}>Exit Criteria</label>
              <textarea value={newPhase.exit_criteria} onChange={e => setNewPhase(p => ({ ...p, exit_criteria: e.target.value }))} rows={3} style={sty.textarea} />
            </div>
          </div>
          <label style={sty.label}>Activities</label>
          <textarea value={newPhase.activities} onChange={e => setNewPhase(p => ({ ...p, activities: e.target.value }))} rows={2} style={{ ...sty.textarea, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addPhase} disabled={saving || !newPhase.phase_name.trim()} style={sty.btn}>Add</button>
            <button onClick={() => setShowAdd(false)} style={sty.btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Phase detail cards */}
      {sdp.phases.map(p => (
        <div key={p.id} style={{ ...sty.panel, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1a237e", minWidth: 72 }}>Phase {p.phase_order}</span>
            {editing === p.id ? (
              <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...sty.input, flex: 1 }} />
            ) : (
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{p.phase_name}</span>
            )}
            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#e3f2fd", color: "#1565c0" }}>
              {p.required_for_class}
            </span>
            {!readonly && (
              <div style={{ display: "flex", gap: 4 }}>
                {editing === p.id ? (
                  <>
                    <button onClick={() => savePhase(p.id)} disabled={saving} style={sty.btn}>Save</button>
                    <button onClick={() => setEditing(null)} style={sty.btnGhost}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditing(p.id); setEditName(p.phase_name); setEditEntry(p.entry_criteria ?? ""); setEditExit(p.exit_criteria ?? ""); setEditActivities(p.activities ?? ""); }} style={sty.iconBtn}>✎</button>
                    <button onClick={() => deletePhase(p.id, p.phase_name)} style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
                  </>
                )}
              </div>
            )}
          </div>

          {editing === p.id ? (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Entry Criteria</label>
                <textarea value={editEntry} onChange={e => setEditEntry(e.target.value)} rows={4} style={sty.textarea} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Exit Criteria</label>
                <textarea value={editExit} onChange={e => setEditExit(e.target.value)} rows={4} style={sty.textarea} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Activities</label>
                <textarea value={editActivities} onChange={e => setEditActivities(e.target.value)} rows={4} style={sty.textarea} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { title: "Entry Criteria", val: p.entry_criteria, color: "#e3f2fd" },
                { title: "Exit Criteria", val: p.exit_criteria, color: "#e8f5e9" },
                { title: "Activities", val: p.activities, color: "#f3e5f5" },
              ].map(({ title, val, color }) => (
                <div key={title} style={{ flex: "1 1 200px", background: color, borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#546e7a", marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "#37474f", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {val || <span style={{ color: "#bdbdbd", fontStyle: "italic" }}>Not specified</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Roles tab ─────────────────────────────────────────────────────────────────

function RolesTab({ sdp, onRefresh, readonly }: { sdp: SDP; onRefresh: () => void; readonly: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editResp, setEditResp] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newRole, setNewRole] = useState({ role_name: "", responsibilities: "" });

  async function saveRole(id: string) {
    setSaving(true);
    try {
      await api.sdp.roles.update(id, { role_name: editName, responsibilities: editResp || null });
      setEditing(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deleteRole(id: string, name: string) {
    if (!confirm(`Delete role "${name}"?`)) return;
    await api.sdp.roles.delete(id);
    onRefresh();
  }

  async function addRole() {
    if (!newRole.role_name.trim()) return;
    setSaving(true);
    try {
      await api.sdp.roles.add(sdp.id, {
        role_name: newRole.role_name,
        responsibilities: newRole.responsibilities || null,
        sort_order: sdp.roles.length + 1,
      });
      setNewRole({ role_name: "", responsibilities: "" });
      setShowAdd(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  return (
    <div>
      {!readonly && (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowAdd(v => !v)} style={sty.btnSecondary}>
            {showAdd ? "Cancel" : "+ Add Role"}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={{ ...sty.panel, marginBottom: 14, background: "#f3e5f5" }}>
          <input value={newRole.role_name} onChange={e => setNewRole(r => ({ ...r, role_name: e.target.value }))}
            placeholder="Role name *" style={{ ...sty.input, width: "100%", marginBottom: 8, boxSizing: "border-box" as const }} />
          <textarea value={newRole.responsibilities} onChange={e => setNewRole(r => ({ ...r, responsibilities: e.target.value }))}
            placeholder="Responsibilities…" rows={3} style={{ ...sty.textarea, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRole} disabled={saving || !newRole.role_name.trim()} style={sty.btn}>Add</button>
            <button onClick={() => setShowAdd(false)} style={sty.btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {sdp.roles.map(r => (
          <div key={r.id} style={{ ...sty.panel, flex: "1 1 280px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                {editing === r.id ? (
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...sty.input, width: "100%" }} />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a237e" }}>{r.role_name}</div>
                )}
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#e3f2fd", color: "#1565c0", marginTop: 3, display: "inline-block" }}>
                  Class {r.required_for_class}
                </span>
              </div>
              {!readonly && (
                <div style={{ display: "flex", gap: 4 }}>
                  {editing === r.id ? (
                    <>
                      <button onClick={() => saveRole(r.id)} disabled={saving} style={sty.btn}>Save</button>
                      <button onClick={() => setEditing(null)} style={sty.btnGhost}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(r.id); setEditName(r.role_name); setEditResp(r.responsibilities ?? ""); }} style={sty.iconBtn}>✎</button>
                      <button onClick={() => deleteRole(r.id, r.role_name)} style={{ ...sty.iconBtn, color: "#b71c1c" }}>✕</button>
                    </>
                  )}
                </div>
              )}
            </div>
            {editing === r.id ? (
              <textarea value={editResp} onChange={e => setEditResp(e.target.value)} rows={4} style={sty.textarea} />
            ) : (
              <div style={{ fontSize: 12, color: "#546e7a", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {r.responsibilities || <span style={{ color: "#bdbdbd", fontStyle: "italic" }}>No responsibilities defined</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Approval tab ──────────────────────────────────────────────────────────────

function ApprovalTab({ sdp, compliance, onTransition, onRefreshCompliance }: {
  sdp: SDP;
  compliance: SDPCompliance | null;
  onTransition: (status: SDPStatus, approvedBy?: string, notes?: string) => void;
  onRefreshCompliance: () => void;
}) {
  const [approver, setApprover] = useState(sdp.approved_by ?? "");
  const [notes, setNotes] = useState(sdp.review_notes ?? "");
  const m = STATUS_META[sdp.status];

  const FLOW: SDPStatus[] = ["DRAFT", "IN_REVIEW", "APPROVED", "OBSOLETE"];
  const currentIdx = FLOW.indexOf(sdp.status);

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 380px" }}>
        {/* Workflow stepper */}
        <div style={sty.panel}>
          <div style={sty.panelTitle}>Approval Workflow</div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            {FLOW.map((s, i) => {
              const past = i < currentIdx;
              const curr = i === currentIdx;
              const sm = STATUS_META[s];
              return (
                <div key={s} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                    background: past || curr ? sm.bg : "#f5f5f5",
                    border: `2px solid ${curr ? sm.border : past ? sm.border : "#e0e0e0"}`,
                    color: past || curr ? sm.color : "#9e9e9e",
                  }}>
                    {past ? "✓" : i + 1}
                  </div>
                  <div style={{ marginLeft: 6, marginRight: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: curr ? 700 : 500, color: curr ? sm.color : "#78909c" }}>{s}</div>
                  </div>
                  {i < FLOW.length - 1 && (
                    <div style={{ width: 24, height: 2, background: past ? "#a5d6a7" : "#e0e0e0", marginRight: 6 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current status badge */}
          <div style={{ padding: "10px 14px", borderRadius: 6, background: m.bg, border: `1px solid ${m.border}`, marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: m.color }}>Current: {sdp.status}</span>
            {sdp.approved_at && <span style={{ color: m.color, fontSize: 12, marginLeft: 10 }}>Approved {new Date(sdp.approved_at).toLocaleDateString()} by {sdp.approved_by}</span>}
          </div>

          {/* Action buttons */}
          {sdp.status === "DRAFT" && (
            <div>
              <label style={sty.label}>Review Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional review notes…" style={{ ...sty.textarea, marginBottom: 10 }} />
              <button onClick={() => onTransition("IN_REVIEW", undefined, notes || undefined)} style={sty.btn}>
                Submit for Review →
              </button>
            </div>
          )}

          {sdp.status === "IN_REVIEW" && (
            <div>
              <label style={sty.label}>Approver Name *</label>
              <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Full name" style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" as const }} />
              <label style={sty.label}>Review Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Approval notes…" style={{ ...sty.textarea, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onTransition("APPROVED", approver, notes || undefined)} style={{ ...sty.btn, background: "#1b5e20" }}>
                  ✓ Approve SDP
                </button>
                <button onClick={() => onTransition("DRAFT", undefined, notes || undefined)} style={{ ...sty.btnSmall, background: "#ffebee", color: "#b71c1c", border: "1px solid #ef9a9a" }}>
                  ✗ Return to Draft
                </button>
              </div>
            </div>
          )}

          {sdp.status === "APPROVED" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (confirm("Mark this SDP as obsolete?")) onTransition("OBSOLETE"); }}
                style={{ ...sty.btnSmall, background: "#eceff1", color: "#546e7a" }}>
                → Mark Obsolete
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: "1 1 260px" }}>
        {/* Compliance pre-check */}
        <div style={sty.panel}>
          <div style={{ ...sty.panelTitle, justifyContent: "space-between" }}>
            Approval Checklist
            <button onClick={onRefreshCompliance} style={{ ...sty.btnGhost, padding: "3px 8px", fontSize: 11 }}>
              Refresh
            </button>
          </div>
          {!compliance ? (
            <div style={{ color: "#90a4ae", fontSize: 13 }}>Click Refresh to check</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                {compliance.is_ready_for_approval
                  ? <span style={{ color: "#1b5e20", fontWeight: 600, fontSize: 13 }}>✓ Ready for approval</span>
                  : <span style={{ color: "#b71c1c", fontWeight: 600, fontSize: 13 }}>✗ Not ready</span>}
              </div>
              {compliance.checks.map(c => (
                <div key={c.rule} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ color: c.satisfied ? "#1b5e20" : "#b71c1c", flexShrink: 0 }}>{c.satisfied ? "✓" : "✗"}</span>
                  <div>
                    <div style={{ fontWeight: 500, color: c.satisfied ? "#1b5e20" : "#b71c1c" }}>{c.label}</div>
                    <div style={{ color: "#78909c", fontSize: 11 }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create SDP form ───────────────────────────────────────────────────────────

function CreateSDPForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [version, setVersion] = useState("1.0");
  const [sc, setSc] = useState("C");
  const [lm, setLm] = useState<SDPLifecycleModel>("V_MODEL");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      await api.sdp.create({ project_id: projectId, version, safety_class: sc, lifecycle_model: lm, created_by: author || null });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ ...sty.panel, maxWidth: 560 }}>
      <div style={sty.panelTitle}>Create New SDP</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <label style={sty.label}>Version</label>
          <input value={version} onChange={e => setVersion(e.target.value)} style={{ ...sty.input, width: 80 }} />
        </div>
        <div>
          <label style={sty.label}>Safety Class</label>
          <select value={sc} onChange={e => setSc(e.target.value)} style={{ ...sty.input, width: 100 }}>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
        </div>
        <div>
          <label style={sty.label}>Lifecycle Model</label>
          <select value={lm} onChange={e => setLm(e.target.value as SDPLifecycleModel)} style={{ ...sty.input, width: 130 }}>
            <option value="V_MODEL">V-Model</option>
            <option value="AGILE">Agile</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={sty.label}>Author</label>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name" style={{ ...sty.input, width: "100%" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#78909c", marginBottom: 10 }}>
        Default IEC 62304 sections, phases, and roles will be seeded automatically.
      </div>
      <button onClick={handleCreate} disabled={saving} style={sty.btn}>
        {saving ? "Creating…" : "Create SDP"}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = "overview" | "sections" | "lifecycle" | "roles" | "approval";

function SDPPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? (
    typeof window !== "undefined" ? localStorage.getItem("medsoft_active_project") ?? "" : ""
  );

  const [versions, setVersions] = useState<SDPSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sdp, setSdp] = useState<SDP | null>(null);
  const [compliance, setCompliance] = useState<SDPCompliance | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const vs = await api.sdp.list(projectId);
      setVersions(vs);
      if (vs.length > 0 && !selectedId) setSelectedId(vs[0].id);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [projectId, selectedId]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    setLoadingDetail(true);
    try {
      const d = await api.sdp.get(selectedId);
      setSdp(d);
      setCompliance(null);
    } finally { setLoadingDetail(false); }
  }, [selectedId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  useEffect(() => {
    const handler = () => { setSelectedId(null); loadVersions(); };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, [loadVersions]);

  async function handleUpdate(d: Parameters<typeof api.sdp.update>[1]) {
    if (!selectedId) return;
    await api.sdp.update(selectedId, d);
    loadDetail();
  }

  async function handleFork() {
    if (!selectedId) return;
    try {
      const forked = await api.sdp.fork(selectedId);
      await loadVersions();
      setSelectedId(forked.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTransition(status: SDPStatus, approvedBy?: string, notes?: string) {
    if (!selectedId) return;
    try {
      await api.sdp.transition(selectedId, { status, approved_by: approvedBy ?? null, review_notes: notes ?? null });
      await loadVersions();
      loadDetail();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const match = msg.match(/\d+: ([\s\S]*)/);
      try { alert(JSON.parse(match?.[1] ?? "{}").detail ?? msg); }
      catch { alert(msg); }
    }
  }

  async function loadCompliance() {
    if (!selectedId) return;
    const c = await api.sdp.compliance(selectedId);
    setCompliance(c);
  }

  const readonly = sdp ? !["DRAFT", "IN_REVIEW"].includes(sdp.status) : true;

  if (!projectId) {
    return (
      <div style={sty.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <div style={{ fontWeight: 600 }}>No project selected</div>
        <div style={{ color: "#78909c" }}>Select a project from the sidebar to manage the SDP.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a237e" }}>
            Software Development Plan
          </h1>
          <p style={{ margin: "4px 0 0", color: "#546e7a", fontSize: 14 }}>
            IEC 62304 §5.1 — Version-controlled, audit-ready SDP
          </p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} style={sty.btn}>
          {showCreate ? "Cancel" : "+ New SDP"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#ffebee", color: "#b71c1c", borderRadius: 6, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {showCreate && (
        <div style={{ marginBottom: 20 }}>
          <CreateSDPForm projectId={projectId} onCreated={() => { setShowCreate(false); loadVersions(); }} />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
      ) : versions.length === 0 && !showCreate ? (
        <div style={sty.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600 }}>No SDP yet</div>
          <div style={{ color: "#78909c", marginTop: 4 }}>Create your first SDP to define how software will be developed.</div>
          <button onClick={() => setShowCreate(true)} style={{ ...sty.btn, marginTop: 16 }}>Create First SDP</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
          {/* Version list */}
          <VersionList versions={versions} selectedId={selectedId} onSelect={id => { setSelectedId(id); setTab("overview"); }} />

          {/* Detail pane */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loadingDetail ? (
              <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>
            ) : sdp ? (
              <>
                {/* SDP header */}
                <div style={{ padding: "14px 18px", background: "#fff", border: "1px solid #e0e0e0", borderRadius: "0 8px 0 0", borderBottom: "none", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: "#1a237e" }}>v{sdp.version}</span>
                  <span style={{ ...STATUS_META[sdp.status] as React.CSSProperties, padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                    {sdp.status}
                  </span>
                  <span style={{ fontSize: 13, color: "#546e7a" }}>{sdp.title}</span>
                  <span style={{ fontSize: 12, color: CLASS_COLOR[sdp.safety_class], fontWeight: 700, marginLeft: "auto" }}>
                    Class {sdp.safety_class} · {LC_LABELS[sdp.lifecycle_model]}
                  </span>
                  {readonly && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fff3e0", color: "#e65100", border: "1px solid #ffcc80" }}>
                      Read-only
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", background: "#fff", border: "1px solid #e0e0e0", borderTop: "none", borderBottom: "none" }}>
                  {(["overview", "sections", "lifecycle", "roles", "approval"] as TabId[]).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      ...sty.tabBtn,
                      borderBottom: tab === t ? "2px solid #1a237e" : "2px solid transparent",
                      color: tab === t ? "#1a237e" : "#546e7a",
                      fontWeight: tab === t ? 600 : 400,
                    }}>
                      {t === "overview" ? "Overview" : t === "sections" ? `Sections (${sdp.sections.length})` : t === "lifecycle" ? `Lifecycle (${sdp.phases.length})` : t === "roles" ? `Roles (${sdp.roles.length})` : "Approval"}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 18 }}>
                  {tab === "overview" && <OverviewTab sdp={sdp} onUpdate={handleUpdate} onFork={handleFork} readonly={readonly} />}
                  {tab === "sections" && <SectionsTab sdp={sdp} onRefresh={loadDetail} readonly={readonly} />}
                  {tab === "lifecycle" && <LifecycleTab sdp={sdp} onRefresh={loadDetail} readonly={readonly} />}
                  {tab === "roles" && <RolesTab sdp={sdp} onRefresh={loadDetail} readonly={readonly} />}
                  {tab === "approval" && <ApprovalTab sdp={sdp} compliance={compliance} onTransition={handleTransition} onRefreshCompliance={loadCompliance} />}
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Select a version from the left</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SDPPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#78909c" }}>Loading…</div>}>
      <SDPPageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sty = {
  versionList: {
    width: 200,
    flexShrink: 0,
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: "8px 0 0 8px",
    minHeight: 400,
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
    border: "1px solid #cfd8dc",
    borderRadius: 5,
    padding: "5px 10px",
    cursor: "pointer" as const,
    fontSize: 12,
    background: "#eceff1",
    color: "#546e7a",
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
  },
  btnGhost: {
    background: "transparent",
    color: "#546e7a",
    border: "1px solid #cfd8dc",
    borderRadius: 6,
    padding: "8px 12px",
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
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 16px",
    cursor: "pointer" as const,
    fontSize: 13,
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
  emptyState: {
    textAlign: "center" as const,
    padding: "60px 24px",
    color: "#546e7a",
  },
};
