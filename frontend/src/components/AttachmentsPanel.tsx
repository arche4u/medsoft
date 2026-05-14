"use client";
/**
 * Reusable attachments panel.
 *
 * Drop into any entity-detail view (design element, software unit, requirement,
 * change request, …) by passing the entity's type + id. Handles list,
 * upload, image preview, and delete in one self-contained component. No
 * other module-specific state needed.
 *
 * Backend caps content to images + PDF, max 25 MB per file; this UI mirrors
 * the same whitelist for friendly error messages on the client side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Attachment } from "@/lib/api";

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
];
const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf";

type Props = {
  projectId: string;
  entityType: string;
  entityId: string;
  /** Hide the panel entirely when readonly = true (e.g. the parent entity is locked). */
  readonly?: boolean;
  /** Optional compact mode: smaller chips, no description input, single-row list. */
  compact?: boolean;
};

export default function AttachmentsPanel({ projectId, entityType, entityId, readonly = false, compact = false }: Props) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<{ url: string; filename: string; contentType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true); setError("");
    try {
      const list = await api.attachments.list(entityType, entityId);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Clean up any blob URLs we created to avoid leaks
  useEffect(() => () => {
    if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Unsupported type "${file.type || "unknown"}". Allowed: PNG, JPEG, GIF, WebP, SVG, PDF.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
      return;
    }
    setUploading(true); setError("");
    try {
      await api.attachments.upload({
        project_id: projectId,
        entity_type: entityType,
        entity_id: entityId,
        description: description || undefined,
        file,
      });
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(att: Attachment) {
    if (!window.confirm(`Delete "${att.filename}"?`)) return;
    try {
      await api.attachments.delete(att.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleOpen(att: Attachment) {
    try {
      const blob = await api.attachments.downloadBlob(att.id);
      const url = URL.createObjectURL(blob);
      if (att.content_type.startsWith("image/") || att.content_type === "application/pdf") {
        // Show in modal preview
        if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
        setPreview({ url, filename: att.filename, contentType: att.content_type });
      } else {
        // Fallback — force download
        const a = document.createElement("a");
        a.href = url;
        a.download = att.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownload(att: Attachment) {
    try {
      const blob = await api.attachments.downloadBlob(att.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>📎 Attachments</span>
        <span style={styles.meta}>{rows.length} file{rows.length === 1 ? "" : "s"}</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {!loading && rows.length === 0 && !readonly && (
        <div style={styles.emptyHint}>No files yet. Drop an image or PDF below.</div>
      )}

      {rows.length > 0 && (
        <div style={styles.list}>
          {rows.map(att => (
            <div key={att.id} style={styles.row}>
              <span style={styles.icon}>{att.content_type.startsWith("image/") ? "🖼️" : "📄"}</span>
              <button
                onClick={() => handleOpen(att)}
                title="Click to preview"
                style={styles.linkButton}
              >
                {att.filename}
              </button>
              <span style={styles.size}>{formatSize(att.size_bytes)}</span>
              {!compact && att.description && (
                <span style={styles.desc} title={att.description}>{att.description}</span>
              )}
              <button onClick={() => handleDownload(att)} title="Download" style={styles.action}>⬇</button>
              {!readonly && (
                <button onClick={() => handleDelete(att)} title="Delete" style={{ ...styles.action, color: "#b71c1c" }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readonly && (
        <div style={styles.uploadBox}>
          {!compact && (
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              style={styles.descInput}
              disabled={uploading}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={uploading}
            style={styles.fileInput}
          />
          {uploading && <span style={styles.uploading}>Uploading…</span>}
          <span style={styles.hint}>PNG · JPG · GIF · WebP · SVG · PDF · 25 MB max</span>
        </div>
      )}

      {/* Preview modal — full-screen overlay with the image or PDF */}
      {preview && (
        <div style={styles.previewBackdrop} onClick={() => setPreview(null)}>
          <div style={styles.previewModal} onClick={e => e.stopPropagation()}>
            <div style={styles.previewHeader}>
              <span style={{ fontWeight: 600 }}>{preview.filename}</span>
              <button onClick={() => setPreview(null)} style={styles.previewClose}>✕</button>
            </div>
            {preview.contentType.startsWith("image/") ? (
              <img src={preview.url} alt={preview.filename} style={styles.previewImg} />
            ) : (
              <iframe src={preview.url} title={preview.filename} style={styles.previewIframe} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}


const styles = {
  wrap: { background: "#fafbfc", border: "1px solid #e0e0e0", borderRadius: 6, padding: "8px 10px", marginTop: 10 } as React.CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 } as React.CSSProperties,
  title: { fontSize: 12, fontWeight: 600, color: "#37474f" } as React.CSSProperties,
  meta: { fontSize: 11, color: "#90a4ae" } as React.CSSProperties,
  list: { display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 6 } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", background: "#fff", border: "1px solid #eceff1", borderRadius: 4, fontSize: 12 } as React.CSSProperties,
  icon: { fontSize: 14 } as React.CSSProperties,
  linkButton: { background: "none", border: "none", color: "#1565c0", cursor: "pointer", padding: 0, fontSize: 12, fontFamily: "inherit", textAlign: "left" as const, flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties,
  size: { fontSize: 10, color: "#90a4ae", fontVariantNumeric: "tabular-nums" as const } as React.CSSProperties,
  desc: { fontSize: 11, color: "#78909c", fontStyle: "italic" as const, maxWidth: 240, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties,
  action: { background: "none", border: "none", color: "#546e7a", cursor: "pointer", padding: "0 4px", fontSize: 12 } as React.CSSProperties,
  uploadBox: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginTop: 4, paddingTop: 6, borderTop: "1px dashed #eceff1" } as React.CSSProperties,
  descInput: { flex: "1 1 180px", padding: "4px 8px", border: "1px solid #cfd8dc", borderRadius: 4, fontSize: 12 } as React.CSSProperties,
  fileInput: { fontSize: 11 } as React.CSSProperties,
  uploading: { fontSize: 11, color: "#1565c0" } as React.CSSProperties,
  hint: { fontSize: 10, color: "#9e9e9e" } as React.CSSProperties,
  emptyHint: { fontSize: 11, color: "#90a4ae", fontStyle: "italic" as const, padding: "4px 0" } as React.CSSProperties,
  error: { padding: "6px 10px", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 4, color: "#b71c1c", fontSize: 11, marginBottom: 6 } as React.CSSProperties,
  previewBackdrop: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 } as React.CSSProperties,
  previewModal: { background: "#fff", borderRadius: 8, maxWidth: "92vw", maxHeight: "92vh", display: "flex", flexDirection: "column" as const, overflow: "hidden" } as React.CSSProperties,
  previewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #eceff1" } as React.CSSProperties,
  previewClose: { background: "none", border: "1px solid #cfd8dc", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
  previewImg: { maxWidth: "88vw", maxHeight: "82vh", objectFit: "contain" as const, background: "#000" } as React.CSSProperties,
  previewIframe: { width: "88vw", height: "82vh", border: "none" } as React.CSSProperties,
};
