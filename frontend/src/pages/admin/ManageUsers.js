import React, { useState, useEffect } from "react";
import api from "../../api";

const ROLE_BADGE = {
  voter: "badge-white",
  election_officer: "badge-info",
  trustee: "badge-warning",
  super_admin: "badge-success",
};

const ROLE_LABELS = {
  voter: "Voter",
  election_officer: "Election Officer",
  trustee: "Trustee",
  super_admin: "Super Admin",
};

function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ["", "#f87171", "#fbbf24", "#60a5fa", "#4ade80"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, color: colors[score] || "", label: labels[score] || "" };
}

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "election_officer" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const strength = getPasswordStrength(form.password);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [filter]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?role=${filter}` : "";
      const r = await api.get(`/auth/admin/users${params}`);
      setUsers(r.data);
    } finally { setLoading(false); }
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess(""); setFormLoading(true);
    try {
      await api.post("/auth/admin/add-user", form);
      setFormSuccess(`${ROLE_LABELS[form.role]} account created! They can now login.`);
      setForm({ email: "", full_name: "", password: "", role: "election_officer" });
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to create user");
    } finally { setFormLoading(false); }
  }

  async function toggleUser(userId) {
    setActionLoading(userId);
    try {
      await api.patch(`/auth/admin/users/${userId}/toggle`);
      fetchUsers();
    } finally { setActionLoading(null); }
  }

  const counts = {
    all: users.length,
    voter: users.filter((u) => u.role === "voter").length,
    election_officer: users.filter((u) => u.role === "election_officer").length,
    trustee: users.filter((u) => u.role === "trustee").length,
  };

  return (
    <div className="page-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>User Management</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
            Add Election Officers and Trustees. Voters register themselves.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setFormError(""); setFormSuccess(""); }}>
          {showForm ? "Cancel" : "+ Add Officer / Trustee"}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: "Total Users", value: counts.all },
          { label: "Voters", value: counts.voter },
          { label: "Officers", value: counts.election_officer },
          { label: "Trustees", value: counts.trustee },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add User Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, border: "1px solid #333" }}>
          <div className="card-header">
            <div className="card-title">Add New Officer / Trustee</div>
            <div className="card-desc">These accounts get special access. Voters register themselves at /register.</div>
          </div>

          {formError && <div className="alert alert-error">{formError}</div>}
          {formSuccess && <div className="alert alert-success">✓ {formSuccess}</div>}

          <form onSubmit={handleAddUser}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={form.full_name} onChange={set("full_name")}
                  placeholder="Officer Name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input className="form-input" type="email" value={form.email} onChange={set("email")}
                  placeholder="officer@verifyvote.com" required />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" value={form.password} onChange={set("password")}
                  placeholder="Strong password" required />
                {form.password && (
                  <div className="pw-strength">
                    <div className="pw-bar">
                      <div className="pw-fill" style={{ width: `${strength.score * 25}%`, background: strength.color }} />
                    </div>
                    <div className="pw-label" style={{ color: strength.color }}>{strength.label}</div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role} onChange={set("role")}>
                  <option value="election_officer">Election Officer</option>
                  <option value="trustee">Trustee</option>
                </select>
                <div className="form-hint">
                  {form.role === "election_officer"
                    ? "Can verify voter documents and approve registrations"
                    : "Holds a Shamir key share for threshold decryption"}
                </div>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={formLoading}>
              {formLoading && <span className="spinner" />}
              Create {ROLE_LABELS[form.role]} Account
            </button>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[
          { key: "all", label: "All Users" },
          { key: "voter", label: "Voters" },
          { key: "election_officer", label: "Officers" },
          { key: "trustee", label: "Trustees" },
        ].map((f) => (
          <button key={f.key}
            className={`btn btn-sm ${filter === f.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFilter(f.key)}>
            {f.label} ({counts[f.key] ?? "..."})
          </button>
        ))}
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="spinner" /> Loading users...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 24 }}>
            <div className="alert alert-info">No users found.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-success" : "badge-error"}`}>
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      {u.role !== "super_admin" && (
                        <button
                          className={`btn btn-sm ${u.is_active ? "btn-danger" : "btn-outline"}`}
                          disabled={actionLoading === u.id}
                          onClick={() => toggleUser(u.id)}
                        >
                          {actionLoading === u.id
                            ? <span className="spinner" />
                            : u.is_active ? "Disable" : "Enable"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
