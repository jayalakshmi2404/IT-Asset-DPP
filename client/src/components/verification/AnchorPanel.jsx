import React, { useCallback, useEffect, useState } from 'react';
import Icon from '../common/Icon';
import ViolationList from './ViolationList';
import { anchorApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import { can, PERMISSIONS as P } from '../../auth/permissions';
import { SectionCard } from '../../pages/dashboards/shared';
import toast from 'react-hot-toast';

const EXPLORER_NAME = 'Sepolia Etherscan';

const STATUS_STYLE = {
  CONFIRMED: 'bg-emerald-400/15 text-emerald-200',
  PENDING: 'bg-amber-400/15 text-amber-200',
  FAILED: 'bg-rose-400/15 text-rose-200',
};

const MODE = {
  mock: {
    label: 'Mock Mode — Simulated, No Real Blockchain',
    badge: 'bg-violet-400/15 text-violet-200 ring-violet-300/30',
    note: 'Everything here is simulated and stored in this application’s own database. No blockchain was contacted and no transaction was sent. This is not blockchain proof.',
    anchorButton: 'Simulate anchor (latest block)',
    anchorDone: 'Simulated anchor created. This is not a blockchain transaction.',
    anchorExists: 'The latest block already has a simulated anchor. Showing the existing record.',
    empty: 'No block has been simulated yet. Nothing has been anchored.',
  },
  ethereum: {
    label: 'Ethereum Sepolia — Real Testnet Transaction',
    badge: 'bg-sky-400/15 text-sky-200 ring-sky-300/30',
    note: 'Only block hashes are sent to the Sepolia test network. No asset or personal data leaves the system. Testnet transactions have no monetary value.',
    anchorButton: 'Anchor latest block (Sepolia)',
    anchorDone: 'Anchor transaction submitted to Sepolia. Refresh status to see confirmation.',
    anchorExists: 'The latest block is already anchored on Sepolia. Showing the existing record.',
    empty: 'No block has been anchored yet. Nothing has been verified externally.',
  },
  unavailable: {
    label: 'Unavailable — Anchors Could Not Be Checked',
    badge: 'bg-amber-400/15 text-amber-200 ring-amber-400/30',
    note: 'The anchor check could not be completed. Nothing is reported as verified. Use Re-check to try again.',
    empty: '',
  },
  none: {
    label: 'Disabled — Anchoring Not Enabled',
    badge: 'bg-white/5 text-ink-300 ring-white/10',
    note: 'Anchoring is off. The hash chain still works as the local integrity record. To try the free simulation, set ANCHOR_PROVIDER=mock on the server and restart it.',
    empty: '',
  },
};

const RESULT_TEXT = {
  VERIFIED: 'Every anchor matches the ledger.',
  VIOLATION_DETECTED: 'At least one anchor does not match. See the reasons below.',
  PENDING: 'Anchors are waiting for confirmation. Nothing is verified yet.',
  UNAVAILABLE: 'The anchors could not be checked. Nothing is claimed as verified.',
  NO_ANCHORS: null, // replaced by the mode-specific empty text
};

function modeOf(result) {
  const kind = result?.providerInfo?.kind;
  if (kind && MODE[kind]) return kind;
  // A failed request has no providerInfo. It must not be shown as "Disabled".
  if (result?.status === 'UNAVAILABLE') return 'unavailable';
  if (result?.provider === 'mock') return 'mock';
  if (result?.provider === 'ethereum') return 'ethereum';
  return 'none';
}

/**
 * External anchor panel. The active provider comes from the server (providerInfo), so the
 * label always matches what the server will actually do. Mock results are always marked
 * as simulated. The hash chain remains the local integrity record.
 */
function Tile({ label, value, tone }) {
  const color = tone === 'violet' ? 'text-violet-200' : tone === 'sky' ? 'text-sky-200' : 'text-ink-800';
  return (
    <div className="rounded-xl border border-white/[0.07] p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={`mt-1 text-lg font-bold ${color}`}>{value}</dd>
    </div>
  );
}

export default function AnchorPanel({ user }) {
  const canRead = can(user, P.ANCHOR_READ);
  const canWrite = can(user, P.ANCHOR_WRITE);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canRead) return;
    setBusy(true);
    try {
      const res = await anchorApi.list();
      setResult(res.data.data);
    } catch (err) {
      setResult({ status: 'UNAVAILABLE', verified: false, anchors: [], violations: [{ blockIndex: '-', reason: apiErrorMessage(err) }] });
    } finally {
      setBusy(false);
    }
  }, [canRead]);

  useEffect(() => {
    load();
  }, [load]);

  async function createAnchor() {
    setBusy(true);
    try {
      const res = await anchorApi.create();
      const mode = modeOf({ providerInfo: res.data.providerInfo });
      if (res.data.created === false) toast(MODE[mode].anchorExists);
      else toast.success(MODE[mode].anchorDone);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    try {
      await anchorApi.refresh();
      toast.success('Anchor status refreshed');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return null;

  const mode = modeOf(result);
  const info = MODE[mode];
  const status = result?.status || 'PENDING';
  const emptyText = status === 'NO_ANCHORS' ? info.empty : RESULT_TEXT[status] || 'Checking the anchor status.';
  const anchorsEnabled = mode !== 'none';
  const canCreate = mode === 'mock' || mode === 'ethereum';

  return (
    <SectionCard
      title="External anchor"
      action={
        anchorsEnabled && (
          <div className="flex flex-wrap gap-2">
            {canWrite && canCreate && (
              <button type="button" className="btn-primary" disabled={busy} onClick={createAnchor}>
                <Icon name="shield" className="h-4 w-4" /> {info.anchorButton}
              </button>
            )}
            {canWrite && canCreate && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={refreshStatus}>
                Refresh status
              </button>
            )}
            <button type="button" className="btn-secondary" disabled={busy} onClick={load}>Re-check</button>
          </div>
        )
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          data-testid="provider-badge"
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${info.badge}`}
        >
          {info.label}
        </span>
        {mode === 'mock' && (
          <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[11px] font-bold tracking-wide text-violet-100">MOCK / SIMULATED</span>
        )}
      </div>
      <p className="mb-3 text-xs text-ink-500">{info.note}</p>
      {emptyText && <p className="mb-3 text-sm text-ink-400">{emptyText}</p>}

      {result?.anchors?.length > 0 && (
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Anchor totals">
          <Tile label="Confirmed" value={result.confirmedCount ?? 0} />
          <Tile label="Pending" value={result.pendingCount ?? 0} />
          <Tile label="Failed" value={result.failedCount ?? 0} />
          {mode === 'mock' ? (
            <Tile label="Simulated" value={result.simulatedCount ?? 0} tone="violet" />
          ) : (
            <Tile label="Real Sepolia" value={result.realCount ?? 0} tone="sky" />
          )}
        </dl>
      )}

      {result?.anchors?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Block #</th>
                <th className="py-2 pr-3 font-semibold">Block hash</th>
                <th className="py-2 pr-3 font-semibold">Reference</th>
                <th className="py-2 pr-3 font-semibold">Timestamp</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {result.anchors.map((a) => (
                <tr key={a.blockIndex}>
                  <td className="py-2.5 pr-3 font-medium text-ink-800">#{a.blockIndex}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-ink-400" title={a.blockHash}>{String(a.blockHash).slice(0, 12)}…</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-ink-400" title={a.txRef}>
                    {a.simulated && <span className="mr-1.5 rounded bg-violet-400/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-100">MOCK / SIMULATED</span>}
                    {String(a.txRef).slice(0, a.simulated ? 16 : 10)}…
                    {a.explorerUrl && (
                      <a className="ml-2 font-sans text-[11px] font-semibold text-cyan-glow underline" href={a.explorerUrl} target="_blank" rel="noopener noreferrer">
                        View on {EXPLORER_NAME}
                      </a>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-ink-400">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status] || 'bg-white/5 text-ink-300'}`}>{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.notices?.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/25">
          <div className="mb-1 font-semibold">Not checked</div>
          <ul className="list-disc space-y-1 pl-5">
            {result.notices.map((n, i) => (
              <li key={i}>Block #{n.blockIndex}: {n.reason}</li>
            ))}
          </ul>
        </div>
      )}
      <ViolationList violations={result?.violations || []} limit={10} heading="Anchor problems" />
    </SectionCard>
  );
}
