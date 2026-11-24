import React, { useState, useEffect } from "react";
import api from "../../api";
import { useAuth } from "../../context/AuthContext";

export default function Trustees() {
  const { user } = useAuth();
  const isAdmin   = user?.role === "super_admin";
  const isTrustee = user?.role === "trustee";

  const [elections, setElections]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [sharesData, setSharesData] = useState(null);
  const [tallyResult, setTallyResult] = useState(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [error, setError]           = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/elections?status=closed,tallying")
      .then((res) => setElections(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load closed elections"))
      .finally(() => setElectionsLoading(false));
  }, []);

  async function loadShares(election) {
    setSelected(election);
    setError(""); setSuccessMsg(""); setTallyResult(null); setSharesData(null);
    try {
      const res = await api.get(`/admin/elections/${election.id}/shares`);
      setSharesData(res.data);
      // if tally already done
      if (election.status === "tallying") {
        const tr = await api.get(`/admin/elections/${election.id}/result`).catch(() => null);
        if (tr) setTallyResult(tr.data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load shares");
    }
  }

  async function handleApprove() {
    if (!sharesData) return;
    const shareIndex = sharesData.my_share_index;
    const alreadyApproved = sharesData.approvals?.[user.email] === shareIndex;
    if (!Number.isInteger(shareIndex)) {
      setError("No Shamir share is assigned to this trustee account.");
      return;
    }

    setApproveLoading(true); setError(""); setSuccessMsg("");
    try {
      const res = await api.post(`/admin/elections/${selected.id}/trustee-approve`, {
        share_index: shareIndex,
      });
      setSharesData((prev) => ({
        ...prev,
        approvals: res.data.approvals,
        approval_count: res.data.approval_count,
      }));
      if (res.data.tally) {
        setTallyResult(res.data.tally);
        setSuccessMsg("✅ Threshold met! Tally computed automatically.");
      } else if (res.data.tally_error) {
        setError(res.data.tally_error);
      } else {
        setSuccessMsg(alreadyApproved ? "Approval withdrawn." : "Your share approved successfully!");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Approval failed");
    } finally { setApproveLoading(false); }
  }

  const approvals     = sharesData?.approvals || {};
  const approvalCount = sharesData?.approval_count || 0;
  const threshold     = sharesData?.threshold || 3;
  const total         = sharesData?.total || 5;
  const thresholdMet  = approvalCount >= threshold;
  const hasMyApproval = user?.email in approvals;

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Trustee Key Management</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          Shamir (t-of-n) secret sharing. At least {threshold} trustees must approve to reconstruct the decryption key.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <span className="badge badge-info">Shamir ({threshold}-of-{total})</span>
        <span className="badge badge-white">Threshold Cryptography</span>
        <span className="badge badge-white">Ed25519 Trustee Signatures</span>
        <span className="badge badge-white">Homomorphic Tally</span>
      </div>

      {error      && <div className="alert alert-error"   style={{ marginBottom: 12 }}>{error}</div>}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{successMsg}</div>}

      {/* Election selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Select Election</div>
        </div>
        {electionsLoading ? <div className="alert alert-info">Loading closed elections...</div> : elections.length === 0 ? (
          <div className="alert alert-info">No closed elections available.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {elections.map((e) => (
              <div key={e.id} onClick={() => loadShares(e)} style={{
                padding: "12px 16px", borderRadius: "var(--radius)",
                border: `1px solid ${selected?.id === e.id ? "var(--text-primary)" : "var(--border)"}`,
                background: selected?.id === e.id ? "var(--bg-hover)" : "var(--bg-input)",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{e.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {e.ballot_count} votes · {e.status}
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={(event) => { event.stopPropagation(); loadShares(e); }}>
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approval status panel */}
      {sharesData && selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Trustee Approvals</div>
            <div className="card-desc">{approvalCount} of {total} trustees approved · Need {threshold} to unlock tally</div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6 }}>
              <span>{approvalCount} / {threshold} required</span>
              <span style={{ color: thresholdMet ? "var(--success)" : "var(--warning)", fontWeight: 600 }}>
                {thresholdMet ? "✓ Threshold Met — Tally Triggered" : `Need ${threshold - approvalCount} more`}
              </span>
            </div>
            <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99, transition: "width 0.4s",
                width: `${Math.min(100, (approvalCount / threshold) * 100)}%`,
                background: thresholdMet ? "var(--success)" : "var(--text-primary)",
              }} />
            </div>
          </div>

          {/* Who approved — shown to everyone */}
          {isTrustee && Object.keys(approvals).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Approved By
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(approvals).map(([email, idx]) => (
                  <span key={email} className="badge badge-success">✓ {email} (Share {idx + 1})</span>
                ))}
              </div>
            </div>
          )}

          {/* TRUSTEE VIEW: only approve/withdraw button */}
          {isTrustee && !thresholdMet && (
            <button
              className={`btn btn-full ${hasMyApproval ? "btn-outline" : "btn-primary"}`}
              style={{ padding: "12px" }}
              disabled={approveLoading}
              onClick={handleApprove}
            >
              {approveLoading
                ? <><span className="spinner" /> Processing…</>
                : hasMyApproval
                  ? "✓ Approved — Click to Withdraw"
                  : "Approve My Share"}
            </button>
          )}

          {isTrustee && thresholdMet && (
            <div className="alert alert-success">
              ✅ Threshold reached. Tally has been computed automatically.
            </div>
          )}

          {/* ADMIN VIEW: only status, no share list, no manual tally button */}
          {isAdmin && (
            <div style={{
              padding: "14px 16px", background: thresholdMet ? "var(--success-bg)" : "var(--warning-bg)",
              borderRadius: "var(--radius)",
              border: `1px solid ${thresholdMet ? "var(--success-border)" : "var(--warning-border)"}`,
            }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: thresholdMet ? "var(--success)" : "var(--warning)" }}>
                {thresholdMet
                  ? "✅ Threshold met — Tally computed automatically"
                  : `⏳ Waiting for ${threshold - approvalCount} more trustee approval(s)`}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                Tally triggers automatically once {threshold} trustees approve. No manual action needed.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tally result */}
      {tallyResult && (
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 16 }}>✅ Tally computed via homomorphic decryption</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            {(tallyResult.results || []).map((r) => (
              <div key={r.candidate_id} style={{
                padding: "16px", textAlign: "center", borderRadius: "var(--radius)",
                background: r.is_winner ? "var(--success-bg)" : "var(--bg-input)",
                border: `1px solid ${r.is_winner ? "var(--success-border)" : "var(--border)"}`,
              }}>
                {r.is_winner && <div style={{ fontSize: "0.7rem", color: "var(--success)", fontWeight: 700, marginBottom: 4 }}>WINNER 🏆</div>}
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.candidate_name}</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, margin: "8px 0" }}>{r.votes}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.percentage}%</div>
              </div>
            ))}
          </div>
          {[
            { label: "Total Votes",               value: tallyResult.total_votes },
            { label: "Tally Hash (SHA-256)",       value: tallyResult.tally_hash },
            { label: "Result Signature (Ed25519)", value: tallyResult.result_signature?.slice(0, 60) + "…" },
          ].map((r) => (
            <div key={r.label} style={{ padding: "10px 14px", background: "var(--bg-input)", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{r.label}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
