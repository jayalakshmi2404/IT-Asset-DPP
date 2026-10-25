import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { PERMISSIONS as P } from './auth/permissions';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import AssetDetails from './pages/AssetDetails';
import LifecycleEvents from './pages/LifecycleEvents';
import Transfers from './pages/Transfers';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import IntegrityVerification from './pages/IntegrityVerification';
import PublicVerification from './pages/PublicVerification';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Public: no sign-in required */}
      <Route path="/verify" element={<PublicVerification />} />
      <Route path="/verify/:dppId" element={<PublicVerification />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/assets" element={<ProtectedRoute permissions={[P.ASSETS_READ]}><Assets /></ProtectedRoute>} />
      <Route path="/assets/:id" element={<ProtectedRoute permissions={[P.ASSETS_READ]}><AssetDetails /></ProtectedRoute>} />
      <Route path="/lifecycle" element={<ProtectedRoute permissions={[P.LIFECYCLE_READ]}><LifecycleEvents /></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute permissions={[P.LIFECYCLE_ALLOCATE]}><Transfers /></ProtectedRoute>} />
      <Route path="/integrity" element={<ProtectedRoute permissions={[P.INTEGRITY_FULL_CHAIN]}><IntegrityVerification /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute permissions={[P.REPORTS_SCOPED]}><Reports /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute permissions={[P.USERS_MANAGE]}><Users /></ProtectedRoute>} />
      <Route path="/audit-logs" element={<ProtectedRoute permissions={[P.AUDIT_READ]}><AuditLogs /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute permissions={[P.PROFILE_READ]}><Settings /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
