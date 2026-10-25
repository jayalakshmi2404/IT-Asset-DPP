import React, { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { assetApi, departmentApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { CATEGORIES } from '../../utils/format';
import toast from 'react-hot-toast';

const emptyForm = {
  assetId: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseCost: '',
  warranty: '',
  departmentId: '',
  location: '',
  description: '',
};

export default function AddAssetModal({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [departments, setDepartments] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    departmentApi.list().then((res) => setDepartments(res.data.data)).catch(() => setDepartments([]));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const e = {};
    if (!form.assetId.trim()) e.assetId = 'Asset ID is required.';
    else if (!/^[A-Za-z0-9._-]{1,40}$/.test(form.assetId.trim())) e.assetId = 'Use letters, digits, dots, hyphens or underscores.';
    if (!form.name.trim()) e.name = 'Asset name is required.';
    if (!form.category) e.category = 'Choose a category.';
    if (!form.purchaseDate) e.purchaseDate = 'Purchase date is required.';
    else if (new Date(form.purchaseDate) > new Date()) e.purchaseDate = 'Purchase date cannot be in the future.';
    if (form.purchaseCost !== '' && (Number.isNaN(Number(form.purchaseCost)) || Number(form.purchaseCost) < 0)) e.purchaseCost = 'Enter a number of 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        assetId: form.assetId.trim(),
        name: form.name.trim(),
        category: form.category,
        brand: form.brand,
        model: form.model,
        serialNumber: form.serialNumber,
        purchaseDate: form.purchaseDate,
        purchaseCost: form.purchaseCost === '' ? 0 : Number(form.purchaseCost),
        warranty: form.warranty,
        location: form.location,
        description: form.description,
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
      };
      const res = await assetApi.create(payload);
      toast.success(`Asset ${res.data.data.asset.assetId} registered.`);
      onCreated(res.data.data.asset);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Register asset" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Asset ID" required error={errors.assetId} htmlFor="assetId">
            <input id="assetId" className="input" placeholder="AST-1009" value={form.assetId} onChange={(e) => update('assetId', e.target.value)} />
          </Field>
          <Field label="Asset name" required error={errors.name} htmlFor="name">
            <input id="name" className="input" placeholder="Dell Latitude 5440" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Category" required error={errors.category} htmlFor="category">
            <select id="category" className="input" value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Department" htmlFor="departmentId" hint="Controls which managers can see this asset.">
            <select id="departmentId" className="input" value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
              <option value="">Unassigned</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand" htmlFor="brand"><input id="brand" className="input" value={form.brand} onChange={(e) => update('brand', e.target.value)} /></Field>
          <Field label="Model" htmlFor="model"><input id="model" className="input" value={form.model} onChange={(e) => update('model', e.target.value)} /></Field>
          <Field label="Serial number" htmlFor="serialNumber"><input id="serialNumber" className="input" value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} /></Field>
          <Field label="Purchase date" required error={errors.purchaseDate} htmlFor="purchaseDate">
            <input id="purchaseDate" type="date" className="input" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} />
          </Field>
          <Field label="Purchase cost (USD)" error={errors.purchaseCost} htmlFor="purchaseCost">
            <input id="purchaseCost" type="number" min="0" step="0.01" className="input" value={form.purchaseCost} onChange={(e) => update('purchaseCost', e.target.value)} />
          </Field>
          <Field label="Warranty" htmlFor="warranty"><input id="warranty" className="input" placeholder="3 years" value={form.warranty} onChange={(e) => update('warranty', e.target.value)} /></Field>
          <Field label="Location" htmlFor="location" className="sm:col-span-2"><input id="location" className="input" placeholder="HQ - Floor 2" value={form.location} onChange={(e) => update('location', e.target.value)} /></Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <textarea id="description" className="input" rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-ink-400">Status is set to Active on registration. To assign an owner, record an allocation after saving.</p>

        <div className="flex flex-col-reverse justify-end gap-3 border-t border-white/[0.06] pt-4 sm:flex-row">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Registering…' : 'Register asset'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Field({ label, required, error, children, htmlFor, hint, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label} {required && <span className="text-rose-400" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-300" role="alert">{error}</p>}
    </div>
  );
}
