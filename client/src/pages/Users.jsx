import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import Pagination from '../components/common/Pagination';
import EmptyState from '../components/common/EmptyState';
import Icon from '../components/common/Icon';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import UserFormModal from '../components/common/UserFormModal';
import { userApi, departmentApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/format';
import toast from 'react-hot-toast';

export default function Users() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', role: '', status: '' });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)) };
      const res = await userApi.list(params);
      setRows(res.data.data);
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

  useEffect(() => {
    departmentApi.list().then((r) => setDepartments(r.data.data)).catch(() => setDepartments([]));
  }, []);

  const deptName = (id) => departments.find((d) => d.id === id)?.name || '—';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Accounts, roles and manager department scope. Deactivated accounts cannot sign in."
        actions={<button type="button" className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" /> New account</button>}
      />

      <form
        role="search"
        className="card flex flex-col gap-3 p-4 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery((q) => ({ ...q, search: search.trim() }));
        }}
      >
        <label className="sr-only" htmlFor="user-search">Search users</label>
        <input id="user-search" className="input flex-1" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="sr-only" htmlFor="user-role">Role</label>
        <select id="user-role" className="input sm:w-44" value={query.role} onChange={(e) => { setPage(1); setQuery((q) => ({ ...q, role: e.target.value })); }}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
        </select>
        <label className="sr-only" htmlFor="user-status">Status</label>
        <select id="user-status" className="input sm:w-40" value={query.status} onChange={(e) => { setPage(1); setQuery((q) => ({ ...q, status: e.target.value })); }}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No accounts match" description="Change the filters or create a new account." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06] text-sm">
                <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Name</th>
                    <th scope="col" className="px-5 py-3 font-medium">Role</th>
                    <th scope="col" className="px-5 py-3 font-medium">Department</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-3"><p className="font-medium text-white">{u.name}</p><p className="text-xs text-ink-400">{u.email}</p></td>
                      <td className="px-5 py-3 text-ink-600">{ROLE_LABELS[u.role] || u.role}</td>
                      <td className="px-5 py-3 text-ink-600">{deptName(u.departmentId)}</td>
                      <td className="px-5 py-3">
                        <span className={`badge ${u.status === 'ACTIVE' ? 'badge-green' : 'badge-slate'}`}>{u.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" className="text-xs font-medium text-brand-300 hover:text-brand-200" onClick={() => setEditing(u)}>
                          Edit<span className="sr-only"> {u.name}</span>
                        </button>
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

      {(creating || editing) && (
        <UserFormModal
          existingUser={editing || undefined}
          departments={departments}
          currentUserId={me.id}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
