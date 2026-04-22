"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getAuth, clearAuth, type AuthUser } from "@/lib/auth";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#ef5350", QA: "#66bb6a", DEVELOPER: "#42a5f5", REVIEWER: "#ab47bc",
};

const PUBLIC_PATHS = ["/login"];

export default function NavUser() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const auth = getAuth();
    setUser(auth);
    if (!auth && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
  }, [pathname, router]);

  const logout = () => {
    clearAuth();
    router.push("/login");
  };

  if (!user) return (
    <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid #e2e8f0" }}>
      <a href="/login" style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.78rem" }}>Sign In →</a>
    </div>
  );

  const roleColor = ROLE_COLORS[user.role] ?? "#90a4ae";

  return (
    <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.85rem 1.25rem" }}>
      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: roleColor + "18",
          border: `2px solid ${roleColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.75rem", color: roleColor, fontWeight: "bold", flexShrink: 0,
        }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#0f172a", fontSize: "0.78rem", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.62rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email}
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div style={{ marginBottom: "0.6rem" }}>
        <span style={{
          background: roleColor + "18", color: roleColor,
          borderRadius: 10, padding: "2px 8px",
          fontSize: "0.62rem", fontWeight: "bold",
        }}>
          {user.role}
        </span>
        <span style={{ color: "#94a3b8", fontSize: "0.6rem", marginLeft: 6 }}>
          {user.permissions.length} permissions
        </span>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          width: "100%", padding: "0.35rem", background: "transparent",
          border: "1px solid #e2e8f0", borderRadius: 4, color: "#64748b",
          fontSize: "0.72rem", cursor: "pointer", textAlign: "center",
        }}
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.border = "1px solid #ef4444"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.border = "1px solid #e2e8f0"; (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
      >
        Sign Out
      </button>
    </div>
  );
}
