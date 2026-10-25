import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import Pagination from '../components/common/Pagination';
import EmptyState from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import { lifecycleApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { EVENT_TYPE_LABELS, formatDateTime, truncateHash } from '../utils/format';
import toast from 'react-hot-toast';

const TYPES = ['REGISTRATION', 'ALLOCATION', 'MAINTENANCE', 'TRANSFER', 'DISPOSAL'];

/** Ledger view inside the caller's scope. The eventType filter can come from the URL (e.g. ?eventType=MAINTENANCE). */
export default function LifecycleEvents() {
  const [params, setParams] = useSearchParams();
  const eventType = TYPES.includes(params.get('eventType')) ? params.get('eventType') : '';
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);

  useEffect(() => setPage(1), [eventType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await lifecycleApi.listAll({ page, limit: 20, ...(eventType ? { eventType } : {}) });
        if (cancelled) return;
        setRows(res.data.data);
        setMeta(res.data.pagination);
      } catch (err) {
        if (!cancelled) toast.error(apiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, eventType]);

  function setType(value) {
    const next = new URLSearchParams(params);
    if (value) next.set('eventType', value);
    else next.delete('eventType');
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ledger" title="Lifecycle events" description="Each row is one recorded event, with the SHA-256 hash that links it into the chain." />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event type filter">
        {['', ...TYPES].map((t) => (
          <button
            key={t || 'ALL'}
            type="button"
            role="radio"
            aria-checked={eventType === t}
            onClick={() => setType(t)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${eventType === t ? 'bg-brand-600 text-white' : 'bg-white/[0.04] text-ink-600 ring-1 ring-inset ring-white/[0.07] hover:bg-white/[0.07]'}`}
          >
            {t ? EVENT_TYPE_LABELS[t] : 'All events'}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No events to show" description="No lifecycle events match this filter in your scope." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06] text-sm">
                <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">When</th>
                    <th scope="col" className="px-5 py-3 font-medium">Asset</th>
                    <th scope="col" className="px-5 py-3 font-medium">Event</th>
                    <th scope="col" className="px-5 py-3 font-medium">Details</th>
                    <th scope="col" className="px-5 py-3 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((r) => (
                    <tr key={r._id} className="hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-400">{formatDateTime(r.timestamp)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-800">{r.assetId}</td>
                      <td className="px-5 py-3 font-medium text-white">{EVENT_TYPE_LABELS[r.eventType] || r.eventType}</td>
                      <td className="max-w-md px-5 py-3 text-ink-600">
                        <span className="line-clamp-2">{r.description}</span>
                        {r.performedByName && <span className="block text-xs text-ink-400">By {r.performedByName}</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-cyan-glow" title={r.currentHash}>{truncateHash(r.currentHash, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/[0.06] p-4">
              <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
