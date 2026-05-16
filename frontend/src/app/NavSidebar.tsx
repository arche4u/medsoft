"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { api, RequirementCategory } from "@/lib/api";

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

function IconHelp({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
    </svg>
  );
}

function IconCyber({ size = 20 }: { size?: number }) {
  // Shield-with-keyhole — security/integrity primitive.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 0 1 1 5.83V14h-2v-3.17A3 3 0 0 1 12 5z"/>
    </svg>
  );
}

// ── Nav config ───────────────────────────────────────────────────────────────

type SubItem = { href: string; label: string };
type NavItem = { href: string; label: string; subItems?: SubItem[] };
type NavGroup = { group: string; items: NavItem[] };

type Section = {
  id: "design" | "documents" | "pm" | "cybersecurity";
  label: string;
  icon: React.ReactNode;
  groups: NavGroup[];
};

const SECTIONS: Section[] = [
  {
    id: "pm",
    label: "PM",
    icon: <IconPM />,
    groups: [
      {
        group: "Projects",
        items: [
          { href: "/projects",          label: "All Projects" },
          { href: "/projects/dashboard", label: "Project Dashboard" },
        ],
      },
      {
        group: "Compliance",
        items: [
          { href: "/audit",    label: "Activity Log" },
          { href: "/users",    label: "Users" },
          { href: "/training", label: "Training Records" },
        ],
      },
    ],
  },
  {
    // Spans the whole IEC 62304 software lifecycle (§5 development, §6
    // maintenance touchpoints, §7 risk, §5.5–§5.7 verification) — labelled
    // "Develop" rather than "Design" so the section name matches its scope.
    id: "design",
    label: "Develop",
    icon: <IconDesign />,
    // Groups are ordered by ascending IEC 62304 clause: §4.3 → §5.2 → §5.3/§5.4
    // → §5.5–§5.7 → §7. The sidebar mirrors the standard's lifecycle sequence.
    groups: [
      {
        // IEC 62304 §4.3 — software safety classification register. First,
        // because classification precedes requirements analysis in the standard.
        group: "Classification",
        items: [
          { href: "/software-items", label: "Software Items" },                // §4.3
        ],
      },
      {
        // IEC 62304 §5.2 — software requirements analysis.
        group: "Requirements",
        items: [
          {
            href: "/requirements",                                            // §5.2
            label: "Requirements",
            subItems: [
              { href: "/requirements?type=USER",     label: "User" },
              { href: "/requirements?type=SYSTEM",   label: "System" },
              { href: "/requirements?type=SOFTWARE", label: "Software" },
            ],
          },
        ],
      },
      {
        // IEC 62304 §5.3 → §5.4. SDP (§5.1) lives in Docs > IEC 62304 Plans
        // alongside the other plan documents.
        group: "Design",
        items: [
          { href: "/architecture", label: "SW Architecture" },                // §5.3
          { href: "/design",       label: "Detailed Design" },                // §5.4 — grouped under §5.3 components
        ],
      },
      {
        // IEC 62304 §5.5–§5.7 verification + cross-cutting V&V / traceability.
        group: "Verification",
        items: [
          { href: "/units", label: "Unit Verification" },                      // §5.5
          { href: "/integration-tests", label: "Integration Tests" },          // §5.6
          { href: "/system-testing", label: "System Testing & Release" },      // §5.7 + §5.8 release-mgmt
        ],
      },
      {
        // §7 Software risk management. Class + level filters live in the
        // page itself (chip-bars at the top of /risks). Only the §7.4
        // inbox gets a sidebar shortcut because it's a distinct workflow,
        // not just a filter.
        group: "Risk (§7)",
        items: [
          { href: "/risks",                              label: "Risk Register" },
          { href: "/risks?needs_reevaluation=true",      label: "Re-eval Inbox (§7.4)" },
        ],
      },
      {
        // §6 Software Maintenance Process — post-release feedback funnel that
        // feeds problems to §9 CAPA and change requests to §6.3 change-control.
        group: "Maintenance",
        items: [
          { href: "/feedback", label: "Feedback Intake (§6.2.1)" },
        ],
      },
      {
        // Cross-cutting V&V + traceability spine — spans every §-level above.
        // Not a clause-numbered process, so it sits last as the "whole picture".
        group: "Traceability",
        items: [
          { href: "/traceability", label: "V-Model Tree" },
          { href: "/validation",   label: "Validation Records" },
        ],
      },
    ],
  },
  {
    // IEC 81001-5-1 cybersecurity — top-level peer to Develop, not nested
    // under it. Pairs with §7 (risk_class=SECURITY) already in the Risk
    // Register and §8.2.2 SOUP already in Config Management.
    id: "cybersecurity",
    label: "Cyber",
    icon: <IconCyber />,
    groups: [
      {
        group: "Cybersecurity (IEC 81001-5-1)",
        items: [
          { href: "/plans/cybersecurity",                  label: "Cybersecurity Plan" },
          { href: "/threat-model",                          label: "Threat Model (STRIDE)" },
          { href: "/vulnerabilities",                       label: "Vulnerabilities (CVE)" },
          { href: "/risks?risk_class=SECURITY",             label: "Security Risks (§7)" },
          { href: "/config-mgmt?type=SOUP",                 label: "SOUP / SBOM source (§8.2.2)" },
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
        // IEC 62304 planning documents — all share the same versioned,
        // signed-off workflow. Each is a direct link; no nesting needed.
        group: "IEC 62304 Plans",
        items: [
          { href: "/sdp",                         label: "Dev Plan (§5.1)" },
          { href: "/plans/legacy-software",         label: "Legacy Software (§4.4)" },
          { href: "/plans/maintenance",            label: "Maintenance Plan (§6.1)" },
          { href: "/plans/risk-mgmt",              label: "Risk Mgmt Plan (§7)" },
          { href: "/plans/config-mgmt",            label: "Config Mgmt Plan (§8.1)" },
          { href: "/plans/problem-resolution",     label: "Problem Resolution Plan (§9)" },
          { href: "/plans/cybersecurity",          label: "Cybersecurity Plan (81001-5-1)" },
          { href: "/plans",                         label: "Custom Plans" },
        ],
      },
      {
        // IEC 62304 §6.2 change control + §8 configuration management — the two
        // processes that govern how the software baseline evolves.
        group: "Change & Configuration",
        items: [
          { href: "/change-control", label: "Change Requests" },
          { href: "/config-mgmt",    label: "Config Management" },
        ],
      },
      {
        // IEC 62304 §9 — software problem resolution / CAPA.
        group: "Problem Resolution",
        items: [
          { href: "/capa", label: "Problem Resolution" },
        ],
      },
      {
        // §5.8 release + the cross-cutting Design History File compliance record.
        group: "Release & DHF",
        items: [
          { href: "/release", label: "Releases" },
          { href: "/dhf",     label: "Design History File" },
        ],
      },
      {
        group: "Document Register",
        items: [
          { href: "/documents",                          label: "All Documents" },
          { href: "/documents?category=SOP",             label: "SOPs" },
          { href: "/documents?category=PLANS",           label: "Plans" },
          { href: "/documents?category=TECHNICAL",       label: "Technical" },
          { href: "/documents?category=DEVELOPMENT",     label: "Development" },
          { href: "/documents?category=STANDARDS",       label: "Standards Docs" },
        ],
      },
      {
        group: "Knowledge Base",
        items: [
          { href: "/knowledge", label: "📚 Standards Library" },
        ],
      },
    ],
  },
];

// ── Help menu (role-aware popover) ──────────────────────────────────────────
//
// Sits at the bottom of the icon rail. Click → opens a small popover with
// links into the mkdocs-built manual that FastAPI serves at /manual.
//
// • Admin / Developer  → both Developer Guide + User Guide
// • Everyone else      → User Guide only (single-item popover)
//
// Reads the role off the JWT response cached in localStorage by the login
// flow (see api.ts `getToken`). Default-deny: if there's no auth (e.g. the
// pre-login page), we show only the User Guide.

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const auth = JSON.parse(localStorage.getItem("medsoft_auth") ?? "null");
      setRole(auth?.role ?? "");
    } catch { setRole(""); }
  }, []);

  // Two separate static sites served by the backend:
  //   /manual       → full site (User + Developer)  — for ADMIN / DEVELOPER
  //   /manual-user  → user-only site (Developer Guide excluded from build)
  //                                                  — for everyone else
  // Build them with: `mkdocs build && mkdocs build -f mkdocs-user.yml`
  const backend = process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, "")
    : "http://localhost:8000";
  const userGuideUrl = `${backend}/manual-user/`;
  const devGuideUrl  = `${backend}/manual/developer/`;
  // Admin / Developer roles see both guides; everyone else sees only the
  // user guide. The role check is purely a UI affordance — the docs
  // themselves are not access-controlled.
  const isElevated = role === "ADMIN" || role === "DEVELOPER";

  return (
    <div style={{ marginTop: "auto", position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Help"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          padding: "0.6rem 0.3rem",
          background: open ? "rgba(255,255,255,0.18)" : "transparent",
          border: "none",
          borderRadius: 8,
          borderLeft: `3px solid ${open ? "#93c5fd" : "transparent"}`,
          color: open ? "#ffffff" : "rgba(255,255,255,0.5)",
          cursor: "pointer",
          gap: "0.22rem",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseOver={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "#bfdbfe"; } }}
        onMouseOut={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; } }}
      >
        <IconHelp />
        <span style={{ fontSize: "0.48rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: "700" }}>
          Help
        </span>
      </button>

      {open && (
        // Click-outside backdrop — closes the popover on any outside click.
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "transparent" }}
          />
          <div
            style={{
              position: "absolute",
              left: 56,
              bottom: 0,
              minWidth: 220,
              background: "#ffffff",
              border: "1px solid #c7d2fe",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
              padding: 6,
              zIndex: 101,
            }}
          >
            <div style={{ padding: "6px 10px 8px", fontSize: 11, fontWeight: 700, color: "#475569",
                          letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>
              Documentation
            </div>
            <HelpLink href={userGuideUrl} title="User Guide"
                      subtitle="Workflow guides per module — for QA, RA, clinical engineers" />
            {isElevated && (
              <HelpLink href={devGuideUrl} title="Developer Guide"
                        subtitle="Architecture, conventions, API reference, IEC mapping" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HelpLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        padding: "8px 10px",
        textDecoration: "none",
        color: "#0f172a",
        borderRadius: 6,
        transition: "background 0.12s",
      }}
      onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "#eef2ff"; }}
      onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{subtitle}</div>
    </a>
  );
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function parseQS(qs: string | undefined): Record<string, string> {
  if (!qs) return {};
  return Object.fromEntries(qs.split("&").map(p => p.split("=") as [string, string]));
}

function detectActiveSection(pathname: string, type: string | null, category?: string | null): Section["id"] | null {
  for (const s of SECTIONS) {
    for (const g of s.groups) {
      for (const item of g.items) {
        const base = item.href.split("?")[0];
        if (pathname === base || pathname.startsWith(base + "/")) return s.id;
        if (item.subItems?.some(sub => {
          const [sb, qs] = sub.href.split("?");
          const params = parseQS(qs);
          if (pathname !== sb) return false;
          if (params.type && params.type !== type) return false;
          if (params.category && params.category !== category) return false;
          return true;
        })) return s.id;
      }
    }
  }
  return null;
}

// ── Inner component (needs useSearchParams) ──────────────────────────────────

function NavSidebarInner() {
  const pathname      = usePathname();
  const searchParams  = useSearchParams();
  const currentType   = searchParams.get("type");
  const currentCat    = searchParams.get("category");

  const autoSection = detectActiveSection(pathname, currentType, currentCat) ?? "pm";
  const [activeId, setActiveId] = useState<Section["id"] | null>(autoSection);

  // ── Dynamic requirement categories ────────────────────────────────────────
  const [dynCats, setDynCats] = useState<RequirementCategory[]>([]);

  const loadCats = async (projectId: string) => {
    if (!projectId) { setDynCats([]); return; }
    if (typeof window !== "undefined" && !localStorage.getItem("medsoft_auth")) {
      setDynCats([]); return;
    }
    try { setDynCats(await api.requirements.categories.list(projectId)); }
    catch { setDynCats([]); }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Load from storage on mount
    const pid = localStorage.getItem("medsoft_active_project") ?? "";
    if (pid) loadCats(pid);
    // Listen for project changes fired by the requirements page
    const handler = (e: Event) => {
      loadCats((e as CustomEvent<{ projectId: string }>).detail?.projectId ?? "");
    };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);

  // Per-item expand state for sub-items
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach(s =>
      s.groups.forEach(g =>
        g.items.forEach(item => {
          if (item.subItems?.some(sub => {
            const [b, qs] = sub.href.split("?");
            const params = parseQS(qs);
            if (pathname !== b) return false;
            if (params.type && params.type !== currentType) return false;
            if (params.category && params.category !== currentCat) return false;
            return true;
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
    const params = parseQS(qs);
    if (pathname !== base) return false;
    if (params.type && params.type !== currentType) return false;
    if (params.category && params.category !== currentCat) return false;
    return true;
  };

  const activeSection = SECTIONS.find(s => s.id === activeId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* ── Icon Rail ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 56,
        minWidth: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: "1px solid #c7d2fe",
        background: "linear-gradient(180deg, #1e3a8a 0%, #1e40af 60%, #1d4ed8 100%)",
        paddingTop: "0.6rem",
        paddingBottom: "0.6rem",
        gap: "0.2rem",
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
                width: 44,
                padding: "0.6rem 0.3rem",
                background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                border: "none",
                borderRadius: 8,
                borderLeft: `3px solid ${isActive ? "#93c5fd" : "transparent"}`,
                color: isActive ? "#ffffff" : hasCurrentPath ? "#93c5fd" : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                gap: "0.22rem",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseOver={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "#bfdbfe"; } }}
              onMouseOut={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = hasCurrentPath ? "#93c5fd" : "rgba(255,255,255,0.5)"; } }}
            >
              {s.icon}
              <span style={{ fontSize: "0.48rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: "700" }}>
                {s.label}
              </span>
            </button>
          );
        })}

        {/* Help — role-aware popover anchored at the bottom of the icon rail.
            • ADMIN / DEVELOPER → Developer Guide + User Guide (both)
            • Everyone else    → User Guide only
            URLs point at the backend's /manual mount (FastAPI serves the mkdocs HTML). */}
        <HelpMenu />
      </div>

      {/* ── Content Panel ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        display: activeSection ? "block" : "none",
        background: "#fafbff",
      }}>
        {/* Section header */}
        {activeSection && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.65rem 0.75rem 0.45rem",
            borderBottom: "1px solid #e2e8f0",
            color: "#1e40af",
            fontSize: "0.68rem",
            fontWeight: "700",
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            background: "#eff6ff",
          }}>
            {activeSection.icon}
            {activeSection.label}
          </div>
        )}

        {/* Nav groups */}
        {activeSection?.groups.map(group => (
          <div key={group.group} style={{ marginBottom: "0.15rem" }}>
            <div style={{
              padding: "0.5rem 0.75rem 0.18rem",
              fontSize: "0.56rem",
              fontWeight: "800",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#6366f1",
              borderBottom: "1px solid #e0e7ff",
              marginBottom: "0.1rem",
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
                        background: active && !expanded ? "#eff6ff" : "transparent",
                        border: "none",
                        borderLeft: `2px solid ${active && !expanded ? "#3b82f6" : "transparent"}`,
                        color: active ? "#1e40af" : "#374151",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        gap: "0.35rem",
                        boxSizing: "border-box",
                      }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.05)"; }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = active && !expanded ? "#eff6ff" : "transparent"; }}
                    >
                      <span style={{ fontSize: "0.58rem", color: expanded ? "#3b82f6" : "#94a3b8", minWidth: 8 }}>
                        {expanded ? "▼" : "▶"}
                      </span>
                      <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                      <span style={{ fontSize: "0.55rem", color: "#1d4ed8", background: "#dbeafe", borderRadius: 8, padding: "1px 6px", fontWeight: "600" }}>
                        {item.href === "/requirements" && dynCats.length > 0 ? dynCats.length : item.subItems.length}
                      </span>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className="nav-link"
                      style={{
                        paddingLeft: "0.9rem",
                        paddingRight: "0.75rem",
                        ...(active ? { color: "#1e40af", borderLeftColor: "#3b82f6", background: "#eff6ff" } : {}),
                      }}
                    >
                      {item.label}
                    </Link>
                  )}

                  {/* Sub-items tree */}
                  {item.subItems && expanded && (() => {
                    // Use dynamic categories for the Requirements item
                    const subs: SubItem[] =
                      item.href === "/requirements" && dynCats.length > 0
                        ? [...dynCats]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map(c => ({
                              href: `/requirements?type=${encodeURIComponent(c.name)}`,
                              label: c.label ?? c.name,
                            }))
                        : item.subItems;
                    return (
                      <div style={{ position: "relative", marginLeft: "0.9rem" }}>
                        <div style={{
                          position: "absolute",
                          left: "0.65rem",
                          top: 0,
                          bottom: 4,
                          width: 1,
                          background: "#e5e7eb",
                        }} />
                        {subs.map((sub, idx) => {
                          const subActive = isSubActive(sub);
                          return (
                            <div key={sub.href} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                              <div style={{
                                position: "absolute",
                                left: "0.65rem",
                                top: "50%",
                                width: "0.55rem",
                                height: 1,
                                background: subActive ? "#3b82f6" : "#e5e7eb",
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
                                  color: subActive ? "#1d4ed8" : "#64748b",
                                  borderLeftColor: subActive ? "#3b82f6" : "transparent",
                                  background: subActive ? "#eff6ff" : "transparent",
                                  fontWeight: subActive ? "600" : "normal",
                                }}
                              >
                                {sub.label}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
