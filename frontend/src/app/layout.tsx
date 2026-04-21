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
            color: #94a3b8;
            text-decoration: none;
            font-size: 0.78rem;
            border-left: 2px solid transparent;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
          }
          .nav-link:hover {
            color: #f1f5f9;
            border-left-color: #3b82f6;
            background: rgba(59, 130, 246, 0.1);
          }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: "monospace", background: "#f0f2f5", minHeight: "100vh", display: "flex" }}>

        {/* Sidebar */}
        <aside style={{
          width: 270,
          minWidth: 270,
          background: "#0f172a",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}>
          {/* Brand — spans full sidebar width */}
          <Link href="/" style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.95rem 0.75rem 0.85rem 0.75rem",
            textDecoration: "none",
            borderBottom: "1px solid #1e293b",
            flexShrink: 0,
          }}>
            {/* Logo mark */}
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: "bold", fontSize: "0.85rem", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(59,130,246,0.4)",
            }}>
              M
            </div>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "0.9rem", letterSpacing: "0.2px" }}>MedSoft</div>
              <div style={{ color: "#475569", fontSize: "0.58rem", marginTop: 1, letterSpacing: "0.04em" }}>IEC 62304</div>
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
