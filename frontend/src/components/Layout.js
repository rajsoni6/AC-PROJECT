import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Simple inline SVG icons — no emojis
const Icon = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  document:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  qr:        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3v3"/><path d="M21 21h-3"/><path d="M16 21v-3"/><path d="M16 16h.01"/></svg>,
  vote:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  receipt:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>,
  board:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  verify:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  key:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  election:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M6 20V10M12 20V4M18 20v-6"/></svg>,
  plus:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  users:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  results:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  audit:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  logout:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const NAV = {
  voter: [
    { label: "Dashboard",        path: "/dashboard",       icon: Icon.dashboard },
    { section: "My Voting" },
    { label: "Upload Documents", path: "/voter/documents", icon: Icon.document },
    { label: "My QR Code",       path: "/voter/qrcode",    icon: Icon.qr },
    { label: "Elections",        path: "/voter/elections", icon: Icon.vote },
    { label: "My Receipt",       path: "/voter/receipt",   icon: Icon.receipt },
    { section: "Public" },
    { label: "Bulletin Board",   path: "/bulletin",        icon: Icon.board },
  ],
  election_officer: [
    { label: "Dashboard",        path: "/dashboard",              icon: Icon.dashboard },
    { section: "Officer Tools" },
    { label: "Verify Voters",    path: "/officer/verifications",  icon: Icon.verify },
    { section: "Public" },
    { label: "Bulletin Board",   path: "/bulletin",               icon: Icon.board },
  ],
  trustee: [
    { label: "Dashboard",        path: "/dashboard",       icon: Icon.dashboard },
    { section: "Trustee" },
    { label: "Key Shares",       path: "/admin/trustees",  icon: Icon.key },
    { section: "Public" },
    { label: "Bulletin Board",   path: "/bulletin",        icon: Icon.board },
  ],
  super_admin: [
    { label: "Dashboard",        path: "/dashboard",              icon: Icon.dashboard },
    { section: "Elections" },
    { label: "All Elections",    path: "/admin/elections",        icon: Icon.election },
    { label: "Create Election",  path: "/admin/elections/create", icon: Icon.plus },
    { section: "Management" },
    { label: "Manage Users",     path: "/admin/users",            icon: Icon.users },
    { label: "Verify Voters",    path: "/officer/verifications",  icon: Icon.verify },
    { label: "Trustees",         path: "/admin/trustees",         icon: Icon.key },
    { label: "Results",          path: "/admin/results",          icon: Icon.results },
    { label: "Audit Log",        path: "/admin/audit",            icon: Icon.audit },
    { section: "Public" },
    { label: "Bulletin Board",   path: "/bulletin",               icon: Icon.board },
  ],
};

const ROLE_LABELS = {
  voter:            "Voter",
  election_officer: "Election Officer",
  trustee:          "Trustee",
  super_admin:      "Super Admin",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const baseNav = NAV[user?.role] || NAV.voter;

  const navItems = user?.role === "voter" && user?.is_verified
    ? baseNav.filter(item => item.path !== "/voter/documents")
    : user?.role === "voter" && !user?.is_verified
    ? baseNav.filter(item => !["/voter/elections", "/voter/receipt"].includes(item.path))
    : baseNav;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>VerifyVote</h1>
          <span>Secure Electronic Voting</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            if (item.section) {
              return (
                <div key={i} className="nav-section">
                  <span className="nav-section-label">{item.section}</span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-name">{user?.full_name}</div>
          <div className="sidebar-user-role">{ROLE_LABELS[user?.role]}</div>
          <button className="btn btn-outline btn-sm btn-full" onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {Icon.logout} Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
