export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function truncateHash(hash, chars = 10) {
  if (!hash) return '—';
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

export function formatCurrency(value) {
  if (value === undefined || value === null || value === '') return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export const CATEGORIES = ['Laptop', 'Desktop', 'Monitor', 'Server', 'Networking', 'Mobile Device', 'Printer', 'Storage', 'Peripheral', 'Other'];

export const STATUS_LABELS = {
  ACTIVE: 'Active',
  MAINTENANCE: 'Under Maintenance',
  DISPOSED: 'Disposed',
  TRANSFERRED: 'Transferred',
};

export const STATUS_BADGE_CLASS = {
  ACTIVE: 'badge badge-active',
  MAINTENANCE: 'badge badge-maintenance',
  DISPOSED: 'badge badge-disposed',
  TRANSFERRED: 'badge badge-transferred',
};

export const EVENT_TYPE_LABELS = {
  REGISTRATION: 'Registration',
  ALLOCATION: 'Allocation',
  MAINTENANCE: 'Maintenance',
  TRANSFER: 'Transfer',
  DISPOSAL: 'Disposal',
};

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  AUDITOR: 'Auditor',
};

/** Four explicit verification states. "Verified" is only ever shown after a real check succeeded. */
export const INTEGRITY_STATE = {
  PENDING: { label: 'Not yet verified', tone: 'text-ink-400', ring: 'ring-ink-300' },
  VERIFIED: { label: 'Verified', tone: 'text-emerald-300', ring: 'ring-emerald-400/30' },
  VIOLATION_DETECTED: { label: 'Failed: integrity violation', tone: 'text-rose-300', ring: 'ring-rose-400/30' },
  UNAVAILABLE: { label: 'Unavailable: could not check', tone: 'text-amber-300', ring: 'ring-amber-400/30' },
};
