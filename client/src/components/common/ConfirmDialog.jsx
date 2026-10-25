import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, loading = false }) {
  if (!open) return null;
  return (
    <Modal onClose={onCancel} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-ink-600">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
