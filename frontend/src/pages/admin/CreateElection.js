import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";

const NATIONALITIES = ["Indian", "American", "British", "Canadian", "Australian", "German", "French", "Japanese", "Chinese", "Other"];
const CONSTITUENCIES = ["North Delhi", "South Delhi", "East Delhi", "West Delhi", "Mumbai North", "Mumbai South", "Bangalore North", "Bangalore South", "Chennai", "Kolkata", "Hyderabad", "Pune", "Other"];

export default function CreateElection() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [trusteesInfo, setTrusteesInfo] = useState({ count: 0, trustees: [] });
  const [form, setForm] = useState({
    title: "", description: "",
    eligibility_policy: { nationality: "", min_age: 18, constituency: "" },
    candidates: [{ name: "", party: "" }],
    threshold: 2, total_trustees: 0,
  });
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [trusteesLoading, setTrusteesLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/trustee-count").then((r) => {
      setTrusteesInfo(r.data);
      setForm((f) => ({
        ...f,
        total_trustees: r.data.count,
        threshold: Math.max(2, Math.ceil(r.data.count / 2)),
      }));
    }).catch((err) => setError(err.response?.data?.detail || "Could not load active trustees. Please retry before creating an election."))
      .finally(() => setTrusteesLoading(false));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPolicy = (k) => (e) => setForm((f) => ({
    ...f, eligibility_policy: { ...f.eligibility_policy, [k]: e.target.value }
  }));

  function addCandidate() {
    setForm((f) => ({ ...f, candidates: [...f.candidates, { name: "", party: "" }] }));
  }
  function setCandidate(i, k, v) {
    setForm((f) => {
      const c = [...f.candidates]; c[i] = { ...c[i], [k]: v };
      return { ...f, candidates: c };
    });
  }
  function removeCandidate(i) {
    setForm((f) => ({ ...f, candidates: f.candidates.filter((_, idx) => idx !== i) }));
  }

  async function handleCreate() {
    setError(""); setLoading(true);
    try {
      const payload = { ...form };
      // clean empty policy fields
      if (!payload.eligibility_policy.nationality) delete payload.eligibility_policy.nationality;
      if (!payload.eligibility_policy.constituency) delete payload.eligibility_policy.constituency;
      const res = await api.post("/admin/elections", payload);
      setResult(res.data); setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create election");
    } finally { setLoading(false); }
  }

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Create Election</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          ElGamal key pair generated, Ed25519 signs the config, Shamir splits the private key.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">ElGamal Keygen</span>
        <span className="badge badge-white">Ed25519 Config Signature</span>
        <span className="badge badge-white">Shamir (3-of-5)</span>
        <span className="badge badge-white">ABAC Policy</span>
      </div>

      <div className="steps" style={{ marginBottom: 24 }}>
        {["Election Details", "Candidates & ABAC Policy", "Keys Generated"].map((s, i) => (
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

      {/* Step 1: Election Details */}
      {step === 1 && (
        <div className="card">
        <div className="form-group">
            <label className="form-label">Election Title *</label>
            <input className="form-input" value={form.title} onChange={set("title")} placeholder="General Election 2025" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description} onChange={set("description")} placeholder="Election description..." />
          </div>

          <div style={{ padding: "14px 16px", background: "var(--info-bg)", borderRadius: "var(--radius)", border: "1px solid var(--info-border)", marginBottom: 16 }}>
            <div style={{ fontSize: "0.82rem", color: "var(--info)", fontWeight: 600, marginBottom: 4 }}>ℹ️ Election Lifecycle</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Election is opened and closed manually by Super Admin from the Elections management page. No start/end time needed.
            </div>
          </div>

          {trusteesInfo.count === 0 ? (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              No active trustees found. Please add trustees from User Management before creating an election.
            </div>
          ) : (
            <div style={{ padding: "12px 14px", background: "var(--success-bg)", borderRadius: "var(--radius)", border: "1px solid var(--success-border)", marginBottom: 16 }}>
              <div style={{ fontSize: "0.82rem", color: "var(--success)", fontWeight: 600, marginBottom: 4 }}>Trustees Available: {trusteesInfo.count}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {trusteesInfo.trustees.map((t) => (
                  <span key={t.id} className="badge badge-success">{t.email}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Total Trustees (n) — shares to generate</label>
              <input className="form-input" type="number" value={trusteesInfo.count} readOnly aria-readonly="true" />
              <div className="form-hint">Fixed to active trustee accounts. One Shamir share is assigned to each trustee when this election is created.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Threshold (t) — min needed to decrypt</label>
              <select className="form-select" value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: parseInt(e.target.value) }))}
                disabled={trusteesInfo.count === 0}>
                {Array.from({ length: form.total_trustees }, (_, i) => i + 1)
                  .filter((n) => n >= 2)
                  .map((n) => (
                    <option key={n} value={n}>{n} of {form.total_trustees}</option>
                  ))}
              </select>
              <div className="form-hint">At least 2 trustees must approve. Add all trustees before creating the election; later-added trustees cannot join its existing key shares.</div>
            </div>
          </div>

          <button className="btn btn-primary" disabled={trusteesLoading || !form.title || trusteesInfo.count < 2} onClick={() => setStep(2)}>
            Next →
          </button>
        </div>
      )}

      {/* Step 2: Candidates + ABAC */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Candidates</div>
            <div className="card-desc">Add at least 2 candidates</div>
          </div>

          {form.candidates.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                {i === 0 && <label className="form-label">Candidate Name</label>}
                <input className="form-input" value={c.name}
                  onChange={(e) => setCandidate(i, "name", e.target.value)} placeholder="Full name" />
              </div>
              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                {i === 0 && <label className="form-label">Party</label>}
                <input className="form-input" value={c.party}
                  onChange={(e) => setCandidate(i, "party", e.target.value)} placeholder="Party name" />
              </div>
              {form.candidates.length > 1 && (
                <button className="btn btn-danger btn-sm" onClick={() => removeCandidate(i)}>✕</button>
              )}
            </div>
          ))}
          <button className="btn btn-outline btn-sm" onClick={addCandidate} style={{ marginBottom: 24 }}>
            + Add Candidate
          </button>

          <hr className="divider" />

          <div className="card-header">
            <div className="card-title">ABAC Eligibility Policy</div>
            <div className="card-desc">
              Voters must match these attributes to participate. Leave blank to allow all.
            </div>
          </div>

          <div style={{ padding: "12px 14px", background: "var(--warning-bg)", borderRadius: "var(--radius)", border: "1px solid var(--warning-border)", marginBottom: 16, fontSize: "0.82rem", color: "var(--warning)" }}>
            ⚠️ These attributes are matched against voter's uploaded document details (nationality, DOB, constituency).
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Nationality</label>
              <select className="form-select" value={form.eligibility_policy.nationality} onChange={setPolicy("nationality")}>
                <option value="">Any (no restriction)</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="form-hint">Voter's nationality must match</div>
            </div>
            <div className="form-group">
              <label className="form-label">Minimum Age</label>
              <select className="form-select" value={form.eligibility_policy.min_age}
                onChange={(e) => setForm((f) => ({ ...f, eligibility_policy: { ...f.eligibility_policy, min_age: parseInt(e.target.value) } }))}>
                {[18, 21, 25].map((a) => <option key={a} value={a}>{a} years</option>)}
              </select>
              <div className="form-hint">Calculated from date of birth</div>
            </div>
            <div className="form-group">
              <label className="form-label">Constituency</label>
              <select className="form-select" value={form.eligibility_policy.constituency} onChange={setPolicy("constituency")}>
                <option value="">Any (no restriction)</option>
                {CONSTITUENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="form-hint">Voter's constituency must match</div>
            </div>
          </div>

          {/* ABAC preview */}
          <div style={{ padding: "12px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 20 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>Policy Preview</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Eligible voters must be:
              <strong> {form.eligibility_policy.nationality || "any nationality"}</strong>,
              age ≥ <strong>{form.eligibility_policy.min_age}</strong>,
              constituency: <strong>{form.eligibility_policy.constituency || "any"}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary"
              disabled={loading || form.candidates.some((c) => !c.name) || form.candidates.length < 2}
              onClick={handleCreate}>
              {loading && <span className="spinner" />}
              Create Election & Generate Keys
            </button>
          </div>
          {form.candidates.length < 2 && (
            <div className="form-hint" style={{ marginTop: 8, color: "var(--error)" }}>At least 2 candidates required</div>
          )}
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && result && (
        <div className="card">
          <div className="alert alert-success">✅ Election created successfully!</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {[
              { label: "Election ID",                value: result.election_id },
              { label: "ElGamal Public Key (h)",     value: result.elgamal_public_key_preview },
              { label: "Config Signature (Ed25519)", value: result.config_signature?.slice(0, 60) + "…" },
              { label: "Shamir Shares",              value: `${result.total_trustees} shares, threshold ${result.threshold}` },
            ].map((r) => (
              <div key={r.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{r.label}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={() => navigate("/admin/elections")}>View All Elections</button>
            <button className="btn btn-outline" onClick={() => navigate("/admin/trustees")}>Manage Trustees</button>
          </div>
        </div>
      )}
    </div>
  );
}
