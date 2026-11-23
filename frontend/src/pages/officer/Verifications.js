import React, { useState, useEffect } from "react";
import api from "../../api";

const STATUS_BADGE = {
  pending:  "badge-warning",
  approved: "badge-success",
  rejected: "badge-error",
};

export default function Verifications() {
  const [voters, setVoters]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState("pending");
  const [error, setError]                 = useState("");
  const [modal, setModal]                 = useState(null);
  const [step, setStep]                   = useState(0);
  const [docUrl, setDocUrl]               = useState(null);
  const [docMime, setDocMime]             = useState("");
  const [docLoading, setDocLoading]       = useState(false);
  const [docError, setDocError]           = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionDone, setActionDone]       = useState(null);

  useEffect(() => { fetchVoters(); }, [filter]); // eslint-disable-line

  async function fetchVoters() {
    setLoading(true); setError("");
    try {
      const res = await api.get(`/officer/pending-verifications?status=${filter}`);
      setVoters(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load voters");
    } finally { setLoading(false); }
  }

  function openModal(voter) {
    setModal(voter);
    setStep(0);
    setDocUrl(null);
    setDocMime("");
    setDocError("");
    setActionDone(null);
  }

  function closeModal() {
    if (docUrl) URL.revokeObjectURL(docUrl);
    setModal(null);
    setDocUrl(null);
  }

  async function decryptDocument() {
    if (docUrl) return;
    setDocLoading(true); setDocError("");
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `http://localhost:8000/api/v1/officer/document/${modal.user_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Decryption failed");
      const blob = await res.blob();
      setDocMime(blob.type);
      setDocUrl(URL.createObjectURL(blob));
    } catch (e) {
      setDocError(e.message);
    } finally { setDocLoading(false); }
  }

  async function handleAction(action) {
    setActionLoading(action);
    try {
      await api.post(`/officer/verify/${modal.user_id}`, { action });
      setActionDone(action);
      setTimeout(() => fetchVoters(), 300);
    } catch (err) {
      setDocError(err.response?.data?.detail || "Action failed");
    } finally { setActionLoading(null); }
  }

  // For already-decided voters: only 2 steps (no Decision tab)
  const isPending   = modal?.verification_status === "pending";
  const stepLabels  = isPending ? ["Voter Info", "Document", "Decision"] : ["Voter Info", "Document"];
  const maxStep     = stepLabels.length - 1;

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Voter Verification Queue</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Review encrypted documents. Approval is signed with Ed25519.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">AES-256-GCM Decryption</span>
        <span className="badge badge-white">Ed25519 Approval Signature</span>
        <span className="badge badge-white">SHA-256 Audit Fingerprint</span>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["pending", "approved", "rejected"].map((s) => (
          <button key={s}
            className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="spinner" /> Loading...
        </div>
      ) : voters.length === 0 ? (
        <div className="card">
          <div className="alert alert-info">No {filter} verifications.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {voters.map((v) => (
            <div key={v.user_id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: "1rem" }}>{v.full_name}</span>
                    <span className={`badge ${STATUS_BADGE[v.verification_status]}`}>
                      {v.verification_status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{v.email}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
                    {v.id_document_type} &nbsp;·&nbsp; {v.nationality} &nbsp;·&nbsp; {v.constituency}
                  </div>
                </div>
                {v.verification_status === "pending" ? (
                  <button className="btn btn-primary btn-sm" onClick={() => openModal(v)}>
                    Start Verification →
                  </button>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={() => openModal(v)}>
                    View Details
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
            width: "100%", maxWidth: 600, maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            {/* Header */}
            <div style={{
              padding: "18px 24px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                  {isPending ? "Verify Voter" : "Voter Details"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {modal.full_name}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}
                style={{ fontSize: "1.2rem", padding: "4px 10px" }}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{
              padding: "14px 24px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center",
            }}>
              {stepLabels.map((label, i) => (
                <React.Fragment key={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700,
                      background: i < step ? "var(--success)" : i === step ? "var(--text-primary)" : "var(--border)",
                      color: i <= step ? "#fff" : "var(--text-muted)",
                      flexShrink: 0,
                    }}>
                      {i < step ? "✓" : i + 1}
                    </div>
                    <span style={{
                      fontSize: "0.82rem", fontWeight: i === step ? 600 : 400,
                      color: i === step ? "var(--text-primary)" : i < step ? "var(--success)" : "var(--text-muted)",
                    }}>{label}</span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: "var(--border)", margin: "0 10px" }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

              {/* Step 0: Voter Info */}
              {step === 0 && (
                <div>
                  <div style={{ marginBottom: 16, fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    Review the voter's personal information before proceeding to document verification.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Full Name",         value: modal.full_name },
                      { label: "Email",              value: modal.email },
                      { label: "Document Type",      value: modal.id_document_type },
                      { label: "Date of Birth",      value: modal.date_of_birth },
                      { label: "Nationality",        value: modal.nationality },
                      { label: "Constituency",       value: modal.constituency },
                      { label: "Status",             value: modal.verification_status },
                      { label: "Doc Hash (SHA-256)", value: modal.document_hash ? modal.document_hash.slice(0, 20) + "…" : "—" },
                      ...(!isPending ? [
                        { label: "Verified By (Officer)", value: modal.verified_by_email || "—" },
                        { label: "Verified At",           value: modal.verified_at ? new Date(modal.verified_at).toLocaleString() : "—" },
                      ] : []),
                    ].map((item) => (
                      <div key={item.label} style={{
                        padding: "10px 12px", background: "var(--bg-input)",
                        borderRadius: "var(--radius)", border: "1px solid var(--border)",
                      }}>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginTop: 3, fontWeight: 500 }}>
                          {item.value || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 1: Document */}
              {step === 1 && (
                <div>
                  {!docUrl ? (
                    <>
                      <div style={{ marginBottom: 16, fontSize: "0.9rem", color: "var(--text-muted)" }}>
                        The document is stored encrypted with <strong>AES-256-GCM</strong>. Click the button below to decrypt and view it.
                      </div>
                      <div style={{
                        padding: "16px", background: "var(--bg-input)",
                        borderRadius: "var(--radius)", border: "1px solid var(--border)",
                        marginBottom: 16,
                      }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          <span className="badge badge-info">AES-256-GCM</span>
                          <span className="badge badge-white">DEK Unwrap via KEK</span>
                          <span className="badge badge-white">SHA-256 Verified</span>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 3 }}>Document Hash:</div>
                        <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-primary)", wordBreak: "break-all" }}>
                          {modal.document_hash || "—"}
                        </div>
                      </div>
                      {!isPending && modal.officer_signature && (
                        <div style={{
                          padding: "12px 14px", background: "var(--success-bg)",
                          borderRadius: "var(--radius)", border: "1px solid var(--success-border)",
                          marginBottom: 16,
                        }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--success)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                            Ed25519 Officer Signature
                          </div>
                          <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-primary)", wordBreak: "break-all" }}>
                            {modal.officer_signature}
                          </div>
                        </div>
                      )}
                      {docError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{docError}</div>}
                      <button className="btn btn-primary btn-full" onClick={decryptDocument} disabled={docLoading}>
                        {docLoading ? <><span className="spinner" /> Decrypting…</> : "🔓 Decrypt & View Document"}
                      </button>
                    </>
                  ) : (
                    <div style={{
                      border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      overflow: "hidden", background: "#000",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      minHeight: 320,
                    }}>
                      {docMime.startsWith("image/") ? (
                        <img src={docUrl} alt="ID Document"
                          style={{ maxWidth: "100%", maxHeight: 440, objectFit: "contain" }} />
                      ) : (
                        <iframe src={docUrl} title="ID Document"
                          style={{ width: "100%", height: 440, border: "none" }} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Decision — only for pending voters */}
              {step === 2 && isPending && (
                <div>
                  {actionDone ? (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <div style={{ fontSize: "3rem", marginBottom: 12 }}>
                        {actionDone === "approve" ? "✅" : "❌"}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 6 }}>
                        Voter {actionDone === "approve" ? "Approved" : "Rejected"}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        {actionDone === "approve"
                          ? "The voter has been approved and can now access elections."
                          : "The voter has been rejected and will be notified to re-upload their document."}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 20, fontSize: "0.9rem", color: "var(--text-muted)" }}>
                        You have reviewed the voter's information and document. Make your final decision below.
                        This action will be <strong>signed with Ed25519</strong> and logged in the audit trail.
                      </div>
                      <div style={{
                        padding: "14px 16px", background: "var(--bg-input)",
                        borderRadius: "var(--radius)", border: "1px solid var(--border)",
                        marginBottom: 20,
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "0.9rem" }}>Verification Summary</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          <div>👤 <strong>{modal.full_name}</strong> — {modal.email}</div>
                          <div>📄 {modal.id_document_type} &nbsp;·&nbsp; {modal.nationality} &nbsp;·&nbsp; {modal.constituency}</div>
                          <div>🔐 Document reviewed: <span style={{ color: docUrl ? "var(--success)" : "var(--warning)" }}>{docUrl ? "Yes ✓" : "Not viewed"}</span></div>
                        </div>
                      </div>
                      {docError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{docError}</div>}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <button
                          className="btn btn-full"
                          style={{
                            background: "var(--success-bg)", color: "var(--success)",
                            border: "1px solid var(--success-border)", padding: "14px",
                            fontSize: "0.95rem", fontWeight: 600,
                          }}
                          disabled={!!actionLoading}
                          onClick={() => handleAction("approve")}
                        >
                          {actionLoading === "approve" ? <span className="spinner" /> : "✓"} Approve Voter
                        </button>
                        <button
                          className="btn btn-danger btn-full"
                          style={{ padding: "14px", fontSize: "0.95rem", fontWeight: 600 }}
                          disabled={!!actionLoading}
                          onClick={() => handleAction("reject")}
                        >
                          {actionLoading === "reject" ? <span className="spinner" /> : "✗"} Reject Voter
                        </button>
                      </div>
                      <div style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center" }}>
                        Rejection will allow the voter to re-upload their document.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <button className="btn btn-outline btn-sm"
                onClick={() => step > 0 ? setStep(step - 1) : closeModal()}>
                {step === 0 ? "Close" : "← Back"}
              </button>

              {/* Next button: show only when not done and not on last step */}
              {!actionDone && step < maxStep && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !docUrl}
                >
                  Next →
                </button>
              )}

              {actionDone && (
                <button className="btn btn-primary btn-sm" onClick={closeModal}>
                  Done ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
