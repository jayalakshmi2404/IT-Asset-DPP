import React from 'react';
import { formatDateTime, truncateHash, EVENT_TYPE_LABELS } from '../../utils/format';
import { COVERAGE_LABELS, TONE_CLASSES, LOCAL_CHECK_TEXT, EXPLORER_NAME } from '../../utils/anchorLabels';

/** Public verification output. No owner or personal names are shown. */
export default function VerificationResult({ result }) {
  const { verified, asset, totalEvents, lifecycle = [], footer, violations = [], checkedAt, anchoring } = result;

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

      <AnchoringSummary anchoring={anchoring} />

      <h3 className="mb-1 mt-8 text-sm font-semibold text-white">Provenance timeline</h3>
      <p className="mb-3 text-xs text-ink-400">Every record is in the local hash chain. The badge shows whether an external anchor covers it.</p>
      <ol className="overflow-hidden rounded-xl border border-white/[0.07]">
        {lifecycle.map((evt, i) => {
          const cov = COVERAGE_LABELS[evt.anchor?.label] || COVERAGE_LABELS.HASH_CHAIN_ONLY;
          return (
            <li key={i} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${i !== lifecycle.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
              <div className="min-w-0">
                <div className="font-medium text-ink-800">{EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}</div>
                <div className="truncate text-xs text-ink-400">{evt.description}</div>
                <div className="text-xs text-ink-400">{formatDateTime(evt.timestamp)}</div>
                <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_CLASSES[cov.tone]}`} title={cov.note}>
                  {cov.text}
                </span>
              </div>
              <span className="shrink-0 font-mono text-xs text-cyan-glow" title={evt.currentHash}>{truncateHash(evt.currentHash, 6)}</span>
            </li>
          );
        })}
      </ol>

      <p className={`mt-6 text-center text-sm font-medium ${verified ? 'text-emerald-300' : 'text-rose-300'}`}>{footer}</p>
    </div>
  );
}

/** Anchor status for this asset. Says plainly when the proof is simulated, and never implies more than the record shows. */
function AnchoringSummary({ anchoring }) {
  if (!anchoring || !anchoring.configured || !anchoring.latest) {
    return (
      <div className="mb-2 rounded-xl border border-white/[0.07] p-4 text-sm text-ink-400">
        <div className="font-semibold text-ink-800">External anchoring</div>
        <p className="mt-1">Not enabled on this server. The hash chain above still checks every record.</p>
      </div>
    );
  }
  const latest = anchoring.latest;
  const tone = latest.simulated
    ? 'violet'
    : latest.status === 'CONFIRMED' ? 'emerald' : latest.status === 'FAILED' ? 'rose' : 'amber';
  return (
    <div className="mb-2 rounded-xl border border-white/[0.07] p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-800">External anchoring</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}>{latest.simulated ? 'MOCK / SIMULATED' : latest.status}</span>
      </div>
      {latest.simulated && (
        <p className="mb-2 rounded-lg bg-violet-500/10 p-2.5 text-xs text-violet-200 ring-1 ring-inset ring-violet-300/25">
          This anchor is a development simulation stored in this application. It is not blockchain proof.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Anchored block" value={`#${latest.blockIndex}`} />
        <Stat label="Status" value={latest.status} />
        <Stat label="Network" value={latest.simulated ? 'None (simulated)' : 'Sepolia testnet'} />
        <Stat label="Submitted" value={latest.submittedAt ? formatDateTime(latest.submittedAt) : '—'} />
      </dl>
      <p className="mt-3 text-xs text-ink-400">{LOCAL_CHECK_TEXT[latest.localCheck] || 'Local check unavailable.'}</p>
      {latest.explorerUrl && (
        <a className="mt-2 inline-block text-xs font-semibold text-cyan-glow underline" href={latest.explorerUrl} target="_blank" rel="noopener noreferrer">
          View the anchor transaction on {EXPLORER_NAME}
        </a>
      )}
      <p className="mt-3 text-[11px] text-ink-500">
        Checked against this application’s own records only. An administrator can re-check the anchors against the chain.
      </p>
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
