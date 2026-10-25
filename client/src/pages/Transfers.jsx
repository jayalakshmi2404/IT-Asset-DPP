import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import Icon from '../components/common/Icon';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import AddLifecycleEventModal from '../components/lifecycle/AddLifecycleEventModal';
import { assetApi, lifecycleApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/format';
import toast from 'react-hot-toast';

/** Administrator page: pick an asset, then record a transfer. Recent transfers are listed from the ledger. */
export default function Transfers() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadTransfers() {
    setLoading(true);
    try {
      const res = await lifecycleApi.listAll({ eventType: 'TRANSFER', limit: 20 });
      setTransfers(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransfers();
  }, []);

  async function findAssets(e) {
    e.preventDefault();
    try {
      const res = await assetApi.list({ search: search.trim(), limit: 8, status: 'ACTIVE' });
      setCandidates(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Transfers" description="Move an active asset to another department or location. Each transfer is one signed-off ledger entry." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="pick-h">
          <h2 id="pick-h" className="mb-4 text-sm font-semibold text-white">1. Choose an active asset</h2>
          <form onSubmit={findAssets} role="search" className="flex gap-2">
            <label className="sr-only" htmlFor="transfer-search">Asset name or ID</label>
            <input id="transfer-search" className="input" placeholder="Asset name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn-secondary"><Icon name="search" className="h-4 w-4" /> Find</button>
          </form>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {candidates.map((a) => (
              <li key={a._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{a.name}</p>
                  <p className="text-xs text-ink-400">{a.assetId} · {a.department || 'Unassigned'}</p>
                </div>
                <button type="button" className="btn-primary shrink-0" onClick={() => setSelected(a)}>Transfer</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-4 text-sm font-semibold text-white">Recent transfers</h2>
          {loading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : transfers.length === 0 ? (
            <EmptyState title="No transfers yet" description="Transfers you record will appear here." />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {transfers.map((t) => (
                <li key={t._id} className="py-3">
                  <p className="text-sm font-medium text-ink-800">{t.assetId}</p>
                  <p className="text-xs text-ink-400">{t.description}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(t.timestamp)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selected && (
        <AddLifecycleEventModal
          asset={selected}
          user={user}
          initialType="TRANSFER"
          onClose={() => setSelected(null)}
          onCreated={() => {
            setSelected(null);
            setCandidates([]);
            setSearch('');
            loadTransfers();
          }}
        />
      )}
    </div>
  );
}
