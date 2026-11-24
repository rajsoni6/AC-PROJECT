import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Layout from "./components/Layout";

// Voter pages
import VoterDocumentUpload from "./pages/voter/DocumentUpload";
import VoterQRCode from "./pages/voter/QRCode";
import VoterElections from "./pages/voter/Elections";
import VoterCastVote from "./pages/voter/CastVote";
import VoterReceipt from "./pages/voter/Receipt";

// Officer pages
import OfficerVerifications from "./pages/officer/Verifications";

// Admin pages
import AdminElections from "./pages/admin/Elections";
import AdminCreateElection from "./pages/admin/CreateElection";
import AdminTrustees from "./pages/admin/Trustees";
import AdminResults from "./pages/admin/Results";
import AdminReports from "./pages/admin/Reports";
import AdminAudit from "./pages/admin/Audit";
import AdminManageUsers from "./pages/admin/ManageUsers";

// Public
import BulletinBoard from "./pages/BulletinBoard";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Protected — all roles */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="bulletin" element={<BulletinBoard />} />

            {/* Voter */}
            <Route path="voter/documents" element={
              <ProtectedRoute roles={["voter"]}><VoterDocumentUpload /></ProtectedRoute>
            } />
            <Route path="voter/qrcode" element={
              <ProtectedRoute roles={["voter"]}><VoterQRCode /></ProtectedRoute>
            } />
            <Route path="voter/elections" element={
              <ProtectedRoute roles={["voter"]}><VoterElections /></ProtectedRoute>
            } />
            <Route path="voter/vote/:electionId" element={
              <ProtectedRoute roles={["voter"]}><VoterCastVote /></ProtectedRoute>
            } />
            <Route path="voter/receipt" element={
              <ProtectedRoute roles={["voter"]}><VoterReceipt /></ProtectedRoute>
            } />

            {/* Officer */}
            <Route path="officer/verifications" element={
              <ProtectedRoute roles={["election_officer", "super_admin"]}><OfficerVerifications /></ProtectedRoute>
            } />

            {/* Admin */}
            <Route path="admin/elections" element={
              <ProtectedRoute roles={["super_admin"]}><AdminElections /></ProtectedRoute>
            } />
            <Route path="admin/elections/create" element={
              <ProtectedRoute roles={["super_admin"]}><AdminCreateElection /></ProtectedRoute>
            } />
            <Route path="admin/trustees" element={
              <ProtectedRoute roles={["super_admin", "trustee"]}><AdminTrustees /></ProtectedRoute>
            } />
            <Route path="admin/results" element={
              <ProtectedRoute roles={["super_admin"]}><AdminResults /></ProtectedRoute>
            } />
            <Route path="admin/reports" element={
              <ProtectedRoute roles={["super_admin"]}><AdminReports /></ProtectedRoute>
            } />
            <Route path="admin/audit" element={
              <ProtectedRoute roles={["super_admin"]}><AdminAudit /></ProtectedRoute>
            } />
            <Route path="admin/users" element={
              <ProtectedRoute roles={["super_admin"]}><AdminManageUsers /></ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
