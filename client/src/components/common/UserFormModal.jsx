import React, { useState } from 'react';
import Modal from './Modal';
import { userApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { Field } from '../assets/AddAssetModal';
import toast from 'react-hot-toast';

const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates or edits an account. Role, status, department and manager scope are sent
 * as IDs. The server rejects any field outside this list.
 */
export default function UserFormModal({ existingUser, departments = [], currentUserId, onClose, onSaved }) {
  const isEdit = Boolean(existingUser);
  const isSelf = isEdit && existingUser.id === currentUserId;
  const [form, setForm] = useState({
    name: existingUser?.name || '',
    email: existingUser?.email || '',
    password: '',
    role: existingUser?.role || 'EMPLOYEE',
    status: existingUser?.status || 'ACTIVE',
    departmentId: existingUser?.departmentId || '',
    managedDepartmentIds: existingUser?.managedDepartmentIds || [],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleManaged(id) {
    setForm((f) => ({
      ...f,
      managedDepartmentIds: f.managedDepartmentIds.includes(id) ? f.managedDepartmentIds.filter((x) => x !== id) : [...f.managedDepartmentIds, id],
    }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!isEdit) {
      if (!form.email.trim() || !EMAIL_PATTERN.test(form.email.trim())) e.email = 'Enter a valid email address.';
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    } else if (form.password && form.password.length < 8) {
      e.password = 'Password must be at least 8 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const base = {
        name: form.name.trim(),
        role: form.role,
        departmentId: form.departmentId || null,
        managedDepartmentIds: form.role === 'MANAGER' ? form.managedDepartmentIds : [],
      };
      if (isEdit) {
        const payload = { ...base, status: form.status };
        if (form.password) payload.password = form.password;
        await userApi.update(existingUser.id, payload);
        toast.success('Account updated.');
      } else {
        await userApi.create({ ...base, email: form.email.trim().toLowerCase(), password: form.password });
        toast.success('Account created.');
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit account' : 'Create account'} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Full name" required error={errors.name} htmlFor="uName">
          <input id="uName" className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
        </Field>
        <Field label="Email" required={!isEdit} error={errors.email} htmlFor="uEmail">
          <input id="uEmail" type="email" className="input" disabled={isEdit} value={form.email} onChange={(e) => update('email', e.target.value)} />
        </Field>
        <Field label={isEdit ? 'New password (optional)' : 'Password'} required={!isEdit} error={errors.password} htmlFor="uPass" hint={isEdit ? 'Leave blank to keep the current password. Resetting it signs the user out everywhere.' : 'At least 8 characters.'}>
          <input id="uPass" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => update('password', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" htmlFor="uRole" hint={isSelf ? 'You cannot change your own role.' : undefined}>
            <select id="uRole" className="input" value={form.role} onChange={(e) => update('role', e.target.value)} disabled={isSelf}>
              {ROLES.map((r) => (<option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>))}
            </select>
          </Field>
          <Field label="Status" htmlFor="uStatus" hint={isSelf ? 'You cannot deactivate yourself.' : undefined}>
            <select id="uStatus" className="input" value={form.status} onChange={(e) => update('status', e.target.value)} disabled={!isEdit || isSelf}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Department" htmlFor="uDept">
          <select id="uDept" className="input" value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
            <option value="">No department</option>
            {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </Field>
        {form.role === 'MANAGER' && (
          <fieldset>
            <legend className="label">Departments this manager may see</legend>
            {departments.length === 0 ? (
              <p className="text-xs text-ink-400">Create departments in Settings first.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {departments.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-ink-600 ring-1 ring-inset ring-white/[0.06]">
                    <input type="checkbox" className="h-4 w-4 rounded border-ink-300 bg-ink-100 text-brand-500" checked={form.managedDepartmentIds.includes(d.id)} onChange={() => toggleManaged(d.id)} />
                    {d.name}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-ink-400">A manager with no departments sees no assets.</p>
          </fieldset>
        )}

        <div className="flex flex-col-reverse justify-end gap-3 border-t border-white/[0.06] pt-4 sm:flex-row">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
