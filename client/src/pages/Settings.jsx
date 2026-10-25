import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import Icon from '../components/common/Icon';
import { authApi, departmentApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { can, PERMISSIONS as P } from '../auth/permissions';
import { ROLE_LABELS } from '../utils/format';
import { SectionCard } from './dashboards/shared';
import { Field } from '../components/assets/AddAssetModal';
import toast from 'react-hot-toast';

function rememberedSession() {
  try {
    return Boolean(window.localStorage.getItem('itdpp_token'));
  } catch {
    return false;
  }
}

export default function Settings() {
  const { user, replaceSession, logout } = useAuth();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [deptForm, setDeptForm] = useState({ name: '', code: '' });
  const [deptError, setDeptError] = useState('');
  const canManageDepartments = can(user, P.DEPARTMENTS_MANAGE);

  useEffect(() => {
    departmentApi.list().then((r) => setDepartments(r.data.data)).catch(() => setDepartments([]));
  }, []);

  async function changePassword(e) {
    e.preventDefault();
    const errs = {};
    if (!pw.currentPassword) errs.currentPassword = 'Enter your current password.';
    if (pw.newPassword.length < 8) errs.newPassword = 'Use at least 8 characters.';
    if (pw.newPassword !== pw.confirm) errs.confirm = 'The passwords do not match.';
    setPwErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const res = await authApi.changePassword(pw.currentPassword, pw.newPassword);
      replaceSession(res.data.data.token, res.data.data.user, rememberedSession());
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password updated. Other sessions were signed out.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function addDepartment(e) {
    e.preventDefault();
    setDeptError('');
    if (!deptForm.name.trim()) {
      setDeptError('Department name is required.');
      return;
    }
    try {
      await departmentApi.create({ name: deptForm.name.trim(), code: deptForm.code.trim() });
      setDeptForm({ name: '', code: '' });
      const r = await departmentApi.list();
      setDepartments(r.data.data);
      toast.success('Department created.');
    } catch (err) {
      setDeptError(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, password and, for administrators, departments." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Profile">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-ink-400">Name</dt><dd className="mt-1 text-white">{user.name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-400">Role</dt><dd className="mt-1 text-white">{ROLE_LABELS[user.role]}</dd></div>
            <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-400">Email</dt><dd className="mt-1 break-all text-white">{user.email}</dd></div>
            <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-400">Department</dt><dd className="mt-1 text-white">{user.department || 'None'}</dd></div>
          </dl>
          <button type="button" className="btn-secondary mt-6" onClick={logout}>
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </SectionCard>

        <SectionCard title="Change password">
          <form onSubmit={changePassword} noValidate className="space-y-4">
            <Field label="Current password" required error={pwErrors.currentPassword} htmlFor="cp-current">
              <input id="cp-current" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" required error={pwErrors.newPassword} htmlFor="cp-new" hint="At least 8 characters.">
              <input id="cp-new" type="password" autoComplete="new-password" className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password" required error={pwErrors.confirm} htmlFor="cp-confirm">
              <input id="cp-confirm" type="password" autoComplete="new-password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            <p className="text-xs text-ink-400">Changing your password signs out every other session.</p>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
          </form>
        </SectionCard>

        {canManageDepartments && (
          <SectionCard title="Departments" className="xl:col-span-2">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ul className="divide-y divide-white/[0.06]">
                {departments.length === 0 && <li className="py-3 text-sm text-ink-400">No departments yet.</li>}
                {departments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-white">{d.name}</span>
                    <span className="font-mono text-xs text-ink-400">{d.code || '—'}</span>
                  </li>
                ))}
              </ul>
              <form onSubmit={addDepartment} noValidate className="space-y-4" aria-label="Add department">
                <Field label="Department name" required htmlFor="d-name" error={deptError}>
                  <input id="d-name" className="input" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
                </Field>
                <Field label="Code (optional)" htmlFor="d-code" hint="2–12 letters, digits or hyphens.">
                  <input id="d-code" className="input" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} />
                </Field>
                <button type="submit" className="btn-primary">Add department</button>
              </form>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
