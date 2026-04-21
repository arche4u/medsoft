"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Project, TestCase, Requirement, TraceLink } from "@/lib/api";

// ── Collapsible test case row ─────────────────────────────────────────────────
function TestCaseRow({ tc, linkedReqs }: { tc: TestCase; linkedReqs: Requirement[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #f0f0f0" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
      >
        <span style={{ color: "#999", fontSize: 12, minWidth: 14 }}>{open ? "▾" : "▸"}</span>
        {tc.readable_id && (
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#fff", background: "#1565c0", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
            {tc.readable_id}
          </span>
        )}
        <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{tc.title}</span>
        {linkedReqs.length > 0 && (
          <span style={{
            fontSize: 11, background: "#e3f2fd", color: "#1565c0",
            borderRadius: 10, padding: "1px 8px", fontWeight: 600,
          }}>{linkedReqs.length} req{linkedReqs.length > 1 ? "s" : ""}</span>
        )}
        <span style={{ fontSize: 11, color: "#bbb" }}>
          {new Date(tc.created_at).toLocaleDateString()}
        </span>
      </div>
      {open && (
        <div style={{ padding: "6px 36px 12px", background: "#fafafa" }}>
          {tc.description && (
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#555" }}>{tc.description}</p>
          )}
          {linkedReqs.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>LINKED REQUIREMENTS</div>
              {linkedReqs.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1565c0" }}>
                    {r.readable_id}
                  </span>
                  <span style={{ fontSize: 13 }}>{r.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>No requirements linked yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────
function TestCasesPageInner() {
  const params    = useSearchParams();
  const projParam = params.get("project_id") ?? "";

  const [projects, setProjects]     = useState<Project[]>([]);
  const [testcases, setTestcases]   = useState<TestCase[]>([]);
  const [allReqs, setAllReqs]       = useState<Requirement[]>([]);
  const [traceLinks, setTraceLinks] = useState<TraceLink[]>([]);
  const [projectId, setProjectId]   = useState(projParam);

  // create form
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving]     = useState(false);

  // link form
  const [linkReqId, setLinkReqId] = useState("");
  const [linkTcId, setLinkTcId]   = useState("");
  const [linking, setLinking]     = useState(false);
  const [linkMsg, setLinkMsg]     = useState("");

  useEffect(() => { api.projects.list().then(setProjects); }, []);

  const reload = async () => {
    if (!projectId) return;
    const [tcs, reqs, links] = await Promise.all([
      api.testcases.list(projectId),
      api.requirements.list(projectId),
      api.tracelinks.list(),
    ]);
    setTestcases(tcs);
    setAllReqs(reqs);
    setTraceLinks(links);
  };

  useEffect(() => {
    if (!projectId) { setTestcases([]); setAllReqs([]); setTraceLinks([]); return; }
    reload();
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) { setFormError("Select a project"); return; }
    setSaving(true); setFormError("");
    try {
      await api.testcases.create({ project_id: projectId, title: title.trim(), description: desc.trim() || undefined });
      setTitle(""); setDesc("");
      await reload();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true); setLinkMsg("");
    try {
      await api.tracelinks.create({ requirement_id: linkReqId, testcase_id: linkTcId });
      setLinkMsg("Linked successfully.");
      setLinkReqId(""); setLinkTcId("");
      await reload();
    } catch (e: any) { setLinkMsg(`Error: ${e.message}`); }
    finally { setLinking(false); }
  }

  const swReqs = allReqs.filter(r => r.type === "SOFTWARE");
  const reqById = Object.fromEntries(allReqs.map(r => [r.id, r]));

  const linkedReqsForTc = (tcId: string): Requirement[] =>
    traceLinks
      .filter(l => l.testcase_id === tcId)
      .map(l => reqById[l.requirement_id])
      .filter(Boolean) as Requirement[];

  const unlinked = testcases.filter(tc => !traceLinks.some(l => l.testcase_id === tc.id));
  const linked   = testcases.filter(tc =>  traceLinks.some(l => l.testcase_id === tc.id));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px" }}>
      <h1 style={{ marginTop: 0, marginBottom: 20 }}>Test Cases</h1>

      <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }}>
        <option value="">— Select project</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Create */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Add Test Case</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} />
            <input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
            {formError && <p style={{ color: "red", margin: 0, fontSize: 13 }}>{formError}</p>}
            <button type="submit" disabled={saving || !projectId} style={btnStyle}>{saving ? "Saving…" : "Add Test Case"}</button>
          </form>
        </section>

        {/* Link */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Link SOFTWARE Req → Test Case</h2>
          <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={linkReqId} onChange={e => setLinkReqId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— SOFTWARE requirement *</option>
              {swReqs.map(r => <option key={r.id} value={r.id}>{r.readable_id} {r.title}</option>)}
            </select>
            <select value={linkTcId} onChange={e => setLinkTcId(e.target.value)} required style={inputStyle} disabled={!projectId}>
              <option value="">— Test case *</option>
              {testcases.map(tc => <option key={tc.id} value={tc.id}>{tc.readable_id ? `${tc.readable_id} ` : ""}{tc.title}</option>)}
            </select>
            {linkMsg && <p style={{ color: linkMsg.startsWith("Error") ? "red" : "#2e7d32", margin: 0, fontSize: 13 }}>{linkMsg}</p>}
            <button type="submit" disabled={linking || !linkReqId || !linkTcId} style={btnStyle}>{linking ? "Linking…" : "Link"}</button>
          </form>
        </section>
      </div>

      {/* Test case tree */}
      {!projectId ? (
        <p style={{ color: "#888" }}>Select a project.</p>
      ) : testcases.length === 0 ? (
        <p style={{ color: "#888" }}>No test cases yet.</p>
      ) : (
        <>
          {linked.length > 0 && (
            <CollapsibleGroup
              title={`Linked to Requirements`}
              count={linked.length}
              color="#1565c0"
              defaultOpen={true}
            >
              {linked.map(tc => <TestCaseRow key={tc.id} tc={tc} linkedReqs={linkedReqsForTc(tc.id)} />)}
            </CollapsibleGroup>
          )}

          {unlinked.length > 0 && (
            <CollapsibleGroup
              title="Not Yet Linked"
              count={unlinked.length}
              color="#757575"
              defaultOpen={true}
            >
              {unlinked.map(tc => <TestCaseRow key={tc.id} tc={tc} linkedReqs={[]} />)}
            </CollapsibleGroup>
          )}
        </>
      )}
    </div>
  );
}

function CollapsibleGroup({ title, count, color, defaultOpen, children }: {
  title: string; count: number; color: string; defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          background: color + "11", borderLeft: `4px solid ${color}`,
          padding: "9px 14px", borderRadius: "0 6px 0 0",
        }}
      >
        <span style={{ fontWeight: 700, color, fontSize: 14, flex: 1 }}>
          {open ? "▾" : "▸"} {title}
        </span>
        <span style={{
          background: color, color: "#fff", borderRadius: 12,
          padding: "2px 10px", fontSize: 12, fontWeight: 700,
        }}>{count}</span>
      </div>
      {open && (
        <div style={{
          background: "#fff", border: "1px solid #e0e0e0",
          borderTop: "none", borderRadius: "0 0 6px 6px",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function TestCasesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <TestCasesPageInner />
    </Suspense>
  );
}

const cardStyle: React.CSSProperties  = { background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "1.25rem" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnStyle: React.CSSProperties   = { padding: "8px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
