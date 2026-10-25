import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const auth = { user: null, loading: false, logout: vi.fn() };
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({
  reportApi: { overview: vi.fn(), lifecycle: vi.fn() },
  lifecycleApi: { recent: vi.fn(), listAll: vi.fn(), listForAsset: vi.fn(), addEvent: vi.fn() },
  integrityApi: { fullChain: vi.fn() },
  auditApi: { list: vi.fn() },
  assetApi: { list: vi.fn(), get: vi.fn(), getIntegrity: vi.fn(), verifyIntegrity: vi.fn(), getQr: vi.fn(), generateQr: vi.fn() },
  departmentApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  userApi: { list: vi.fn(), assignable: vi.fn(), create: vi.fn(), update: vi.fn() },
  authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn(), changePassword: vi.fn() },
}));
vi.mock('../src/services/resources', () => api);

// Charts need a real canvas; the dashboards only need them to render.
vi.mock('../src/components/charts/AssetStatusChart', () => ({ default: () => 'status-chart' }));
vi.mock('../src/components/charts/CategoryBarChart', () => ({ default: () => 'category-chart' }));
vi.mock('../src/components/charts/LifecycleDistributionChart', () => ({ default: () => 'distribution-chart' }));

import Dashboard from '../src/pages/Dashboard';

const overview = { scope: 'GLOBAL', totalAssets: 8, activeAssets: 6, underMaintenance: 1, disposedAssets: 1, byStatus: [], byCategory: [{ category: 'Laptop', count: 3 }], byDepartment: [] };
const emptyList = { data: { success: true, data: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } } };

function userFor(role, extra = {}) {
  return { id: `${role}-id`, name: `${role} User`, email: `${role.toLowerCase()}@example.test`, role, status: 'ACTIVE', department: '', departmentId: null, managedDepartmentIds: [], ...extra };
}

function renderFor(user) {
  auth.user = user;
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('role-specific dashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.reportApi.overview.mockResolvedValue({ data: { data: overview } });
    api.reportApi.lifecycle.mockResolvedValue({ data: { data: { distribution: [], maintenanceActivity: 0, transfers: 0, disposals: 0 } } });
    api.lifecycleApi.recent.mockResolvedValue({ data: { data: [] } });
    api.lifecycleApi.listAll.mockResolvedValue({ data: { data: [] } });
    api.integrityApi.fullChain.mockResolvedValue({ data: { data: { status: 'VERIFIED', verified: true, totalBlocks: 9, violations: [], checkedAt: '2026-10-23T10:00:00Z' } } });
    api.auditApi.list.mockResolvedValue({ data: { data: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 5 } } });
    api.assetApi.list.mockResolvedValue(emptyList);
    api.departmentApi.list.mockResolvedValue({ data: { data: [] } });
  });

  it('ADMIN sees organisation totals and a full-ledger check button, but does not run the check on load', async () => {
    renderFor(userFor('ADMIN'));
    expect(await screen.findByText('Total assets')).toBeInTheDocument();
    expect(await screen.findByText('8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check full ledger/i })).toBeInTheDocument();
    expect(api.integrityApi.fullChain).not.toHaveBeenCalled();
  });

  it('ADMIN running the check shows the verified state only after the response arrives', async () => {
    renderFor(userFor('ADMIN'));
    await userEvent.click(screen.getByRole('button', { name: /check full ledger/i }));
    expect(await screen.findByText('Verified')).toBeInTheDocument();
  });

  it('EMPLOYEE never requests organisation-wide reports and sees only personal copy', async () => {
    renderFor(userFor('EMPLOYEE'));
    expect(await screen.findByText('My assets')).toBeInTheDocument();
    expect(await screen.findByText(/no assets allocated to you/i)).toBeInTheDocument();
    expect(api.reportApi.overview).not.toHaveBeenCalled();
    expect(api.reportApi.lifecycle).not.toHaveBeenCalled();
    expect(api.auditApi.list).not.toHaveBeenCalled();
    expect(screen.queryByText('Total assets')).not.toBeInTheDocument();
  });

  it('MANAGER with no departments is told that no assets are visible', async () => {
    renderFor(userFor('MANAGER', { managedDepartmentIds: [] }));
    expect(await screen.findByText(/not assigned to any department yet/i)).toBeInTheDocument();
  });

  it('MANAGER dashboard requests only the scoped endpoints and never audit logs', async () => {
    renderFor(userFor('MANAGER', { managedDepartmentIds: ['d1'] }));
    await waitFor(() => expect(api.reportApi.overview).toHaveBeenCalled());
    expect(api.auditApi.list).not.toHaveBeenCalled();
    expect(api.integrityApi.fullChain).not.toHaveBeenCalled();
  });

  it('AUDITOR is read-only: no transfer or user shortcuts, and the verification button is available', async () => {
    renderFor(userFor('AUDITOR'));
    expect(await screen.findByRole('button', { name: /run check/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /users & departments/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /transfers/i })).not.toBeInTheDocument();
  });
});
