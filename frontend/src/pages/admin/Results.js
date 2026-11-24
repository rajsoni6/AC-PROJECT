import React, { useState, useEffect } from "react";
import api from "../../api";

export default function Results() {
  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/elections")
      .then((r) => setElections(r.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load elections"))
      .finally(() => setListLoading(false));
  }, []);

  async function loadResult(e) {
    setSelected(e); setResult(null); setError(""); setLoading(false);
    if (e.status === "closed" || e.status === "draft" || e.status === "published" || e.status === "open") {
      setError("Tally not computed yet. Trustees need to approve shares first.");
      return;
    }
    setDetailsLoadingId(e.id);
    try {
      const r = await api.get(`/admin/elections/${e.id}/result`);
      setResult(r.data);
    } catch (err) {
      setError(err.response?.data?.detail || "No result yet");
    } finally {
      setDetailsLoadingId(null);
    }
  }

  async function publishResult() {
    setLoading(true); setError("");
    try {
      const r = await api.post(`/admin/elections/${selected.id}/publish-result`);
      setResult(r.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Publish failed");
    } finally { setLoading(false); }
  }

  const maxVotes = result ? Math.max(...(result.results || []).map((r) => r.votes), 1) : 1;

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Election Results</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Homomorphic tally via Exponential ElGamal. Results signed with Ed25519 and SHA-256 integrity hash.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">Exponential ElGamal</span>
        <span className="badge badge-white">Threshold Decryption</span>
        <span className="badge badge-white">Ed25519 Result Signature</span>
        <span className="badge badge-white">SHA-256 Integrity</span>
        <span className="badge badge-white">PKI Verification</span>
      </div>

      {error && (
        <div className={`alert ${error.includes("Tally not computed") ? "alert-warning" : "alert-error"}`}>
          {error.includes("Tally not computed")
            ? "⏳ " + error + " Go to Trustee Key Management page."
            : error}
        </div>
      )}

      {/* Election list */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Select Election</div></div>
        {listLoading ? <div className="alert alert-info">Loading elections...</div> : elections.length === 0 ? (
          <div className="alert alert-info">No elections found.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {elections.map((e) => {
              const hasResult = e.status === "tallying" || e.status === "completed";
              return (
                <div key={e.id} onClick={() => loadResult(e)}
                  style={{
                    padding: "12px 16px", borderRadius: "var(--radius)", cursor: "pointer",
                    border: `1px solid ${selected?.id === e.id ? "var(--text-primary)" : "var(--border)"}`,
                    background: selected?.id === e.id ? "var(--bg-hover)" : "var(--bg-input)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    transition: "all 0.15s",
                  }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{e.title}</span>
                      <span className={`badge ${
                        e.status === "completed" ? "badge-success" :
                        e.status === "tallying"  ? "badge-info" :
                        e.status === "closed"    ? "badge-warning" : "badge-white"
                      }`}>{e.status}</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {e.ballot_count} votes
                      {!hasResult && " · Tally pending"}
                      {hasResult  && " · Result available ✓"}
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" disabled={detailsLoadingId === e.id}
                    onClick={(event) => { event.stopPropagation(); loadResult(e); }}>
                    {detailsLoadingId === e.id ? <><span className="spinner" /> Loading details…</> : <>⌕ See Details</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Result display */}
      {result && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div className="card-title">{selected?.title}</div>
            {result.status !== "completed" && result.status !== "published" && (
              <button className="btn btn-primary btn-sm" disabled={loading} onClick={publishResult}>
                {loading && <span className="spinner" />} Publish Result
              </button>
            )}
            {(result.status === "completed" || result.status === "published") && <span className="badge badge-success">Published ✓</span>}
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {(result.results || []).map((r) => (
              <div key={r.candidate_id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{r.candidate_name}</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    {r.votes} votes ({r.percentage}%)
                  </span>
                </div>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    width: `${(r.votes / maxVotes) * 100}%`,
                    background: r.is_winner ? "var(--accent)" : "var(--text-muted)",
                    transition: "width 0.5s",
                  }} />
                </div>
                {r.is_winner && (
                  <div style={{ fontSize: "0.72rem", color: "var(--success)", marginTop: 3 }}>🏆 Winner</div>
                )}
              </div>
            ))}
          </div>

          {/* Crypto proofs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Total Votes", value: result.total_votes },
              { label: "Tally Hash (SHA-256)", value: result.tally_hash },
              { label: "Result Signature (Ed25519)", value: result.result_signature ? result.result_signature.slice(0, 64) + "…" : "Pending" },
              { label: "Final Snapshot Hash", value: result.final_snapshot_hash || "Pending" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{item.label}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
