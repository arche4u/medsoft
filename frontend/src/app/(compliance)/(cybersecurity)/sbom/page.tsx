"use client";
// IEC 81001-5-1 SBOM — CycloneDX 1.5 export viewer + downloader.
//
// The page fetches the project's SBOM from the backend (a derived view
// over the §8.2.2 SOUP register + open vulnerabilities) and shows a
// component count + a pretty-printed preview. The download button hands
// the same payload back as a CycloneDX 1.5 JSON file with a
// release-style filename so auditors can attach it directly to a release.
import { useActiveProject } from "@/lib/useActiveProject";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type CdxComponent = { "bom-ref": string; name: string; version: string; description?: string; purl?: string };
type CdxVuln = { "bom-ref": string; id: string; description?: string; ratings?: { score: number; severity: string }[]; affects: { ref: string }[]; analysis?: { state: string } };
type Cdx = { bomFormat: string; specVersion: string; serialNumber: string; metadata: { timestamp: string; component: { name: string } }; components: CdxComponent[]; vulnerabilities: CdxVuln[] };

export default function SbomPage() {
  const [projectId] = useActiveProject();
  const [sbom, setSbom] = useState<Cdx | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState<string>("sbom.json");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchSbom = async () => {
    if (!projectId) return;
    setLoading(true); setError("");
    try {
      const r = await api.sbom.fetchCycloneDx(projectId);
      setSbom(r.json as Cdx);
      setBlob(r.blob);
      setFilename(r.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) fetchSbom(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const download = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!projectId) {
    return <div style={page}><h1 style={h1}>SBOM</h1><p>Select a project to view its SBOM.</p></div>;
  }

  return (
    <div style={page}>
      <h1 style={h1}>SBOM <span style={subtitle}>IEC 81001-5-1 — CycloneDX 1.5 export from the §8.2.2 SOUP register</span></h1>
      {error && <div style={errBox}>{error}</div>}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
          <div>
            {sbom ? (
              <>
                <div style={{ fontSize: "0.9rem", color: "#0d1b2a" }}>
                  <strong>{sbom.metadata.component.name}</strong> · {sbom.components.length} component{sbom.components.length === 1 ? "" : "s"} · {sbom.vulnerabilities.length} open vulnerability/ies
                </div>
                <div style={muted}>Generated {new Date(sbom.metadata.timestamp).toLocaleString()} · spec {sbom.specVersion} · serial <code style={{ fontSize: "0.7rem" }}>{sbom.serialNumber}</code></div>
              </>
            ) : (
              <div style={muted}>{loading ? "Loading…" : "No SBOM loaded."}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button style={btn()} onClick={fetchSbom} disabled={loading}>{loading ? "Generating…" : "Re-generate"}</button>
            <button style={btn("#2e7d32")} onClick={download} disabled={!blob}>Download .json</button>
          </div>
        </div>
      </div>

      {sbom && sbom.components.length > 0 && (
        <div style={card}>
          <h3 style={h3}>Components ({sbom.components.length})</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={th}>Name</th>
                <th style={th}>Version</th>
                <th style={th}>purl</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {sbom.components.map(c => (
                <tr key={c["bom-ref"]} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>{c.name}</td>
                  <td style={td}><code style={{ fontSize: "0.78rem" }}>{c.version}</code></td>
                  <td style={td}>{c.purl ? <code style={{ fontSize: "0.75rem" }}>{c.purl}</code> : <span style={muted}>—</span>}</td>
                  <td style={td}>{c.description ?? <span style={muted}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sbom && sbom.vulnerabilities.length > 0 && (
        <div style={card}>
          <h3 style={h3}>Open Vulnerabilities ({sbom.vulnerabilities.length})</h3>
          {sbom.vulnerabilities.map(v => (
            <div key={v["bom-ref"]} style={{ padding: "0.6rem 0.75rem", border: "1px solid #eee", borderRadius: 6, marginBottom: "0.4rem", background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{v.id}</strong>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {v.ratings?.[0] && <span style={severityBadge(v.ratings[0].severity)}>{v.ratings[0].severity} · CVSS {v.ratings[0].score.toFixed(1)}</span>}
                  {v.analysis && <span style={analysisBadge(v.analysis.state)}>{v.analysis.state}</span>}
                </div>
              </div>
              {v.description && <div style={{ fontSize: "0.8rem", color: "#37474f", marginTop: 4 }}>{v.description}</div>}
              <div style={{ ...muted, marginTop: 4 }}>Affects: {v.affects.map(a => a.ref).join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      {sbom && (
        <details style={card}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Raw CycloneDX JSON</summary>
          <pre style={{ background: "#0d1b2a", color: "#e0e0e0", padding: "1rem", borderRadius: 6, overflow: "auto", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            {JSON.stringify(sbom, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

const page: React.CSSProperties = { padding: "2rem", fontFamily: "-apple-system, sans-serif", maxWidth: 1300, margin: "0 auto" };
const h1: React.CSSProperties = { color: "#0d1b2a", marginBottom: "1.5rem" };
const h3: React.CSSProperties = { marginTop: 0, marginBottom: "0.6rem", color: "#0d1b2a" };
const subtitle: React.CSSProperties = { fontSize: "0.85rem", fontWeight: "normal", color: "#666", marginLeft: "0.75rem" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" };
const muted: React.CSSProperties = { color: "#888", fontSize: "0.78rem" };
const errBox: React.CSSProperties = { background: "#ffebee", border: "1px solid #f44336", borderRadius: 4, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" };
const btn = (bg = "#1565c0"): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 4, padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.82rem" });
const th: React.CSSProperties = { textAlign: "left", padding: "0.5rem 0.6rem", fontSize: "0.78rem", color: "#37474f", borderBottom: "2px solid #ddd" };
const td: React.CSSProperties = { padding: "0.4rem 0.6rem" };
const severityBadge = (s: string): React.CSSProperties => {
  const colors: Record<string, string> = { critical: "#b71c1c", high: "#e53935", medium: "#fb8c00", low: "#9e9e9e" };
  return { background: colors[s.toLowerCase()] ?? "#546e7a", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600 };
};
const analysisBadge = (s: string): React.CSSProperties => ({ background: "#546e7a", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600 });
