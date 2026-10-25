import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import { assetApi, lifecycleApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';
import { Greeting, SectionCard, RecentEvents, ErrorNotice } from './shared';

/**
 * Employees see only the assets allocated to them. The API limits the list to
 * assignedTo = current user, so no organisation-wide figures are requested here.
 */
export default function EmployeeDashboard({ user }) {
  const [assets, setAssets] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [a, e] = await Promise.all([assetApi.list({ limit: 50, sortBy: 'name', sortDir: 'asc' }), lifecycleApi.recent(6)]);
        if (cancelled) return;
        setAssets(a.data.data);
        setEvents(e.data.data);
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

  return (
    <div className="space-y-6">
      <Greeting user={user} subtitle="The equipment currently allocated to you." />
      {error && <ErrorNotice message={error} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard title="My assets" className="xl:col-span-2" action={<Link to="/assets" className="text-xs font-medium text-brand-300 hover:text-brand-200">Open list</Link>}>
          {loading ? (
            <CardSkeleton />
          ) : assets.length === 0 ? (
            <EmptyState icon={<Icon name="box" className="h-6 w-6" />} title="No assets allocated to you" description="When IT allocates equipment to you it will appear here, with its full lifecycle history." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {assets.map((a) => (
                <li key={a._id}>
                  <Link to={`/assets/${a.assetId}`} className="block rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{a.name}</p>
                        <p className="text-xs text-ink-400">{a.assetId} · {a.category}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-3 text-xs text-ink-400">Location: {a.location || '—'} · Purchased {formatDate(a.purchaseDate)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent activity on my assets">
          <RecentEvents events={events} loading={loading} emptyText="No activity on your assets yet." />
        </SectionCard>
      </div>
    </div>
  );
}
