import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import Pagination from '../components/common/Pagination';
import Icon from '../components/common/Icon';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import AddAssetModal from '../components/assets/AddAssetModal';
import { assetApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { can, PERMISSIONS as P } from '../auth/permissions';
import { CATEGORIES, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { filenameFromDisposition, saveBlob } from '../utils/download';

const STATUSES = ['ACTIVE', 'MAINTENANCE', 'DISPOSED', 'TRANSFERRED'];

export default function Assets() {
  const { user } = useAuth();
  const canRegister = can(user, P.ASSETS_WRITE);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', category: '', status: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Exports the same filters the list is showing (the page number is not part of an export).
  async function handleExport() {
    setExporting(true);
    try {
      const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v));
      const res = await assetApi.exportCsv(params);
      saveBlob(res.data, filenameFromDisposition(res.headers['content-disposition'], 'assets.csv'));
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(await exportErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)) };
      const res = await assetApi.list(params);
      setItems(res.data.data);
      setMeta(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  function applySearch(e) {
    e.preventDefault();
    setPage(1);
    setQuery((q) => ({ ...q, search: search.trim() }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Register"
        title={user.role === 'EMPLOYEE' ? 'My assets' : 'Assets'}
        description={user.role === 'EMPLOYEE' ? 'Equipment currently allocated to you.' : 'Every asset inside your data scope, with its Digital Product Passport.'}
        actions={(
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
              <Icon name="log" className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            {canRegister && <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" className="h-4 w-4" /> Register asset</button>}
          </div>
        )}
      />

      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <form onSubmit={applySearch} className="flex flex-1 gap-2" role="search">
          <label className="sr-only" htmlFor="asset-search">Search assets</label>
          <input id="asset-search" className="input" placeholder="Search by name, asset ID, serial or DPP ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="btn-secondary">Search</button>
        </form>
        <div className="grid grid-cols-2 gap-3 lg:w-96">
          <label className="block">
            <span className="sr-only">Category</span>
            <select className="input" value={query.category} onChange={(e) => { setPage(1); setQuery((q) => ({ ...q, category: e.target.value })); }}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Status</span>
            <select className="input" value={query.status} onChange={(e) => { setPage(1); setQuery((q) => ({ ...q, status: e.target.value })); }}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (<option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>))}
            </select>
          </label>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : items.length === 0 ? (
          <EmptyState title="No assets found" description={query.search || query.category || query.status ? 'Try clearing the filters.' : 'Nothing is registered in your scope yet.'} actionLabel={query.search || query.category || query.status ? 'Clear filters' : undefined} onAction={() => { setSearch(''); setPage(1); setQuery({ search: '', category: '', status: '' }); }} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06] text-sm">
                <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Asset</th>
                    <th scope="col" className="px-5 py-3 font-medium">Category</th>
                    <th scope="col" className="px-5 py-3 font-medium">Department</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                    <th scope="col" className="px-5 py-3 font-medium">Purchased</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map((a) => (
                    <tr key={a._id} className="transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3.5">
                        <Link to={`/assets/${a.assetId}`} className="font-medium text-white hover:text-brand-200">{a.name}</Link>
                        <div className="font-mono text-xs text-ink-400">{a.assetId}</div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-600">{a.category}</td>
                      <td className="px-5 py-3.5 text-ink-600">{a.department || '—'}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={a.status} /></td>
                      <td className="px-5 py-3.5 text-ink-400">{formatDate(a.purchaseDate)}</td>
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

      {showAdd && (
        <AddAssetModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            toast.success('Asset registered and recorded in the ledger.');
            load();
          }}
        />
      )}
    </div>
  );
}

/** Error responses come back as a Blob when responseType is blob, so the JSON message must be read from it. */
async function exportErrorMessage(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      /* not JSON */
    }
  }
  return apiErrorMessage(err);
}
