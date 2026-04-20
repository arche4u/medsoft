import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "MedSoft", description: "Medical Software Compliance Platform" };

const sections = [
  { label: "Requirements", links: [{ href: "/projects", label: "Projects" }, { href: "/requirements", label: "Requirements" }, { href: "/risks", label: "Risks" }] },
  { label: "Design", links: [{ href: "/design", label: "Design" }] },
  { label: "Verification", links: [{ href: "/testcases", label: "Test Cases" }, { href: "/verification", label: "Execution" }, { href: "/tracelinks", label: "Trace Matrix" }] },
  { label: "Validation", links: [{ href: "/validation", label: "Validation" }] },
  { label: "Analysis", links: [{ href: "/traceability", label: "V-Model" }, { href: "/impact", label: "Impact" }, { href: "/audit", label: "Audit" }] },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "monospace", background: "#f0f2f5", minHeight: "100vh" }}>
        <nav style={{ background: "#0d1b2a", color: "#fff", padding: "0.6rem 2rem", display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap", borderBottom: "2px solid #1565c0" }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", fontWeight: "bold", fontSize: "1rem", marginRight: "0.5rem" }}>🏥 MedSoft</Link>
          {sections.map((s) => (
            <span key={s.label} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <span style={{ color: "#546e7a", fontSize: "0.7rem", textTransform: "uppercase" }}>{s.label}</span>
              {s.links.map(({ href, label }) => (
                <Link key={href} href={href} style={{ color: "#90caf9", textDecoration: "none", fontSize: "0.8rem" }}>{label}</Link>
              ))}
            </span>
          ))}
        </nav>
        <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
