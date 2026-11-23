import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../api";

function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#dc2626", "#d97706", "#2563eb", "#16a34a"];
  return { score, label: labels[score] || "", color: colors[score] || "" };
}

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = getPasswordStrength(form.password);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authAPI.register({ ...form, role: "voter" });
      login(res.data);
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        // FastAPI validation error — extract first message
        setError(detail.map((d) => d.msg).join(" | "));
      } else {
        setError(detail || "Registration failed");
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-layout">
      <div className="auth-left">
        <div className="auth-brand">
          <h1>VerifyVote</h1>
          <p>Register as a voter to participate in secure, verifiable elections.</p>
          <div className="auth-features">
            {[
              { title: "Step 1", desc: "Create your voter account" },
              { title: "Step 2", desc: "Upload your ID document (AES-256-GCM encrypted)" },
              { title: "Step 3", desc: "Wait for officer verification" },
              { title: "Step 4", desc: "Receive your anonymous QR credential" },
              { title: "Step 5", desc: "Cast your encrypted vote" },
              { title: "Step 6", desc: "Verify your vote on the bulletin board" },
            ].map((f) => (
              <div key={f.title} className="auth-feature">
                <div className="auth-feature-dot" />
                <div className="auth-feature-text">
                  <strong>{f.title}</strong> — {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-form-title">Create voter account</div>
          <div className="auth-form-sub">Fill in your details to register as a voter</div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input className="form-input" value={form.full_name} onChange={set("full_name")}
                placeholder="John Doe" required />
            </div>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" value={form.email} onChange={set("email")}
                placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password} onChange={set("password")}
                placeholder="Min 8 chars, uppercase, digit, symbol" required />
              {form.password && (
                <div className="pw-strength">
                  <div className="pw-bar">
                    <div className="pw-fill" style={{ width: `${strength.score * 25}%`, background: strength.color }} />
                  </div>
                  <div className="pw-label" style={{ color: strength.color }}>{strength.label}</div>
                </div>
              )}
              <div className="form-hint">Secured with Argon2id hashing</div>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--bg-secondary)",
              borderRadius: "var(--radius)", border: "1px solid var(--border)",
              marginBottom: 16, fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Account type: <strong style={{ color: "var(--text-primary)" }}>Voter</strong>
              &nbsp;&mdash; Officers and Trustees are added by the administrator.
            </div>

            <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
              {loading && <span className="spinner" />}
              Create account
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-muted)", fontSize: "0.82rem" }}>
            Already registered?{" "}
            <Link to="/login" style={{ color: "var(--text-primary)", fontWeight: 500 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
