"use client";

import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useMemo, useState } from "react";
import { api, FeedbackItem, FeedbackMeta, FeedbackStatus } from "@/lib/api";

/**
 * IEC 62304 §6.2.1 Feedback Intake.
 *
 * Page surfaces the post-market surveillance funnel: new feedback in →
 * triage / safety-evaluate → escalate to a Problem Report (§9) or Change
 * Request (§6.3) → close. All taxonomies (sources, severities, statuses)
 * come from /feedback/meta — no hardcoded enums in this file.
 */
export default function FeedbackPage() {
  const [projectId] = useActiveProject();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [meta, setMeta] = useState<FeedbackMeta | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string>("");

  // ── Load meta once + items on project/filter change ─────────────────────
  useEffect(() => { api.feedback.meta().then(setMeta).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    api.feedback.list(projectId, {
      status:   statusFilter   || undefined,
      severity: severityFilter || undefined,
    }).then(setItems).catch(e => setError(String(e)));
  }, [projectId, statusFilter, severityFilter]);

  const selected = items.find(x => x.id === selectedId) ?? null;

  // ── Stats summary by status ─────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [items]);

  async function refresh() {
    if (!projectId) return;
    const fresh = await api.feedback.list(projectId, {
      status:   statusFilter   || undefined,
      severity: severityFilter || undefined,
    });
    setItems(fresh);
    if (selectedId) {
      const stillThere = fresh.find(x => x.id === selectedId);
      if (!stillThere) setSelectedId(null);
    }
  }

  if (!projectId) {
    return <div style={s.wrap}><Placeholder>Select a project from the sidebar to view feedback.</Placeholder></div>;
  }
  if (!meta) {
    return <div style={s.wrap}><Placeholder>Loading…</Placeholder></div>;
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <div>
          <h1 style={s.h1}>Feedback Intake</h1>
          <p style={s.sub}>
            IEC 62304 §6.2.1 — post-market surveillance funnel. Feedback is logged,
            evaluated per §6.2.1.2, safety-assessed per §6.2.1.3, then escalated to
            a Problem Report (§9) or Change Request (§6.3).
          </p>
        </div>
        <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>+ New Feedback</button>
      </header>

      {error && <div style={s.error}>{error}</div>}

      {/* Stats by status */}
      <div style={s.statsRow}>
        {meta.statuses.map(st => (
          <div key={st.name} style={{ ...s.statCard, borderLeft: `4px solid ${st.color}` }}>
            <div style={s.statCount}>{counts[st.name] ?? 0}</div>
            <div style={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filterRow}>
        <Select value={statusFilter} onChange={setStatusFilter} placeholder="All statuses"
                options={meta.statuses.map(x => ({ value: x.name, label: x.label }))} />
        <Select value={severityFilter} onChange={setSeverityFilter} placeholder="All severities"
                options={meta.severities.map(x => ({ value: x.name, label: x.label }))} />
        <div style={{ flex: 1 }} />
        <span style={s.muted}>{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>

      {/* List + detail split */}
      <div style={s.split}>
        <div style={s.listCol}>
          {items.length === 0
            ? <Placeholder>No feedback items yet. Click <b>+ New Feedback</b> to log the first one.</Placeholder>
            : items.map(it => (
                <Card key={it.id} item={it} meta={meta}
                      selected={selectedId === it.id}
                      onClick={() => setSelectedId(selectedId === it.id ? null : it.id)} />
              ))}
        </div>
        <div style={s.detailCol}>
          {selected
            ? <Detail item={selected} meta={meta} onRefresh={refresh} onClose={() => setSelectedId(null)} />
            : <Placeholder>Select a feedback item to view details.</Placeholder>}
        </div>
      </div>

      {showCreate && (
        <CreateModal meta={meta} projectId={projectId}
                     onClose={() => setShowCreate(false)}
                     onCreated={async () => { setShowCreate(false); await refresh(); }} />
      )}
    </div>
  );
}


// ── Card ────────────────────────────────────────────────────────────────────
function Card({ item, meta, selected, onClick }: {
  item: FeedbackItem;
  meta: FeedbackMeta;
  selected: boolean;
  onClick: () => void;
}) {
  const sev = meta.severities.find(x => x.name === item.severity);
  const src = meta.sources.find(x => x.name === item.source);
  const st  = meta.statuses.find(x => x.name === item.status);
  return (
    <div onClick={onClick} style={{
      ...s.card,
      borderColor: selected ? "#1a1a2e" : "#e0e0e0",
      borderWidth: selected ? 2 : 1,
      background: selected ? "#fafafa" : "#fff",
    }}>
      <div style={s.cardRow}>
        <span style={s.readableId}>{item.readable_id}</span>
        <Chip color={sev?.color ?? "#9e9e9e"} label={sev?.label ?? item.severity} />
        <Chip color={src?.color ?? "#546e7a"} label={src?.label ?? item.source} faded />
        <Chip color={st?.color ?? "#546e7a"}  label={st?.label  ?? item.status} />
        {item.adverse_event && <Chip color="#b71c1c" label="ADVERSE" />}
        {item.spec_deviation && <Chip color="#e65100" label="SPEC DEV" />}
      </div>
      <div style={s.cardTitle}>{item.summary}</div>
      <div style={s.cardMeta}>
        {item.reporter ? <>{item.reporter} · </> : null}
        {item.affected_version ? <>v{item.affected_version} · </> : null}
        {new Date(item.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}


// ── Detail panel ────────────────────────────────────────────────────────────
function Detail({ item, meta, onRefresh, onClose }: {
  item: FeedbackItem;
  meta: FeedbackMeta;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  // Local form state for the evaluation / escalation / close panels.
  const [tab, setTab] = useState<"summary" | "evaluate" | "escalate" | "close">("summary");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Evaluate form
  const [evIsProblem, setEvIsProblem] = useState<boolean | null>(item.is_problem);
  const [evNotes,     setEvNotes]     = useState(item.evaluation_notes ?? "");
  const [evBy,        setEvBy]        = useState(item.evaluated_by ?? "");
  const [evSafety,    setEvSafety]    = useState(item.safety_impact_assessment ?? "");
  const [evChange,    setEvChange]    = useState<boolean | null>(item.change_needed);

  // Escalate form
  const [escTarget, setEscTarget] = useState<"PROBLEM" | "CHANGE">("PROBLEM");
  const [escNotes,  setEscNotes]  = useState("");

  // Close form
  const [closeNotes, setCloseNotes] = useState("");

  async function doEvaluate() {
    if (evIsProblem === null) { setErr("is_problem decision is required"); return; }
    setBusy(true); setErr("");
    try {
      await api.feedback.evaluate(item.id, {
        is_problem: evIsProblem,
        evaluation_notes: evNotes || null,
        evaluated_by: evBy || null,
        safety_impact_assessment: evSafety || null,
        change_needed: evChange,
      });
      await onRefresh();
      setTab("summary");
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }
  async function doEscalate() {
    setBusy(true); setErr("");
    try {
      await api.feedback.escalate(item.id, {
        to_problem: escTarget === "PROBLEM",
        to_change_request: escTarget === "CHANGE",
        extra_notes: escNotes || null,
      });
      await onRefresh();
      setTab("summary");
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }
  async function doClose() {
    if (!closeNotes.trim()) { setErr("Closure rationale required"); return; }
    setBusy(true); setErr("");
    try {
      await api.feedback.close(item.id, closeNotes.trim());
      await onRefresh();
      setTab("summary");
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const canEvaluate = item.status === "NEW" || item.status === "UNDER_REVIEW";
  const canEscalate = item.status === "EVALUATED";
  const canClose    = item.status !== "CLOSED";

  return (
    <div style={s.detailCard}>
      <div style={s.detailHeader}>
        <div>
          <div style={s.readableIdLarge}>{item.readable_id}</div>
          <div style={s.detailTitle}>{item.summary}</div>
        </div>
        <button onClick={onClose} style={s.btnSecondary}>Close</button>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(["summary", "evaluate", "escalate", "close"] as const).map(t => {
          const disabled =
            (t === "evaluate" && !canEvaluate) ||
            (t === "escalate" && !canEscalate) ||
            (t === "close"    && !canClose);
          return (
            <button key={t}
                    disabled={disabled}
                    onClick={() => setTab(t)}
                    style={{
                      ...s.tab,
                      ...(tab === t ? s.tabActive : {}),
                      ...(disabled ? s.tabDisabled : {}),
                    }}>
              {t === "summary" ? "Details" :
               t === "evaluate" ? "Evaluate §6.2.1.2" :
               t === "escalate" ? "Escalate §6.2.2" :
               "Close"}
            </button>
          );
        })}
      </div>

      {err && <div style={s.error}>{err}</div>}

      {tab === "summary" && <SummaryView item={item} meta={meta} />}
      {tab === "evaluate" && (
        <div style={s.form}>
          <Field label="Is this a problem? (§6.2.1.2)">
            <RadioRow value={evIsProblem} onChange={setEvIsProblem} />
          </Field>
          <Field label="Evaluation notes">
            <textarea value={evNotes} onChange={e => setEvNotes(e.target.value)}
                      rows={3} style={s.textarea} placeholder="What did the evaluation find?" />
          </Field>
          <Field label="Evaluated by">
            <input value={evBy} onChange={e => setEvBy(e.target.value)} style={s.input}
                   placeholder="Name and role" />
          </Field>
          <Field label="Safety impact assessment (§6.2.1.3)">
            <textarea value={evSafety} onChange={e => setEvSafety(e.target.value)}
                      rows={3} style={s.textarea}
                      placeholder="How does this affect the safety of released software?" />
          </Field>
          <Field label="Change needed?">
            <RadioRow value={evChange} onChange={setEvChange} />
          </Field>
          <button onClick={doEvaluate} disabled={busy} style={s.btnPrimary}>
            {busy ? "Saving…" : "Save evaluation"}
          </button>
        </div>
      )}
      {tab === "escalate" && (
        <div style={s.form}>
          <Field label="Escalate to">
            <div style={{ display: "flex", gap: 12 }}>
              <label style={s.radio}>
                <input type="radio" checked={escTarget === "PROBLEM"} onChange={() => setEscTarget("PROBLEM")} />
                Problem Report (§9 CAPA)
              </label>
              <label style={s.radio}>
                <input type="radio" checked={escTarget === "CHANGE"} onChange={() => setEscTarget("CHANGE")} />
                Change Request (§6.3)
              </label>
            </div>
          </Field>
          <Field label="Extra notes">
            <textarea value={escNotes} onChange={e => setEscNotes(e.target.value)}
                      rows={3} style={s.textarea}
                      placeholder="Any additional context appended to the new record" />
          </Field>
          <p style={s.muted}>
            The new record will reference this feedback item ({item.readable_id}) in its title for provenance.
          </p>
          <button onClick={doEscalate} disabled={busy} style={s.btnPrimary}>
            {busy ? "Escalating…" : `Create linked ${escTarget === "PROBLEM" ? "Problem Report" : "Change Request"}`}
          </button>
        </div>
      )}
      {tab === "close" && (
        <div style={s.form}>
          <Field label="Closure rationale">
            <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
                      rows={4} style={s.textarea}
                      placeholder="Why is no further action required? (Required)" />
          </Field>
          <button onClick={doClose} disabled={busy} style={s.btnPrimary}>
            {busy ? "Closing…" : "Close feedback"}
          </button>
        </div>
      )}
    </div>
  );
}


function SummaryView({ item, meta }: { item: FeedbackItem; meta: FeedbackMeta }) {
  const sev = meta.severities.find(x => x.name === item.severity);
  const src = meta.sources.find(x => x.name === item.source);
  return (
    <div style={s.form}>
      <Row k="Source">{src?.label ?? item.source}</Row>
      <Row k="Severity">
        <Chip color={sev?.color ?? "#9e9e9e"} label={sev?.label ?? item.severity} />
      </Row>
      <Row k="Reporter">{item.reporter ?? "—"}</Row>
      <Row k="Reported">{item.reported_at ? new Date(item.reported_at).toLocaleString() : "—"}</Row>
      <Row k="Affected version">{item.affected_version ?? "—"}</Row>
      <Row k="Adverse event">{item.adverse_event ? "Yes" : "No"}</Row>
      <Row k="Spec deviation">{item.spec_deviation ? "Yes" : "No"}</Row>

      {item.description && (
        <Field label="Description">
          <div style={s.readBlock}>{item.description}</div>
        </Field>
      )}

      {item.evaluated_at && (
        <>
          <Field label="Evaluation outcome (§6.2.1.2)">
            <Row k="Is problem">{item.is_problem ? "Yes" : "No"}</Row>
            <Row k="Change needed">{item.change_needed == null ? "—" : item.change_needed ? "Yes" : "No"}</Row>
            <Row k="Evaluated by">{item.evaluated_by ?? "—"}</Row>
            <Row k="Evaluated at">{new Date(item.evaluated_at).toLocaleString()}</Row>
            {item.evaluation_notes && <div style={s.readBlock}>{item.evaluation_notes}</div>}
          </Field>
          {item.safety_impact_assessment && (
            <Field label="Safety impact assessment (§6.2.1.3)">
              <div style={s.readBlock}>{item.safety_impact_assessment}</div>
            </Field>
          )}
        </>
      )}

      {item.escalated_problem_id && (
        <Field label="Escalated to Problem Report">
          <a href={`/capa#problem-${item.escalated_problem_id}`} style={s.link}>
            {item.escalated_problem_id}
          </a>
        </Field>
      )}
      {item.escalated_change_request_id && (
        <Field label="Escalated to Change Request">
          <a href={`/change-control#cr-${item.escalated_change_request_id}`} style={s.link}>
            {item.escalated_change_request_id}
          </a>
        </Field>
      )}
      {item.closure_rationale && (
        <Field label="Closure rationale">
          <div style={s.readBlock}>{item.closure_rationale}</div>
        </Field>
      )}
    </div>
  );
}


// ── Create modal ────────────────────────────────────────────────────────────
function CreateModal({ meta, projectId, onClose, onCreated }: {
  meta: FeedbackMeta;
  projectId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [source,   setSource]   = useState(meta.sources[0]?.name ?? "");
  const [severity, setSeverity] = useState("MINOR");
  const [reporter, setReporter] = useState("");
  const [summary,  setSummary]  = useState("");
  const [desc,     setDesc]     = useState("");
  const [version,  setVersion]  = useState("");
  const [adverse,  setAdverse]  = useState(false);
  const [specDev,  setSpecDev]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  async function submit() {
    if (!summary.trim()) { setErr("Summary required"); return; }
    setBusy(true); setErr("");
    try {
      await api.feedback.create({
        project_id: projectId,
        source, severity,
        reporter: reporter || null,
        summary: summary.trim(),
        description: desc || null,
        affected_version: version || null,
        adverse_event: adverse,
        spec_deviation: specDev,
      });
      await onCreated();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Log new feedback</h2>
        <p style={s.muted}>IEC 62304 §6.2.1.1 — record an inbound feedback item for triage.</p>

        {err && <div style={s.error}>{err}</div>}

        <div style={s.form}>
          <Field label="Source channel">
            <select value={source} onChange={e => setSource(e.target.value)} style={s.input}>
              {meta.sources.map(o => <option key={o.name} value={o.name}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select value={severity} onChange={e => setSeverity(e.target.value)} style={s.input}>
              {meta.severities.map(o => <option key={o.name} value={o.name}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Reporter (name / role / contact)">
            <input value={reporter} onChange={e => setReporter(e.target.value)} style={s.input} />
          </Field>
          <Field label="Affected version">
            <input value={version} onChange={e => setVersion(e.target.value)} style={s.input}
                   placeholder="e.g. v1.0.0" />
          </Field>
          <Field label="Summary *">
            <input value={summary} onChange={e => setSummary(e.target.value)} style={s.input}
                   placeholder="One-line description of the feedback" />
          </Field>
          <Field label="Description">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={s.textarea}
                      placeholder="Full description: who, what, when, environment, repro steps if any." />
          </Field>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={s.radio}>
              <input type="checkbox" checked={adverse} onChange={e => setAdverse(e.target.checked)} />
              Adverse event (actual or potential)
            </label>
            <label style={s.radio}>
              <input type="checkbox" checked={specDev} onChange={e => setSpecDev(e.target.checked)} />
              Deviation from specification
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={s.btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={busy} style={s.btnPrimary}>
            {busy ? "Logging…" : "Log feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Small UI primitives ────────────────────────────────────────────────────
function Chip({ color, label, faded }: { color: string; label: string; faded?: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      background: faded ? "#fff" : color + "22",
      color, border: `1px solid ${color}`,
      borderRadius: 4, padding: "1px 8px",
      fontSize: 11, fontWeight: 600, marginRight: 6,
    }}>{label}</span>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#546e7a", fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 13, padding: "3px 0" }}>
      <div style={{ width: 140, color: "#666" }}>{k}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={s.input}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function RadioRow({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <label style={s.radio}>
        <input type="radio" checked={value === true} onChange={() => onChange(true)} /> Yes
      </label>
      <label style={s.radio}>
        <input type="radio" checked={value === false} onChange={() => onChange(false)} /> No
      </label>
      <label style={s.radio}>
        <input type="radio" checked={value === null} onChange={() => onChange(null)} /> —
      </label>
    </div>
  );
}
function Placeholder({ children }: { children: React.ReactNode }) {
  return <div style={s.placeholder}>{children}</div>;
}


// ── Styles ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrap: { padding: "20px 24px", maxWidth: 1400 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 },
  h1: { margin: 0, fontSize: 22, color: "#0d1b2a" },
  sub: { margin: "6px 0 0", fontSize: 13, color: "#546e7a", maxWidth: 760 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 },
  statCard: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: "10px 14px" },
  statCount: { fontSize: 22, fontWeight: 700, color: "#0d1b2a" },
  statLabel: { fontSize: 12, color: "#546e7a", marginTop: 2 },
  filterRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 12 },
  split: { display: "grid", gridTemplateColumns: "minmax(360px, 1fr) 2fr", gap: 16 },
  listCol: { display: "flex", flexDirection: "column", gap: 8 },
  detailCol: {},
  card: { background: "#fff", border: "1px solid", borderRadius: 6, padding: 12, cursor: "pointer" },
  cardRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 6 },
  readableId: { fontFamily: "monospace", fontWeight: 700, color: "#0d1b2a", marginRight: 8 },
  cardTitle: { fontSize: 14, color: "#0d1b2a", fontWeight: 500, marginBottom: 4 },
  cardMeta: { fontSize: 11, color: "#9e9e9e" },
  detailCard: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 18 },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  readableIdLarge: { fontFamily: "monospace", fontWeight: 700, color: "#5d4037", fontSize: 13 },
  detailTitle: { fontSize: 17, color: "#0d1b2a", marginTop: 2 },
  tabs: { display: "flex", gap: 4, borderBottom: "1px solid #e0e0e0", marginBottom: 16 },
  tab: { background: "transparent", border: "none", padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#546e7a", borderBottom: "2px solid transparent" },
  tabActive: { color: "#0d1b2a", fontWeight: 600, borderBottomColor: "#1a1a2e" },
  tabDisabled: { color: "#bdbdbd", cursor: "not-allowed" },
  form: { display: "flex", flexDirection: "column" },
  input: { padding: "6px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 13, fontFamily: "inherit" },
  textarea: { padding: "8px 10px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 13, fontFamily: "inherit", resize: "vertical" },
  readBlock: { background: "#fafafa", border: "1px solid #eee", padding: "8px 10px", borderRadius: 4, fontSize: 13, color: "#37474f", whiteSpace: "pre-wrap" },
  radio: { display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" },
  btnPrimary: { padding: "8px 14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, cursor: "pointer", fontWeight: 600 },
  btnSecondary: { padding: "8px 14px", background: "#fff", color: "#546e7a", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 13, cursor: "pointer" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 8, padding: 24, width: "min(640px, 90vw)", maxHeight: "90vh", overflowY: "auto" },
  placeholder: { padding: 24, background: "#fff", border: "1px dashed #cfd8dc", borderRadius: 6, color: "#90a4ae", fontSize: 13, textAlign: "center" },
  link: { color: "#1565c0", fontFamily: "monospace", textDecoration: "underline" },
  error: { background: "#ffebee", color: "#b71c1c", border: "1px solid #ef9a9a", borderRadius: 4, padding: "8px 12px", fontSize: 13, marginBottom: 12 },
  muted: { color: "#9e9e9e", fontSize: 12 },
};
