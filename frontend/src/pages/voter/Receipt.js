import React, { useState, useEffect } from "react";
import api from "../../api";

export default function Receipt() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/voter/receipts")
      .then((res) => setReceipts(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load receipts"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="spinner" /> Loading receipts...
    </div>
  );

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>My Vote Receipts</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Each receipt is signed with Ed25519 and contains a SHA-256 commitment for verification.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">Ed25519 Signed</span>
        <span className="badge badge-white">SHA-256 Commitment</span>
        <span className="badge badge-white">Merkle Inclusion Proof</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {receipts.length === 0 && !error && (
        <div className="card">
          <div className="alert alert-info">No vote receipts yet. Cast a vote to receive a receipt.</div>
        </div>
      )}

      {receipts.map((r) => (
        <div key={r.ballot_id} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.election_title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                Voted: {new Date(r.submitted_at).toLocaleString()}
              </div>
            </div>
            <span className="badge badge-success">Verified ✓</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Ballot Commitment (SHA-256)", value: r.commitment },
              { label: "Nullifier", value: r.nullifier },
              { label: "Receipt Signature (Ed25519)", value: r.receipt_signature },
              { label: "Merkle Root", value: r.merkle_root || "Pending" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{item.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
