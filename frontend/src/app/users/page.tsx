"use client";
import { useEffect, useState } from "react";
import { api, UserRead, RoleRead, PermissionRead } from "@/lib/api";
import { hasPermission, getAuth } from "@/lib/auth";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#b71c1c", QA: "#1b5e20", QARA: "#1a6b3c",
  DEVELOPER: "#0d47a1", TESTER: "#6a1b9a", REVIEWER: "#4a148c",
};

export default function UsersPage() {
  const [users,     setUsers]    = useState<UserRead[]>([]);
  const [roles,     setRoles]    = useState<RoleRead[]>([]);
  const [allPerms,  setAllPerms] = useState<PermissionRead[]>([]);
  const [error,     setError]    = useState("");
  const [canManage, setCanManage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [primaryAdminId, setPrimaryAdminId] = useState<string | null>(null);

  // New user form
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [roleId,   setRoleId]   = useState("");

  // Edit user inline
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editName,     setEditName]     = useState("");
  const [editRoleId,   setEditRoleId]   = useState("");
  const [editSaving,   setEditSaving]   = useState(false);

  // New role form
  const [showRoleForm,  setShowRoleForm]  = useState(false);
  const [roleName,      setRoleName]      = useState("");
  const [roleDesc,      setRoleDesc]      = useState("");
  const [rolePerms,     setRolePerms]     = useState<Set<string>>(new Set());
  const [roleErr,       setRoleErr]       = useState("");

  useEffect(() => {
    setCanManage(hasPermission("MANAGE_USERS"));
    setCurrentUserId(getAuth()?.user_id ?? null);
    load();
  }, []);

  const load = async () => {
    try {
      const [u, r, p] = await Promise.all([api.users.list(), api.roles.list(), api.roles.listPermissions()]);
      setUsers(u);
      setRoles(r);
      setAllPerms(p);
      if (r.length > 0) setRoleId(r[0].id);
      // Primary admin = earliest-created ADMIN user — permanently protected
      const admins = u.filter(usr => usr.role_name === "ADMIN").sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      if (admins.length > 0) setPrimaryAdminId(admins[0].id);
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

  const createRole = async () => {
    if (!roleName) return;
    setRoleErr("");
    try {
      await api.roles.create({ name: roleName, description: roleDesc, permission_names: [...rolePerms] });
      setRoleName(""); setRoleDesc(""); setRolePerms(new Set()); setShowRoleForm(false);
      load();
    } catch (e: unknown) { setRoleErr(e instanceof Error ? e.message : String(e)); }
  };

  const deleteRole = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"? Users assigned this role must be re-assigned first.`)) return;
    try { await api.roles.delete(id); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const toggleActive = async (user: UserRead) => {
    try {
      await api.users.update(user.id, { is_active: !user.is_active });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const isProtected = (u: UserRead) =>
    u.id === primaryAdminId || u.id === currentUserId;

  const startEdit = (u: UserRead) => {
    setEditingId(u.id);
    setEditName(u.name);
    setEditRoleId(roles.find(r => r.name === u.role_name)?.id ?? "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      await api.users.update(editingId, { name: editName, role_id: editRoleId || undefined });
      setEditingId(null);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setEditSaving(false); }
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });

  // Group permissions by module (word after the verb)
  const PERM_GROUPS: Record<string, { label: string; perms: string[] }> = {
    REQUIREMENT:    { label: "Requirements",    perms: ["READ_REQUIREMENT","CREATE_REQUIREMENT","UPDATE_REQUIREMENT","DELETE_REQUIREMENT"] },
    RISK:           { label: "Risks",           perms: ["READ_RISK","CREATE_RISK","UPDATE_RISK","DELETE_RISK"] },
    DESIGN:         { label: "Design",          perms: ["READ_DESIGN","CREATE_DESIGN","UPDATE_DESIGN","DELETE_DESIGN"] },
    TESTCASE:       { label: "Testing",         perms: ["READ_TESTCASE","CREATE_TESTCASE","EXECUTE_TEST"] },
    VALIDATION:     { label: "Validation",      perms: ["CREATE_VALIDATION","UPDATE_VALIDATION"] },
    CHANGE:         { label: "Change Control",  perms: ["CREATE_CHANGE_REQUEST","APPROVE_CHANGE_REQUEST","IMPLEMENT_CHANGE"] },
    RELEASE:        { label: "Release",         perms: ["CREATE_RELEASE","APPROVE_RELEASE","PUBLISH_RELEASE"] },
    DOCUMENT:       { label: "Documents",       perms: ["READ_DOCUMENT","UPDATE_DOCUMENT","GENERATE_DHF"] },
    ADMIN:          { label: "Admin",           perms: ["MANAGE_USERS","VIEW_AUDIT"] },
  };
  const allPermNames = new Set(allPerms.map(p => p.name));

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
                <>
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5, background: editingId === u.id ? "#f0f4ff" : undefined }}>
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
                        {isProtected(u) ? (
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontStyle: "italic" }}>
                            🔒 {u.id === primaryAdminId ? "Primary admin" : "Current user"}
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => editingId === u.id ? setEditingId(null) : startEdit(u)}
                              style={btnStyle(editingId === u.id ? "#64748b" : "#3949ab")}
                            >
                              {editingId === u.id ? "Cancel" : "Edit"}
                            </button>
                            <button
                              style={btnStyle(u.is_active ? "#b71c1c" : "#2e7d32")}
                              onClick={() => toggleActive(u)}
                            >
                              {u.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  {editingId === u.id && (
                    <tr key={u.id + "_edit"} style={{ background: "#f0f4ff" }}>
                      <td colSpan={5} style={{ padding: "10px 12px", border: "1px solid #c5cae9", borderTop: "none" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ flex: "1 1 160px" }}>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", marginBottom: 3, fontWeight: 600 }}>Full Name</div>
                            <input style={{ ...inputStyle }} value={editName} onChange={e => setEditName(e.target.value)} />
                          </div>
                          <div style={{ flex: "1 1 160px" }}>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", marginBottom: 3, fontWeight: 600 }}>Role</div>
                            <select style={inputStyle} value={editRoleId} onChange={e => setEditRoleId(e.target.value)}>
                              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                          <div style={{ paddingTop: 16 }}>
                            <button onClick={saveEdit} disabled={editSaving || !editName} style={btnStyle("#1565c0")}>
                              {editSaving ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {/* Role management */}
          <div style={{ marginTop: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, color: "#1e293b", fontSize: "0.9rem" }}>Roles & Permissions</h4>
              {canManage && (
                <button onClick={() => setShowRoleForm(v => !v)} style={btnStyle(showRoleForm ? "#64748b" : "#3949ab")}>
                  {showRoleForm ? "Cancel" : "+ New Role"}
                </button>
              )}
            </div>

            {/* Role creation form */}
            {showRoleForm && (
              <div style={{ background: "#f0f4ff", border: "1px solid #c5cae9", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="Role name (e.g. TESTER)" value={roleName}
                    onChange={e => setRoleName(e.target.value.toUpperCase().replace(/\s+/g, "_"))} />
                  <input style={{ ...inputStyle, flex: "2 1 200px" }} placeholder="Description (optional)" value={roleDesc}
                    onChange={e => setRoleDesc(e.target.value)} />
                </div>
                <div style={{ fontSize: "0.72rem", color: "#3949ab", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Permissions — select per module
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 10 }}>
                  {Object.entries(PERM_GROUPS).map(([key, group]) => {
                    const available = group.perms.filter(p => allPermNames.has(p));
                    if (!available.length) return null;
                    const allChecked = available.every(p => rolePerms.has(p));
                    return (
                      <div key={key} style={{ background: "#fff", border: "1px solid #c5cae9", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <input type="checkbox" checked={allChecked} style={{ margin: 0 }}
                            onChange={e => {
                              const next = new Set(rolePerms);
                              available.forEach(p => e.target.checked ? next.add(p) : next.delete(p));
                              setRolePerms(next);
                            }} />
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#3949ab" }}>{group.label}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {available.map(p => (
                            <label key={p} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: "0.68rem", color: "#555" }}>
                              <input type="checkbox" checked={rolePerms.has(p)} style={{ margin: 0 }}
                                onChange={e => {
                                  const next = new Set(rolePerms);
                                  e.target.checked ? next.add(p) : next.delete(p);
                                  setRolePerms(next);
                                }} />
                              {p.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {roleErr && <div style={{ color: "#b71c1c", fontSize: "0.78rem", marginBottom: 6 }}>{roleErr}</div>}
                <button onClick={createRole} disabled={!roleName} style={btnStyle()}>Create Role</button>
              </div>
            )}

            {/* Role list */}
            {roles.map(r => {
              const color = ROLE_COLORS[r.name] ?? "#546e7a";
              return (
                <div key={r.id} style={{ marginBottom: "0.5rem", padding: "0.65rem 0.85rem", background: "#fafafa", borderRadius: 6, border: "1px solid #e8eaed" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.permissions.length > 0 ? 6 : 0 }}>
                    <span style={{
                      fontWeight: 700, fontSize: "0.78rem", color,
                      background: color + "18", borderRadius: 4, padding: "2px 8px",
                    }}>{r.name}</span>
                    {r.description && <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.description}</span>}
                    {canManage && (
                      <button onClick={() => deleteRole(r.id, r.name)}
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "#e57373", cursor: "pointer", fontSize: "0.78rem" }}>
                        Delete
                      </button>
                    )}
                  </div>
                  {r.permissions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {r.permissions.map(p => (
                        <span key={p} style={{ fontSize: "0.62rem", background: color + "14", color, border: `1px solid ${color}33`, borderRadius: 3, padding: "1px 6px", fontWeight: 500 }}>
                          {p.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
