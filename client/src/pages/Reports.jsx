import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/dashboard/KpiCard';
import CategoryBarChart from '../components/charts/CategoryBarChart';
import LifecycleDistributionChart from '../components/charts/LifecycleDistributionChart';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import EmptyState from '../components/common/EmptyState';
import { reportApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { can, PERMISSIONS as P } from '../auth/permissions';
import { SectionCard, ErrorNotice } from './dashboards/shared';

const SCOPE_TEXT = {
  GLOBAL: 'Organisation-wide figures',
  DEPARTMENTS: 'Figures for your managed departments only',
  OWN: 'Figures for assets allocated to you',
};

export default function Reports() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [o, l] = await Promise.all([reportApi.overview(), reportApi.lifecycle()]);
      setOverview(o.data.data);
      setLifecycle(l.data.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        description={overview ? SCOPE_TEXT[overview.scope] || 'Figures within your scope' : 'Figures within your data scope.'}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}

      {loading && !overview ? (
        <CardSkeleton />
      ) : !overview ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard label="Total assets" value={overview.totalAssets} tone="blue" />
            <KpiCard label="Active" value={overview.activeAssets} tone="green" />
            <KpiCard label="Under maintenance" value={overview.underMaintenance} tone="amber" />
            <KpiCard label="Disposed" value={overview.disposedAssets} tone="rose" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Assets by category">
              {overview.byCategory.length ? <CategoryBarChart data={overview.byCategory} labelKey="category" valueKey="count" title="Assets" /> : <EmptyState title="No assets in scope" />}
            </SectionCard>

            <SectionCard title="Lifecycle events by type">
              {lifecycle ? <LifecycleDistributionChart distribution={lifecycle.distribution} /> : <CardSkeleton />}
              {lifecycle && (
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-ink-400">
                  <div><dt>Maintenance</dt><dd className="mt-1 text-lg font-semibold text-white">{lifecycle.maintenanceActivity}</dd></div>
                  <div><dt>Transfers</dt><dd className="mt-1 text-lg font-semibold text-white">{lifecycle.transfers}</dd></div>
                  <div><dt>Disposals</dt><dd className="mt-1 text-lg font-semibold text-white">{lifecycle.disposals}</dd></div>
                </dl>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Assets by department">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr><th scope="col" className="py-2 pr-4 font-medium">Department</th><th scope="col" className="py-2 text-right font-medium">Assets</th></tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {overview.byDepartment.map((d) => (
                    <tr key={d.department}><td className="py-2.5 pr-4 text-ink-800">{d.department}</td><td className="py-2.5 text-right tabular-nums text-white">{d.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {!can(user, P.REPORTS_GLOBAL) && (
            <p className="text-xs text-ink-400">Verification totals are shown only to roles with organisation-wide reporting access.</p>
          )}
        </>
      )}
    </div>
  );
}
