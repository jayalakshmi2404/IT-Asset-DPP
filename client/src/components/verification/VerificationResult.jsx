import React from 'react';
import { formatDateTime, truncateHash, EVENT_TYPE_LABELS } from '../../utils/format';

/** Public verification output. No owner or personal names are shown. */
export default function VerificationResult({ result }) {
  const { verified, asset, totalEvents, lifecycle = [], footer, violations = [], checkedAt } = result;

  return (
    <div>
      <div
        role="status"
        className={`mb-6 rounded-2xl p-5 text-center ring-1 ring-inset ${verified ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-rose-500/10 ring-rose-400/30'}`}
      >
        <div className={`text-xl font-bold ${verified ? 'text-emerald-300' : 'text-rose-300'}`}>
          {verified ? '✓ Asset verified' : '⚠ Integrity violation detected'}
        </div>
        {!verified && <p className="mt-2 text-sm text-rose-200">One or more lifecycle records do not match their recorded hashes.</p>}
        {checkedAt && <p className="mt-2 text-xs text-ink-400">Checked {formatDateTime(checkedAt)}</p>}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Asset ID" value={asset.assetId} />
        <Stat label="Name" value={asset.name} />
        <Stat label="Status" value={asset.status} />
        <Stat label="Department" value={asset.departmentName || '—'} />
        <Stat label="DPP ID" value={asset.dppId} mono />
        <Stat label="Lifecycle records" value={totalEvents} />
      </dl>

      {!verified && violations.length > 0 && (
        <div className="mb-6 rounded-lg bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-inset ring-rose-400/25">
          <div className="mb-2 font-semibold">Problems found</div>
          <ul className="list-disc space-y-1 pl-5">
            {violations.map((v, i) => (
              <li key={i}>{v.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold text-white">Lifecycle</h3>
      <ol className="overflow-hidden rounded-xl border border-white/[0.07]">
        {lifecycle.map((evt, i) => (
          <li key={i} className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${i !== lifecycle.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
            <div className="min-w-0">
              <div className="font-medium text-ink-800">{EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}</div>
              <div className="truncate text-xs text-ink-400">{evt.description}</div>
              <div className="text-xs text-ink-400">{formatDateTime(evt.timestamp)}</div>
            </div>
            <span className="shrink-0 font-mono text-xs text-cyan-glow" title={evt.currentHash}>{truncateHash(evt.currentHash, 6)}</span>
          </li>
        ))}
      </ol>

      <p className={`mt-6 text-center text-sm font-medium ${verified ? 'text-emerald-300' : 'text-rose-300'}`}>{footer}</p>
    </div>
  );
}

function Stat({ label, value, mono }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={`mt-0.5 break-all font-medium text-ink-800 ${mono ? 'font-mono text-sm' : ''}`}>{value}</dd>
    </div>
  );
}
