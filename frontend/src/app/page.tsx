import Link from "next/link";

const steps = [
  { href: "/projects",     label: "1. Create a Project", desc: "Define a new IEC 62304 compliance project." },
  { href: "/requirements", label: "2. Add Requirements", desc: "Capture USER / SYSTEM / SOFTWARE requirements (§5.2)." },
  { href: "/architecture", label: "3. Define Architecture", desc: "Add §5.3 components, interfaces, and detailed design." },
  { href: "/system-testing", label: "4. Run System Tests & Release", desc: "Execute §5.7 system tests, then build the §5.8 release." },
  { href: "/traceability", label: "5. View V-Model Tree", desc: "Requirements → design → tests → validation traceability." },
];

export default function Home() {
  return (
    <div>
      <h1 style={{ marginBottom: "0.5rem" }}>MedSoft Compliance Platform</h1>
      <p style={{ color: "#555", marginBottom: "2rem" }}>Phase 0 — IEC 62304 Traceability Foundation</p>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {steps.map((s) => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
            <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "1.25rem", cursor: "pointer" }}>
              <div style={{ fontWeight: "bold", marginBottom: "0.4rem" }}>{s.label}</div>
              <div style={{ color: "#666", fontSize: "0.875rem" }}>{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
