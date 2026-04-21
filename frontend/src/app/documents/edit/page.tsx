"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Doc, DocumentStatus, Requirement } from "@/lib/api";

// ── Section definitions per doc_type ─────────────────────────────────────────

type DocSection = {
  id: string;
  title: string;
  iecRef: string;
  guidance: string;
  reqFilter?: "USER" | "SYSTEM" | "SOFTWARE"; // live requirements list for this section
};

const SECTION_DEFS: Record<string, DocSection[]> = {
  SDP: [
    {
      id: "development_processes",
      title: "1. Development Processes",
      iecRef: "IEC 62304 §5.1.1 (a)",
      guidance:
        "Define the software development life cycle (SDLC) model being used (e.g., V-Model, Waterfall, Agile with IEC 62304 compliance overlay). Specify development phases, entry and exit criteria for each phase, and role responsibilities. For safety class B/C software, include rationale for the chosen model.",
    },
    {
      id: "documentation_deliverables",
      title: "2. Documentation and Deliverables",
      iecRef: "IEC 62304 §5.1.1 (b)",
      guidance:
        "List all documents, records, and software outputs to be produced during development. Include document owner, required review/approval level, and planned completion milestone. Examples: SRS, SADS, SDDS, SOUP list, unit test protocol, integration test protocol, verification report, release notes.",
    },
    {
      id: "traceability",
      title: "3. Traceability",
      iecRef: "IEC 62304 §5.1.1 (c), §9.5",
      guidance:
        "Define how software requirements (URQ/SYS/SWR), risk controls from the risk management file (ISO 14971), design elements, and verification results are traced across the lifecycle. Specify the traceability matrix structure, tooling used, and frequency of traceability review.",
    },
    {
      id: "configuration_management",
      title: "4. Configuration and Change Management",
      iecRef: "IEC 62304 §8",
      guidance:
        "Define procedures for identifying, versioning, and controlling all software configuration items (SCIs): source code, build artifacts, test scripts, and documentation. Describe the change control process, baseline management, version labelling convention, and how changes are reviewed and approved before implementation.",
    },
    {
      id: "problem_resolution",
      title: "5. Problem Resolution",
      iecRef: "IEC 62304 §9",
      guidance:
        "Define procedures for identifying, recording, evaluating, resolving, and closing software problems and anomalies discovered during development, testing, or post-release. Include severity classification criteria, escalation paths, re-test requirements, and linkage to the change request process.",
    },
    {
      id: "integration",
      title: "6. Integration",
      iecRef: "IEC 62304 §5.6",
      guidance:
        "Describe the software integration strategy (e.g., bottom-up, incremental, continuous integration). Specify which software units are integrated in each build, the integration test approach, acceptance criteria for each integration stage, and how integration test results are recorded and reviewed.",
    },
    {
      id: "risk_management",
      title: "7. Risk Management",
      iecRef: "IEC 62304 §4.3, ISO 14971",
      guidance:
        "State the software safety class (A, B, or C) with justification based on the risk analysis outcome. Describe how the safety class determines the rigor and completeness requirements for each development activity. Reference the Risk Management Plan and explain how software risk controls are identified, implemented, and verified.",
    },
  ],
  SRS: [
    {
      id: "scope_context",
      title: "1. Scope and System Context",
      iecRef: "IEC 62304 §5.2.1",
      guidance:
        "Describe the scope of the software system and its intended use environment. Identify the hardware platform, target users, and any interfaces to external systems (e.g., EHR, nurse call, device communication). State the software safety class and reference the Risk Management Plan.",
    },
    {
      id: "user_requirements",
      title: "2. User Requirements",
      iecRef: "IEC 62304 §5.2.2",
      guidance:
        "User requirements capture the needs of clinicians, operators, and patients. Each USER requirement (URQ-NNN) must be traceable to system and software requirements. The live list below is drawn directly from the Requirements module.",
      reqFilter: "USER",
    },
    {
      id: "system_requirements",
      title: "3. System Requirements",
      iecRef: "IEC 62304 §5.2.3",
      guidance:
        "System requirements refine user needs into measurable, testable system-level behaviours. Each SYSTEM requirement (SYS-NNN) must trace to a USER requirement. The live list below is drawn directly from the Requirements module.",
      reqFilter: "SYSTEM",
    },
    {
      id: "software_requirements",
      title: "4. Software Requirements",
      iecRef: "IEC 62304 §5.2.4 – §5.2.6",
      guidance:
        "Software requirements define the functionality, performance, and safety constraints that software must satisfy. Each SOFTWARE requirement (SWR-NNN) must trace to a SYSTEM requirement and, where applicable, to a risk control measure from the Risk Management File.",
      reqFilter: "SOFTWARE",
    },
    {
      id: "interface_requirements",
      title: "5. Interface Requirements",
      iecRef: "IEC 62304 §5.2.5",
      guidance:
        "Define all software interfaces: hardware drivers, communication protocols (e.g., CAN, SPI, UART, HL7, FHIR), external APIs, and user interface frameworks. Specify data formats, timing constraints, error handling, and failure mode behaviour for each interface.",
    },
    {
      id: "risk_requirements",
      title: "6. Risk-Related Requirements",
      iecRef: "IEC 62304 §5.2.6, ISO 14971 §6",
      guidance:
        "List software requirements that directly implement risk control measures from the Risk Management File. For each, state the hazard being mitigated, the residual risk level, and the verification method. Confirm alignment with the Risk Management Plan.",
    },
    {
      id: "requirements_traceability",
      title: "7. Requirements Traceability",
      iecRef: "IEC 62304 §5.2.7, §9.5",
      guidance:
        "Summarise the traceability approach for this document. Confirm that all USER requirements trace to SYSTEM requirements, all SYSTEM requirements trace to SOFTWARE requirements, and that software requirements are linked to design elements, test cases, and (where applicable) risk controls. Reference the Traceability Matrix document.",
    },
  ],
};

// Generic fallback for other doc types that don't have defined sections
function buildGenericSection(docType: string): DocSection[] {
  return [
    {
      id: "scope",
      title: "1. Scope and Purpose",
      iecRef: "IEC 62304",
      guidance: `Describe the scope and purpose of this ${docType} document.`,
    },
    {
      id: "content",
      title: "2. Content",
      iecRef: "IEC 62304",
      guidance: "Enter the main content of this document.",
    },
    {
      id: "references",
      title: "3. References",
      iecRef: "IEC 62304",
      guidance: "List related documents, standards, and regulatory references.",
    },
  ];
}

function getSections(docType: string): DocSection[] {
  return SECTION_DEFS[docType] ?? buildGenericSection(docType);
}

// ── Status badge (inline) ─────────────────────────────────────────────────────
const STATUS_META: Record<DocumentStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: "Not Started", color: "#6b7280", bg: "#f3f4f6" },
  DRAFT:       { label: "Draft",       color: "#b45309", bg: "#fef3c7" },
  IN_REVIEW:   { label: "In Review",   color: "#1d4ed8", bg: "#dbeafe" },
  APPROVED:    { label: "Approved",    color: "#15803d", bg: "#dcfce7" },
  OBSOLETE:    { label: "Obsolete",    color: "#991b1b", bg: "#fee2e2" },
};

// ── Live requirements block (read-only, for SRS sections) ────────────────────

const REQ_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  USER:     { label: "USER",     color: "#1565c0", bg: "#e3f2fd" },
  SYSTEM:   { label: "SYSTEM",  color: "#2e7d32", bg: "#e8f5e9" },
  SOFTWARE: { label: "SOFTWARE",color: "#6a1b9a", bg: "#f3e5f5" },
};

function RequirementsListBlock({ projectId, reqType }: { projectId: string; reqType: "USER" | "SYSTEM" | "SOFTWARE" }) {
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    api.requirements.list(projectId, reqType)
      .then(r => { setReqs(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId, reqType]);

  const meta = REQ_TYPE_META[reqType] ?? REQ_TYPE_META.USER;

  return (
    <div style={{
      border: `1px solid ${meta.color}30`,
      borderRadius: 6,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        background: meta.bg,
        borderBottom: `1px solid ${meta.color}30`,
        padding: "8px 14px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          background: meta.color, color: "#fff",
          fontSize: 11, fontWeight: 700, borderRadius: 3, padding: "2px 8px",
        }}>{meta.label}</span>
        <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>
          Requirements — live from database
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {loading ? "loading…" : `${reqs.length} item${reqs.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 13 }}>Loading requirements…</div>
      ) : reqs.length === 0 ? (
        <div style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
          No {reqType} requirements found. Add them in the Requirements module.
        </div>
      ) : (
        reqs.map((r, i) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "8px 14px",
            background: i % 2 === 0 ? "#fff" : "#fafafa",
            borderBottom: i < reqs.length - 1 ? "1px solid #f3f4f6" : "none",
          }}>
            <span style={{
              fontFamily: "monospace", fontWeight: 700, fontSize: 12,
              color: meta.color, flexShrink: 0, minWidth: 72,
            }}>{r.readable_id}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{r.title}</div>
              {r.description && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{r.description}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Section editor (contentEditable) ─────────────────────────────────────────

function SectionEditor({
  section,
  initialHtml,
  onChange,
  onFocus,
  projectId,
}: {
  section: DocSection;
  initialHtml: string;
  onChange: (id: string, html: string) => void;
  onFocus: (id: string) => void;
  projectId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Set innerHTML once on mount from saved content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginBottom: 36, scrollMarginTop: 100 }} id={`sec-${section.id}`}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
          {section.title}
        </h2>
        <span style={{
          fontSize: 11, color: "#6b7280", background: "#f3f4f6",
          padding: "2px 8px", borderRadius: 4, fontFamily: "monospace",
        }}>
          {section.iecRef}
        </span>
      </div>

      {/* Guidance callout */}
      <div style={{
        background: "#f0f9ff", border: "1px solid #bae6fd",
        borderLeft: "3px solid #0ea5e9", borderRadius: "0 6px 6px 0",
        padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "#0c4a6e",
        lineHeight: 1.55,
      }}>
        {section.guidance}
      </div>

      {/* Live requirements list (SRS sections with reqFilter) */}
      {section.reqFilter && projectId && (
        <RequirementsListBlock projectId={projectId} reqType={section.reqFilter} />
      )}

      {/* Additional notes label for req sections */}
      {section.reqFilter && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          Additional Notes
        </div>
      )}

      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => onFocus(section.id)}
        onInput={() => {
          if (editorRef.current) onChange(section.id, editorRef.current.innerHTML);
        }}
        style={{
          minHeight: 120,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          padding: "12px 14px",
          fontSize: 14,
          lineHeight: 1.7,
          color: "#111827",
          outline: "none",
          background: "#fff",
          fontFamily: "Georgia, serif",
          cursor: "text",
        }}
        onFocusCapture={() => {
          if (editorRef.current) editorRef.current.style.borderColor = "#3b82f6";
          if (editorRef.current) editorRef.current.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)";
        }}
        onBlurCapture={() => {
          if (editorRef.current) editorRef.current.style.borderColor = "#d1d5db";
          if (editorRef.current) editorRef.current.style.boxShadow = "none";
        }}
        data-placeholder="Start writing this section…"
      />
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ onSave, saving, saved }: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  function cmd(command: string, value?: string) {
    document.execCommand(command, false, value ?? "");
  }

  const fmtBtn = (label: string, command: string, val?: string, title?: string) => (
    <button
      key={command + (val ?? "")}
      title={title ?? label}
      onMouseDown={e => { e.preventDefault(); cmd(command, val); }}
      style={toolbarBtnStyle}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: "#fff", borderBottom: "1px solid #e5e7eb",
      display: "flex", alignItems: "center", gap: 2, padding: "6px 20px",
      flexWrap: "wrap",
    }}>
      {/* Format buttons */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("B", "bold", undefined, "Bold (Ctrl+B)")}
        {fmtBtn("I", "italic", undefined, "Italic (Ctrl+I)")}
        {fmtBtn("U", "underline", undefined, "Underline (Ctrl+U)")}
      </div>

      <div style={dividerStyle} />

      {/* Block format */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("H1", "formatBlock", "h1", "Heading 1")}
        {fmtBtn("H2", "formatBlock", "h2", "Heading 2")}
        {fmtBtn("H3", "formatBlock", "h3", "Heading 3")}
        {fmtBtn("¶", "formatBlock", "p", "Normal paragraph")}
      </div>

      <div style={dividerStyle} />

      {/* Lists */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("• List", "insertUnorderedList", undefined, "Bullet list")}
        {fmtBtn("1. List", "insertOrderedList", undefined, "Numbered list")}
      </div>

      <div style={dividerStyle} />

      {/* Font size */}
      <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
        {fmtBtn("A-", "fontSize", "2", "Small text")}
        {fmtBtn("A", "fontSize", "3", "Normal text")}
        {fmtBtn("A+", "fontSize", "5", "Large text")}
      </div>

      <div style={dividerStyle} />

      {fmtBtn("— Line", "insertHorizontalRule", undefined, "Horizontal rule")}

      {/* Save status */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {saved && !saving && (
          <span style={{ fontSize: 12, color: "#10b981" }}>✓ Saved</span>
        )}
        {!saved && !saving && (
          <span style={{ fontSize: 12, color: "#f59e0b" }}>Unsaved changes</span>
        )}
        {saving && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>Saving…</span>
        )}
        <button onClick={onSave} disabled={saving || saved} style={{
          ...actionBtnStyle,
          background: saved ? "#f3f4f6" : "#1e40af",
          color: saved ? "#9ca3af" : "#fff",
          cursor: saved ? "default" : "pointer",
        }}>
          Save
        </button>
      </div>
    </div>
  );
}

// ── Section nav (left panel) ──────────────────────────────────────────────────

function SectionNav({ sections, active }: { sections: DocSection[]; active: string | null }) {
  return (
    <nav style={{ position: "sticky", top: 50, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        Sections
      </div>
      {sections.map(s => (
        <a
          key={s.id}
          href={`#sec-${s.id}`}
          style={{
            display: "block", padding: "5px 10px", borderRadius: 6,
            fontSize: 13, color: active === s.id ? "#1e40af" : "#374151",
            background: active === s.id ? "#eff6ff" : "transparent",
            textDecoration: "none", borderLeft: `3px solid ${active === s.id ? "#3b82f6" : "transparent"}`,
            marginBottom: 2, lineHeight: 1.4,
          }}
        >
          {s.title}
        </a>
      ))}
    </nav>
  );
}

// ── Preview overlay ───────────────────────────────────────────────────────────

function PreviewModal({
  doc,
  sections,
  content,
  onClose,
  onDownload,
}: {
  doc: Doc;
  sections: DocSection[];
  content: Record<string, string>;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(3px)", zIndex: 100,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "32px 16px", overflow: "auto",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 8, width: "100%", maxWidth: 820,
        boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
      }} onClick={e => e.stopPropagation()}>
        {/* Preview toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 20px", borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb", borderRadius: "8px 8px 0 0",
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: "#374151" }}>
            Preview — {doc.title}
          </span>
          <button onClick={onDownload} style={{ ...actionBtnStyle, background: "#1e40af", color: "#fff" }}>
            ↓ Download PDF
          </button>
          <button onClick={onClose} style={{ ...actionBtnStyle, background: "#f3f4f6", color: "#374151" }}>
            Close
          </button>
        </div>

        {/* Document content */}
        <div style={{ padding: "40px 48px" }}>
          {/* Document header */}
          <div style={{ borderBottom: "2px solid #1e40af", paddingBottom: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginBottom: 4 }}>
              {doc.doc_type}
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: 24, color: "#111827", fontWeight: 700 }}>
              {doc.title}
            </h1>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280" }}>
              {doc.version && <span>Version: {doc.version}</span>}
              <span>Status: {STATUS_META[doc.status as DocumentStatus]?.label ?? doc.status}</span>
            </div>
          </div>

          {/* Sections */}
          {sections.map(s => (
            <div key={s.id} style={{ marginBottom: 32 }}>
              <h2 style={{
                fontSize: 15, fontWeight: 700, color: "#1e3a5f",
                margin: "0 0 4px", borderBottom: "1px solid #e5e7eb", paddingBottom: 6,
              }}>
                {s.title}
              </h2>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginBottom: 10 }}>
                {s.iecRef}
              </div>
              {content[s.id] ? (
                <div
                  style={{ fontSize: 14, lineHeight: 1.8, color: "#374151", fontFamily: "Georgia, serif" }}
                  dangerouslySetInnerHTML={{ __html: content[s.id] }}
                />
              ) : (
                <p style={{ color: "#d1d5db", fontSize: 14, fontStyle: "italic", margin: 0 }}>
                  [Section not yet completed]
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main editor inner ─────────────────────────────────────────────────────────

function EditDocumentInner() {
  const params   = useSearchParams();
  const router   = useRouter();
  const docId    = params.get("id");

  const [doc, setDoc]         = useState<Doc | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(true);
  const [preview, setPreview] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    api.documents.get(docId).then(d => {
      setDoc(d);
      try {
        setContent(d.content ? JSON.parse(d.content) : {});
      } catch {
        setContent({});
      }
      setLoading(false);
    });
  }, [docId]);

  const handleChange = useCallback((sectionId: string, html: string) => {
    setContent(prev => ({ ...prev, [sectionId]: html }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!doc || saved) return;
    setSaving(true);
    try {
      const updated = await api.documents.update(doc.id, {
        content: JSON.stringify(content),
        status: doc.status === "NOT_STARTED" ? "DRAFT" : doc.status,
      });
      setDoc(updated);
      setSaved(true);
    } catch (e: any) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }, [doc, content, saved]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  function handleDownload() {
    if (!doc) return;
    const sections = getSections(doc.doc_type);
    const sectionHtml = sections.map(s => `
      <div class="section">
        <div class="sec-ref">${s.iecRef}</div>
        <h2>${s.title}</h2>
        ${content[s.id] || '<p class="empty">[Section not completed]</p>'}
      </div>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.title}</title>
  <style>
    @page { margin: 25mm 20mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; }
    .doc-header { border-bottom: 2pt solid #1e40af; padding-bottom: 12pt; margin-bottom: 28pt; }
    .doc-type { font-family: monospace; font-size: 9pt; color: #6b7280; margin-bottom: 4pt; }
    h1 { font-size: 20pt; margin: 0 0 6pt; color: #111827; }
    .meta { font-size: 10pt; color: #6b7280; }
    .section { margin-bottom: 28pt; page-break-inside: avoid; }
    .sec-ref { font-family: monospace; font-size: 8pt; color: #9ca3af; margin-bottom: 3pt; }
    h2 { font-size: 13pt; color: #1e3a5f; margin: 0 0 8pt; border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 4pt; }
    p { margin: 0 0 8pt; }
    ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
    li { margin-bottom: 3pt; }
    h3 { font-size: 11pt; font-weight: bold; margin: 10pt 0 4pt; }
    .empty { color: #d1d5db; font-style: italic; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-type">${doc.doc_type}</div>
    <h1>${doc.title}</h1>
    <div class="meta">
      ${doc.version ? `Version: ${doc.version} &nbsp;|&nbsp; ` : ""}
      Status: ${STATUS_META[doc.status as DocumentStatus]?.label ?? doc.status} &nbsp;|&nbsp;
      Generated: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
    </div>
  </div>
  ${sectionHtml}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Allow pop-ups to download as PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  if (loading || !doc) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#9ca3af" }}>
        {!docId ? "No document ID provided." : "Loading…"}
      </div>
    );
  }

  const sections = getSections(doc.doc_type);
  const smeta    = STATUS_META[doc.status as DocumentStatus] ?? STATUS_META.NOT_STARTED;
  const filled   = sections.filter(s => content[s.id]?.trim()).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Top header bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <Link href="/documents" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          ← Document Register
        </Link>
        <span style={{ color: "#d1d5db" }}>|</span>
        <span style={{
          fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 4,
        }}>{doc.doc_type}</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111827", flex: 1 }}>{doc.title}</span>

        <span style={{
          fontSize: 12, background: smeta.bg, color: smeta.color,
          padding: "3px 10px", borderRadius: 20, fontWeight: 600,
        }}>{smeta.label}</span>

        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {filled}/{sections.length} sections filled
        </span>

        <button onClick={() => setPreview(true)} style={{ ...actionBtnStyle, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>
          Preview
        </button>
        <button onClick={handleDownload} style={{ ...actionBtnStyle, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
          ↓ Download PDF
        </button>
      </div>

      {/* Format toolbar */}
      <Toolbar onSave={handleSave} saving={saving} saved={saved} />

      {/* Body */}
      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "28px 24px", gap: 32 }}>
        {/* Section nav */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <SectionNav sections={sections} active={activeSection} />
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {sections.map(s => (
            <SectionEditor
              key={s.id}
              section={s}
              initialHtml={content[s.id] ?? ""}
              onChange={handleChange}
              onFocus={setActiveSection}
              projectId={doc.project_id}
            />
          ))}

          {/* Bottom save */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
            <button onClick={handleSave} disabled={saving || saved} style={{
              ...actionBtnStyle, fontSize: 14, padding: "9px 24px",
              background: saved ? "#f3f4f6" : "#1e40af",
              color: saved ? "#9ca3af" : "#fff",
              cursor: saved ? "default" : "pointer",
            }}>
              {saving ? "Saving…" : saved ? "Saved" : "Save Document"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          doc={doc}
          sections={sections}
          content={content}
          onClose={() => setPreview(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

export default function EditDocumentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#888" }}>Loading…</div>}>
      <EditDocumentInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const toolbarBtnStyle: React.CSSProperties = {
  padding: "4px 9px", border: "1px solid #e5e7eb", borderRadius: 5,
  background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13,
  fontWeight: 500, lineHeight: 1.4, minWidth: 28, textAlign: "center",
};
const actionBtnStyle: React.CSSProperties = {
  padding: "6px 14px", border: "none", borderRadius: 6,
  cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const dividerStyle: React.CSSProperties = {
  width: 1, height: 20, background: "#e5e7eb", margin: "0 4px", flexShrink: 0,
};
