import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import KpiCard from '../../components/dashboard/KpiCard';
import IntegrityStatus from '../../components/dashboard/IntegrityStatus';
import ViolationList from '../../components/verification/ViolationList';
import Icon from '../../components/common/Icon';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { reportApi, integrityApi, auditApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { Greeting, SectionCard, ErrorNotice } from './shared';
import toast from 'react-hot-toast';

/** Read-only oversight: organisation-wide counts, ledger verification and audit trail. No write actions. */
export default function AuditorDashboard({ user }) {
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [o, a] = await Promise.all([reportApi.overview(), auditApi.list({ limit: 8 })]);
      setOverview(o.data.data);
      setAudit(a.data.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runChainCheck() {
    setChecking(true);
    try {
      const res = await integrityApi.fullChain();
      setChain(res.data.data);
    } catch (err) {
      setChain({ status: 'UNAVAILABLE', verified: false, violations: [] });
      toast.error(apiErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Greeting user={user} subtitle="Read-only oversight: organisation figures, ledger verification and the audit trail." />
      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="stagger-children grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Total assets" value={overview?.totalAssets} loading={loading} tone="blue" icon={<Icon name="box" className="h-5 w-5" />} />
        <KpiCard label="Active" value={overview?.activeAssets} loading={loading} tone="green" icon={<Icon name="check" className="h-5 w-5" />} />
        <KpiCard label="Under maintenance" value={overview?.underMaintenance} loading={loading} tone="amber" icon={<Icon name="wrench" className="h-5 w-5" />} />
        <KpiCard label="Disposed" value={overview?.disposedAssets} loading={loading} tone="rose" icon={<Icon name="swap" className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Full ledger verification"
          action={
            <button type="button" className="btn-primary" onClick={runChainCheck} disabled={checking}>
              <Icon name="shield" className="h-4 w-4" /> {checking ? 'Checking…' : 'Run check'}
            </button>
          }
        >
          <IntegrityStatus state={chain ? chain.status : 'PENDING'} checkedAt={chain?.checkedAt} totalBlocks={chain?.totalBlocks} violationCount={chain?.violations?.length || 0} />
          <ViolationList violations={chain?.violations || []} limit={10} />
        </SectionCard>

        <SectionCard title="Recent audit entries" action={<Link to="/audit-logs" className="text-xs font-medium text-brand-300 hover:text-brand-200">Open audit log</Link>}>
          {loading ? (
            <CardSkeleton />
          ) : audit.length === 0 ? (
            <EmptyState title="No audit entries" description="Actions taken in the system will be listed here." />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {audit.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium text-ink-800">{a.action.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-right text-xs text-ink-400">{a.userName || 'System'}<br />{formatDateTime(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
