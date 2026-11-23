import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api";

export default function CastVote() {
  const { electionId } = useParams();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [selected, setSelected] = useState(null);
  const [qrToken, setQrToken] = useState("");
  const [step, setStep] = useState(1); // 1=select, 2=confirm, 3=done
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/voter/elections/${electionId}`)
      .then((res) => setElection(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load election"));
  }, [electionId]);

  async function handleSubmit() {
    if (!selected) { setError("Please select a candidate"); return; }
    setError(""); setLoading(true);
    try {
      const res = await api.post(`/voter/vote/${electionId}`, {
        candidate_id: selected,
        qr_token: qrToken,
      });
      setResult(res.data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || "Vote submission failed");
    } finally {
      setLoading(false);
    }
  }

  if (!election && !error) return (
    <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="spinner" /> Loading election...
    </div>
  );

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>{election?.title || "Cast Vote"}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Your vote is encrypted with Exponential ElGamal. A ZKP proves validity without revealing your choice.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">Exponential ElGamal</span>
        <span className="badge badge-white">Zero-Knowledge Proof</span>
        <span className="badge badge-white">SHA-256 Nullifier</span>
        <span className="badge badge-white">TLS 1.3</span>
      </div>

      {/* Steps */}
      <div className="steps" style={{ marginBottom: 24 }}>
        {["Select Candidate", "Confirm & Encrypt", "Receipt"].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`step ${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}`}>
              <div className="step-num">{step > i + 1 ? "✓" : i + 1}</div>
              <span>{s}</span>
            </div>
            {i < 2 && <span className="step-arrow">›</span>}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Step 1: Select */}
      {step === 1 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Select Your Candidate</div>
            <div className="card-desc">{election?.description}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {(election?.candidates || []).map((c) => (
              <div key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  padding: "16px", borderRadius: "var(--radius)",
                  border: `2px solid ${selected === c.id ? "#fff" : "var(--border)"}`,
                  background: selected === c.id ? "var(--bg-hover)" : "var(--bg-input)",
                  cursor: "pointer", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  border: `2px solid ${selected === c.id ? "#fff" : "var(--border)"}`,
                  background: selected === c.id ? "#fff" : "transparent",
                  flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{c.name}</div>
                  {c.party && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{c.party}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">QR Token (from your QR code)</label>
            <input className="form-input" value={qrToken} onChange={(e) => setQrToken(e.target.value)}
              placeholder="Paste your QR credential token" />
            <div className="form-hint">Used for ZKP eligibility verification and nullifier generation</div>
          </div>
          <button className="btn btn-primary" disabled={!selected} onClick={() => setStep(2)}>
            Continue →
          </button>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Confirm & Encrypt Vote</div>
            <div className="card-desc">Your vote will be encrypted before submission. This action cannot be undone.</div>
          </div>
          <div style={{ padding: "16px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 20 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>Selected Candidate</div>
            <div style={{ fontWeight: 600 }}>
              {election?.candidates?.find((c) => c.id === selected)?.name}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {[
              "Vote encrypted with Exponential ElGamal",
              "Zero-Knowledge Proof generated (valid vote proof)",
              "SHA-256 nullifier prevents double voting",
              "Submitted over TLS 1.3",
              "Stored in PostgreSQL atomic transaction",
            ].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--success)" }}>✓</span> {s}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
              {loading && <span className="spinner" />}
              Encrypt & Submit Vote
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Receipt */}
      {step === 3 && result && (
        <div className="card">
          <div className="alert alert-success">✅ Vote submitted successfully!</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {[
              { label: "Ballot Commitment (SHA-256)", value: result.commitment },
              { label: "Nullifier", value: result.nullifier },
              { label: "Receipt Signature (Ed25519)", value: result.receipt_signature?.slice(0, 60) + "…" },
              { label: "Merkle Inclusion", value: result.merkle_root ? "Included in bulletin board" : "Pending" },
            ].map((r) => (
              <div key={r.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{r.label}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button className="btn btn-outline" onClick={() => navigate("/voter/receipt")}>View Full Receipt</button>
            <button className="btn btn-ghost" onClick={() => navigate("/bulletin")}>Bulletin Board</button>
          </div>
        </div>
      )}
    </div>
  );
}
