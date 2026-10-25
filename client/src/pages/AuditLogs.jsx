import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import Pagination from '../components/common/Pagination';
import EmptyState from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import { auditApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { formatDateTime } from '../utils/format';
import toast from 'react-hot-toast';

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'ASSET_CREATED', 'ASSET_UPDATED', 'LIFECYCLE_EVENT', 'INTEGRITY_CHECK', 'FULL_CHAIN_CHECK', 'QR_GENERATED', 'PUBLIC_VERIFY', 'USER_CREATED', 'USER_UPDATED', 'DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED', 'UNAUTHORIZED_ACCESS'];

export default function AuditLogs() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 25 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', result: '', assetId: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: 25, ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) };
        const res = await auditApi.list(params);
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
  }, [page, applied]);

  function apply(e) {
    e.preventDefault();
    setPage(1);
    setApplied({ ...filters, assetId: filters.assetId.trim() });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Oversight" title="Audit logs" description="Every sensitive action is recorded here, including failed sign-ins and denied access attempts." />

      <form onSubmit={apply} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6" role="search">
        <Field label="Action" htmlFor="af-action">
          <select id="af-action" className="input" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">Any action</option>
            {ACTIONS.map((a) => (<option key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</option>))}
          </select>
        </Field>
        <Field label="Result" htmlFor="af-result">
          <select id="af-result" className="input" value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value })}>
            <option value="">Any result</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
          </select>
        </Field>
        <Field label="Asset ID" htmlFor="af-asset">
          <input id="af-asset" className="input" value={filters.assetId} onChange={(e) => setFilters({ ...filters, assetId: e.target.value })} />
        </Field>
        <Field label="From" htmlFor="af-from">
          <input id="af-from" type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </Field>
        <Field label="To" htmlFor="af-to">
          <input id="af-to" type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary w-full">Apply</button>
          <button type="button" className="btn-secondary" onClick={() => { const empty = { action: '', result: '', assetId: '', from: '', to: '' }; setFilters(empty); setPage(1); setApplied(empty); }}>Reset</button>
        </div>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No audit entries" description="No entries match these filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06] text-sm">
                <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Time</th>
                    <th scope="col" className="px-5 py-3 font-medium">Actor</th>
                    <th scope="col" className="px-5 py-3 font-medium">Action</th>
                    <th scope="col" className="px-5 py-3 font-medium">Asset</th>
                    <th scope="col" className="px-5 py-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((r) => (
                    <tr key={r._id} className="hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-400">{formatDateTime(r.timestamp)}</td>
                      <td className="px-5 py-3 text-ink-800">{r.userName || 'System'}</td>
                      <td className="px-5 py-3 text-white">{r.action.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-600">{r.assetId || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`badge ${r.result === 'SUCCESS' ? 'badge-green' : 'badge-rose'}`}>{r.result === 'SUCCESS' ? 'Success' : 'Failure'}</span>
                      </td>
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

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
    </div>
  );
}
