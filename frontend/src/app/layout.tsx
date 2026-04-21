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
            color: #90caf9;
            text-decoration: none;
            font-size: 0.76rem;
            border-left: 2px solid transparent;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
          }
          .nav-link:hover {
            color: #e0e0e0;
            border-left-color: #1565c0;
            background: rgba(21, 101, 192, 0.15);
          }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: "monospace", background: "#f0f2f5", minHeight: "100vh", display: "flex" }}>

        {/* Sidebar */}
        <aside style={{
          width: 220,
          minWidth: 220,
          background: "#0d1b2a",
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
            padding: "0.9rem 0.75rem 0.8rem 0.75rem",
            textDecoration: "none",
            borderBottom: "1px solid #1e3a5f",
            flexShrink: 0,
          }}>
            {/* Logo mark */}
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: "bold", fontSize: "0.85rem", flexShrink: 0,
            }}>
              M
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: "bold", fontSize: "0.88rem", letterSpacing: "0.3px" }}>MedSoft</div>
              <div style={{ color: "#37474f", fontSize: "0.58rem", marginTop: 1 }}>IEC 62304</div>
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
