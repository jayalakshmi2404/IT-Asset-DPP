import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const auth = { user: null, loading: false, logout: vi.fn() };
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }));

import ProtectedRoute from '../src/components/layout/ProtectedRoute';
import { PERMISSIONS as P } from '../src/auth/permissions';

function renderAt(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<h1>LOGIN PAGE</h1>} />
        <Route path="/secure" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    auth.user = null;
    auth.loading = false;
  });

  it('redirects anonymous visitors to the login page', () => {
    renderAt('/secure', <ProtectedRoute><p>SECRET</p></ProtectedRoute>);
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  it('shows a restoring state while the session is being checked', () => {
    auth.loading = true;
    renderAt('/secure', <ProtectedRoute><p>SECRET</p></ProtectedRoute>);
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session');
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  it('shows an access-restricted page when the role lacks the permission', () => {
    auth.user = { id: 'e1', name: 'Emp Loyee', role: 'EMPLOYEE', email: 'e@x.test', status: 'ACTIVE', managedDepartmentIds: [] };
    renderAt('/secure', <ProtectedRoute permissions={[P.USERS_MANAGE]}><p>SECRET</p></ProtectedRoute>);
    expect(screen.getByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  it('renders the page when the role has the permission', () => {
    auth.user = { id: 'a1', name: 'Ada Admin', role: 'ADMIN', email: 'a@x.test', status: 'ACTIVE', managedDepartmentIds: [] };
    renderAt('/secure', <ProtectedRoute permissions={[P.USERS_MANAGE]}><p>SECRET</p></ProtectedRoute>);
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });
});
