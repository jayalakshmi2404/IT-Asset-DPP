import React, { useCallback, useEffect, useState } from 'react';
import KpiCard from '../../components/dashboard/KpiCard';
import IntegrityStatus from '../../components/dashboard/IntegrityStatus';
import ViolationList from '../../components/verification/ViolationList';
import AssetStatusChart from '../../components/charts/AssetStatusChart';
import CategoryBarChart from '../../components/charts/CategoryBarChart';
import Icon from '../../components/common/Icon';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import { reportApi, lifecycleApi, integrityApi, auditApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { can, PERMISSIONS as P } from '../../auth/permissions';
import { Greeting, SectionCard, ShortcutLink, RecentEvents, ErrorNotice } from './shared';
import toast from 'react-hot-toast';

export default function AdminDashboard({ user }) {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [o, e, a] = await Promise.all([reportApi.overview(), lifecycleApi.recent(6), can(user, P.AUDIT_READ) ? auditApi.list({ limit: 5 }) : Promise.resolve(null)]);
      setOverview(o.data.data);
      setEvents(e.data.data);
      setAudit(a ? a.data.data : []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function runChainCheck() {
    setChecking(true);
    try {
      const res = await integrityApi.fullChain();
      setChain(res.data.data);
    } catch (err) {
      setChain({ status: 'UNAVAILABLE', verified: false, violations: [], message: apiErrorMessage(err) });
      toast.error(apiErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Greeting user={user} subtitle="Organisation-wide view of every registered asset and its lifecycle." />
      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="stagger-children grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Total assets" value={overview?.totalAssets} loading={loading} tone="blue" icon={<Icon name="box" className="h-5 w-5" />} />
        <KpiCard label="Active" value={overview?.activeAssets} loading={loading} tone="green" icon={<Icon name="check" className="h-5 w-5" />} />
        <KpiCard label="Under maintenance" value={overview?.underMaintenance} loading={loading} tone="amber" icon={<Icon name="wrench" className="h-5 w-5" />} />
        <KpiCard label="Disposed" value={overview?.disposedAssets} loading={loading} tone="rose" icon={<Icon name="swap" className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard title="Status mix" className="xl:col-span-1">
          {loading || !overview ? (
            <CardSkeleton />
          ) : (
            <AssetStatusChart active={overview.activeAssets} maintenance={overview.underMaintenance} disposed={overview.disposedAssets} />
          )}
        </SectionCard>
        <SectionCard title="Assets by category" className="xl:col-span-2">
          {loading || !overview ? <CardSkeleton /> : <CategoryBarChart data={overview.byCategory} labelKey="category" valueKey="count" title="Assets" />}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Ledger integrity"
          action={
            <button type="button" className="btn-secondary" onClick={runChainCheck} disabled={checking}>
              <Icon name="shield" className="h-4 w-4" /> {checking ? 'Checking…' : 'Check full ledger'}
            </button>
          }
        >
          <IntegrityStatus
            state={chain ? chain.status : 'PENDING'}
            checkedAt={chain?.checkedAt}
            totalBlocks={chain?.totalBlocks}
            violationCount={chain?.violations?.length || 0}
          />
          <ViolationList violations={chain?.violations || []} limit={5} />
        </SectionCard>

        <SectionCard title="Recent lifecycle activity">
          <RecentEvents events={events} loading={loading} />
        </SectionCard>

        <SectionCard title="Recent audit activity">
          {loading ? (
            <CardSkeleton />
          ) : audit.length === 0 ? (
            <p className="text-sm text-ink-400">No audit entries yet.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {audit.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium text-ink-800">{a.action.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-xs text-ink-400">{a.userName || 'System'} · {formatDateTime(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Shortcuts">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ShortcutLink to="/assets" icon="box" label="Asset register" hint="Register and review assets" />
            <ShortcutLink to="/transfers" icon="swap" label="Transfers" hint="Move assets between departments" />
            <ShortcutLink to="/integrity" icon="shield" label="Integrity verification" hint="Full ledger check" />
            <ShortcutLink to="/users" icon="users" label="Users & departments" hint="Accounts and manager scope" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
