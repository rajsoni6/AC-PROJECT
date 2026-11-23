import React, { useState, useEffect } from "react";
import api from "../../api";

const ACTION_COLORS = {
  register: "badge-info",
  login: "badge-white",
  document_upload: "badge-warning",
  voter_approved: "badge-success",
  voter_rejected: "badge-error",
  vote_cast: "badge-success",
  election_created: "badge-info",
  election_opened: "badge-success",
  election_closed: "badge-warning",
  tally_computed: "badge-info",
  result_published: "badge-success",
};

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLogs(); }, [page, filter]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filter) params.append("action", filter);
      const r = await api.get(`/admin/audit?${params}`);
      setLogs(r.data.logs);
      setTotal(r.data.total);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load audit logs");
    } finally { setLoading(false); }
  }

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Audit Log & Digital Forensics</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Every action is hashed with SHA-256, authenticated with HMAC-SHA-256, and signed with Ed25519.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">SHA-256 Evidence Hash</span>
        <span className="badge badge-white">HMAC-SHA-256 Authentication</span>
        <span className="badge badge-white">Ed25519 Signatures</span>
        <span className="badge badge-white">Tamper-Evident Log</span>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: "Total Events", value: total },
          { label: "Integrity", value: "HMAC-SHA-256" },
          { label: "Signatures", value: "Ed25519" },
          { label: "Hash Algorithm", value: "SHA-256" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: "1.2rem" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["", "vote_cast", "voter_approved", "election_created", "tally_computed", "result_published"].map((a) => (
          <button key={a} className={`btn btn-sm ${filter === a ? "btn-primary" : "btn-outline"}`}
            onClick={() => { setFilter(a); setPage(1); }}>
            {a || "All Events"}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="spinner" /> Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 24 }}>
            <div className="alert alert-info">No audit logs found.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Resource</th>
                  <th>Evidence Hash</th>
                  <th>HMAC</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${ACTION_COLORS[log.action] || "badge-white"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>{log.user_email || "system"}</td>
                    <td style={{ fontSize: "0.78rem", fontFamily: "monospace" }}>
                      {log.resource || "—"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {log.evidence_hash ? log.evidence_hash.slice(0, 12) + "…" : "—"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {log.hmac_tag ? log.hmac_tag.slice(0, 12) + "…" : "—"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {log.signature ? log.signature.slice(0, 12) + "…" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ padding: "6px 12px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button className="btn btn-outline btn-sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
