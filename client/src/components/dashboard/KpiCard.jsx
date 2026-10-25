import React from 'react';

const TONES = {
  blue: 'from-brand-500/25 to-transparent text-brand-300 ring-brand-400/30',
  green: 'from-emerald-500/25 to-transparent text-emerald-300 ring-emerald-400/30',
  amber: 'from-amber-500/25 to-transparent text-amber-300 ring-amber-400/30',
  rose: 'from-rose-500/25 to-transparent text-rose-300 ring-rose-400/30',
  violet: 'from-violet-glow/25 to-transparent text-violet-300 ring-violet-glow/30',
};

/** A KPI tile. `value` must come from an authorized API response; never a placeholder. */
export default function KpiCard({ label, value, hint, icon, tone = 'blue', loading = false }) {
  return (
    <div className="card lift relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${TONES[tone]?.split(' ').slice(0, 2).join(' ')} opacity-50`} aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</p>
          {loading ? (
            <div className="skeleton mt-3 h-8 w-20 rounded" />
          ) : (
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">{value ?? '—'}</p>
          )}
          {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        </div>
        {icon && <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ${TONES[tone]?.split(' ').find((c) => c.startsWith('text-'))}`} aria-hidden="true">{icon}</div>}
      </div>
    </div>
  );
}
