import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import KpiCard from '../../components/dashboard/KpiCard';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import { reportApi, lifecycleApi, assetApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { Greeting, SectionCard, ShortcutLink, RecentEvents, ErrorNotice } from './shared';

/** Every number here comes from the manager-scoped endpoints (only the managed departments). */
export default function ManagerDashboard({ user }) {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [o, e, m] = await Promise.all([
          reportApi.overview(),
          lifecycleApi.recent(6),
          assetApi.list({ status: 'MAINTENANCE', limit: 6, sortBy: 'name', sortDir: 'asc' }),
        ]);
        if (cancelled) return;
        setOverview(o.data.data);
        setEvents(e.data.data);
        setMaintenance(m.data.data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const noDepartments = (user.managedDepartmentIds || []).length === 0;

  return (
    <div className="space-y-6">
      <Greeting user={user} subtitle="Your departments only: allocations, maintenance and lifecycle activity." />
      {error && <ErrorNotice message={error} />}
      {noDepartments && (
        <div role="status" className="card p-4 text-sm text-amber-200 ring-1 ring-inset ring-amber-400/25">
          You are not assigned to any department yet, so no assets are visible. Ask an administrator to assign your departments.
        </div>
      )}

      <div className="stagger-children grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Assets in scope" value={overview?.totalAssets} loading={loading} tone="blue" icon={<Icon name="box" className="h-5 w-5" />} hint="Your departments" />
        <KpiCard label="Active" value={overview?.activeAssets} loading={loading} tone="green" icon={<Icon name="check" className="h-5 w-5" />} />
        <KpiCard label="Under maintenance" value={overview?.underMaintenance} loading={loading} tone="amber" icon={<Icon name="wrench" className="h-5 w-5" />} />
        <KpiCard label="Disposed" value={overview?.disposedAssets} loading={loading} tone="rose" icon={<Icon name="swap" className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Maintenance in progress"
          action={<Link to="/lifecycle?eventType=MAINTENANCE" className="text-xs font-medium text-brand-300 hover:text-brand-200">View all</Link>}
        >
          {loading ? (
            <CardSkeleton />
          ) : maintenance.length === 0 ? (
            <EmptyState icon="✓" title="Nothing under maintenance" description="No asset in your departments is currently in maintenance." />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {maintenance.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link to={`/assets/${a.assetId}`} className="text-sm font-medium text-white hover:text-brand-200">{a.name}</Link>
                    <p className="text-xs text-ink-400">{a.assetId} · {a.department || 'No department'}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent activity in your departments">
          <RecentEvents events={events} loading={loading} emptyText="No activity in your departments yet." />
        </SectionCard>

        <SectionCard title="Shortcuts" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ShortcutLink to="/lifecycle?eventType=ALLOCATION" icon="user" label="Allocate assets" hint="Assign an asset to an employee" />
            <ShortcutLink to="/lifecycle?eventType=MAINTENANCE" icon="wrench" label="Maintenance" hint="Start and complete maintenance" />
            <ShortcutLink to="/reports" icon="chart" label="Scoped reports" hint="Figures for your departments" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
