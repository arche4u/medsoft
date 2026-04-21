"use client";
import { useEffect, useState } from "react";
import { api, UserRead, RoleRead } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#b71c1c", QA: "#1b5e20", DEVELOPER: "#0d47a1", REVIEWER: "#4a148c",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [roles, setRoles] = useState<RoleRead[]>([]);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");

  useEffect(() => {
    setCanManage(hasPermission("MANAGE_USERS"));
    load();
  }, []);

  const load = async () => {
    try {
      const [u, r] = await Promise.all([api.users.list(), api.roles.list()]);
      setUsers(u);
      setRoles(r);
      if (r.length > 0) setRoleId(r[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createUser = async () => {
    if (!name || !email || !password || !roleId) return;
    try {
      setError("");
      await api.users.create({ name, email, password, role_id: roleId });
      setName(""); setEmail(""); setPassword("");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleActive = async (user: UserRead) => {
    try {
      await api.users.update(user.id, { is_active: !user.is_active });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>User Management</h1>

      {!canManage && (
        <div style={{ background: "#fff3e0", border: "1px solid #ff9800", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "1rem", color: "#e65100", fontSize: "0.85rem" }}>
          You have read-only access to this page. MANAGE_USERS permission required to create or modify users.
        </div>
      )}

      {error && (
        <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: canManage ? "320px 1fr" : "1fr", gap: "1.5rem" }}>
        {canManage && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>New User</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <input style={inputStyle} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
              <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
              <select style={inputStyle} value={roleId} onChange={e => setRoleId(e.target.value)}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button style={btnStyle()} onClick={createUser}>Create User</button>
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Users ({users.length})</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                {["Name", "Email", "Role", "Status", canManage ? "Actions" : ""].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: "8px 10px", border: "1px solid #eee", fontWeight: "500" }}>{u.name}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #eee", color: "#555" }}>{u.email}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #eee" }}>
                    <span style={{
                      background: ((ROLE_COLORS[u.role_name ?? ""] ?? "#888") + "20"),
                      color: ROLE_COLORS[u.role_name ?? ""] ?? "#888",
                      borderRadius: 10, padding: "2px 8px", fontSize: "0.72rem", fontWeight: "bold",
                    }}>
                      {u.role_name}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", border: "1px solid #eee" }}>
                    <span style={{
                      background: u.is_active ? "#e8f5e9" : "#fafafa",
                      color: u.is_active ? "#2e7d32" : "#888",
                      borderRadius: 10, padding: "2px 8px", fontSize: "0.72rem",
                    }}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: "8px 10px", border: "1px solid #eee" }}>
                      <button
                        style={btnStyle(u.is_active ? "#b71c1c" : "#2e7d32")}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Role permissions summary */}
          {roles.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              <h4 style={{ color: "#555", fontSize: "0.85rem" }}>Role Permissions</h4>
              {roles.map(r => (
                <div key={r.id} style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "#fafafa", borderRadius: 6, border: "1px solid #eee" }}>
                  <span style={{
                    fontWeight: "bold", fontSize: "0.8rem",
                    color: ROLE_COLORS[r.name] ?? "#333", marginRight: "0.75rem",
                  }}>{r.name}</span>
                  <span style={{ fontSize: "0.72rem", color: "#666" }}>
                    {r.permissions.join(" · ") || "No permissions"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
