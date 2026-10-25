import React from 'react';
import EmptyState from '../common/EmptyState';
import { formatDateTime, truncateHash, EVENT_TYPE_LABELS } from '../../utils/format';

const EVENT_ICONS = { REGISTRATION: '＋', ALLOCATION: '◉', MAINTENANCE: '⚙', TRANSFER: '⇄', DISPOSAL: '✕' };

/**
 * Shows what each record says and its stored hashes. It does NOT claim the record
 * is verified: verification is a separate, explicit check (see the DPP panel).
 */
export default function LifecycleTimeline({ events = [], loading, emptyDescription }) {
  if (loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState icon="⟲" title="No lifecycle events yet" description={emptyDescription || 'Events appear here as this asset moves through its lifecycle.'} />;
  }

  return (
    <ol className="relative space-y-5 border-l border-white/10 pl-6" aria-label="Lifecycle history">
      {events.map((evt) => (
        <li key={evt._id || evt.eventId} className="relative">
          <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-600/30 text-xs text-brand-200 ring-4 ring-ink-50" aria-hidden="true">
            {EVENT_ICONS[evt.eventType] || '•'}
          </span>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-white">
                {EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}
                {evt.eventType === 'MAINTENANCE' && evt.metadata?.maintenanceState && (
                  <span className="ml-2 text-xs font-normal text-ink-400">({evt.metadata.maintenanceState === 'START' ? 'started' : 'completed'})</span>
                )}
              </span>
              <time className="text-xs text-ink-400" dateTime={evt.timestamp}>
                {formatDateTime(evt.timestamp)}
              </time>
            </div>
            {evt.description && <p className="mb-2 text-sm text-ink-500">{evt.description}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
              {evt.performedByName && (
                <span>
                  By <span className="text-ink-600">{evt.performedByName}</span>
                </span>
              )}
              <span className="font-mono" title={evt.previousHash}>Prev {truncateHash(evt.previousHash, 6)}</span>
              <span className="font-mono" title={evt.currentHash}>Hash {truncateHash(evt.currentHash, 6)}</span>
              <span>Recorded</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
