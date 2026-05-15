"use client";
/**
 * Auto-generated architecture diagrams (IEC 62304 §5.3).
 *
 * Renders two Mermaid block diagrams built from existing data — no extra
 * schema or data entry required:
 *
 *   1. Component hierarchy — flowchart TD walking SYSTEM → SUBSYSTEM →
 *      ITEM → UNIT via parent_id. Colour-coded by safety class.
 *
 *   2. Interface map — flowchart LR with components as nodes and
 *      SWInterfaces as labelled directed edges. Safety-relevant edges are
 *      thicker red.
 *
 * Uses the dynamic-import Mermaid pattern from CLAUDE.md so we don't bundle
 * Mermaid into the main route chunk.
 */
import { useMemo } from "react";
import { SWComponent, SWInterface } from "@/lib/api";
import MermaidView from "@/components/MermaidView";

type Props = {
  components: SWComponent[];
  interfaces: SWInterface[];
};

// Builders return Mermaid source strings.
export function buildHierarchyDiagram(components: SWComponent[]): string {
  if (components.length === 0) return "";
  const lines: string[] = ["flowchart TD"];
  // Node declarations
  for (const c of components) {
    const id = nodeId(c.id);
    const label = `${c.name}<br/><small>${c.component_type} · Class ${c.safety_class}</small>`;
    lines.push(`    ${id}["${label}"]`);
  }
  // Parent → child edges
  for (const c of components) {
    if (c.parent_id) {
      lines.push(`    ${nodeId(c.parent_id)} --> ${nodeId(c.id)}`);
    }
  }
  // Safety-class colouring via classDef
  lines.push("    classDef cA fill:#e8f5e9,stroke:#1b5e20,color:#1b5e20");
  lines.push("    classDef cB fill:#fff3e0,stroke:#e65100,color:#e65100");
  lines.push("    classDef cC fill:#ffebee,stroke:#b71c1c,color:#b71c1c");
  for (const c of components) {
    const cls = c.safety_class === "C" ? "cC" : c.safety_class === "B" ? "cB" : "cA";
    lines.push(`    class ${nodeId(c.id)} ${cls}`);
  }
  return lines.join("\n");
}

export function buildInterfaceDiagram(
  components: SWComponent[],
  interfaces: SWInterface[],
): string {
  if (interfaces.length === 0) return "";
  // Only include components that participate in at least one interface
  // (keeps the diagram from showing isolated nodes).
  const involved = new Set<string>();
  interfaces.forEach(i => {
    involved.add(i.source_component_id);
    involved.add(i.target_component_id);
  });
  const lines: string[] = ["flowchart LR"];
  for (const c of components) {
    if (!involved.has(c.id)) continue;
    const id = nodeId(c.id);
    lines.push(`    ${id}["${c.name}<br/><small>${c.component_type}</small>"]`);
  }
  for (const iface of interfaces) {
    const src = nodeId(iface.source_component_id);
    const tgt = nodeId(iface.target_component_id);
    const label = `${iface.name}<br/><small>${iface.interface_type}${iface.safety_relevant ? " · SAFETY" : ""}</small>`;
    // Thicker arrow for safety-relevant interfaces
    const arrow = iface.safety_relevant ? "==>" : "-->";
    lines.push(`    ${src} ${arrow}|"${label}"| ${tgt}`);
  }
  // Safety-relevant link highlight
  lines.push("    linkStyle default stroke:#90a4ae,stroke-width:1.5px");
  return lines.join("\n");
}

function nodeId(uuid: string): string {
  // Mermaid IDs can't have dashes/spaces; replace UUID hyphens with `_`.
  return "n_" + uuid.replace(/-/g, "_");
}


export default function ArchitectureDiagrams({ components, interfaces }: Props) {
  const hierarchySource = useMemo(() => buildHierarchyDiagram(components), [components]);
  const interfaceSource = useMemo(() => buildInterfaceDiagram(components, interfaces), [components, interfaces]);

  if (components.length === 0) {
    return (
      <div style={styles.empty}>
        No components yet. Add components in the Architecture Tree tab to see auto-generated diagrams here.
      </div>
    );
  }

  return (
    <div>
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.h3}>Component Hierarchy</h3>
          <span style={styles.legend}>
            <LegendChip label="Class A" bg="#e8f5e9" fg="#1b5e20" />
            <LegendChip label="Class B" bg="#fff3e0" fg="#e65100" />
            <LegendChip label="Class C" bg="#ffebee" fg="#b71c1c" />
          </span>
        </div>
        <p style={styles.subtitle}>
          SYSTEM → SUBSYSTEM → ITEM → UNIT walk, colour-coded by IEC 62304 safety class. Generated from the live component tree.
        </p>
        <MermaidView source={hierarchySource} containerStyle={diagramFrame} />
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.h3}>Interface Map</h3>
          <span style={styles.legend}>
            <span style={{ fontSize: 11, color: "#546e7a" }}>
              <strong style={{ color: "#b71c1c" }}>━━&gt;</strong> safety-relevant&nbsp;&nbsp;
              <strong style={{ color: "#90a4ae" }}>──&gt;</strong> non-safety
            </span>
          </span>
        </div>
        <p style={styles.subtitle}>
          Components shown as blocks, each SWInterface as a labelled directed edge with type and safety annotation.
        </p>
        {interfaceSource ? (
          <MermaidView source={interfaceSource} containerStyle={diagramFrame} />
        ) : (
          <div style={styles.empty}>No interfaces defined yet.</div>
        )}
      </section>
    </div>
  );
}


function LegendChip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${fg}33`, borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 600, marginLeft: 4 }}>
      {label}
    </span>
  );
}


// Frame for the rendered Mermaid SVG (shared MermaidView already sets minHeight).
const diagramFrame: React.CSSProperties = {
  overflowX: "auto", padding: 10, background: "#fff",
  border: "1px solid #e0e0e0", borderRadius: 6,
};

const styles = {
  section: { marginBottom: 24 } as React.CSSProperties,
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap" as const, gap: 8 } as React.CSSProperties,
  h3: { margin: 0, fontSize: 15, fontWeight: 600, color: "#0d47a1" } as React.CSSProperties,
  subtitle: { margin: "0 0 8px", color: "#78909c", fontSize: 12 } as React.CSSProperties,
  legend: { fontSize: 11, color: "#546e7a" } as React.CSSProperties,
  empty: { padding: 24, textAlign: "center" as const, color: "#9e9e9e", fontSize: 13, background: "#fafafa", border: "1px dashed #e0e0e0", borderRadius: 6 } as React.CSSProperties,
};
