"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// ── Icons ────────────────────────────────────────────────────────────────────

function IconDesign({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
    </svg>
  );
}

function IconDocuments({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 17h12v1H6zm0-2h12v1H6zm0-2h8v1H6z"/>
    </svg>
  );
}

function IconPM({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05C16.19 13.89 17 15.02 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
  );
}

// ── Nav config ───────────────────────────────────────────────────────────────

type SubItem = { href: string; label: string };
type NavItem = { href: string; label: string; subItems?: SubItem[] };
type NavGroup = { group: string; items: NavItem[] };

type Section = {
  id: "design" | "documents" | "pm";
  label: string;
  icon: React.ReactNode;
  groups: NavGroup[];
};

const SECTIONS: Section[] = [
  {
    id: "design",
    label: "Design",
    icon: <IconDesign />,
    groups: [
      {
        group: "Design",
        items: [
          {
            href: "/requirements",
            label: "Requirements",
            subItems: [
              { href: "/requirements?type=USER",     label: "User" },
              { href: "/requirements?type=SYSTEM",   label: "System" },
              { href: "/requirements?type=SOFTWARE", label: "Software" },
            ],
          },
          {
            href: "/design",
            label: "Design Elements",
            subItems: [
              { href: "/design?type=ARCHITECTURE", label: "Architecture" },
              { href: "/design?type=DETAILED",     label: "Detailed" },
            ],
          },
        ],
      },
      {
        group: "Risk",
        items: [{
          href: "/risks",
          label: "Risk Register",
          subItems: [
            { href: "/risks?level=HIGH",   label: "High Risk" },
            { href: "/risks?level=MEDIUM", label: "Medium Risk" },
            { href: "/risks?level=LOW",    label: "Low Risk" },
          ],
        }],
      },
      {
        group: "Testing",
        items: [
          { href: "/testcases",    label: "Test Cases" },
          { href: "/verification", label: "Test Execution" },
          { href: "/validation",   label: "Validation Records" },
          { href: "/tracelinks",   label: "Trace Matrix" },
          { href: "/traceability", label: "V-Model Tree" },
          { href: "/impact",       label: "Impact Analysis" },
        ],
      },
    ],
  },
  {
    id: "documents",
    label: "Docs",
    icon: <IconDocuments />,
    groups: [
      {
        group: "Change Control",
        items: [
          { href: "/change-control", label: "Change Requests" },
          { href: "/release",        label: "Releases" },
          { href: "/dhf",            label: "Design History File" },
        ],
      },
      {
        group: "Plans",
        items: [
          { href: "/documents?category=PLANS&type=SDP",   label: "Software Development Plan" },
          { href: "/documents?category=PLANS&type=SMP",   label: "Software Maintenance Plan" },
          { href: "/documents?category=PLANS&type=SPRP",  label: "Problem Resolution Plan" },
          { href: "/documents?category=PLANS&type=SCP",   label: "Software Configuration Plan" },
          { href: "/documents?category=PLANS&type=SVP",   label: "Software Verification Plan" },
          { href: "/documents?category=PLANS&type=SBRP",  label: "Build & Release Plan" },
        ],
      },
      {
        group: "Technical Documents",
        items: [
          { href: "/documents?category=TECHNICAL&type=SRS",    label: "Requirements Specification" },
          { href: "/documents?category=TECHNICAL&type=SADS",   label: "Architecture Design Spec" },
          { href: "/documents?category=TECHNICAL&type=SDDS",   label: "Detailed Design Spec" },
          { href: "/documents?category=TECHNICAL&type=SVPROT", label: "Verification Protocol" },
          { href: "/documents?category=TECHNICAL&type=SVREP",  label: "Verification Report" },
        ],
      },
      {
        group: "Development Documents",
        items: [
          { href: "/documents?category=DEVELOPMENT&type=SBD",  label: "Software Build Document" },
          { href: "/documents?category=DEVELOPMENT&type=SII",  label: "Installation Instructions" },
          { href: "/documents?category=DEVELOPMENT&type=CG",   label: "Coding Guidelines" },
          { href: "/documents?category=DEVELOPMENT&type=SUTP", label: "Unit Test Protocol" },
          { href: "/documents?category=DEVELOPMENT&type=SUTR", label: "Unit Test Report" },
          { href: "/documents?category=DEVELOPMENT&type=SITP", label: "Integration Test Protocol" },
          { href: "/documents?category=DEVELOPMENT&type=SITR", label: "Integration Test Report" },
          { href: "/documents?category=DEVELOPMENT&type=SOUP", label: "SOUP List" },
          { href: "/documents?category=DEVELOPMENT&type=CRR",  label: "Code Review Report" },
          { href: "/documents?category=DEVELOPMENT&type=VDD",  label: "Version Description Doc" },
          { href: "/documents?category=DEVELOPMENT&type=RHL",  label: "Revision History Log" },
          { href: "/documents?category=DEVELOPMENT&type=UAL",  label: "Unresolved Anomaly List" },
          { href: "/documents?category=DEVELOPMENT&type=TM",   label: "Traceability Matrix" },
        ],
      },
    ],
  },
  {
    id: "pm",
    label: "PM",
    icon: <IconPM />,
    groups: [
      {
        group: "Projects",
        items: [{ href: "/projects", label: "Projects" }],
      },
      {
        group: "Compliance",
        items: [
          { href: "/audit",    label: "Audit Log" },
          { href: "/users",    label: "Users" },
          { href: "/training", label: "Training Records" },
        ],
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectActiveSection(pathname: string, type: string | null): Section["id"] | null {
  for (const s of SECTIONS) {
    for (const g of s.groups) {
      for (const item of g.items) {
        const base = item.href.split("?")[0];
        if (pathname === base || pathname.startsWith(base + "/")) return s.id;
        if (item.subItems?.some(sub => {
          const [sb, qs] = sub.href.split("?");
          const t = qs?.split("type=")[1];
          return pathname === sb && (!t || type === t);
        })) return s.id;
      }
    }
  }
  return null;
}

// ── Inner component (needs useSearchParams) ──────────────────────────────────

function NavSidebarInner() {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const currentType  = searchParams.get("type");

  const autoSection = detectActiveSection(pathname, currentType) ?? "design";
  const [activeId, setActiveId] = useState<Section["id"] | null>(autoSection);

  // Per-item expand state for sub-items
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach(s =>
      s.groups.forEach(g =>
        g.items.forEach(item => {
          if (item.subItems?.some(sub => {
            const [b, qs] = sub.href.split("?");
            const t = qs?.split("type=")[1];
            return pathname === b && (!t || currentType === t);
          })) init[item.href] = true;
        })
      )
    );
    return init;
  });

  const toggleItem = (key: string) =>
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleSection = (id: Section["id"]) =>
    setActiveId(prev => (prev === id ? null : id));

  const isPathActive = (href: string) => {
    const base = href.split("?")[0];
    return pathname === base || pathname.startsWith(base + "/");
  };

  const isSubActive = (sub: SubItem) => {
    const [base, qs] = sub.href.split("?");
    const t = qs?.split("type=")[1];
    return pathname === base && (!t || currentType === t);
  };

  const activeSection = SECTIONS.find(s => s.id === activeId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* ── Icon Rail ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 52,
        minWidth: 52,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: "1px solid #1e3a5f",
        paddingTop: "0.5rem",
        paddingBottom: "0.5rem",
        gap: "0.25rem",
      }}>
        {SECTIONS.map(s => {
          const isActive = activeId === s.id;
          const hasCurrentPath = detectActiveSection(pathname, currentType) === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggleSection(s.id)}
              title={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                padding: "0.55rem 0.35rem",
                background: isActive ? "rgba(21,101,192,0.25)" : "transparent",
                border: "none",
                borderRadius: 6,
                borderLeft: `3px solid ${isActive ? "#42a5f5" : "transparent"}`,
                color: isActive ? "#90caf9" : hasCurrentPath ? "#546e7a" : "#37474f",
                cursor: "pointer",
                gap: "0.2rem",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseOver={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "#90caf9"; } }}
              onMouseOut={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = hasCurrentPath ? "#546e7a" : "#37474f"; } }}
            >
              {s.icon}
              <span style={{ fontSize: "0.5rem", letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: "bold" }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Content Panel ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        display: activeSection ? "block" : "none",
      }}>
        {/* Section header */}
        {activeSection && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.6rem 0.75rem 0.4rem",
            borderBottom: "1px solid #1e3a5f",
            color: "#42a5f5",
            fontSize: "0.7rem",
            fontWeight: "bold",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {activeSection.icon}
            {activeSection.label}
          </div>
        )}

        {/* Nav groups */}
        {activeSection?.groups.map(group => (
          <div key={group.group} style={{ marginBottom: "0.25rem" }}>
            <div style={{
              padding: "0.45rem 0.75rem 0.15rem",
              fontSize: "0.58rem",
              fontWeight: "bold",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#37474f",
            }}>
              {group.group}
            </div>

            {group.items.map(item => {
              const expanded = !!open[item.href];
              const active   = isPathActive(item.href);

              return (
                <div key={item.href}>
                  {item.subItems ? (
                    <button
                      onClick={() => toggleItem(item.href)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "0.32rem 0.75rem 0.32rem 0.9rem",
                        background: active && !expanded ? "rgba(21,101,192,0.15)" : "transparent",
                        border: "none",
                        borderLeft: `2px solid ${active && !expanded ? "#1565c0" : "transparent"}`,
                        color: active ? "#e0e0e0" : "#90caf9",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        gap: "0.35rem",
                        boxSizing: "border-box",
                      }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "rgba(21,101,192,0.1)"; }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = active && !expanded ? "rgba(21,101,192,0.15)" : "transparent"; }}
                    >
                      <span style={{ fontSize: "0.58rem", color: expanded ? "#42a5f5" : "#546e7a", minWidth: 8 }}>
                        {expanded ? "▼" : "▶"}
                      </span>
                      <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                      <span style={{ fontSize: "0.55rem", color: "#37474f", background: "#0d2137", borderRadius: 8, padding: "1px 4px" }}>
                        {item.subItems.length}
                      </span>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className="nav-link"
                      style={{
                        paddingLeft: "0.9rem",
                        paddingRight: "0.75rem",
                        ...(active ? { color: "#e0e0e0", borderLeftColor: "#1565c0", background: "rgba(21,101,192,0.15)" } : {}),
                      }}
                    >
                      {item.label}
                    </Link>
                  )}

                  {/* Sub-items tree */}
                  {item.subItems && expanded && (
                    <div style={{ position: "relative", marginLeft: "0.9rem" }}>
                      <div style={{
                        position: "absolute",
                        left: "0.65rem",
                        top: 0,
                        bottom: 4,
                        width: 1,
                        background: "#1e3a5f",
                      }} />
                      {item.subItems.map((sub, idx) => {
                        const subActive = isSubActive(sub);
                        const isLast = idx === item.subItems!.length - 1;
                        return (
                          <div key={sub.href} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <div style={{
                              position: "absolute",
                              left: "0.65rem",
                              top: "50%",
                              width: "0.55rem",
                              height: 1,
                              background: subActive ? "#42a5f5" : "#1e3a5f",
                            }} />
                            <Link
                              href={sub.href}
                              className="nav-link"
                              style={{
                                paddingLeft: "1.6rem",
                                paddingTop: "0.25rem",
                                paddingBottom: "0.25rem",
                                fontSize: "0.74rem",
                                flex: 1,
                                color: subActive ? "#90caf9" : "#4a6080",
                                borderLeftColor: subActive ? "#1565c0" : "transparent",
                                background: subActive ? "rgba(21,101,192,0.12)" : "transparent",
                                fontWeight: subActive ? "500" : "normal",
                              }}
                            >
                              {sub.label}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export with Suspense ──────────────────────────────────────────────────────

export default function NavSidebar() {
  return (
    <Suspense fallback={<div style={{ flex: 1 }} />}>
      <NavSidebarInner />
    </Suspense>
  );
}
