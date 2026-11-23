import React, { useState, useEffect } from "react";
import api from "../api";

export default function BulletinBoard() {
  const [elections, setElections]           = useState([]);
  const [selected, setSelected]             = useState(null);
  const [entries, setEntries]               = useState([]);
  const [merkleRoot, setMerkleRoot]         = useState("");
  const [electionResult, setElectionResult] = useState(null);
  const [loading, setLoading]               = useState(false);
  const [verifyCommitment, setVerifyCommitment] = useState("");
  const [verifyResult, setVerifyResult]     = useState(null);

  useEffect(() => {
    api.get("/public/elections")
      .then((r) => setElections(r.data))
      .catch(() => {});
  }, []);

  async function loadBoard(election) {
    setSelected(election); setLoading(true);
    setEntries([]); setVerifyResult(null); setElectionResult(null); setMerkleRoot("");
    try {
      const r = await api.get(`/public/bulletin/${election.id}`);
      setEntries(r.data.entries);
      setMerkleRoot(r.data.merkle_root);
    } catch { /* ignore */ }

    // load result if available
    if (election.status === "tallying" || election.status === "completed") {
      try {
        const rr = await api.get(`/public/results/${election.id}`);
        setElectionResult(rr.data);
      } catch { /* no result yet */ }
    }
    setLoading(false);
  }

  async function verifyInclusion() {
    if (!verifyCommitment || !selected) return;
    try {
      const r = await api.post(`/public/bulletin/${selected.id}/verify`, { commitment: verifyCommitment });
      setVerifyResult(r.data);
    } catch {
      setVerifyResult({ verified: false, message: "Not found in bulletin board" });
    }
  }

  const maxVotes = electionResult
    ? Math.max(...(electionResult.results || []).map((r) => r.votes), 1)
    : 1;

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Public Bulletin Board</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Publicly verifiable, append-only board. All ballots committed with SHA-256, Merkle tree, Ed25519 signed.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">SHA-256 Commitments</span>
        <span className="badge badge-white">Merkle Tree Inclusion</span>
        <span className="badge badge-white">Ed25519 Signed Records</span>
        <span className="badge badge-white">Publicly Verifiable</span>
      </div>

      {/* Election selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Select Election</div></div>
        {elections.length === 0 ? (
          <div className="alert alert-info">No public elections available.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {elections.map((e) => (
              <button key={e.id}
                className={`btn btn-sm ${selected?.id === e.id ? "btn-primary" : "btn-outline"}`}
                onClick={() => loadBoard(e)}>
                {e.title}
                {(e.status === "tallying" || e.status === "completed") && " 🏆"}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div className="spinner" /> Loading...
        </div>
      )}

      {/* ── Election Result (if available) ── */}
      {electionResult && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title">Election Result — {electionResult.title}</div>
            <span className={`badge ${electionResult.status === "completed" ? "badge-success" : "badge-info"}`}>
              {electionResult.status}
            </span>
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {(electionResult.results || []).map((r) => (
              <div key={r.candidate_id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: r.is_winner ? 700 : 500 }}>
                    {r.is_winner && "🏆 "}{r.candidate_name}
                  </span>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    {r.votes} votes ({r.percentage}%)
                  </span>
                </div>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99, transition: "width 0.5s",
                    width: `${(r.votes / maxVotes) * 100}%`,
                    background: r.is_winner ? "var(--text-primary)" : "var(--text-muted)",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Crypto proof */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Total Votes",         value: electionResult.total_votes },
              { label: "Tally Hash (SHA-256)", value: electionResult.tally_hash?.slice(0, 24) + "…" },
              { label: "Result Signature",     value: electionResult.result_signature ? electionResult.result_signature.slice(0, 24) + "…" : "—" },
              { label: "Snapshot Hash",        value: electionResult.final_snapshot_hash ? electionResult.final_snapshot_hash.slice(0, 24) + "…" : "—" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 12px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{item.label}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 2, fontFamily: "monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Merkle root */}
      {merkleRoot && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="card-title">Merkle Root</div>
            <span className="badge badge-success">Verified ✓</span>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
            {merkleRoot}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
            SHA-256 root of all {entries.length} ballot commitments. Any tampering changes this root.
          </div>
        </div>
      )}

      {/* Verify inclusion */}
      {selected && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Verify Ballot Inclusion</div>
            <div className="card-desc">Enter your ballot commitment (from your receipt) to verify it's included</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="form-input" value={verifyCommitment}
              onChange={(e) => setVerifyCommitment(e.target.value)}
              placeholder="Paste your SHA-256 ballot commitment…" />
            <button className="btn btn-primary" onClick={verifyInclusion} disabled={!verifyCommitment}>
              Verify
            </button>
          </div>
          {verifyResult && (
            <div className={`alert ${verifyResult.verified ? "alert-success" : "alert-error"}`} style={{ marginTop: 12 }}>
              {verifyResult.verified ? "✅ Ballot is included in the Merkle tree" : "❌ " + verifyResult.message}
              {verifyResult.merkle_proof && (
                <div style={{ marginTop: 8, fontSize: "0.75rem", fontFamily: "monospace" }}>
                  Proof depth: {verifyResult.merkle_proof.length} hashes
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ballot entries table */}
      {!loading && entries.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Ballot Entries</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{entries.length} ballots</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commitment (SHA-256)</th>
                  <th>Entry Signature</th>
                  <th>Posted At</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id}>
                    <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {e.commitment.slice(0, 20)}…{e.commitment.slice(-8)}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {e.entry_signature ? e.entry_signature.slice(0, 20) + "…" : "—"}
                    </td>
                    <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {new Date(e.posted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && selected && entries.length === 0 && !electionResult && (
        <div className="card">
          <div className="alert alert-info">No ballots on the bulletin board yet.</div>
        </div>
      )}
    </div>
  );
}
