"use client";
import { useEffect, useState } from "react";
import { api, TrainingRecord, UserRead } from "@/lib/api";
import { getAuth, hasPermission } from "@/lib/auth";

export default function TrainingPage() {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [users, setUsers] = useState<UserRead[]>([]);
  const [error, setError] = useState("");
  const canManage = hasPermission("MANAGE_USERS");

  const [userId, setUserId] = useState("");
  const [trainingName, setTrainingName] = useState("");
  const [description, setDescription] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [filterUser, setFilterUser] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) return;
    // Default: show own records
    if (!canManage) {
      setFilterUser(auth.user_id);
      api.training.list(auth.user_id).then(setRecords).catch(console.error);
    } else {
      setUserId(auth.user_id);
      loadAll();
    }
    if (canManage) {
      api.users.list().then(setUsers).catch(console.error);
    }
  }, []);

  const loadAll = async (uid?: string) => {
    try {
      const recs = await api.training.list(uid);
      setRecords(recs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFilterChange = (uid: string) => {
    setFilterUser(uid);
    loadAll(uid || undefined);
  };

  const createRecord = async () => {
    if (!userId || !trainingName || !completedAt || !validUntil) return;
    try {
      setError("");
      await api.training.create({
        user_id: userId,
        training_name: trainingName,
        description: description || undefined,
        completed_at: new Date(completedAt).toISOString(),
        valid_until: new Date(validUntil).toISOString(),
      });
      setTrainingName(""); setDescription(""); setCompletedAt(""); setValidUntil("");
      loadAll(filterUser || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteRecord = async (id: string) => {
    try {
      await api.training.delete(id);
      loadAll(filterUser || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const now = new Date();
  const validCount = records.filter(r => r.is_valid).length;
  const expiredCount = records.length - validCount;

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" };
  const inputStyle: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" };
  const btnStyle = (color = "#1565c0"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem" });

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem", color: "#0d1b2a" }}>Training & Competency</h1>

      {error && (
        <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* Summary badges */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Valid", count: validCount, color: "#2e7d32", bg: "#e8f5e9" },
          { label: "Expired", count: expiredCount, color: "#b71c1c", bg: "#ffebee" },
          { label: "Total", count: records.length, color: "#1565c0", bg: "#e3f2fd" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 8, padding: "0.75rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: "bold", color: s.color }}>{s.count}</div>
            <div style={{ fontSize: "0.72rem", color: "#666" }}>{s.label} Records</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: canManage ? "300px 1fr" : "1fr", gap: "1.5rem" }}>
        {canManage && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Add Training Record</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">Select user…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role_name})</option>)}
              </select>
              <input style={inputStyle} placeholder="Training name" value={trainingName} onChange={e => setTrainingName(e.target.value)} />
              <textarea style={{ ...inputStyle, height: 55 }} placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
              <div>
                <label style={{ fontSize: "0.72rem", color: "#555" }}>Completed</label>
                <input type="date" style={inputStyle} value={completedAt} onChange={e => setCompletedAt(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: "0.72rem", color: "#555" }}>Valid Until</label>
                <input type="date" style={inputStyle} value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
              <button style={btnStyle()} onClick={createRecord}>Add Record</button>
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Training Records</h3>
            {canManage && (
              <select style={{ ...inputStyle, width: "auto" }} value={filterUser} onChange={e => handleFilterChange(e.target.value)}>
                <option value="">All users</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>

          {records.length === 0 ? (
            <p style={{ color: "#888", fontSize: "0.85rem" }}>No training records found.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["Training", "Description", "Completed", "Valid Until", "Status", canManage ? "" : null].filter(h => h !== null).map(h => (
                    <th key={h as string} style={{ padding: "8px 10px", textAlign: "left", border: "1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const expiring = r.is_valid && (new Date(r.valid_until).getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;
                  return (
                    <tr key={r.id} style={{ background: !r.is_valid ? "#fff5f5" : expiring ? "#fffde7" : "#fff" }}>
                      <td style={{ padding: "8px 10px", border: "1px solid #eee", fontWeight: 500 }}>{r.training_name}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #eee", color: "#666", fontSize: "0.78rem" }}>{r.description || "—"}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #eee", color: "#555" }}>{new Date(r.completed_at).toLocaleDateString()}</td>
                      <td style={{ padding: "8px 10px", border: "1px solid #eee", color: !r.is_valid ? "#b71c1c" : expiring ? "#e65100" : "#555" }}>
                        {new Date(r.valid_until).toLocaleDateString()}
                        {expiring && r.is_valid && <span style={{ marginLeft: 4, fontSize: "0.7rem", color: "#e65100" }}>⚠ Expiring soon</span>}
                      </td>
                      <td style={{ padding: "8px 10px", border: "1px solid #eee" }}>
                        <span style={{
                          background: r.is_valid ? "#e8f5e9" : "#ffebee",
                          color: r.is_valid ? "#2e7d32" : "#b71c1c",
                          borderRadius: 10, padding: "2px 8px", fontSize: "0.72rem",
                        }}>
                          {r.is_valid ? "Valid" : "Expired"}
                        </span>
                      </td>
                      {canManage && (
                        <td style={{ padding: "8px 10px", border: "1px solid #eee" }}>
                          <button style={{ ...btnStyle("#b71c1c"), padding: "2px 6px" }} onClick={() => deleteRecord(r.id)}>✕</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
