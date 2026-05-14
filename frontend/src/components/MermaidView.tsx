"use client";
/**
 * Shared Mermaid diagram renderer.
 *
 * Renders a Mermaid diagram from `source` text. Uses the dynamic-import
 * pattern from CLAUDE.md so Mermaid isn't bundled into route chunks, and
 * surfaces parse errors inline instead of throwing. Drop it into any view
 * that needs to preview a diagram — pass `containerStyle` to control the
 * frame (border/padding/scroll) where the SVG is drawn.
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  source: string;
  /** Style merged onto the SVG container div (default just minHeight). */
  containerStyle?: React.CSSProperties;
};

export default function MermaidView({ source, containerStyle }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!source.trim() || !ref.current) return;
    let cancelled = false;
    setErr("");

    import("mermaid").then(mod => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      const id = `mm-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, source)
        .then(({ svg }) => {
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(e => {
          if (!cancelled) setErr(String((e as Error)?.message ?? e));
          if (ref.current) ref.current.innerHTML = "";
        });
    });

    return () => { cancelled = true; };
  }, [source]);

  return (
    <div>
      {err && (
        <div style={{ color: "#b71c1c", background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 8 }}>
          ⚠ {err}
        </div>
      )}
      <div ref={ref} style={{ minHeight: 40, ...containerStyle }} />
    </div>
  );
}
