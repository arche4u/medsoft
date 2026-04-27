"use client";

/**
 * InlineEditPanel — generic reusable edit form.
 *
 * Usage:
 *   <InlineEditPanel
 *     fields={[
 *       { name: "title",       label: "Title",       type: "textarea", required: true, autoResize: true },
 *       { name: "description", label: "Description", type: "textarea", autoResize: true, placeholder: "Optional" },
 *       { name: "parent_id",   label: "Parent",      type: "select",   options: [...] },
 *     ]}
 *     initialValues={{ title: req.title, description: req.description ?? "" }}
 *     onSave={async (vals) => { await api.something.update(id, vals); }}
 *     onCancel={() => setEditing(false)}
 *   />
 *
 * accentColor / accentBg control the border + background tint so each module
 * can match its own colour scheme while sharing the same component.
 */

import { useEffect, useRef, useState } from "react";

// ── Field definition ──────────────────────────────────────────────────────────

export type FieldOption = {
  value: string;
  label: string;
  group?: string;   // if set, option is placed inside an <optgroup>
};

export type FieldDef = {
  name:        string;
  label:       string;
  type:        "text" | "textarea" | "select";
  required?:   boolean;
  placeholder?: string;
  autoResize?: boolean;   // textarea only — grows with content
  rows?:       number;    // textarea only — initial rows
  options?:    FieldOption[];  // select only
  flex?:       string;    // CSS flex shorthand for column sizing (default "1 1 200px")
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  fields:        FieldDef[];
  initialValues: Record<string, string>;
  onSave:        (values: Record<string, string>) => Promise<void>;
  onCancel:      () => void;
  accentColor?:  string;   // border colour
  accentBg?:     string;   // background tint
  saveLabel?:    string;   // override "Save"
};

export function InlineEditPanel({
  fields,
  initialValues,
  onSave,
  onCancel,
  accentColor = "#ffd54f",
  accentBg    = "#fffde7",
  saveLabel   = "Save",
}: Props) {
  const [values,  setValues]  = useState<Record<string, string>>(initialValues);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Auto-size every autoResize textarea on first render
  useEffect(() => {
    for (const f of fields) {
      if (f.type === "textarea" && f.autoResize) {
        const el = textareaRefs.current[f.name];
        if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
      }
    }
  }, []);

  function set(name: string, value: string) {
    setValues(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await onSave(values);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background:   accentBg,
        border:       `1px solid ${accentColor}`,
        borderRadius: 6,
        padding:      "10px 12px",
        marginBottom: 4,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
        {fields.map(f => (
          <div key={f.name} style={{ flex: f.flex ?? "1 1 200px" }}>
            <label style={labelStyle}>
              {f.label}{f.required ? " *" : ""}
            </label>

            {f.type === "select" && (
              <select
                value={values[f.name] ?? ""}
                onChange={e => set(f.name, e.target.value)}
                required={f.required}
                style={inputStyle}
              >
                {!f.required && <option value="">— None</option>}
                {renderSelectOptions(f.options ?? [])}
              </select>
            )}

            {f.type === "textarea" && (
              <textarea
                ref={el => { textareaRefs.current[f.name] = el; }}
                value={values[f.name] ?? ""}
                onChange={e => set(f.name, e.target.value)}
                onInput={f.autoResize ? e => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = t.scrollHeight + "px";
                } : undefined}
                required={f.required}
                placeholder={f.placeholder}
                rows={f.rows ?? 1}
                style={{
                  ...inputStyle,
                  resize:     f.autoResize ? "none" : "vertical",
                  overflow:   f.autoResize ? "hidden" : undefined,
                  lineHeight: "1.5",
                  minHeight:  32,
                }}
              />
            )}

            {f.type === "text" && (
              <input
                value={values[f.name] ?? ""}
                onChange={e => set(f.name, e.target.value)}
                required={f.required}
                placeholder={f.placeholder}
                style={inputStyle}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: "#b71c1c", margin: "0 0 6px", fontSize: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" disabled={saving} style={saveStyle}>
          {saving ? "Saving…" : saveLabel}
        </button>
        <button type="button" onClick={onCancel} style={cancelStyle}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Options renderer (supports optgroup) ──────────────────────────────────────

function renderSelectOptions(options: FieldOption[]) {
  const groups  = new Map<string, FieldOption[]>();
  const flat:   FieldOption[] = [];

  for (const o of options) {
    if (o.group) {
      if (!groups.has(o.group)) groups.set(o.group, []);
      groups.get(o.group)!.push(o);
    } else {
      flat.push(o);
    }
  }

  const nodes: React.ReactNode[] = [];
  flat.forEach(o => nodes.push(<option key={o.value} value={o.value}>{o.label}</option>));
  groups.forEach((opts, group) =>
    nodes.push(
      <optgroup key={group} label={group}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </optgroup>
    )
  );
  return nodes;
}

// ── Shared style constants ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display:       "block",
  fontSize:      11,
  fontWeight:    600,
  color:         "#78716c",
  marginBottom:  3,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  padding:     "6px 8px",
  border:      "1px solid #d1d5db",
  borderRadius: 4,
  fontSize:    13,
  width:       "100%",
  boxSizing:   "border-box",
  background:  "#fff",
  fontFamily:  "inherit",
};

const saveStyle: React.CSSProperties = {
  padding:      "5px 16px",
  background:   "#1565c0",
  color:        "#fff",
  border:       "none",
  borderRadius: 4,
  cursor:       "pointer",
  fontSize:     13,
  fontWeight:   600,
};

const cancelStyle: React.CSSProperties = {
  padding:      "5px 12px",
  background:   "#f5f5f5",
  color:        "#555",
  border:       "1px solid #d1d5db",
  borderRadius: 4,
  cursor:       "pointer",
  fontSize:     13,
};
