import React from 'react';
import { INTEGRITY_STATE } from '../../utils/format';
import { formatDateTime } from '../../utils/format';

/**
 * Renders one of four states. VERIFIED is shown only when `state` came from a
 * completed verification response; PENDING is the default before any check runs.
 */
export default function IntegrityStatus({ state = 'PENDING', checkedAt, totalBlocks, violationCount = 0, compact = false }) {
  const meta = INTEGRITY_STATE[state] || INTEGRITY_STATE.PENDING;
  return (
    <div className={`flex items-start gap-3 ${compact ? '' : 'rounded-xl bg-white/[0.02] p-4 ring-1 ring-inset ' + meta.ring}`}>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ${meta.ring} ${meta.tone}`} aria-hidden="true">
        {state === 'VERIFIED' ? '✓' : state === 'VIOLATION_DETECTED' ? '!' : state === 'UNAVAILABLE' ? '…' : '○'}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${meta.tone}`}>{meta.label}</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {state === 'PENDING' && 'Run a verification to check every hash in the ledger.'}
          {state === 'VERIFIED' && `${totalBlocks ?? '—'} ledger blocks matched their recorded hashes.`}
          {state === 'VIOLATION_DETECTED' && `${violationCount} problem${violationCount === 1 ? '' : 's'} found. Review the records below.`}
          {state === 'UNAVAILABLE' && 'The check could not be completed. Nothing has been marked as verified.'}
        </p>
        {checkedAt && <p className="mt-1 text-[11px] text-ink-400">Checked {formatDateTime(checkedAt)}</p>}
      </div>
    </div>
  );
}
