import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authAPI.login(form);
      await login(res.data);
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d) => d.msg).join(" | "));
      } else {
        setError(detail || "Invalid email or password");
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-layout">
      <div className="auth-left">
        <div className="auth-brand">
          <h1>VerifyVote</h1>
          <p>A cryptographically secure electronic voting platform built for transparency, privacy, and integrity.</p>
          <div className="auth-features">
            {[
              { title: "AES-256-GCM", desc: "Document encryption with key wrapping" },
              { title: "ElGamal Encryption", desc: "Homomorphic vote tallying" },
              { title: "Ed25519 Signatures", desc: "Officer approvals and receipts" },
              { title: "Shamir Secret Sharing", desc: "Threshold trustee decryption" },
              { title: "Zero-Knowledge Proofs", desc: "Vote validity without disclosure" },
              { title: "Merkle Tree", desc: "Bulletin board inclusion proofs" },
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
          <div className="auth-form-title">Sign in</div>
          <div className="auth-form-sub">Enter your credentials to access your account</div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" value={form.email}
                onChange={set("email")} placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={set("password")} placeholder="Your password" required />
            </div>
            <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}
              style={{ marginTop: 4 }}>
              {loading && <span className="spinner" />}
              Sign in
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            New voter?{" "}
            <Link to="/register" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
