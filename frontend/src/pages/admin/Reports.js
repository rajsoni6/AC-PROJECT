import React, { useEffect, useState } from "react";
import api from "../../api";

const number = (value) => new Intl.NumberFormat().format(value || 0);

export default function Reports() {
  const [elections, setElections] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/elections")
      .then(({ data }) => {
        setElections(data);
        if (data.length) setSelectedId(data[0].id);
      })
      .catch((err) => setError(err.response?.data?.detail || "Could not load elections"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setReport(null); return; }
    let active = true;
    setLoading(true); setError("");
    api.get(`/admin/reports/elections/${selectedId}`)
      .then(({ data }) => { if (active) setReport(data); })
      .catch((err) => { if (active) setError(err.response?.data?.detail || "Could not load report"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const turnout = report?.turnout_percentage || 0;
  const eligible = report?.eligible_voters || 0;
  const voted = report?.votes_cast || 0;
  const chartMax = Math.max(eligible, voted, 1);

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Election Reports</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
          View eligible voter totals and turnout for each election.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <label htmlFor="report-election" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>Select election</label>
        <select id="report-election" className="form-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={!elections.length}>
          {elections.length === 0 && <option value="">No elections available</option>}
          {elections.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {loading && <div className="page-content" style={{ display: "flex", alignItems: "center", gap: 12 }}><div className="spinner" /> Loading report...</div>}
      {!loading && !error && !elections.length && <div className="card"><div className="alert alert-info">Create an election to see its report.</div></div>}

      {!loading && report && <>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{report.election.title}</h2>
              {report.election.description && <p style={{ color: "var(--text-muted)", marginTop: 6 }}>{report.election.description}</p>}
            </div>
            <span className="badge badge-info">{report.election.status}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 18, fontSize: "0.85rem" }}>
            <span><b>{number(report.election.candidate_count)}</b> candidates</span>
            <span>Start: {report.election.start_time ? new Date(report.election.start_time).toLocaleString() : "Not set"}</span>
            <span>End: {report.election.end_time ? new Date(report.election.end_time).toLocaleString() : "Not set"}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 20 }}>
          {[["Eligible voters", eligible], ["Votes cast", voted], ["Not yet voted", report.not_yet_voted], ["Turnout", `${turnout}%`]].map(([label, value]) => (
            <div className="card" key={label}><div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{label}</div><div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 8 }}>{typeof value === "number" ? number(value) : value}</div></div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><div className="card-title">Participation</div></div>
          <div role="img" aria-label={`Voter totals: ${eligible} eligible, ${voted} voted`} style={{ display: "grid", gap: 18, padding: "8px 0" }}>
            {[["Eligible voters", eligible, "var(--accent)"], ["Votes cast", voted, "var(--success)"]].map(([label, value, color]) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: "0.85rem" }}><span>{label}</span><b>{number(value)}</b></div>
                <div style={{ height: 14, borderRadius: 999, background: "var(--bg-input)", overflow: "hidden" }}><div style={{ width: `${(value / chartMax) * 100}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s" }} /></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: "0.85rem" }}><span>Turnout percentage</span><b>{turnout}%</b></div>
            <div style={{ height: 10, borderRadius: 999, background: "var(--bg-input)", overflow: "hidden" }}><div style={{ width: `${Math.min(turnout, 100)}%`, height: "100%", background: "var(--success)", borderRadius: 999 }} /></div>
          </div>
        </div>

        <div className="alert alert-info">{report.privacy} This report does not show voter identities, QR tokens, credentials, or ballot selections.</div>
      </>}
    </div>
  );
}
