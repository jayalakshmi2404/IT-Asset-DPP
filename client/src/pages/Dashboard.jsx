import React from 'react';
import { useAuth } from '../context/AuthContext';
import AdminDashboard from './dashboards/AdminDashboard';
import ManagerDashboard from './dashboards/ManagerDashboard';
import EmployeeDashboard from './dashboards/EmployeeDashboard';
import AuditorDashboard from './dashboards/AuditorDashboard';

/** Chooses the dashboard for the signed-in role. Each dashboard only calls endpoints its role may use. */
export default function Dashboard() {
  const { user } = useAuth();
  switch (user.role) {
    case 'ADMIN':
      return <AdminDashboard user={user} />;
    case 'MANAGER':
      return <ManagerDashboard user={user} />;
    case 'AUDITOR':
      return <AuditorDashboard user={user} />;
    default:
      return <EmployeeDashboard user={user} />;
  }
}
