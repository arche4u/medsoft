"use client";
import { use, useState } from "react";
import { api } from "@/lib/api";
import { PlanShell, sty } from "@/components/plan/shared";

function formatTypeLabel(typeKey: string): string {
  return typeKey
    .split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function CustomCreateForm({ projectId, planType, defaultTitle, onCreated }: {
  projectId: string;
  planType: string;
  defaultTitle: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [sc, setSc] = useState("C");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.plans.create({
        project_id: projectId,
        plan_type: planType,
        title: title.trim(),
        safety_class: sc,
        created_by: author || null,
      });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ ...sty.panel, maxWidth: 480 }}>
      <div style={sty.panelTitle}>Create {defaultTitle}</div>
      <label style={sty.label}>Document Title</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ ...sty.input, width: "100%", marginBottom: 10, boxSizing: "border-box" as const }}
      />
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={sty.label}>Safety Class</label>
          <select value={sc} onChange={e => setSc(e.target.value)} style={{ ...sty.input, width: 110 }}>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
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
      <div style={{ fontSize: 12, color: "#78909c", marginBottom: 10 }}>
        A placeholder section will be created automatically. Add more sections in the editor.
      </div>
      <button
        onClick={create}
        disabled={saving || !title.trim()}
        style={{ ...sty.btn, opacity: saving || !title.trim() ? 0.5 : 1 }}
      >
        {saving ? "Creating…" : `Create ${defaultTitle}`}
      </button>
    </div>
  );
}

export default function CustomPlanPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const planType = decodeURIComponent(type);
  const displayTitle = formatTypeLabel(planType);

  return (
    <PlanShell
      planType={planType}
      pageTitle={displayTitle}
      pageSubtitle={`Custom plan document — type: ${planType}`}
      entityLabel="Plan"
      createForm={(projectId, onCreated) => (
        <CustomCreateForm
          projectId={projectId}
          planType={planType}
          defaultTitle={displayTitle}
          onCreated={onCreated}
        />
      )}
    />
  );
}
