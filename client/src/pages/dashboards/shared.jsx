import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { formatDateTime, EVENT_TYPE_LABELS } from '../../utils/format';

export function ErrorNotice({ message, onRetry }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 p-5 ring-1 ring-inset ring-rose-400/25 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-rose-200">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}

export function SectionCard({ title, action, children, className = '' }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ShortcutLink({ to, icon, label, hint }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="block truncate text-xs text-ink-400">{hint}</span>}
      </span>
    </Link>
  );
}

export function RecentEvents({ events, loading, emptyText = 'No lifecycle events yet.' }) {
  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>;
  if (!events.length) return <p className="text-sm text-ink-400">{emptyText}</p>;
  return (
    <ul className="divide-y divide-white/[0.06]">
      {events.map((e) => (
        <li key={e._id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-800">
              {EVENT_TYPE_LABELS[e.eventType] || e.eventType} <span className="text-ink-400">· {e.assetId}</span>
            </p>
            <p className="truncate text-xs text-ink-400">{e.description}</p>
          </div>
          <time className="shrink-0 text-xs text-ink-400" dateTime={e.timestamp}>{formatDateTime(e.timestamp)}</time>
        </li>
      ))}
    </ul>
  );
}

export function Greeting({ user, subtitle }) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <header className="hero-bloom relative overflow-hidden rounded-2xl px-5 py-6 ring-1 ring-inset ring-white/[0.05] sm:px-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-glow">Asset Intelligence Overview</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Welcome back, {user.name.split(' ')[0]}</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-400">{subtitle}</p>
      <time className="mt-3 block text-xs text-ink-500" dateTime={new Date().toISOString().slice(0, 10)}>{today}</time>
    </header>
  );
}
