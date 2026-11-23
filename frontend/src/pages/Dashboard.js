import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_STEPS = {
  voter: [
    { step: 1, label: "Register Account",    desc: "Voter account created",                    done: true },
    { step: 2, label: "Upload ID Document",  desc: "AES-256-GCM encrypted upload",             path: "/voter/documents" },
    { step: 3, label: "Await Verification",  desc: "Election officer reviews your document" },
    { step: 4, label: "Get QR Credential",   desc: "Anonymous credential via Blind Signature", path: "/voter/qrcode" },
    { step: 5, label: "Vote in Election",    desc: "ElGamal encrypted ballot submission",       path: "/voter/elections" },
    { step: 6, label: "View Receipt",        desc: "Ed25519 signed vote receipt",               path: "/voter/receipt" },
  ],
  election_officer: [
    { step: 1, label: "Review Documents",    desc: "Decrypt and verify voter ID documents",    path: "/officer/verifications" },
    { step: 2, label: "Sign Approvals",      desc: "Ed25519 digital signature on each approval" },
    { step: 3, label: "Monitor Elections",   desc: "View public bulletin board",               path: "/bulletin" },
  ],
  trustee: [
    { step: 1, label: "Receive Key Share",   desc: "Shamir (3-of-5) secret share assigned",   path: "/admin/trustees" },
    { step: 2, label: "Approve Tally",       desc: "Threshold decryption authorization" },
    { step: 3, label: "Verify Results",      desc: "ZKP tally verification" },
  ],
  super_admin: [
    { step: 1, label: "Create Election",     desc: "ElGamal keygen + Ed25519 config signature", path: "/admin/elections/create" },
    { step: 2, label: "Add Officers",        desc: "Assign election officers and trustees",      path: "/admin/users" },
    { step: 3, label: "Distribute Keys",     desc: "Shamir (3-of-5) trustee key shares",        path: "/admin/trustees" },
    { step: 4, label: "Monitor Voting",      desc: "Bulletin board + Merkle tree",              path: "/bulletin" },
    { step: 5, label: "Compute Tally",       desc: "Homomorphic vote counting",                 path: "/admin/results" },
    { step: 6, label: "Publish Results",     desc: "Ed25519 signed result + SHA-256 integrity", path: "/admin/results" },
  ],
};

const CRYPTO_INFO = [
  { label: "Transport",          value: "TLS 1.3" },
  { label: "Password Hashing",   value: "Argon2id" },
  { label: "Document Encryption",value: "AES-256-GCM + KEK" },
  { label: "Vote Encryption",    value: "Exponential ElGamal" },
  { label: "Signatures",         value: "Ed25519" },
  { label: "Key Distribution",   value: "Shamir (3-of-5)" },
  { label: "Integrity",          value: "SHA-256 + Merkle Tree" },
  { label: "Access Control",     value: "RBAC + ABAC" },
];

const ROLE_LABELS = {
  voter: "Voter", election_officer: "Election Officer",
  trustee: "Trustee", super_admin: "Super Admin",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const steps = ROLE_STEPS[user?.role] || [];

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
          Welcome, {user?.full_name}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: 3 }}>
          Signed in as <strong style={{ color: "var(--text-secondary)" }}>{ROLE_LABELS[user?.role]}</strong>
        </div>
      </div>

      {/* Workflow */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Your Workflow</div>
          <div className="card-desc">Complete each step in sequence</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((s) => (
            <div key={s.step}
              onClick={() => s.path && navigate(s.path)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 14px",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                cursor: s.path ? "pointer" : "default",
                transition: "border-color 0.12s",
              }}
              onMouseEnter={(e) => s.path && (e.currentTarget.style.borderColor = "#111")}
              onMouseLeave={(e) => s.path && (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: s.done ? "var(--success-bg)" : "var(--bg-primary)",
                border: `1.5px solid ${s.done ? "var(--success)" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.72rem", fontWeight: 700,
                color: s.done ? "var(--success)" : "var(--text-muted)",
              }}>
                {s.done ? "+" : s.step}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.845rem", fontWeight: 500, color: "var(--text-primary)" }}>
                  {s.label}
                </div>
                <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 1 }}>
                  {s.desc}
                </div>
              </div>
              {s.path && (
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>&#8594;</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Crypto Architecture */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Cryptographic Architecture</div>
          <div className="card-desc">Security primitives used in this system</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          {CRYPTO_INFO.map((item) => (
            <div key={item.label} style={{
              padding: "11px 13px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                {item.label}
              </div>
              <div style={{ fontSize: "0.845rem", fontWeight: 600, color: "var(--text-primary)", marginTop: 3 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
