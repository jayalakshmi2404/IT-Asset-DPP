import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { departmentApi, lifecycleApi, userApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { can, PERMISSIONS as P } from '../../auth/permissions';
import { Field } from '../assets/AddAssetModal';
import toast from 'react-hot-toast';

/**
 * Only the event types the signed-in role may record are offered. The server enforces
 * the same rules again (allocation/transfer/maintenance: administrators and managers
 * within scope; disposal: administrators only).
 */
export default function AddLifecycleEventModal({ asset, user, onClose, onCreated, initialType }) {
  const allowedTypes = useMemo(() => {
    const types = [];
    if (can(user, P.LIFECYCLE_ALLOCATE)) types.push({ value: 'ALLOCATION', label: 'Allocate' }, { value: 'MAINTENANCE', label: 'Maintenance' }, { value: 'TRANSFER', label: 'Transfer' });
    if (can(user, P.LIFECYCLE_DISPOSE)) types.push({ value: 'DISPOSAL', label: 'Dispose' });
    return types;
  }, [user]);

  const [eventType, setEventType] = useState(allowedTypes.some((t) => t.value === initialType) ? initialType : allowedTypes[0]?.value || 'ALLOCATION');
  const [departments, setDepartments] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [fields, setFields] = useState({ date: new Date().toISOString().slice(0, 10) });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState(asset.status === 'MAINTENANCE' ? 'COMPLETE' : 'START');

  useEffect(() => {
    departmentApi.list().then((res) => setDepartments(res.data.data)).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const departmentId = fields.departmentId || fields.newDepartmentId;
    if (!departmentId || (eventType !== 'ALLOCATION' && eventType !== 'TRANSFER')) return;
    userApi
      .assignable({ departmentId })
      .then((res) => setAssignees(res.data.data))
      .catch(() => setAssignees([]));
  }, [fields.departmentId, fields.newDepartmentId, eventType]);

  function update(field, value) {
    setFields((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function requiredFor(type) {
    switch (type) {
      case 'ALLOCATION':
        return ['assignedToUserId', 'departmentId', 'location', 'date'];
      case 'MAINTENANCE':
        return ['description', 'result', 'date'];
      case 'TRANSFER':
        return ['newDepartmentId', 'newLocation', 'reason', 'date'];
      case 'DISPOSAL':
        return ['disposalReason', 'authorizedBy', 'certificateReference', 'date'];
      default:
        return [];
    }
  }

  function validate() {
    const e = {};
    for (const f of requiredFor(eventType)) {
      if (!String(fields[f] ?? '').trim()) e[f] = 'This field is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function payloadFor(type) {
    const base = { eventType: type, effectiveDate: fields.date };
    switch (type) {
      case 'ALLOCATION':
        return { ...base, assignedToUserId: fields.assignedToUserId, departmentId: fields.departmentId, location: fields.location };
      case 'MAINTENANCE':
        return { ...base, description: fields.description, result: fields.result, maintenanceState };
      case 'TRANSFER':
        return { ...base, newDepartmentId: fields.newDepartmentId, newLocation: fields.newLocation, reason: fields.reason, ...(fields.newAssignedToUserId ? { newAssignedToUserId: fields.newAssignedToUserId } : {}) };
      case 'DISPOSAL':
        return { ...base, disposalReason: fields.disposalReason, authorizedBy: fields.authorizedBy, certificateReference: fields.certificateReference };
      default:
        return base;
    }
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await lifecycleApi.addEvent(asset.assetId, payloadFor(eventType));
      toast.success(`${allowedTypes.find((t) => t.value === eventType)?.label || eventType} recorded and added to the hash chain.`);
      onCreated(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (allowedTypes.length === 0) {
    return (
      <Modal title="Record lifecycle event" onClose={onClose}>
        <p className="text-sm text-ink-400">Your role cannot record lifecycle events.</p>
      </Modal>
    );
  }

  return (
    <Modal title={`Record event: ${asset.assetId}`} onClose={onClose} maxWidth="max-w-xl">
      <div role="radiogroup" aria-label="Event type" className="mb-5 flex flex-wrap gap-2">
        {allowedTypes.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={eventType === t.value}
            onClick={() => {
              setEventType(t.value);
              setErrors({});
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${eventType === t.value ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {eventType === 'ALLOCATION' && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Department" required error={errors.departmentId} htmlFor="allocDept">
                <select id="allocDept" className="input" value={fields.departmentId || ''} onChange={(e) => update('departmentId', e.target.value)}>
                  <option value="">Choose a department</option>
                  {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </Field>
              <Field label="Employee" required error={errors.assignedToUserId} htmlFor="allocUser" hint={fields.departmentId && assignees.length === 0 ? 'No active employees in this department.' : undefined}>
                <select id="allocUser" className="input" value={fields.assignedToUserId || ''} onChange={(e) => update('assignedToUserId', e.target.value)} disabled={!fields.departmentId}>
                  <option value="">Choose an employee</option>
                  {assignees.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                </select>
              </Field>
            </div>
            <Field label="Location" required error={errors.location} htmlFor="allocLocation">
              <input id="allocLocation" className="input" value={fields.location || ''} onChange={(e) => update('location', e.target.value)} />
            </Field>
            <Field label="Effective date" required error={errors.date} htmlFor="allocDate">
              <input id="allocDate" type="date" className="input" value={fields.date} onChange={(e) => update('date', e.target.value)} />
            </Field>
          </>
        )}

        {eventType === 'MAINTENANCE' && (
          <>
            <fieldset className="flex gap-2">
              <legend className="label">Maintenance step</legend>
              {['START', 'COMPLETE'].map((s) => (
                <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset ${maintenanceState === s ? 'bg-brand-600/20 text-white ring-brand-400/50' : 'text-ink-400 ring-white/10'}`}>
                  <input type="radio" name="maintenanceState" value={s} checked={maintenanceState === s} onChange={() => setMaintenanceState(s)} className="sr-only" />
                  {s === 'START' ? 'Start maintenance' : 'Complete maintenance'}
                </label>
              ))}
            </fieldset>
            <Field label="Work description" required error={errors.description} htmlFor="mDesc">
              <textarea id="mDesc" className="input" rows={3} value={fields.description || ''} onChange={(e) => update('description', e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Result" required error={errors.result} htmlFor="mResult">
                <input id="mResult" className="input" placeholder="Completed / in progress" value={fields.result || ''} onChange={(e) => update('result', e.target.value)} />
              </Field>
              <Field label="Date" required error={errors.date} htmlFor="mDate">
                <input id="mDate" type="date" className="input" value={fields.date} onChange={(e) => update('date', e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {eventType === 'TRANSFER' && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="New department" required error={errors.newDepartmentId} htmlFor="tDept">
                <select id="tDept" className="input" value={fields.newDepartmentId || ''} onChange={(e) => update('newDepartmentId', e.target.value)}>
                  <option value="">Choose a department</option>
                  {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </Field>
              <Field label="New employee (optional)" htmlFor="tUser" hint="Leave empty to make the asset unassigned.">
                <select id="tUser" className="input" value={fields.newAssignedToUserId || ''} onChange={(e) => update('newAssignedToUserId', e.target.value)} disabled={!fields.newDepartmentId}>
                  <option value="">Unassigned</option>
                  {assignees.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="New location" required error={errors.newLocation} htmlFor="tLoc">
                <input id="tLoc" className="input" value={fields.newLocation || ''} onChange={(e) => update('newLocation', e.target.value)} />
              </Field>
              <Field label="Date" required error={errors.date} htmlFor="tDate">
                <input id="tDate" type="date" className="input" value={fields.date} onChange={(e) => update('date', e.target.value)} />
              </Field>
            </div>
            <Field label="Reason" required error={errors.reason} htmlFor="tReason">
              <input id="tReason" className="input" value={fields.reason || ''} onChange={(e) => update('reason', e.target.value)} />
            </Field>
          </>
        )}

        {eventType === 'DISPOSAL' && (
          <>
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-inset ring-rose-400/25">
              Disposal is final. The asset cannot receive further events or edits afterwards.
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Authorised by" required error={errors.authorizedBy} htmlFor="dAuth">
                <input id="dAuth" className="input" value={fields.authorizedBy || ''} onChange={(e) => update('authorizedBy', e.target.value)} />
              </Field>
              <Field label="Disposal date" required error={errors.date} htmlFor="dDate">
                <input id="dDate" type="date" className="input" value={fields.date} onChange={(e) => update('date', e.target.value)} />
              </Field>
            </div>
            <Field label="Disposal reason" required error={errors.disposalReason} htmlFor="dReason">
              <input id="dReason" className="input" value={fields.disposalReason || ''} onChange={(e) => update('disposalReason', e.target.value)} />
            </Field>
            <Field label="Certificate reference" required error={errors.certificateReference} htmlFor="dCert">
              <input id="dCert" className="input" value={fields.certificateReference || ''} onChange={(e) => update('certificateReference', e.target.value)} />
            </Field>
          </>
        )}

        <div className="flex flex-col-reverse justify-end gap-3 border-t border-white/[0.06] pt-4 sm:flex-row">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Recording…' : 'Record event'}</button>
        </div>
      </form>
    </Modal>
  );
}
