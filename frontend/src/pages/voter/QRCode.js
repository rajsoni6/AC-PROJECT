import React, { useState, useEffect } from "react";
import api from "../../api";

export default function QRCode() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/voter/qrcode")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load QR code"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="spinner" /> Loading credential...
    </div>
  );

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Anonymous Voting Credential</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Your QR code contains a blind-signed anonymous credential. It proves eligibility without revealing your identity.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">Blind Signature</span>
        <span className="badge badge-white">Zero-Knowledge Proof</span>
        <span className="badge badge-white">Ed25519 Signed</span>
        <span className="badge badge-white">SHA-256 Nullifier</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data?.status === "pending" && (
        <div className="card">
          <div className="alert alert-warning">
            ⏳ Your document is pending officer verification. QR code will be available after approval.
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Verification Status</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Document Uploaded", done: true },
                { label: "Officer Review", done: false },
                { label: "Eligibility Approved", done: false },
                { label: "Blind Signature Issued", done: false },
                { label: "QR Code Generated", done: false },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: s.done ? "var(--success-bg)" : "var(--bg-input)",
                    border: `1px solid ${s.done ? "var(--success)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.65rem", color: s.done ? "var(--success)" : "var(--text-muted)",
                  }}>
                    {s.done ? "✓" : "○"}
                  </div>
                  <span style={{ fontSize: "0.875rem", color: s.done ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data?.qr_code_base64 && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 20 }}>
            <img
              src={`data:image/png;base64,${data.qr_code_base64}`}
              alt="Voting QR Code"
              style={{ width: 220, height: 220, border: "4px solid var(--border)", borderRadius: "var(--radius)" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
            {[
              { label: "Nullifier (SHA-256)", value: data.nullifier },
              { label: "Credential Signature", value: data.credential_signature?.slice(0, 40) + "…" },
              { label: "Issued At", value: data.issued_at },
            ].map((r) => (
              <div key={r.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{r.label}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</div>
              </div>
            ))}
          </div>
          <div className="alert alert-info" style={{ marginTop: 16, textAlign: "left" }}>
            🔒 This QR code is cryptographically bound to your identity via blind signature. Present it at the voting terminal.
          </div>
        </div>
      )}
    </div>
  );
}
