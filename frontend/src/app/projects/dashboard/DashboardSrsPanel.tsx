"use client";
/**
 * Compact composite SRS panel for the project dashboard.
 *
 * Surfaces the project's current release manifest — the composite SRS — at
 * the project level so users see what version of the SRS is being assembled
 * without having to navigate into /requirements. Pulls just the headline
 * info: version, status, signoff trail, manifest pins. Clicking "View
 * details" deep-links into /requirements where the full bar lives.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api, CompositeBaseline, CompositeBaselineSummary, ReqBaselineStatus,
} from "@/lib/api";

const STATUS_COLOR: Record<ReqBaselineStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "#eceff1", fg: "#546e7a" },
  IN_REVIEW: { bg: "#fff3e0", fg: "#e65100" },
  APPROVED:  { bg: "#e8f5e9", fg: "#1b5e20" },
  OBSOLETE:  { bg: "#f5f5f5", fg: "#9e9e9e" },
};

type Props = { projectId: string };

export default function DashboardSrsPanel({ projectId }: Props) {
  const [summaries, setSummaries] = useState<CompositeBaselineSummary[]>([]);
  const [latest, setLatest] = useState<CompositeBaseline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const list = await api.requirements.baselines.list(projectId);
        if (cancelled) return;
        setSummaries(list);
        // Pick the APPROVED one if present, else the most recent.
        const target = list.find(b => b.status === "APPROVED") ?? list[0];
        if (target) {
          const detail = await api.requirements.baselines.get(target.id);
          if (!cancelled) setLatest(detail);
        } else {
          setLatest(null);
        }
      } catch {
        if (!cancelled) { setSummaries([]); setLatest(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#1a237e", fontSize: 13 }}>Composite SRS</span>
          {latest ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 14 }}>v{latest.version}</span>
              <span style={{ ...statusBadge(latest.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {latest.status}
              </span>
              <span style={styles.meta}>{latest.components.length} category(ies) pinned</span>
              {summaries.length > 1 && (
                <span style={styles.meta}>· {summaries.length} version(s) total</span>
              )}
            </>
          ) : (
            <span style={styles.meta}>— no composite SRS yet —</span>
          )}
        </div>
        <Link href="/requirements" style={styles.link}>
          View details →
        </Link>
      </div>

      {latest && latest.components.length > 0 && (
        <div style={styles.pins}>
          {latest.components.map(c => (
            <span key={c.id} style={pinChip(c.category_baseline.status)}>
              {c.category_baseline.category_name}@v{c.category_baseline.version}
              <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 10 }}>{c.category_baseline.status}</span>
            </span>
          ))}
        </div>
      )}

      {latest && (
        <div style={styles.signoff}>
          <SignoffCell label="Prepared" name={latest.prepared_by} at={latest.prepared_at} />
          <SignoffCell label="Reviewed" name={latest.reviewed_by} at={latest.reviewed_at} />
          <SignoffCell label="Approved" name={latest.approved_by} at={latest.approved_at} />
        </div>
      )}
    </div>
  );
}

function SignoffCell({ label, name, at }: { label: string; name: string | null; at: string | null }) {
  return (
    <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ color: "#78909c", fontWeight: 600 }}>{label}</span>
      <span style={{ color: name ? "#1a237e" : "#bdbdbd", fontWeight: name ? 600 : 400 }}>
        {name ?? "—"}
      </span>
      {at && <span style={{ color: "#9ca3af", fontSize: 10 }}>{new Date(at).toLocaleDateString()}</span>}
    </div>
  );
}

function statusBadge(status: ReqBaselineStatus) {
  const c = STATUS_COLOR[status];
  return { background: c.bg, color: c.fg };
}

function pinChip(status: ReqBaselineStatus): React.CSSProperties {
  const c = STATUS_COLOR[status];
  return {
    background: c.bg, color: c.fg,
    border: `1px solid ${c.fg}33`,
    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

const styles = {
  wrap: {
    background: "#fff", border: "1px solid #c5cae9", borderRadius: 8,
    padding: "12px 14px", marginBottom: 20, borderLeft: "4px solid #1a237e",
  } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 } as React.CSSProperties,
  meta: { fontSize: 12, color: "#78909c" } as React.CSSProperties,
  link: { fontSize: 12, color: "#1a237e", textDecoration: "none", fontWeight: 600 } as React.CSSProperties,
  pins: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 10, padding: "8px 10px", background: "#f5faff", border: "1px solid #c5cae9", borderRadius: 6 } as React.CSSProperties,
  signoff: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 10, padding: "8px 10px", background: "#fafafa", border: "1px solid #eceff1", borderRadius: 6 } as React.CSSProperties,
};
