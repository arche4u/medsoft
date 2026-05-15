"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveAuth, getAuth } from "@/lib/auth";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#b71c1c", QA: "#1b5e20", DEVELOPER: "#0d47a1", REVIEWER: "#4a148c",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAuth()) router.replace("/");
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.auth.login(email, password);
      saveAuth({
        user_id: data.user_id,
        name: data.name,
        email: data.email,
        role: data.role,
        permissions: data.permissions,
        access_token: data.access_token,
      });
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    display: "block", width: "100%", padding: "0.65rem 0.8rem",
    border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem",
    fontFamily: "monospace", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <div style={{ width: 380 }}>
        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 2px 16px rgba(0,0,0,0.1)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ background: "#0d1b2a", padding: "2rem", textAlign: "center" }}>
            <div style={{ color: "#fff", fontSize: "1.4rem", fontWeight: "bold", fontFamily: "monospace" }}>MedSoft</div>
            <div style={{ color: "#546e7a", fontSize: "0.75rem", marginTop: 4, fontFamily: "monospace" }}>IEC 62304 Compliance Platform</div>
          </div>

          <form onSubmit={handleLogin} style={{ padding: "2rem" }}>
            <h2 style={{ margin: "0 0 1.5rem", fontSize: "1rem", color: "#333", fontFamily: "monospace" }}>Sign In</h2>

            {error && (
              <div style={{ background: "#ffebee", border: "1px solid #f44336", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem", color: "#b71c1c", fontSize: "0.82rem", fontFamily: "monospace" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#555", marginBottom: 4, fontFamily: "monospace" }}>Email</label>
              <input
                type="email"
                style={inputStyle}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@medsoft.local"
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#555", marginBottom: 4, fontFamily: "monospace" }}>Password</label>
              <input
                type="password"
                style={inputStyle}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "0.7rem", background: loading ? "#90a4ae" : "#1565c0",
                color: "#fff", border: "none", borderRadius: 6, fontSize: "0.9rem",
                cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace",
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Demo credentials */}
        <div style={{ marginTop: "1.5rem", background: "#fff", borderRadius: 8, padding: "1rem 1.25rem", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "0.6rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Demo Accounts</div>
          {[
            { email: "admin@medsoft.local",    pass: "Admin@123",  role: "ADMIN" },
            { email: "qa@medsoft.local",       pass: "Qa@123456",  role: "QA" },
            { email: "dev@medsoft.local",      pass: "Dev@123456", role: "DEVELOPER" },
            { email: "reviewer@medsoft.local", pass: "Review@123", role: "REVIEWER" },
          ].map(u => (
            <div
              key={u.email}
              onClick={() => { setEmail(u.email); setPassword(u.pass); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.4rem 0.5rem", borderRadius: 4, cursor: "pointer",
                marginBottom: 2, transition: "background 0.1s",
              }}
              onMouseOver={e => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseOut={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "0.78rem", color: "#444", fontFamily: "monospace" }}>{u.email}</span>
              <span style={{
                fontSize: "0.62rem", fontWeight: "bold", padding: "1px 7px", borderRadius: 10,
                background: (ROLE_COLORS[u.role] ?? "#888") + "20",
                color: ROLE_COLORS[u.role] ?? "#888", fontFamily: "monospace",
              }}>{u.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
