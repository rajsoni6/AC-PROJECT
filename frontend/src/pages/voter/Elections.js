import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";

const STATUS_BADGE = {
  open: "badge-success",
  closed: "badge-error",
  draft: "badge-white",
  published: "badge-info",
  tallying: "badge-warning",
  completed: "badge-white",
};

export default function Elections() {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/voter/elections")
      .then((res) => setElections(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load elections"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="spinner" /> Loading elections...
    </div>
  );

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Available Elections</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Elections you are eligible for based on ABAC policy (nationality, age, constituency).
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">ABAC Eligibility Check</span>
        <span className="badge badge-white">ElGamal Encrypted Ballot</span>
        <span className="badge badge-white">ZKP Vote Proof</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {elections.length === 0 && !error && (
        <div className="card">
          <div className="alert alert-info">No elections available for your profile at this time.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {elections.map((e) => (
          <div key={e.id} className="card" style={{ cursor: "pointer" }}
            onClick={() => e.status === "open" && navigate(`/voter/vote/${e.id}`)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 600 }}>{e.title}</span>
                  <span className={`badge ${STATUS_BADGE[e.status] || "badge-white"}`}>{e.status}</span>
                  {e.has_voted && <span className="badge badge-success">Voted ✓</span>}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{e.description}</p>
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  <span>📅 {e.start_time ? new Date(e.start_time).toLocaleDateString() : "TBD"} – {e.end_time ? new Date(e.end_time).toLocaleDateString() : "TBD"}</span>
                  <span>👥 {e.candidate_count} candidates</span>
                  {e.eligible !== undefined && (
                    <span style={{ color: e.eligible ? "var(--success)" : "var(--error)" }}>
                      {e.eligible ? "✓ Eligible" : "✗ Not eligible"}
                    </span>
                  )}
                </div>
              </div>
              {e.status === "open" && !e.has_voted && (
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 16 }}
                  onClick={(ev) => { ev.stopPropagation(); navigate(`/voter/vote/${e.id}`); }}>
                  Vote Now →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
