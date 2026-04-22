import type { Metadata } from "next";
import Link from "next/link";
import NavUser from "./NavUser";
import NavSidebar from "./NavSidebar";

export const metadata: Metadata = { title: "MedSoft", description: "Medical Software Compliance Platform" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          .nav-link {
            display: block;
            padding: 0.32rem 0.75rem 0.32rem 0.9rem;
            color: #475569;
            text-decoration: none;
            font-size: 0.78rem;
            border-left: 2px solid transparent;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
          }
          .nav-link:hover {
            color: #1e40af;
            border-left-color: #3b82f6;
            background: rgba(59, 130, 246, 0.06);
          }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: "monospace", background: "#f0f2f5", minHeight: "100vh", display: "flex" }}>

        {/* Sidebar */}
        <aside style={{
          width: 274,
          minWidth: 274,
          background: "#ffffff",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          borderRight: "1px solid #e2e8f0",
          boxShadow: "2px 0 12px rgba(30,64,175,0.07)",
        }}>
          {/* Brand — spans full sidebar width */}
          <Link href="/" style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            padding: "0.95rem 0.75rem 0.85rem 1rem",
            textDecoration: "none",
            borderBottom: "1px solid #c7d2fe",
            flexShrink: 0,
            background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
          }}>
            {/* Logo mark */}
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: "800", fontSize: "1rem", flexShrink: 0,
              letterSpacing: "-0.5px",
            }}>
              M
            </div>
            <div>
              <div style={{ color: "#ffffff", fontWeight: "700", fontSize: "0.92rem", letterSpacing: "0.3px" }}>MedSoft</div>
              <div style={{ color: "#93c5fd", fontSize: "0.58rem", marginTop: 1, letterSpacing: "0.06em", textTransform: "uppercase" }}>IEC 62304 Platform</div>
            </div>
          </Link>

          {/* Icon rail + collapsible panel */}
          <NavSidebar />

          {/* User widget */}
          <NavUser />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "2rem", minWidth: 0, overflowX: "auto" }}>
          {children}
        </main>

      </body>
    </html>
  );
}
