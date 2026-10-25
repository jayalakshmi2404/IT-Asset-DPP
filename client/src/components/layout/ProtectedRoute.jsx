import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { can, canAny } from '../../auth/permissions';
import AppShell from './AppShell';
import Icon from '../common/Icon';

/**
 * Route guard. `permissions` is an optional list (any-of) of permission strings.
 * Returns a restricted-access page for authenticated users without the permission.
 * This is a UX guard only: every API call is enforced again by the server.
 */
export default function ProtectedRoute({ children, permissions }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-50" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-medium text-ink-400">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-glow" aria-hidden="true" />
          Restoring your session…
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (permissions && !(permissions.length === 1 ? can(user, permissions[0]) : canAny(user, permissions))) {
    return (
      <AppShell>
        <div className="card mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <Icon name="lock" className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-white">Access restricted</h1>
          <p className="mt-2 text-sm text-ink-400">
            Your role (<span className="text-ink-600">{user.role}</span>) does not include access to this page. Use the navigation menu to reach the pages available to you.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
