import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";

const STATUS_BADGE = {
  draft: "badge-white", published: "badge-info", open: "badge-success",
  closed: "badge-warning", tallying: "badge-info", completed: "badge-success",
};

const STATUS_NEXT = {
  draft:     { action: "publish",  label: "Publish",        cls: "btn-outline" },
  published: { action: "open",     label: "Open Voting",    cls: "btn-primary" },
  open:      { action: "close",    label: "Close Election", cls: "btn-danger"  },
};

export default function AdminElections() {
  const [elections, setElections]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError]               = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/admin/elections")
      .then((res) => setElections(res.data))
      .catch(() => setError("Failed to load elections"))
      .finally(() => setLoading(false));
  }, []);

  async function changeStatus(id, action) {
    setActionLoading(id + action); setError("");
    try {
      await api.post(`/admin/elections/${id}/${action}`);
      const res = await api.get("/admin/elections");
      setElections(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Action failed");
    } finally { setActionLoading(null); }
  }

  if (loading) return (
    <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="spinner" /> Loading...
    </div>
  );

  return (
    <div className="page-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Elections</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
            Manage all elections. Open and close elections manually.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/admin/elections/create")}>
          + Create Election
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {elections.length === 0 ? (
        <div className="card">
          <div className="alert alert-info">No elections yet. Create your first election.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {elections.map((e) => {
            const next = STATUS_NEXT[e.status];
            return (
              <div key={e.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{e.title}</span>
                      <span className={`badge ${STATUS_BADGE[e.status] || "badge-white"}`}>{e.status}</span>
                    </div>
                    {e.description && (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 8 }}>{e.description}</p>
                    )}
                    <div style={{ display: "flex", gap: 16, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span>{e.candidate_count} candidates</span>
                      <span>{e.ballot_count} votes cast</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginLeft: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {next && (
                      <button
                        className={`btn btn-sm ${next.cls}`}
                        disabled={!!actionLoading}
                        onClick={() => changeStatus(e.id, next.action)}
                      >
                        {actionLoading === e.id + next.action ? <span className="spinner" /> : next.label}
                      </button>
                    )}
                    {(e.status === "closed" || e.status === "tallying") && (
                      <button className="btn btn-sm btn-outline"
                        onClick={() => navigate("/admin/trustees")}>
                        Trustee Tally
                      </button>
                    )}
                    {(e.status === "tallying" || e.status === "completed") && (
                      <button className="btn btn-sm btn-primary"
                        onClick={() => navigate("/admin/results")}>
                        View Results
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
