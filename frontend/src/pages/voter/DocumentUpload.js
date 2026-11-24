import React, { useState, useEffect } from "react";
import api from "../../api";

const NATIONALITIES = ["Indian", "American", "British", "Canadian", "Australian", "German", "French", "Japanese", "Chinese", "Other"];
const CONSTITUENCIES = ["North Delhi", "South Delhi", "East Delhi", "West Delhi", "Mumbai North", "Mumbai South", "Bangalore North", "Bangalore South", "Chennai", "Kolkata", "Hyderabad", "Pune", "Other"];

export default function DocumentUpload() {
  const [file, setFile]                 = useState(null);
  const [docType, setDocType]           = useState("national_id");
  const [dob, setDob]                   = useState("");
  const [nationality, setNationality]   = useState("");
  const [constituency, setConstituency] = useState("");
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [status, setStatus]             = useState(null);

  const [hasDocument, setHasDocument] = useState(false);
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    api.get("/voter/document-status")
      .then((r) => {
        setStatus(r.data?.verification_status);
        setHasDocument(r.data?.has_document ?? false);
      })
      .catch((err) => setStatusError(err.response?.data?.detail || "Could not load document status. Refresh and try again."));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError("Please select a document file"); return; }
    setError(""); setLoading(true);
    try {
      const formData = new FormData();
      formData.append("document", file);
      formData.append("doc_type", docType);
      formData.append("date_of_birth", dob);
      formData.append("nationality", nationality);
      formData.append("constituency", constituency);
      const res = await api.post("/voter/upload-document", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      setStatus("pending");
      setHasDocument(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function renderContent() {
    // After successful upload
    if (result) {
      return (
        <div className="card">
          <div className="alert alert-success">✅ Document uploaded and encrypted successfully</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {[
              { label: "Document Hash (SHA-256)", value: result.document_hash },
              { label: "Encryption",              value: "AES-256-GCM with unique DEK" },
              { label: "Key Storage",             value: "DEK wrapped with KEK (KMS pattern)" },
              { label: "Status",                  value: "Pending officer verification" },
            ].map((r) => (
              <div key={r.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{r.label}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Pending — only hide form if document was actually uploaded
    if (status === "pending" && hasDocument) {
      return (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⏳</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 8 }}>Document Under Review</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.7 }}>
            Your document has been submitted and is <strong>pending officer verification</strong>.<br />
            You will get access to elections once approved.
          </div>
        </div>
      );
    }

    // Rejected — show alert + form for re-upload
    return (
      <>
        {status === "rejected" && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ❌ Your previous document was <strong>rejected</strong> by the officer. Please upload a valid document again.
          </div>
        )}
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Document Type</label>
              <select className="form-select" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
                <option value="voter_card">Voter Card</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input className="form-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Nationality</label>
                <select className="form-select" value={nationality} onChange={(e) => setNationality(e.target.value)} required>
                  <option value="">Select nationality</option>
                  {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Constituency</label>
              <select className="form-select" value={constituency} onChange={(e) => setConstituency(e.target.value)} required>
                <option value="">Select constituency</option>
                {CONSTITUENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">ID Document / Image</label>
              <div style={{
                border: "2px dashed var(--border)", borderRadius: "var(--radius)",
                padding: "32px", textAlign: "center", cursor: "pointer",
                background: file ? "var(--success-bg)" : "var(--bg-input)",
                transition: "all 0.2s",
              }}
                onClick={() => document.getElementById("doc-file").click()}
              >
                <input id="doc-file" type="file" accept="image/*,.pdf" style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files[0])} />
                {file ? (
                  <div>
                    <div style={{ fontSize: "1.5rem" }}>✅</div>
                    <div style={{ color: "var(--success)", marginTop: 8, fontSize: "0.875rem" }}>{file.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "2rem" }}>📄</div>
                    <div style={{ color: "var(--text-secondary)", marginTop: 8 }}>Click to select document</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>JPG, PNG, PDF accepted</div>
                  </div>
                )}
              </div>
              <div className="form-hint">File will be encrypted with AES-256-GCM before transmission</div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="btn btn-primary btn-full" type="submit" disabled={loading || !file}>
              {loading && <span className="spinner" />}
              Encrypt & Upload Document
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Upload ID Document</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Your document is encrypted with AES-256-GCM before storage. SHA-256 integrity fingerprint is generated.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">AES-256-GCM Encryption</span>
        <span className="badge badge-white">SHA-256 Integrity</span>
        <span className="badge badge-white">KEK / KMS Wrapping</span>
      </div>

      {renderContent()}
      {statusError && !result && <div className="alert alert-error" style={{ marginTop: 14 }}>{statusError}</div>}
    </div>
  );
}
