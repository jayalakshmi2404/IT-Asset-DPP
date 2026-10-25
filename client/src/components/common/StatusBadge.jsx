import React from 'react';
import { STATUS_LABELS, STATUS_BADGE_CLASS } from '../../utils/format';

export default function StatusBadge({ status }) {
  return <span className={STATUS_BADGE_CLASS[status] || 'badge bg-ink-100 text-ink-700'}>{STATUS_LABELS[status] || status}</span>;
}
