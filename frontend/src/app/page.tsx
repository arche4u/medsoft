import Link from "next/link";

const steps = [
  { href: "/projects", label: "1. Create a Project", desc: "Define a new compliance project." },
  { href: "/requirements", label: "2. Add Requirements", desc: "Attach requirements to a project." },
  { href: "/testcases", label: "3. Add Test Cases", desc: "Attach test cases to a project." },
  { href: "/tracelinks", label: "4. Link & View Matrix", desc: "Link requirements ↔ test cases and view traceability." },
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
